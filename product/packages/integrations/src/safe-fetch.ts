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
    const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (s === '::' || s === '::1') return true;                         // non spécifié, loopback
    if (s.startsWith('fe80') || s.startsWith('fec0')) return true;      // link-local, site-local
    if (/^f[cd]/.test(s)) return true;                                  // unique local (fc00::/7)
    if (s.startsWith('ff')) return true;                                // multicast
    // IPv4 encapsulée (::ffff:127.0.0.1) : on rejuge sur la partie v4.
    const m = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m?.[1]) return isPrivateAddress(m[1]);
    return false;
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
