/**
 * Requêtes partielles HTTP (`Range: bytes=…`) · la règle, pure.
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * Safari et l'iPhone ne lisent une `<video>` que si le serveur sait répondre
 * `206 Partial Content` : le lecteur demande d'abord `bytes=0-1`, puis des
 * morceaux. Les routes qui servent nos médias (clips, vidéo finale, assets de
 * la bibliothèque) renvoyaient toujours `200` et le fichier entier · sur ces
 * navigateurs, la vidéo pouvait rester noire.
 *
 * ── La règle (RFC 9110 §14) ──────────────────────────────────────────────────
 *
 * - Pas d'en-tête `Range` ⇒ `200`, tout le fichier.
 * - Unité inconnue (`items=…`) ⇒ l'en-tête est IGNORÉ (§14.2 : « MUST ignore »)
 *   ⇒ `200`.
 * - `If-Range` présent et différent de l'ETag FORT courant ⇒ la plage visait une
 *   autre version ⇒ `200`, tout le fichier (jamais un morceau d'une autre
 *   version). Une date ou un ETag faible ne correspondent jamais.
 * - Plusieurs plages (`bytes=0-1,5-9`) ⇒ ignorées proprement ⇒ `200` entier,
 *   jamais de `multipart/byteranges` (§14.2 autorise à ignorer ; aucun lecteur
 *   vidéo ne les demande, et c'est ce que fait `send`, le serveur de fichiers
 *   d'Express).
 * - Une plage `bytes=a-b`, `bytes=a-`, `bytes=-n` satisfaisable ⇒ `206`,
 *   `Content-Range: bytes début-fin/taille`, fin bornée à la taille.
 * - Syntaxe invalide (`bytes=`, `bytes=9-3`, `bytes=x-`, `bytes=-`) ou plage
 *   hors taille (`bytes=taille-`, `bytes=-0`, fichier vide) ⇒ `416`,
 *   `Content-Range: bytes *\/taille`.
 *
 * Toutes les réponses (200, 206, 416) annoncent `Accept-Ranges: bytes`.
 */

export type PlageOctets =
  | { statut: 200; debut: number; fin: number; longueur: number; motif: 'sans-plage' | 'unite-inconnue' | 'if-range-different' | 'plages-multiples' }
  | { statut: 206; debut: number; fin: number; longueur: number }
  | { statut: 416; motif: 'syntaxe' | 'hors-taille' };

export interface DemandePlage {
  /** Taille totale de la ressource, en octets. */
  taille: number;
  /** Valeur brute de l'en-tête `Range` (ou `null`). */
  range?: string | null;
  /** Valeur brute de l'en-tête `If-Range` (ou `null`). */
  ifRange?: string | null;
  /** ETag FORT courant de la ressource, guillemets compris · `null` si aucun. */
  etag?: string | null;
}

/** Un entier décimal non signé, sans signe ni espace, dans les entiers sûrs. */
const ENTIER = /^\d{1,15}$/;

function entier(s: string): number | null {
  return ENTIER.test(s) ? Number(s) : null;
}

function complet(taille: number, motif: Extract<PlageOctets, { statut: 200 }>['motif']): PlageOctets {
  return { statut: 200, debut: 0, fin: taille - 1, longueur: taille, motif };
}

/** Décide quoi servir pour une requête, selon `Range` / `If-Range` et la taille. */
export function deciderPlage(d: DemandePlage): PlageOctets {
  const { taille } = d;
  if (!Number.isSafeInteger(taille) || taille < 0) throw new Error(`taille de ressource invalide : ${String(taille)}`);
  const brut = (d.range ?? '').trim();
  if (!brut) return complet(taille, 'sans-plage');

  const egal = brut.indexOf('=');
  // Sans `=`, ce n'est même pas « unité=… » : en-tête inexploitable, ignoré.
  if (egal < 0) return complet(taille, 'unite-inconnue');
  if (brut.slice(0, egal).trim().toLowerCase() !== 'bytes') return complet(taille, 'unite-inconnue');

  // If-Range : la plage ne vaut que pour la version qu'elle désigne (comparaison forte).
  if (d.ifRange != null && d.ifRange.trim() !== '') {
    const v = d.ifRange.trim();
    if (!d.etag || v.startsWith('W/') || v !== d.etag) return complet(taille, 'if-range-different');
  }

  const morceaux = brut.slice(egal + 1).split(',').map((s) => s.trim()).filter((s) => s !== '');
  if (morceaux.length === 0) return { statut: 416, motif: 'syntaxe' };
  if (morceaux.length > 1) return complet(taille, 'plages-multiples');

  const p = morceaux[0]!;
  const tiret = p.indexOf('-');
  if (tiret < 0) return { statut: 416, motif: 'syntaxe' };
  const gauche = p.slice(0, tiret).trim();
  const droite = p.slice(tiret + 1).trim();

  if (gauche === '') {
    // Suffixe `bytes=-n` : les n derniers octets.
    const n = entier(droite);
    if (n === null) return { statut: 416, motif: 'syntaxe' };
    if (n === 0 || taille === 0) return { statut: 416, motif: 'hors-taille' };
    const debut = Math.max(0, taille - n);
    return { statut: 206, debut, fin: taille - 1, longueur: taille - debut };
  }

  const debut = entier(gauche);
  if (debut === null) return { statut: 416, motif: 'syntaxe' };
  let fin: number;
  if (droite === '') fin = taille - 1;
  else {
    const f = entier(droite);
    if (f === null || f < debut) return { statut: 416, motif: 'syntaxe' };
    fin = Math.min(f, taille - 1);
  }
  if (debut >= taille) return { statut: 416, motif: 'hors-taille' };
  return { statut: 206, debut, fin, longueur: fin - debut + 1 };
}

/**
 * En-têtes propres à la plage : `accept-ranges` toujours, `content-length`
 * toujours, `content-range` sur 206 et 416. À fusionner APRÈS les en-têtes de la
 * route (type, cache, disposition…), qu'ils ne remplacent pas.
 */
export function entetesPlage(p: PlageOctets, taille: number): Record<string, string> {
  if (p.statut === 416) return { 'accept-ranges': 'bytes', 'content-range': `bytes */${taille}`, 'content-length': '0' };
  const e: Record<string, string> = { 'accept-ranges': 'bytes', 'content-length': String(p.longueur) };
  if (p.statut === 206) e['content-range'] = `bytes ${p.debut}-${p.fin}/${taille}`;
  return e;
}

/** Les octets à envoyer · une vue (sans copie) du morceau demandé, `null` sur 416. */
export function corpsPlage(octets: Uint8Array, p: PlageOctets): Uint8Array | null {
  if (p.statut === 416) return null;
  return octets.subarray(p.debut, p.fin + 1);
}

/** Tout ce qu'une route doit renvoyer pour ces octets : statut, en-têtes de plage, corps. */
export function servirPlage(octets: Uint8Array, o: Omit<DemandePlage, 'taille'>): { statut: 200 | 206 | 416; entetes: Record<string, string>; corps: Uint8Array | null } {
  const p = deciderPlage({ ...o, taille: octets.length });
  return { statut: p.statut, entetes: entetesPlage(p, octets.length), corps: corpsPlage(octets, p) };
}
