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

function canon(v: unknown, chemin: string, vus: Set<object>): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'boolean':
      return v ? 'true' : 'false';
    case 'string':
      return JSON.stringify(v);
    case 'number':
      if (!Number.isFinite(v)) throw new ErreurCanonique(chemin, 'nombre non fini');
      return JSON.stringify(v);
    case 'object': {
      if (vus.has(v)) throw new ErreurCanonique(chemin, 'référence circulaire');
      vus.add(v);
      let s: string;
      if (Array.isArray(v)) {
        s = '[' + v.map((x, i) => canon(x, `${chemin}/${i}`, vus)).join(',') + ']';
      } else {
        const proto = Object.getPrototypeOf(v);
        if (proto !== Object.prototype && proto !== null) throw new ErreurCanonique(chemin, 'objet non JSON');
        const cles = Object.keys(v).sort();
        s = '{' + cles.map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k], `${chemin}/${echapperSegment(k)}`, vus)}`).join(',') + '}';
      }
      vus.delete(v);
      return s;
    }
    default:
      throw new ErreurCanonique(chemin, `valeur ${typeof v} hors JSON`);
  }
}

/** JSON canonique · lève `ErreurCanonique` sur une valeur hors JSON. */
export function jsonCanonique(v: unknown): string {
  return canon(v, '', new Set());
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

/** SHA-256 d'une suite d'octets, en hexadécimal minuscule. */
export function sha256OctetsHex(donnees: Uint8Array): string {
  const longueurBits = donnees.length * 8;
  const total = ((donnees.length + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(total);
  m.set(donnees);
  m[donnees.length] = 0x80;
  const vue = new DataView(m.buffer);
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

/** SHA-256 du texte encodé en UTF-8. */
export function sha256Hex(texte: string): string {
  return sha256OctetsHex(new TextEncoder().encode(texte));
}

/** Empreinte d'un contenu JSON · SHA-256 de sa forme canonique. */
export function empreinteContenu(v: unknown): string {
  return sha256Hex(jsonCanonique(v));
}

export const EMPREINTE_VALIDE = /^[a-f0-9]{64}$/;
