/**
 * Studios · sérialisation canonique et empreinte SHA-256 (cahier 01 §7, §10).
 *
 * Pur et SYNCHRONE, identique au navigateur et au serveur. `packages/core`
 * n'importe aucune bibliothèque de hachage (aucun module du noyau ne hache
 * aujourd'hui) et `crypto.subtle` est asynchrone, absent hors contexte sûr :
 * on implémente donc SHA-256 (FIPS 180-4) ici, éprouvé contre `node:crypto`
 * par un test sur des vecteurs officiels et des contenus aléatoires.
 *
 * ── Forme canonique ──────────────────────────────────────────────────────────
 *
 * JSON sans espace, clés d'objet triées par point de code UTF-16, nombres et
 * chaînes sérialisés par `JSON.stringify` (forme ECMAScript, celle de RFC 8785
 * pour les nombres finis). Deux contenus égaux donnent la même chaîne, quel que
 * soit l'ordre d'insertion de leurs clés. Les valeurs hors JSON (undefined,
 * fonction, NaN, Infinity, bigint, symbole) sont REFUSÉES plutôt qu'omises en
 * silence : une empreinte qui ignorerait un champ ne prouverait rien.
 */

export class ErreurCanonique extends Error {
  constructor(public readonly chemin: string, raison: string) {
    super(`${raison} en ${chemin || '/'}`);
    this.name = 'ErreurCanonique';
  }
}

function echapperSegment(s: string): string {
  return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

/*
 * L8-C · le chemin d'une erreur est construit SEULEMENT quand on lève : la
 * pile `segments` garde les clés brutes de la descente, échappées au moment
 * de l'erreur. Avant, chaque clé de chaque objet fabriquait sa chaîne de
 * chemin (deux expressions régulières par clé) pour un message qui ne sert
 * presque jamais : 17 ms sur 23 pour l'empreinte d'un contenu de 200 plans et
 * 1000 calques (`perf/mesures.ts`). Sortie et messages identiques, éprouvés
 * contre l'implémentation d'origine (`l8c-equivalence.test.ts`).
 */
function cheminDe(segments: readonly string[]): string {
  let s = '';
  for (const k of segments) s += `/${echapperSegment(k)}`;
  return s;
}

/**
 * Clés déjà mises entre guillemets · un contenu répète les mêmes noms de champ
 * des milliers de fois (`id`, `kind`, `x`…). Bornée : vidée au-delà de
 * `CLES_EN_CACHE_MAX` entrées, jamais une croissance sans fin.
 */
const CLES_EN_CACHE_MAX = 10_000;
const clesCitees = new Map<string, string>();
function citerCle(k: string): string {
  let q = clesCitees.get(k);
  if (q === undefined) {
    if (clesCitees.size >= CLES_EN_CACHE_MAX) clesCitees.clear();
    q = JSON.stringify(k);
    clesCitees.set(k, q);
  }
  return q;
}

/*
 * L8-C · mémoire de forme canonique, active SEULEMENT pendant un calcul pur
 * qui ne modifie pas ses entrées (`avecCanoniqueMemorise`). Un graphe
 * d'impact hache le document pour la composition PUIS le contenu entier qui
 * le contient, et deux versions voisines partagent presque tous leurs calques :
 * la même forme canonique était recalculée jusqu'à quatre fois par geste.
 * Hors de cette portée, aucune mémoire : un objet modifié après coup ne peut
 * jamais rendre une forme périmée.
 */
let memoire: WeakMap<object, string> | null = null;
/** Empreintes déjà calculées dans la même portée, par forme canonique · une identité citée par 200 plans est hachée une fois. */
let empreintesVues: Map<string, string> | null = null;
const FORME_MEMORISEE_MAX = 4096;

/**
 * Exécute `f` avec la mémoire de forme canonique · `f` NE DOIT PAS modifier
 * un objet déjà sérialisé pendant l'appel. Réentrant : un appel imbriqué
 * réutilise la mémoire en cours. La mémoire est relâchée en sortie, même sur
 * exception.
 */
export function avecCanoniqueMemorise<T>(f: () => T): T {
  if (memoire) return f();
  memoire = new WeakMap();
  empreintesVues = new Map();
  try { return f(); } finally { memoire = null; empreintesVues = null; }
}

function canon(v: unknown, segments: string[], vus: Set<object>): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'boolean':
      return v ? 'true' : 'false';
    case 'string':
      return JSON.stringify(v);
    case 'number':
      if (!Number.isFinite(v)) throw new ErreurCanonique(cheminDe(segments), 'nombre non fini');
      return JSON.stringify(v);
    case 'object': {
      const deja = memoire?.get(v);
      if (deja !== undefined) return deja;
      if (vus.has(v)) throw new ErreurCanonique(cheminDe(segments), 'référence circulaire');
      vus.add(v);
      let s: string;
      if (Array.isArray(v)) {
        s = '[';
        for (let i = 0; i < v.length; i++) {
          segments.push(String(i));
          s += (i ? ',' : '') + canon(v[i], segments, vus);
          segments.pop();
        }
        s += ']';
      } else {
        const proto = Object.getPrototypeOf(v);
        if (proto !== Object.prototype && proto !== null) throw new ErreurCanonique(cheminDe(segments), 'objet non JSON');
        const cles = Object.keys(v).sort();
        s = '{';
        for (let i = 0; i < cles.length; i++) {
          const k = cles[i]!;
          segments.push(k);
          s += (i ? ',' : '') + citerCle(k) + ':' + canon((v as Record<string, unknown>)[k], segments, vus);
          segments.pop();
        }
        s += '}';
      }
      vus.delete(v);
      memoire?.set(v, s);
      return s;
    }
    default:
      throw new ErreurCanonique(cheminDe(segments), `valeur ${typeof v} hors JSON`);
  }
}

