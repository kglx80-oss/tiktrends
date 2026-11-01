/**
 * Archive ZIP « store » (sans compression), écrite EN FLUX · règle pure.
 *
 * Ni base, ni réseau : on reçoit des entrées dont les octets arrivent par
 * morceaux (`AsyncIterable<Uint8Array>`) et on rend les morceaux de l'archive
 * dans l'ordre. Aucun fichier n'est gardé en mémoire · seul le répertoire
 * central (nom, empreinte, taille, position · quelques dizaines d'octets par
 * entrée) l'est jusqu'à la fin.
 *
 * ── Pourquoi une écriture maison, et pas une dépendance ──────────────────────
 *
 * Aucune bibliothèque ZIP n'est présente dans le dépôt. Le format « store »
 * tient en trois structures fixes (en-tête local, descripteur, répertoire
 * central) et n'a besoin que d'un CRC-32 · moins de code qu'une dépendance à
 * relire, et chaque octet est éprouvé par un lecteur indépendant dans les tests
 * (`apps/web/test/bibliotheque-archive-db.test.ts`, CRC de `node:zlib`).
 * Les médias (JPEG, MP4, WebP…) sont déjà compressés · les dégonfler ne
 * gagnerait presque rien et coûterait du processeur.
 *
 * ── Les choix de format ──────────────────────────────────────────────────────
 *
 *  · Le CRC et la taille ne sont connus qu'APRÈS les octets · drapeau 3
 *    (descripteur de données après chaque fichier), comme les archives écrites
 *    en flux par Go (`archive/zip`) ou `client-zip`. Les lecteurs courants
 *    (Explorateur Windows, Utilitaire d'archive macOS, `unzip`, 7-Zip) lisent
 *    le répertoire central, qui porte les vraies valeurs.
 *  · Noms en UTF-8 · drapeau 11, doublé du champ « Unicode Path » d'Info-ZIP
 *    (0x7075), que l'Explorateur Windows lit quand il ignore le drapeau.
 *  · Pas de ZIP64 · toute position et toute taille tiennent sur 32 bits. Le
 *    plafond de volume de l'appelant (`PLAFOND_ARCHIVE_OCTETS`) est la moitié
 *    de cette limite ; le dépasser quand même lève `ErreurArchive` · l'archive
 *    est coupée, jamais rendue fausse.
 */

/* ───────────────────────────── CRC-32 (IEEE 802.3) ───────────────────────────── */

/** Tables « slicing-by-8 » · 8 × 256 mots, calculées une fois. */
const TABLES: Uint32Array[] = (() => {
  const t: Uint32Array[] = Array.from({ length: 8 }, () => new Uint32Array(256));
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[0]![n] = c >>> 0;
  }
  for (let n = 0; n < 256; n++) {
    let c = t[0]![n]!;
    for (let k = 1; k < 8; k++) { c = t[0]![c & 0xff]! ^ (c >>> 8); t[k]![n] = c >>> 0; }
  }
  return t;
})();

