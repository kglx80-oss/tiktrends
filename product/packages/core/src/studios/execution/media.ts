/**
 * Studios · L3 · premier filtre des médias, règles du décodage réel, contrôle
 * qualité automatique (cahier 01 §9.1).
 *
 * Pur. Ce module ne DÉCODE rien et ne dit donc jamais « décodable » : il dit
 * « structure plausible ». `completed` exige en plus un décodage RÉEL, fait
 * par le worker (`DecodeurMedia`, pixels complets), dont ce module juge le
 * résultat (`verdictDecodage`). Recette du 8 octobre : un MP4 de 88 octets
 * (ftyp + moov et mdat remplis de zéros, aucune piste) passait pour lisible, et
 * une image aux CRC justes mais à la charge utile abîmée aussi.
 *
 * Le premier filtre lit les octets réels (pas le type annoncé) et exige un
 * fichier COMPLET et COHÉRENT, pas seulement un en-tête valide :
 *  - PNG · chaque bloc dans les bornes, CRC juste, IHDR en tête, au moins un
 *    IDAT, IEND exactement en fin de fichier ;
 *  - JPEG · segments dans les bornes, un SOFn, un SOS, fin EOI (FFD9) ;
 *  - WebP · taille RIFF égale à la taille réelle, blocs dans les bornes ;
 *  - MP4 · boîtes de premier niveau qui couvrent exactement le fichier, `ftyp`,
 *    `moov`, `mdat`, et dans `moov` au moins une piste VIDÉO complète :
 *    `trak/mdia/hdlr` de type `vide`, description d'échantillon (`stsd`) non
 *    vide aux dimensions non nulles, nombre d'échantillons > 0 (`stsz`/`stz2`),
 *    décalages de morceaux (`stco`/`co64`) qui tombent tous dans un `mdat`, et
 *    des échantillons qui tiennent dans les données.
 * Un CRC juste ne prouve pas que les pixels se décodent (le flux zlib d'un PNG,
 * le flux entropique d'un JPEG peuvent être abîmés) : seul le décodeur le dit.
 *
 * La QUALITÉ est séparée : un fichier parfaitement décodé peut montrer le
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
 * Le diagnostic du PREMIER FILTRE, qui décide de la suite au worker :
 *  - `structure_plausible` · à confier au décodeur réel, jamais livrable seul ;
 *  - `incomplet` · format reconnu mais fichier tronqué, abîmé ou sans contenu
 *    (MP4 sans piste) : on RETÉLÉCHARGE, en nombre borné
 *    (`decisionMediaRefuse`), rien n'est livré ni réglé entre-temps ;
 *  - `illisible` · ce n'est pas un média (page d'erreur, texte) : échec.
 */
