import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Récupération d'une URL fournie par l'utilisateur, protégée contre le SSRF.
 *
 * Le serveur vit dans un réseau privé (base Postgres, Redis, et surtout le service
 * de métadonnées du VPS). Sans garde, une URL comme http://169.254.169.254/… ou
 * http://localhost:5432 collée dans un champ « site de la marque » ou glissée dans
 * un snapshot de pub fait relayer la réponse interne par notre serveur.
 *
 * On vérifie donc, à CHAQUE saut de redirection :
 *   1. le schéma (http/https seulement · pas de file:, gopher:, data:) ;
 *   2. le port (80/443 et quelques ports web usuels) ;
 *   3. l'adresse IP réellement résolue (rejet des plages privées et réservées).
 *
 * La redirection est suivie à la main (`redirect: 'manual'`) : sans ça, un hôte
 * public peut renvoyer un 302 vers 127.0.0.1 et le contrôle initial ne sert à rien.
 */

const MAX_REDIRECTS = 4;
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

/** Développe une IPv6 en 8 blocs de 16 bits, ou null si la forme est invalide.
 *  Gère l'abréviation `::` et un suffixe IPv4 en notation pointée (NAT64, mappée). */
function hextetsV6(entree: string): number[] | null {
  let str = entree;
  const pointe = str.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (pointe) {
    const q = pointe[2]!.split('.').map(Number);
    if (q.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    str = pointe[1]! + (((q[0]! << 8) | q[1]!).toString(16)) + ':' + (((q[2]! << 8) | q[3]!).toString(16));
  }
  const parts = str.split('::');
  if (parts.length > 2) return null;
  const tete = parts[0] ? parts[0].split(':') : [];
  const queue = parts.length === 2 ? (parts[1] ? parts[1].split(':') : []) : null;
  let blocs: string[];
  if (queue === null) {
    blocs = tete;
    if (blocs.length !== 8) return null;
  } else {
    const zeros = 8 - tete.length - queue.length;
    if (zeros < 1) return null;
    blocs = [...tete, ...Array<string>(zeros).fill('0'), ...queue];
  }
  if (blocs.length !== 8) return null;
  const out = blocs.map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
  return out.some((n) => Number.isNaN(n)) ? null : out;
}

/** Plages non routables sur Internet : personne n'a de raison légitime de nous y envoyer. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split('.').map(Number) as [number, number, number, number];
    if (p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true;                 // « ce réseau », privé, loopback
    if (a === 169 && b === 254) return true;                            // link-local (métadonnées cloud)
    if (a === 172 && b >= 16 && b <= 31) return true;                   // privé
    if (a === 192 && b === 168) return true;                            // privé
    if (a === 192 && b === 0) return true;                              // IETF / protocole
    if (a === 100 && b >= 64 && b <= 127) return true;                  // CGNAT
    if (a >= 224) return true;                                          // multicast + réservé + broadcast
    return false;
  }
  if (v === 6) {
    const h = hextetsV6(ip.toLowerCase().replace(/^\[|\]$/g, ''));
    if (!h) return true;                                                // forme illisible → refus
    const [h0, h1, h2, h3, h4, h5, h6, h7] = h as [number, number, number, number, number, number, number, number];
    const premiersSixNuls = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0;
    if (premiersSixNuls && h6 === 0 && h7 <= 1) return true;            // :: (non spécifié), ::1 (loopback)
    if ((h0 & 0xffc0) === 0xfe80) return true;                          // fe80::/10 link-local (métadonnées)
    if ((h0 & 0xffc0) === 0xfec0) return true;                          // fec0::/10 site-local (obsolète)
    if ((h0 & 0xfe00) === 0xfc00) return true;                          // fc00::/7 unique local
    if ((h0 & 0xff00) === 0xff00) return true;                          // ff00::/8 multicast
    // Adresses qui ENCAPSULENT une IPv4 · on rejuge sur la v4 portée (une v4
    // publique y reste publique, une v4 interne doit être refusée) · ferme le
    // contournement par forme hexadécimale (::ffff:7f00:1), NAT64 et 6to4.
    const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff) return isPrivateAddress(v4(h6, h7)); // ::ffff:0:0/96 mappée
    if (premiersSixNuls) return isPrivateAddress(v4(h6, h7));           // ::/96 compatible (obsolète)
    if (h0 === 0x0064 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) return isPrivateAddress(v4(h6, h7)); // 64:ff9b::/96 NAT64
    if (h0 === 0x2002) return isPrivateAddress(v4(h1, h2));             // 2002::/16 6to4
    return false;                                                       // unicast global
  }
  return true; // ni v4 ni v6 : on refuse par défaut
}

/** Valide une URL et renvoie son objet URL, ou null si elle doit être refusée. */
export async function assertPublicUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!ALLOWED_PORTS.has(u.port)) return null;

  const host = u.hostname.replace(/^\[|\]$/g, '');
  // Hôte déjà littéral : pas de DNS à faire.
  if (isIP(host)) return isPrivateAddress(host) ? null : u;

  try {
    // Toutes les résolutions doivent être publiques (un nom peut pointer sur
    // plusieurs adresses · il suffit d'une privée pour que ce soit une attaque).
    const addrs = await lookup(host, { all: true });
    if (!addrs.length) return null;
    if (addrs.some((a) => isPrivateAddress(a.address))) return null;
  } catch { return null; }
  return u;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  maxBytes?: number;
}

/**
 * fetch() borné : URL publique uniquement, redirections revalidées une à une,
 * corps tronqué à `maxBytes`. Renvoie null plutôt que de lever, pour que les
 * appelants « best-effort » (enrichissement de marque, vignette produit) restent
 * simples. Le corps est rendu en Buffer ; `contentType` est le type déclaré.
 */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<{ body: Buffer; contentType: string; url: string } | null> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const maxBytes = opts.maxBytes ?? 6_000_000;
  let target: string = raw;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = await assertPublicUrl(target);
    if (!u) return null;
    let res: Response;
    try {
      res = await fetch(u, {
        headers: opts.headers,
        redirect: 'manual', // on revalide nous-mêmes chaque saut
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch { return null; }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      target = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) return null;

    // Coupe avant de tout charger en mémoire : un serveur hostile peut annoncer
    // 1 Ko et envoyer 10 Go.
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return null;
    return { body: buf, contentType: (res.headers.get('content-type') || '').split(';')[0]!.trim(), url: u.toString() };
  }
  return null; // trop de redirections
}
