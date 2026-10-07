/**
 * Studios · L3 · « décodable » et contrôle qualité automatique (cahier 01 §9.1).
 *
 * Pur. `completed` veut dire : fichier stocké, DÉCODABLE, relié. Le statut HTTP
 * du fournisseur ne suffit pas. On lit l'en-tête réel des octets (pas le type
 * annoncé) : PNG (IHDR), JPEG (SOFn), WebP (VP8/VP8L/VP8X), MP4 (`ftyp`).
 * Un en-tête illisible ou des dimensions nulles = pas décodable.
 *
 * La QUALITÉ est séparée : un fichier parfaitement décodable peut montrer le
 * mauvais produit. Le contrôle automatique ne fait que lever le doute
 * (`requires_review`) ; il ne relance jamais une génération payante.
 */

export interface EnteteMedia {
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4';
  largeur: number | null;
  hauteur: number | null;
}

const u32be = (o: Uint8Array, i: number) => ((o[i]! << 24) >>> 0) + (o[i + 1]! << 16) + (o[i + 2]! << 8) + o[i + 3]!;
const u16be = (o: Uint8Array, i: number) => (o[i]! << 8) + o[i + 1]!;
const u16le = (o: Uint8Array, i: number) => o[i]! + (o[i + 1]! << 8);
const u24le = (o: Uint8Array, i: number) => o[i]! + (o[i + 1]! << 8) + (o[i + 2]! << 16);
const ascii = (o: Uint8Array, i: number, n: number) => String.fromCharCode(...o.subarray(i, i + n));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function inspecterMedia(o: Uint8Array): EnteteMedia | null {
  if (o.length >= 24 && PNG.every((b, i) => o[i] === b) && ascii(o, 12, 4) === 'IHDR') {
    const l = u32be(o, 16);
    const h = u32be(o, 20);
    return l > 0 && h > 0 ? { mime: 'image/png', largeur: l, hauteur: h } : null;
  }
  if (o.length >= 4 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) {
    let i = 2;
    while (i + 9 < o.length) {
      if (o[i] !== 0xff) return null;
      const m = o[i + 1]!;
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
      const long = u16be(o, i + 2);
      if (long < 2) return null;
      const sof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
      if (sof) {
        const h = u16be(o, i + 5);
        const l = u16be(o, i + 7);
        return l > 0 && h > 0 ? { mime: 'image/jpeg', largeur: l, hauteur: h } : null;
      }
      i += 2 + long;
    }
    return null;
  }
  if (o.length >= 30 && ascii(o, 0, 4) === 'RIFF' && ascii(o, 8, 4) === 'WEBP') {
    const bloc = ascii(o, 12, 4);
    if (bloc === 'VP8X') return { mime: 'image/webp', largeur: u24le(o, 24) + 1, hauteur: u24le(o, 27) + 1 };
    if (bloc === 'VP8 ') {
      const l = u16le(o, 26) & 0x3fff;
      const h = u16le(o, 28) & 0x3fff;
      return l > 0 && h > 0 ? { mime: 'image/webp', largeur: l, hauteur: h } : null;
    }
    if (bloc === 'VP8L' && o[20] === 0x2f) {
      const b = o.subarray(21, 25);
      const l = 1 + (((b[1]! & 0x3f) << 8) | b[0]!);
      const h = 1 + (((b[3]! & 0x0f) << 10) | (b[2]! << 2) | ((b[1]! & 0xc0) >> 6));
      return { mime: 'image/webp', largeur: l, hauteur: h };
    }
    return null;
  }
  if (o.length >= 12 && ascii(o, 4, 4) === 'ftyp') {
    return { mime: 'video/mp4', largeur: null, hauteur: null };
  }
  return null;
}

/** Ce que le fournisseur (ou un contrôle automatique) dit d'une sortie. */
export interface ConstatSortie {
  /** `false` = le produit visible ne correspond pas à la référence ; `null` = non vérifié. */
  produitConforme?: boolean | null;
}

export type VerdictQualiteAuto = 'pending' | 'requires_review';

/**
 * Un seul constat négatif suffit à demander une relecture humaine. Aucun
 * constat (ou non vérifié) laisse `pending` : l'absence de preuve n'est pas
 * une validation.
 */
export function verdictQualiteAuto(constats: ReadonlyArray<ConstatSortie | null | undefined>): VerdictQualiteAuto {
  return constats.some((c) => c?.produitConforme === false) ? 'requires_review' : 'pending';
}