export function etatFichierMedia(o: Uint8Array): 'structure_plausible' | 'incomplet' | 'illisible' {
  if (inspecterMedia(o)) return 'structure_plausible';
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

interface Boite { type: string; debut: number; fin: number }

/**
 * Boîtes ISO-BMFF entre `debut` et `fin`, qui doivent couvrir EXACTEMENT la
 * plage (`debut` = première boîte, `fin` = fin des données utiles). `null` si
 * une boîte déborde ou ne tombe pas juste.
 */
function boites(o: Uint8Array, debut: number, fin: number): Boite[] | null {
  const r: Boite[] = [];
  let i = debut;
  while (i < fin) {
    if (i + 8 > fin) return null;
    let taille = u32be(o, i);
    const type = ascii(o, i + 4, 4);
    let entete = 8;
    if (taille === 1) {
      if (i + 16 > fin) return null;
      if (u32be(o, i + 8) !== 0) return null;
      taille = u32be(o, i + 12);
      entete = 16;
    } else if (taille === 0) {
      taille = fin - i;
    }
    if (taille < entete || i + taille > fin) return null;
    r.push({ type, debut: i + entete, fin: i + taille });
    i += taille;
  }
  return r;
}

const enfant = (o: Uint8Array, b: Boite | undefined, type: string): Boite | undefined =>
  b ? boites(o, b.debut, b.fin)?.find((x) => x.type === type) : undefined;

/** Une piste vidéo complète · ses dimensions, ou `null`. */
function pisteVideo(o: Uint8Array, trak: Boite, mdats: ReadonlyArray<Boite>): { largeur: number; hauteur: number } | null {
  const mdia = enfant(o, trak, 'mdia');
  const hdlr = enfant(o, mdia, 'hdlr');
  // hdlr : version+drapeaux (4), pre_defined (4), handler_type (4).
  if (!hdlr || hdlr.fin - hdlr.debut < 12 || ascii(o, hdlr.debut + 8, 4) !== 'vide') return null;
  const stbl = enfant(o, enfant(o, mdia, 'minf'), 'stbl');
  if (!stbl) return null;
  const table = boites(o, stbl.debut, stbl.fin);
  if (!table) return null;
  const de = (t: string) => table.find((x) => x.type === t);

  // stsd : version+drapeaux (4), nombre d'entrées (4), puis des entrées dont la
  // première est une VisualSampleEntry (8 + 78 octets au moins) aux
  // dimensions non nulles (largeur, hauteur à +24 et +26 de ses données).
  const stsd = de('stsd');
  if (!stsd || stsd.fin - stsd.debut < 8 || u32be(o, stsd.debut + 4) === 0) return null;
  const entrees = boites(o, stsd.debut + 8, stsd.fin);
  const e = entrees?.[0];
  if (!e || e.fin - e.debut < 78) return null;
  const largeur = u16be(o, e.debut + 24);
  const hauteur = u16be(o, e.debut + 26);
  if (largeur === 0 || hauteur === 0) return null;

  // Nombre et taille des échantillons.
  let echantillons = 0;
  let octetsEchantillons = 0;
  const stsz = de('stsz');
  const stz2 = de('stz2');
  if (stsz) {
    if (stsz.fin - stsz.debut < 12) return null;
    const taille = u32be(o, stsz.debut + 4);
    echantillons = u32be(o, stsz.debut + 8);
    if (taille !== 0) octetsEchantillons = taille * echantillons;
    else {
      if (stsz.debut + 12 + 4 * echantillons > stsz.fin) return null;
      for (let k = 0; k < echantillons; k++) octetsEchantillons += u32be(o, stsz.debut + 12 + 4 * k);
    }
  } else if (stz2) {
    if (stz2.fin - stz2.debut < 12) return null;
    const champ = o[stz2.debut + 7]!;
    echantillons = u32be(o, stz2.debut + 8);
    if (![4, 8, 16].includes(champ) || stz2.debut + 12 + Math.ceil((champ * echantillons) / 8) > stz2.fin) return null;
    for (let k = 0; k < echantillons; k++) {
      const p = stz2.debut + 12;
      octetsEchantillons += champ === 16 ? u16be(o, p + 2 * k) : champ === 8 ? o[p + k]! : (o[p + (k >> 1)]! >> (k % 2 ? 0 : 4)) & 0x0f;
    }
  } else return null;
  if (echantillons === 0 || octetsEchantillons === 0) return null;

  // Décalages de morceaux : tous dans les données d'un `mdat`.
  const stco = de('stco');
  const co64 = de('co64');
  const decalages: number[] = [];
  if (stco) {
    if (stco.fin - stco.debut < 8) return null;
    const n = u32be(o, stco.debut + 4);
    if (stco.debut + 8 + 4 * n > stco.fin) return null;
    for (let k = 0; k < n; k++) decalages.push(u32be(o, stco.debut + 8 + 4 * k));
  } else if (co64) {
    if (co64.fin - co64.debut < 8) return null;
    const n = u32be(o, co64.debut + 4);
    if (co64.debut + 8 + 8 * n > co64.fin) return null;
    for (let k = 0; k < n; k++) {
      if (u32be(o, co64.debut + 8 + 8 * k) !== 0) return null;
      decalages.push(u32be(o, co64.debut + 12 + 8 * k));
    }
  } else return null;
  if (decalages.length === 0) return null;
  if (!decalages.every((d) => mdats.some((m) => d >= m.debut && d < m.fin))) return null;
  const donnees = mdats.reduce((t, m) => t + (m.fin - m.debut), 0);
  if (octetsEchantillons > donnees) return null;
  return { largeur, hauteur };
}

function inspecterMp4(o: Uint8Array): EnteteMedia | null {
  const haut = boites(o, 0, o.length);
  if (!haut || haut[0]?.type !== 'ftyp') return null;
  const moov = haut.find((b) => b.type === 'moov');
  const mdats = haut.filter((b) => b.type === 'mdat' && b.fin > b.debut);
  if (!moov || mdats.length === 0) return null;
  const pistes = boites(o, moov.debut, moov.fin);
  if (!pistes) return null;
  for (const trak of pistes.filter((b) => b.type === 'trak')) {
    const v = pisteVideo(o, trak, mdats);
    if (v) return { mime: 'video/mp4', ...v };
  }
  return null;
}

/* ─────────────────────────── Décodage réel ──────────────────────────────── */

/**
 * Résultat d'un décodage RÉEL (pixels complets pour une image, images
 * décodées pour une vidéo). `cause: 'decodeur'` = l'outil lui-même manque ou
 * plante (binaire absent) : c'est l'infrastructure, pas le fichier.
 */
export type ResultatDecodage =
  | { ok: true; largeur: number; hauteur: number; canaux: number; octetsPixels: number }
  | { ok: false; cause: 'contenu' | 'decodeur'; raison: string };

/**
 * Le décodeur du worker. `decoderVideo` ABSENT = aucun décodeur vidéo : une
 * vidéo n'est alors jamais vérifiable, donc jamais livrable, et la capacité
 * vidéo n'est jamais offerte (`operationsNonVerifiables`).
 */
export interface DecodeurMedia {
  decoderImage(octets: Uint8Array): Promise<ResultatDecodage>;
  decoderVideo?: (octets: Uint8Array) => Promise<ResultatDecodage>;
}

export type VerdictDecodage =
  | { livrable: true; largeur: number; hauteur: number }
  /** `retelecharger` · fichier abîmé, retéléchargé en nombre borné · `attendre` · décodeur indisponible, rien n'est compté · `refuser` · jamais vérifiable ici. */
  | { livrable: false; suite: 'retelecharger' | 'attendre' | 'refuser'; raison: string };

/**
 * Juge un décodage réel contre l'en-tête lu par le premier filtre. Livrable
 * seulement si le décodeur a rendu TOUS les pixels (largeur × hauteur ×
 * canaux) aux dimensions annoncées par l'en-tête. Un décodage absent (vidéo
 * sans décodeur) n'est jamais une réussite.
 */
export function verdictDecodage(entete: EnteteMedia, d: ResultatDecodage | 'decodeur_absent'): VerdictDecodage {
  if (d === 'decodeur_absent') {
    return { livrable: false, suite: 'refuser', raison: `${entete.mime} non vérifiable · aucun décodeur ${entete.mime.startsWith('video/') ? 'vidéo' : 'image'} dans le worker` };
  }
  if (!d.ok) return { livrable: false, suite: d.cause === 'decodeur' ? 'attendre' : 'retelecharger', raison: d.raison };
  if (d.largeur !== entete.largeur || d.hauteur !== entete.hauteur) {
    return { livrable: false, suite: 'retelecharger', raison: `décodé en ${d.largeur}×${d.hauteur}, en-tête ${entete.largeur}×${entete.hauteur}` };
  }
  if (entete.mime.startsWith('image/') && (d.canaux < 1 || d.octetsPixels !== d.largeur * d.hauteur * d.canaux)) {
    return { livrable: false, suite: 'retelecharger', raison: `pixels incomplets · ${d.octetsPixels} octets pour ${d.largeur}×${d.hauteur}×${d.canaux}` };
  }
  return { livrable: true, largeur: d.largeur, hauteur: d.hauteur };
}

/**
 * Téléchargements d'un même résultat avant de conclure qu'il est abîmé chez
 * le fournisseur. Politique, pas une mesure : un transfert coupé se rattrape
 * au deuxième essai, un fichier abîmé à la source reste abîmé ; trois laisse
 * une marge sans boucler. Le test de troncature (deux coupures puis le fichier
 * complet) tient dans cette borne.
 */
export const TELECHARGEMENTS_MEDIA_MAX = 3;

/** Après `essais` téléchargements refusés (celui-ci compris) : retenter ou conclure. */
export function decisionMediaRefuse(essais: number): 'retelecharger' | 'echec' {
  return essais < TELECHARGEMENTS_MEDIA_MAX ? 'retelecharger' : 'echec';
}

/**
 * Le worker sait-il DÉCODER une vidéo ? Non : ni ffmpeg ni ffprobe dans son
 * image (contre-recette du 8 octobre). Source unique pour le devis (refus dès
 * le devis) et pour le worker (refus avant soumission) · à passer à `true`
 * seulement avec un décodeur vidéo réel prouvé sur une vraie vidéo.
 */
export const DECODEUR_VIDEO_WORKER = false;

/**
 * Opérations dont la sortie ne pourrait PAS être vérifiée par ce worker : une
 * animation sans décodeur vidéo. Elles ne sont jamais soumises au fournisseur
 * (rien n'est dépensé pour un résultat qu'on refuserait).
 */
export function operationsNonVerifiables(
  operations: ReadonlyArray<{ operation: string; profil: string }>,
  decodeur: { video: boolean },
): string[] {
  return operations.filter((op) => op.profil === 'animation' && !decodeur.video).map((op) => op.operation);
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
