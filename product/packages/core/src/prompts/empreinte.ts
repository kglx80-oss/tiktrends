/**
 * Empreintes du registre de prompts · SHA-256 et JSON canonique, sans dépendance.
 *
 * ── Ce que ce module tranche ─────────────────────────────────────────────────
 *
 * Le pack `02-PROMPTS.json` porte des empreintes calculées par
 * `docs/studios-v2/tools/verify-pack.py` :
 *
 *   sha256( json.dumps(objet sans contentHash, sort_keys=True,
 *                      ensure_ascii=False, separators=(',', ':')).encode() )
 *
 * et `commonSystemHash = sha256(commonSystemInstructions.encode())`. Ce module
 * reproduit EXACTEMENT cette sérialisation : clés triées par point de code
 * (l'ordre de Python), caractères non ASCII écrits tels quels, échappements de
 * `json.dumps` (`\"`, `\\`, `\n`, `\r`, `\t`, `\b`, `\f`, puis `\u00xx` pour les
 * autres caractères de contrôle, en minuscules), aucun espace.
 *
 * ── Ce qu'il refuse ──────────────────────────────────────────────────────────
 *
 * Un nombre non entier : Python écrit `1.0` là où JavaScript ne voit que `1`
 * après `JSON.parse`. L'empreinte ne serait plus reproductible d'un langage à
 * l'autre, donc le mode « python » LÈVE au lieu de produire une empreinte qui
 * divergerait en silence. Le mode « js » (empreintes propres au serveur, jamais
 * comparées à Python : snapshot de contexte, message compilé) accepte les
 * décimaux finis. Une surrogate isolée est refusée dans les deux modes : Python
 * échoue à l'encodage UTF-8, on échoue aussi.
 *
 * Pur : ni `node:crypto` ni Web Crypto, pour rester importable partout et
 * synchrone. Le test compare à `node:crypto` sur des entrées variées.
 */

/* -------------------------------------------------------------------------- */
/*  SHA-256 (FIPS 180-4)                                                      */
/* -------------------------------------------------------------------------- */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** SHA-256 d'une suite d'octets, en hexadécimal minuscule. */
export function sha256Octets(octets: Uint8Array): string {
  const longueurBits = octets.length * 8;
  const total = (((octets.length + 9 + 63) >> 6) << 6);
  const bloc = new Uint8Array(total);
  bloc.set(octets);
  bloc[octets.length] = 0x80;
  const vue = new DataView(bloc.buffer);
  // Longueur sur 64 bits big-endian · les deux moitiés, sans perte au-delà de 2^32 bits.
  vue.setUint32(total - 8, Math.floor(longueurBits / 0x100000000));
  vue.setUint32(total - 4, longueurBits >>> 0);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = vue.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15]!, b = w[t - 2]!;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t]! + w[t]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0; h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0; h[5] = (h[5]! + f) >>> 0; h[6] = (h[6]! + g) >>> 0; h[7] = (h[7]! + hh) >>> 0;
  }
  let hex = '';
  for (const mot of h) hex += mot.toString(16).padStart(8, '0');
  return hex;
}

/** Erreur levée quand une valeur ne peut pas recevoir d'empreinte reproductible. */
export class ErreurEmpreinte extends Error {
  constructor(public readonly code: 'SURROGATE_ISOLEE' | 'NOMBRE_NON_ENTIER' | 'NOMBRE_NON_FINI' | 'VALEUR_NON_JSON', public readonly chemin: string) {
    super(`Empreinte impossible · ${code} en ${chemin || '/'}`);
    this.name = 'ErreurEmpreinte';
  }
}

function verifierUnicode(texte: string, chemin: string): void {
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const suivant = texte.charCodeAt(i + 1);
      if (!(suivant >= 0xdc00 && suivant <= 0xdfff)) throw new ErreurEmpreinte('SURROGATE_ISOLEE', chemin);
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      throw new ErreurEmpreinte('SURROGATE_ISOLEE', chemin);
    }
  }
}

/** UTF-8 strict d'un texte (refuse une surrogate isolée au lieu de la remplacer). */
export function utf8(texte: string): Uint8Array {
  verifierUnicode(texte, '');
  return new TextEncoder().encode(texte);
}