/** CRC-32 incrémental · `crc32(b, crc32(a)) === crc32(a + b)`. */
export function crc32(octets: Uint8Array, precedent = 0): number {
  const [t0, t1, t2, t3, t4, t5, t6, t7] = TABLES as [Uint32Array, Uint32Array, Uint32Array, Uint32Array, Uint32Array, Uint32Array, Uint32Array, Uint32Array];
  let c = ~precedent >>> 0;
  let i = 0;
  const n = octets.length;
  for (; i + 8 <= n; i += 8) {
    const a = (c ^ (octets[i]! | (octets[i + 1]! << 8) | (octets[i + 2]! << 16) | (octets[i + 3]! << 24))) >>> 0;
    c = t7[a & 0xff]! ^ t6[(a >>> 8) & 0xff]! ^ t5[(a >>> 16) & 0xff]! ^ t4[a >>> 24]!
      ^ t3[octets[i + 4]!]! ^ t2[octets[i + 5]!]! ^ t1[octets[i + 6]!]! ^ t0[octets[i + 7]!]!;
  }
  for (; i < n; i++) c = t0[(c ^ octets[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

/* ───────────────────────────── Structures ───────────────────────────── */

const MAX_32 = 0xffffffff;
const MAX_ENTREES = 0xffff;
/** Drapeaux · bit 3 (descripteur après les octets) + bit 11 (noms UTF-8). */
const DRAPEAUX = 0x0808;
/** Version 2.0 · requise par le descripteur de données. */
const VERSION = 20;

export type CauseErreurArchive = 'volume' | 'format' | 'nom';

/** L'archive ne peut pas être écrite telle quelle · le flux est coupé (jamais une archive fausse). */
export class ErreurArchive extends Error {
  readonly motif: CauseErreurArchive;
  constructor(motif: CauseErreurArchive, message: string) { super(message); this.name = 'ErreurArchive'; this.motif = motif; }
}

export interface EntreeZip {
  /** Nom DANS l'archive · déjà assaini par l'appelant (`nomsArchive`). */
  nom: string;
  /** Date de modification affichée par le lecteur (heure UTC). */
  date: Date;
  octets: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
}

export interface OptionsZip {
  /** Volume maximal des OCTETS des fichiers · au-delà, `ErreurArchive('volume')`. */
  plafondOctets?: number;
  /** Un CRC-32 natif (`node:zlib`) · même résultat, plus rapide. Défaut : `crc32` ci-dessus. */
  crc?: (octets: Uint8Array, precedent: number) => number;
}

/** Date et heure au format MS-DOS (précision de 2 s, années 1980 à 2107). */
export function dateDos(d: Date): { date: number; heure: number } {
  const t = Number.isFinite(d.getTime()) ? d : new Date(Date.UTC(1980, 0, 1));
  const an = Math.min(2107, Math.max(1980, t.getUTCFullYear()));
  if (an !== t.getUTCFullYear()) return { date: ((an - 1980) << 9) | (1 << 5) | 1, heure: 0 };
  return {
    date: ((an - 1980) << 9) | ((t.getUTCMonth() + 1) << 5) | t.getUTCDate(),
    heure: (t.getUTCHours() << 11) | (t.getUTCMinutes() << 5) | (t.getUTCSeconds() >> 1),
  };
}

const utf8 = new TextEncoder();

/** Champ « Unicode Path » d'Info-ZIP (0x7075) · version 1, CRC du nom de l'en-tête, nom UTF-8. */
function champUnicode(nom: Uint8Array): Uint8Array {
  const b = new Uint8Array(4 + 5 + nom.length);
  const v = new DataView(b.buffer);
  v.setUint16(0, 0x7075, true);
  v.setUint16(2, 5 + nom.length, true);
  b[4] = 1;
  v.setUint32(5, crc32(nom), true);
  b.set(nom, 9);
  return b;
}

function enteteLocal(nom: Uint8Array, extra: Uint8Array, dos: { date: number; heure: number }): Uint8Array {
  const b = new Uint8Array(30 + nom.length + extra.length);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, VERSION, true);
  v.setUint16(6, DRAPEAUX, true);
  v.setUint16(8, 0, true); // méthode 0 · stockée
  v.setUint16(10, dos.heure, true);
  v.setUint16(12, dos.date, true);
  // CRC et tailles à zéro · ils suivent dans le descripteur (bit 3).
  v.setUint16(26, nom.length, true);
  v.setUint16(28, extra.length, true);
  b.set(nom, 30);
  b.set(extra, 30 + nom.length);
  return b;
}

function descripteur(crc: number, taille: number): Uint8Array {
  const b = new Uint8Array(16);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x08074b50, true);
  v.setUint32(4, crc, true);
  v.setUint32(8, taille, true);
  v.setUint32(12, taille, true);
  return b;
}

interface Central { nom: Uint8Array; extra: Uint8Array; dos: { date: number; heure: number }; crc: number; taille: number; position: number }

function enteteCentral(e: Central): Uint8Array {
  const b = new Uint8Array(46 + e.nom.length + e.extra.length);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x02014b50, true);
  v.setUint16(4, VERSION, true); // « fait par » · MS-DOS, 2.0
  v.setUint16(6, VERSION, true);
  v.setUint16(8, DRAPEAUX, true);
  v.setUint16(10, 0, true);
  v.setUint16(12, e.dos.heure, true);
  v.setUint16(14, e.dos.date, true);
  v.setUint32(16, e.crc, true);
  v.setUint32(20, e.taille, true);
  v.setUint32(24, e.taille, true);
  v.setUint16(28, e.nom.length, true);
  v.setUint16(30, e.extra.length, true);
  // commentaire, disque, attributs internes et externes · zéro.
  v.setUint32(42, e.position, true);
  b.set(e.nom, 46);
  b.set(e.extra, 46 + e.nom.length);
  return b;
}

function finRepertoire(n: number, taille: number, position: number): Uint8Array {
  const b = new Uint8Array(22);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, n, true);
  v.setUint16(10, n, true);
  v.setUint32(12, taille, true);
  v.setUint32(16, position, true);
  return b;
}

/**
 * Les morceaux de l'archive, dans l'ordre · chaque fichier est lu UNE fois,
 * morceau par morceau, et repart aussitôt. Une erreur de lecture d'un fichier
 * (ou `ErreurArchive`) remonte telle quelle · l'appelant coupe le flux.
 */
export async function* fluxZip(entrees: AsyncIterable<EntreeZip> | Iterable<EntreeZip>, o: OptionsZip = {}): AsyncGenerator<Uint8Array, void, undefined> {
  const plafond = o.plafondOctets ?? MAX_32;
  const crcDe = o.crc ?? crc32;
  const centraux: Central[] = [];
  let position = 0;
  let volume = 0;
  for await (const e of entrees) {
    if (centraux.length >= MAX_ENTREES) throw new ErreurArchive('format', 'Trop de fichiers pour une archive.');
    const nom = utf8.encode(e.nom);
    if (!nom.length || nom.length > 0xffff - 9) throw new ErreurArchive('nom', 'Nom de fichier invalide dans l’archive.');
    const extra = champUnicode(nom);
    const dos = dateDos(e.date);
    const tete = enteteLocal(nom, extra, dos);
    const debut = position;
    yield tete;
    position += tete.length;
    let crc = 0;
    let taille = 0;
    for await (const morceau of e.octets) {
      if (!morceau.length) continue;
      taille += morceau.length;
      volume += morceau.length;
      if (volume > plafond) throw new ErreurArchive('volume', 'Le volume de l’archive dépasse son plafond.');
      if (position + morceau.length > MAX_32) throw new ErreurArchive('format', 'Archive trop grande pour le format ZIP sans extension 64 bits.');
      crc = crcDe(morceau, crc);
      yield morceau;
      position += morceau.length;
    }
    const fin = descripteur(crc >>> 0, taille);
    yield fin;
    position += fin.length;
    centraux.push({ nom, extra, dos, crc: crc >>> 0, taille, position: debut });
  }
  const debutCentral = position;
  for (const c of centraux) {
    const b = enteteCentral(c);
    position += b.length;
    if (position > MAX_32) throw new ErreurArchive('format', 'Archive trop grande pour le format ZIP sans extension 64 bits.');
    yield b;
  }
  yield finRepertoire(centraux.length, position - debutCentral, debutCentral);
}