/** JSON canonique · lève `ErreurCanonique` sur une valeur hors JSON. */
export function jsonCanonique(v: unknown): string {
  return canon(v, [], new Set());
}

/* ─────────────────────────────── SHA-256 ─────────────────────────────────── */

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

const tailleRembourree = (n: number) => ((n + 9 + 63) >> 6) << 6;

/** SHA-256 d'une suite d'octets, en hexadécimal minuscule. */
export function sha256OctetsHex(donnees: Uint8Array): string {
  const m = new Uint8Array(tailleRembourree(donnees.length));
  m.set(donnees);
  return compresser(m, donnees.length);
}

/**
 * Le message est dans `m[0..n)`, suivi de zéros jusqu'à la taille rembourrée
 * au moins · bourrage FIPS 180-4 posé ici, en place.
 */
function compresser(m: Uint8Array, n: number): string {
  const longueurBits = n * 8;
  const total = tailleRembourree(n);
  m[n] = 0x80;
  const vue = new DataView(m.buffer, m.byteOffset, total);
  // Longueur sur 64 bits big-endian · les deux mots, pour les contenus > 512 Mo.
  vue.setUint32(total - 8, Math.floor(longueurBits / 0x100000000));
  vue.setUint32(total - 4, longueurBits >>> 0);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let bloc = 0; bloc < total; bloc += 64) {
    for (let t = 0; t < 16; t++) w[t] = vue.getUint32(bloc + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15]!, y = w[t - 2]!;
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t]! + w[t]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0; h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0; h[5] = (h[5]! + f) >>> 0; h[6] = (h[6]! + g) >>> 0; h[7] = (h[7]! + hh) >>> 0;
  }
  let hex = '';
  for (let i = 0; i < 8; i++) hex += h[i]!.toString(16).padStart(8, '0');
  return hex;
}

const encodeur = new TextEncoder();

/**
 * SHA-256 du texte encodé en UTF-8. L8-C · le texte est encodé DIRECTEMENT
 * dans le tampon rembourré (`encodeInto`) : ni copie, ni le chemin lent
 * d'`encode` sur une chaîne à deux octets par caractère (2,9 ms contre
 * 0,3 ms pour un contenu de 200 plans et 1000 calques, mesuré). Mêmes
 * octets : un UTF-16 isolé devient U+FFFD dans les deux cas (éprouvé).
 */
export function sha256Hex(texte: string): string {
  // 3 octets UTF-8 au plus par unité UTF-16.
  const m = new Uint8Array(tailleRembourree(texte.length * 3));
  const { written } = encodeur.encodeInto(texte, m);
  return compresser(m, written);
}

/** Empreinte d'un contenu JSON · SHA-256 de sa forme canonique. */
export function empreinteContenu(v: unknown): string {
  const forme = jsonCanonique(v);
  // Seules les formes COURTES se répètent (identités, entrées d'un plan) ; une grande forme coûterait à indexer.
  if (!empreintesVues || forme.length > FORME_MEMORISEE_MAX) return sha256Hex(forme);
  let e = empreintesVues.get(forme);
  if (e === undefined) { e = sha256Hex(forme); empreintesVues.set(forme, e); }
  return e;
}

export const EMPREINTE_VALIDE = /^[a-f0-9]{64}$/;