/** SHA-256 d'un texte encodé en UTF-8 · l'équivalent de `sha256(s.encode())`. */
export function sha256Texte(texte: string): string {
  return sha256Octets(utf8(texte));
}

/* -------------------------------------------------------------------------- */
/*  JSON canonique                                                            */
/* -------------------------------------------------------------------------- */

/** Comparaison par point de code, l'ordre de `sorted()` en Python. */
export function comparerPointsDeCode(a: string, b: string): number {
  const ia = a[Symbol.iterator](), ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next(), y = ib.next();
    if (x.done) return y.done ? 0 : -1;
    if (y.done) return 1;
    const cx = x.value.codePointAt(0)!, cy = y.value.codePointAt(0)!;
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
}

const ECHAPPEMENTS: Record<string, string> = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };

function chaineJson(texte: string, chemin: string): string {
  verifierUnicode(texte, chemin);
  let sortie = '"';
  for (const car of texte) {
    const echappe = ECHAPPEMENTS[car];
    if (echappe !== undefined) sortie += echappe;
    else if (car.charCodeAt(0) < 0x20) sortie += '\\u' + car.charCodeAt(0).toString(16).padStart(4, '0');
    else sortie += car;
  }
  return sortie + '"';
}

export type ModeNombres = 'python' | 'js';

function serialiser(valeur: unknown, chemin: string, mode: ModeNombres): string {
  if (valeur === null) return 'null';
  if (valeur === true) return 'true';
  if (valeur === false) return 'false';
  if (typeof valeur === 'string') return chaineJson(valeur, chemin);
  if (typeof valeur === 'number') {
    if (!Number.isFinite(valeur)) throw new ErreurEmpreinte('NOMBRE_NON_FINI', chemin);
    if (Number.isInteger(valeur)) {
      if (mode === 'python' && !Number.isSafeInteger(valeur)) throw new ErreurEmpreinte('NOMBRE_NON_ENTIER', chemin);
      return Object.is(valeur, -0) ? '0' : String(valeur);
    }
    if (mode === 'python') throw new ErreurEmpreinte('NOMBRE_NON_ENTIER', chemin);
    return JSON.stringify(valeur);
  }
  if (Array.isArray(valeur)) return '[' + valeur.map((v, i) => serialiser(v, `${chemin}/${i}`, mode)).join(',') + ']';
  if (typeof valeur === 'object') {
    const cles = Object.keys(valeur as object).sort(comparerPointsDeCode);
    const morceaux: string[] = [];
    for (const cle of cles) {
      const v = (valeur as Record<string, unknown>)[cle];
      if (v === undefined) throw new ErreurEmpreinte('VALEUR_NON_JSON', `${chemin}/${cle}`);
      morceaux.push(chaineJson(cle, `${chemin}/${cle}`) + ':' + serialiser(v, `${chemin}/${cle}`, mode));
    }
    return '{' + morceaux.join(',') + '}';
  }
  throw new ErreurEmpreinte('VALEUR_NON_JSON', chemin);
}

/**
 * JSON canonique · identique à `json.dumps(v, sort_keys=True, ensure_ascii=False,
 * separators=(',', ':'))` en mode « python » (défaut).
 */
export function jsonCanonique(valeur: unknown, mode: ModeNombres = 'python'): string {
  return serialiser(valeur, '', mode);
}

/** SHA-256 du JSON canonique d'une valeur. */
export function empreinteJson(valeur: unknown, mode: ModeNombres = 'python'): string {
  return sha256Texte(jsonCanonique(valeur, mode));
}

/**
 * `contentHash` d'un template ou d'une recette : l'objet complet SANS son champ
 * `contentHash`, en JSON canonique, puis SHA-256. Reproduit `verify-pack.py`.
 */
export function empreinteContenu(objet: Readonly<Record<string, unknown>>): string {
  const copie: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(objet)) if (k !== 'contentHash') copie[k] = v;
  return empreinteJson(copie, 'python');
}

/** Une empreinte SHA-256 hexadécimale minuscule, comme l'exige le schéma. */
export const MOTIF_SHA256 = /^[a-f0-9]{64}$/;
