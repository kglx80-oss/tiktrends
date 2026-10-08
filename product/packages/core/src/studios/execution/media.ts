/**
 * Studios · L3 · « décodable » et contrôle qualité automatique (cahier 01 §9.1).
 *
 * Pur. `completed` veut dire : fichier stocké, DÉCODABLE, relié. Le statut HTTP
 * du fournisseur ne suffit pas. On lit les octets réels (pas le type annoncé)
 * et on exige un fichier COMPLET, pas seulement un en-tête valide :
 *  - PNG · chaque bloc dans les bornes, CRC juste, IHDR en tête, au moins un
 *    IDAT, IEND exactement en fin de fichier ;
 *  - JPEG · segments dans les bornes, un SOFn, un SOS, fin EOI (FFD9) ;
 *  - WebP · taille RIFF égale à la taille réelle, blocs dans les bornes ;
 *  - MP4 · boîtes de premier niveau qui couvrent exactement le fichier, avec
 *    `ftyp`, `moov` et des données (`mdat` ou `moof`).
 * Un fichier tronqué, altéré ou suivi d'octets parasites = pas décodable
 * (recette Codex du 8 octobre : un fichier coupé passait sur son seul en-tête).
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
  if (o.length >= 8 && PNG.every((b, i) => o[i] === b)) return inspecterPng(o);
  if (o.length >= 4 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return inspecterJpeg(o);
  if (o.length >= 12 && ascii(o, 0, 4) === 'RIFF' && ascii(o, 8, 4) === 'WEBP') return inspecterWebp(o);
  if (o.length >= 12 && ascii(o, 4, 4) === 'ftyp') return inspecterMp4(o);
  return null;
}

/**
 * Le diagnostic qui décide de la suite au worker :
 *  - `complet` · livrable ;
 *  - `incomplet` · format reconnu mais fichier tronqué ou abîmé, le plus
 *    souvent un transfert coupé : on RETÉLÉCHARGE (échec de persistance), on
 *    ne conclut ni au succès, ni à l'échec facturé ;
 *  - `illisible` · ce n'est pas un média (page d'erreur, texte) : échec.
 */
export function etatFichierMedia(o: Uint8Array): 'complet' | 'incomplet' | 'illisible' {
  if (inspecterMedia(o)) return 'complet';
  const reconnu = (o.length >= 8 && PNG.every((b, i) => o[i] === b))
    || (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff)
    || (o.length >= 12 && ascii(o, 0, 4) === 'RIFF' && ascii(o, 8, 4) === 'WEBP')
    || (o.length >= 8 && ascii(o, 4, 4) === 'ftyp');
  return reconnu ? 'incomplet' : 'illisible';
}

const TABLE_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(o: Uint8Array, debut: number, fin: number): number {
  let c = 0xffffffff;
  for (let i = debut; i < fin; i++) c = TABLE_CRC[(c ^ o[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function inspecterPng(o: Uint8Array): EnteteMedia | null {
  let i = 8;
  let entete: EnteteMedia | null = null;
  let idat = false;
  while (i + 12 <= o.length) {
    const long = u32be(o, i);
    const type = ascii(o, i + 4, 4);
    const fin = i + 12 + long;
    if (fin > o.length) return null;
    if (crc32(o, i + 4, i + 8 + long) !== u32be(o, i + 8 + long)) return null;
    if (i === 8) {
      if (type !== 'IHDR' || long !== 13) return null;
      const l = u32be(o, i + 8);
      const h = u32be(o, i + 12);
      if (l === 0 || h === 0) return null;
      entete = { mime: 'image/png', largeur: l, hauteur: h };
    }
    if (type === 'IDAT') idat = true;
    if (type === 'IEND') return fin === o.length && idat ? entete : null;
    i = fin;
  }
  return null;
}

function inspecterJpeg(o: Uint8Array): EnteteMedia | null {
  let i = 2;
  let entete: EnteteMedia | null = null;
  while (i + 4 <= o.length) {
    if (o[i] !== 0xff) return null;
    const m = o[i + 1]!;
    if (m === 0xff) { i += 1; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    if (m === 0xd9) return null;
    const long = u16be(o, i + 2);
    if (long < 2 || i + 2 + long > o.length) return null;
    const sof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (sof) {
      if (long < 7) return null;
      const h = u16be(o, i + 5);
      const l = u16be(o, i + 7);
      if (l === 0 || h === 0) return null;
      entete = { mime: 'image/jpeg', largeur: l, hauteur: h };
    }
    if (m === 0xda) {
      // Données d'image : elles courent jusqu'au marqueur de fin, qui doit
      // terminer le fichier. Coupé avant ⇒ pas de FFD9 final.
      if (!entete) return null;
      return o.length >= i + 2 + long + 2 && o[o.length - 2] === 0xff && o[o.length - 1] === 0xd9 ? entete : null;
    }
    i += 2 + long;
  }
  return null;
}

function inspecterWebp(o: Uint8Array): EnteteMedia | null {
  const tailleRiff = (o[4]! | (o[5]! << 8) | (o[6]! << 16) | (o[7]! << 24)) >>> 0;
  if (tailleRiff + 8 !== o.length || o.length < 30) return null;
  let i = 12;
  let entete: EnteteMedia | null = null;
  let image = false;
  while (i + 8 <= o.length) {
    const bloc = ascii(o, i, 4);
    const long = (o[i + 4]! | (o[i + 5]! << 8) | (o[i + 6]! << 16) | (o[i + 7]! << 24)) >>> 0;
    const fin = i + 8 + long + (long % 2);
    if (i + 8 + long > o.length) return null;
    const d = i + 8;
    if (bloc === 'VP8X' && long >= 10) entete = { mime: 'image/webp', largeur: u24le(o, d + 4) + 1, hauteur: u24le(o, d + 7) + 1 };
    if (bloc === 'VP8 ' && long >= 10) {
      image = true;
      const l = u16le(o, d + 6) & 0x3fff;
      const h = u16le(o, d + 8) & 0x3fff;
      if (l === 0 || h === 0) return null;
      entete ??= { mime: 'image/webp', largeur: l, hauteur: h };
    }
    if (bloc === 'VP8L' && long >= 5) {
      if (o[d] !== 0x2f) return null;
      image = true;
      const b = o.subarray(d + 1, d + 5);
      entete ??= { mime: 'image/webp', largeur: 1 + (((b[1]! & 0x3f) << 8) | b[0]!), hauteur: 1 + (((b[3]! & 0x0f) << 10) | (b[2]! << 2) | ((b[1]! & 0xc0) >> 6)) };
    }
    if (bloc === 'ANMF') image = true;
    i = fin;
  }
  return i === o.length && image ? entete : null;
}

function inspecterMp4(o: Uint8Array): EnteteMedia | null {
  let i = 0;
  const vus = new Set<string>();
  while (i < o.length) {
    if (i + 8 > o.length) return null;
    let taille = u32be(o, i);
    const type = ascii(o, i + 4, 4);
    if (taille === 1) {
      if (i + 16 > o.length) return null;
      const haut = u32be(o, i + 8);
      if (haut !== 0) return null;
      taille = u32be(o, i + 12);
    } else if (taille === 0) {
      taille = o.length - i;
    }
    if (taille < 8 || i + taille > o.length) return null;
    vus.add(type);
    i += taille;
  }
  return vus.has('ftyp') && vus.has('moov') && (vus.has('mdat') || vus.has('moof')) ? { mime: 'video/mp4', largeur: null, hauteur: null } : null;
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
