/**
 * Médias de la bibliothèque servis sur l'origine de l'application · la règle,
 * pure.
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * L'import par lien acceptait tout `image/*`, donc `image/svg+xml`. Le SVG était
 * gardé en `data:` URI, puis servi par `/api/asset/[id]` avec le type STOCKÉ,
 * sans `nosniff` ni CSP. Un SVG porte du script : un membre importe le fichier,
 * un owner clique « ouvrir ↗ », le script s'exécute sur l'origine de
 * l'application, avec la session de la victime. Côté Drive, le type servi
 * venait même du NAVIGATEUR (`PickedFile.mimeType`) : un `text/html` passait.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * 1. Le type servi se LIT dans les octets (`typeMediaReel`), jamais dans une
 *    déclaration (en-tête du site distant, colonne `mime_type`, Drive, client).
 * 2. Il appartient à une liste FERMÉE de types qu'aucun navigateur n'exécute
 *    (`TYPES_MEDIA_SERVIS`) · images matricielles, vidéos, sons. Ni SVG, ni
 *    HTML, ni XML, ni PDF. Hors liste ⇒ téléchargement seul (point 4).
 * 3. Toute réponse, refus compris, porte des en-têtes fermés
 *    (`ENTETES_MEDIA_FERMES`) : `nosniff`, CSP `default-src 'none'; sandbox`
 *    (même ouvert seul dans un onglet, un document ne peut rien exécuter), et
 *    la réponse d'un média nomme son fichier (`content-disposition`).
 * 4. Un média existant dont les octets sont HORS liste (SVG ancien, TIFF,
 *    Ogg…) ne disparaît pas : il est servi en TÉLÉCHARGEMENT seul,
 *    `application/octet-stream` en pièce jointe, jamais inline, jamais avec
 *    son type déclaré.
 *
 * La liste couvre ce que la Bibliothèque accepte AUJOURD'HUI (sélecteur Drive :
 * png, jpeg, webp, gif, avif, mp4, quicktime, webm, mpeg, wav ; synchro de
 * dossier : `image/*`, `video/*`, `audio/*`, dont les HEIC des iPhone ;
 * téléversement direct : m4a) · ceux-là s'affichent. Les formats rares hors
 * liste (TIFF, Ogg…) s'importent encore par la synchro Drive, en
 * téléchargement seul (`entreeSynchroDrive`) ; les types exécutables (SVG,
 * HTML, XML) ne s'importent plus.
 *
 * ── Pourquoi une signature, et pas `inspecterMedia` ──────────────────────────
 *
 * `inspecterMedia` (Studios) exige un fichier COMPLET et cohérent (CRC justes,
 * FFD9 final, boîtes exactes) et ne connaît ni GIF, ni AVIF, ni WebM, ni MOV,
 * ni MP3, ni WAV. Appliqué à la bibliothèque, il refuserait des photos de
 * téléphone ordinaires (données après la fin d'image) et des vidéos déjà
 * importées. La sécurité ne vient pas de l'intégrité du fichier mais du TYPE
 * SERVI : un fichier qui commence comme un PNG est servi `image/png` avec
 * `nosniff`, et le navigateur ne le lira jamais comme un document, quoi qu'il
 * contienne ensuite. Les deux lectures concordent sur les formats communs
 * (garde `medias-servis.test.ts`).
 */

export type TypeMediaServi =
  | 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/avif' | 'image/heic'
  | 'video/mp4' | 'video/quicktime' | 'video/webm'
  | 'audio/mpeg' | 'audio/wav' | 'audio/mp4';

export type FamilleMedia = 'image' | 'video' | 'audio';

export const TYPES_MEDIA_SERVIS: Readonly<Record<TypeMediaServi, { extension: string; famille: FamilleMedia }>> = {
  'image/png': { extension: 'png', famille: 'image' },
  'image/jpeg': { extension: 'jpg', famille: 'image' },
  'image/webp': { extension: 'webp', famille: 'image' },
  'image/gif': { extension: 'gif', famille: 'image' },
  'image/avif': { extension: 'avif', famille: 'image' },
  'image/heic': { extension: 'heic', famille: 'image' },
  'video/mp4': { extension: 'mp4', famille: 'video' },
  'video/quicktime': { extension: 'mov', famille: 'video' },
  'video/webm': { extension: 'webm', famille: 'video' },
  'audio/mpeg': { extension: 'mp3', famille: 'audio' },
  'audio/wav': { extension: 'wav', famille: 'audio' },
  'audio/mp4': { extension: 'm4a', famille: 'audio' },
};

const ascii = (o: Uint8Array, i: number, n: number): string =>
  o.length >= i + n ? String.fromCharCode(...o.subarray(i, i + n)) : '';
const u32be = (o: Uint8Array, i: number): number =>
  ((o[i]! << 24) >>> 0) + (o[i + 1]! << 16) + (o[i + 2]! << 8) + o[i + 3]!;

/** Marques ISO-BMFF d'une IMAGE (HEIF) · AVIF d'abord, sinon HEIC (photos d'iPhone). */
const MARQUES_AVIF = new Set(['avif', 'avis']);
const MARQUES_IMAGE_HEIF = new Set(['mif1', 'msf1', 'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'miaf']);
const MARQUES_AUDIO = new Set(['M4A ', 'M4B ', 'M4P ']);
/** QuickTime ancien · pas de `ftyp`, le fichier commence par un de ces atomes. */
const ATOMES_QUICKTIME = new Set(['moov', 'mdat', 'wide', 'free', 'skip', 'pnot']);

function typeIsoBmff(o: Uint8Array): TypeMediaServi | null {
  const taille = u32be(o, 0);
  // Marque majeure (8..12), puis marques compatibles jusqu'à la fin de la boîte
  // `ftyp` (bornée : on ne lit pas au-delà du fichier ni d'une boîte absurde).
  const fin = Math.min(o.length, taille >= 16 && taille <= 256 ? taille : 16);
  const marques: string[] = [ascii(o, 8, 4)];
  for (let i = 16; i + 4 <= fin; i += 4) marques.push(ascii(o, i, 4));
  if (marques.some((m) => MARQUES_AVIF.has(m))) return 'image/avif';
  const majeure = marques[0]!;
  if (MARQUES_IMAGE_HEIF.has(majeure)) return 'image/heic';
  if (MARQUES_AUDIO.has(majeure)) return 'audio/mp4';
  if (majeure === 'qt  ') return 'video/quicktime';
  return 'video/mp4';
}

/**
 * Le type RÉEL d'un média, lu dans ses premiers octets · `null` quand ce n'est
 * pas un des types servis (SVG, HTML, XML, PDF, texte, inconnu).
 */
export function typeMediaReel(o: Uint8Array): TypeMediaServi | null {
  if (o.length < 4) return null;
  if (o.length >= 8 && o[0] === 0x89 && ascii(o, 1, 3) === 'PNG' && o[4] === 0x0d && o[5] === 0x0a && o[6] === 0x1a && o[7] === 0x0a) return 'image/png';
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'image/jpeg';
  const debut6 = ascii(o, 0, 6);
  if (debut6 === 'GIF87a' || debut6 === 'GIF89a') return 'image/gif';
  if (ascii(o, 0, 4) === 'RIFF' && ascii(o, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(o, 0, 4) === 'RIFF' && ascii(o, 8, 4) === 'WAVE') return 'audio/wav';
  if (o.length >= 12 && ascii(o, 4, 4) === 'ftyp') return typeIsoBmff(o);
  if (o.length >= 8 && ATOMES_QUICKTIME.has(ascii(o, 4, 4))) return 'video/quicktime';
  if (o[0] === 0x1a && o[1] === 0x45 && o[2] === 0xdf && o[3] === 0xa3) return 'video/webm';
  if (ascii(o, 0, 3) === 'ID3') return 'audio/mpeg';
  // Trame MPEG audio sans étiquette : synchro sur 11 bits, couche non nulle,
  // débit et fréquence valides (écarte un BOM UTF-16 `FF FE` suivi de texte).
  if (o[0] === 0xff && (o[1]! & 0xe0) === 0xe0 && (o[1]! & 0x06) !== 0
    && (o[2]! >> 4) !== 0x0f && ((o[2]! >> 2) & 0x03) !== 0x03) return 'audio/mpeg';
  return null;
}

/** Caractères base64 qu'il faut lire pour couvrir `typeMediaReel` (256 octets). */
export const DEBUT_BASE64_SIGNATURE = 344;

/**
 * Le type réel lu dans le DÉBUT base64 d'un `data:` URI (les
 * `DEBUT_BASE64_SIGNATURE` premiers caractères suffisent) · même règle que
 * `typeMediaReel`, sans charger le fichier entier. Sert à trier en masse
 * (migration vers le bucket, décompte) ce que l'on servirait de toute façon.
 */
export function typeMediaDebutBase64(debut: string | null | undefined): TypeMediaServi | null {
  const propre = (debut || '').replace(/[^A-Za-z0-9+/]/g, '');
  const n = propre.length - (propre.length % 4);
  if (n < 8) return null;
  let binaire: string;
  try { binaire = atob(propre.slice(0, n)); } catch { return null; }
  const o = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) o[i] = binaire.charCodeAt(i);
  return typeMediaReel(o);
}

/** Alias usuels d'un type DÉCLARÉ · jamais un type servi, seulement un filtre d'entrée. */
const ALIAS_DECLARES: Readonly<Record<string, TypeMediaServi>> = {
  'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'image/heif': 'image/heic',
  'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/vnd.wave': 'audio/wav',
  'audio/mp3': 'audio/mpeg', 'audio/x-m4a': 'audio/mp4', 'video/x-m4v': 'video/mp4',
};

/**
 * Un type DÉCLARÉ (Drive, site distant) ramené à la liste fermée, ou `null`.
 * Sert de PREMIER filtre là où les octets ne sont pas encore lus (vidéo Drive
 * non téléchargée à la synchro) · le type servi, lui, sera relu dans les octets.
 * Casse et paramètres ignorés (`IMAGE/PNG; charset=x` ⇒ `image/png`).
 */
export function typeMediaDeclare(declare: string | null | undefined): TypeMediaServi | null {
  const t = (declare || '').split(';')[0]!.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(TYPES_MEDIA_SERVIS, t)) return t as TypeMediaServi;
  return ALIAS_DECLARES[t] ?? null;
}

export function familleMedia(t: TypeMediaServi): FamilleMedia {
  return TYPES_MEDIA_SERVIS[t].famille;
}

/**
 * Ce qu'on retient d'un fichier à l'IMPORT ou à la SYNCHRO · le type déclaré
 * (Drive, site distant) ramené à la liste fermée, puis, quand les octets sont
 * là, le type RELU dans les octets, qui doit rester de la même famille. Un SVG,
 * un HTML, un type hors liste, ou une « image » dont les octets ne sont pas une
 * image ⇒ `null`, on n'importe pas. Sans octets (vidéo Drive non téléchargée),
 * le déclaré sert de premier filtre · le type SERVI sera relu dans les octets.
 */
export function typeMediaRetenu(mimeDeclare: string | null | undefined, octets?: Uint8Array): { type: TypeMediaServi; kind: FamilleMedia } | null {
  const declare = typeMediaDeclare(mimeDeclare);
  if (!declare) return null;
  if (!octets) return { type: declare, kind: familleMedia(declare) };
  const reel = typeMediaReel(octets);
  if (!reel || familleMedia(reel) !== familleMedia(declare)) return null;
  return { type: reel, kind: familleMedia(reel) };
}

/** Type déclaré qu'un navigateur peut exécuter comme document · jamais importé. */
const DECLARE_EXECUTABLE = /svg|xml|html|script|flash/;

/**
 * Synchro Drive · ce qu'on importe d'un fichier. D'abord la liste servie
 * (`typeMediaRetenu`). Sinon, un fichier RARE non exécutable s'importe quand
 * même, en téléchargement seul : média hors liste (TIFF, Ogg, MKV…) ou fichier
 * non média (PDF, ZIP, texte…, `kind: 'other'`). `depot` vaut
 * `application/octet-stream` (l'objet du bucket ne s'interprète pas) et le
 * proxy le servira en pièce jointe, ses octets n'étant pas dans la liste.
 * `null` pour : un type exécutable (SVG, HTML, XML, JavaScript), un document
 * Google natif (`application/vnd.google-apps.*`, non téléchargeable tel quel),
 * un type mal formé, ou un type listé dont les octets ne concordent pas (SVG
 * déguisé en PNG).
 */
export function entreeSynchroDrive(mimeDeclare: string | null | undefined, octets?: Uint8Array): { type: string; kind: FamilleMedia | 'other'; depot: string; extension: string } | null {
  const liste = typeMediaRetenu(mimeDeclare, octets);
  if (liste) return { type: liste.type, kind: liste.kind, depot: liste.type, extension: TYPES_MEDIA_SERVIS[liste.type].extension };
  const t = (mimeDeclare || '').split(';')[0]!.trim().toLowerCase();
  if (typeMediaDeclare(t)) return null;
  const m = /^(image|video|audio|application|text|font|model)\/[a-z0-9.+-]{1,80}$/.exec(t);
  if (!m || DECLARE_EXECUTABLE.test(t) || t.startsWith('application/vnd.google-apps.')) return null;
  const famille = m[1] === 'image' || m[1] === 'video' || m[1] === 'audio' ? m[1] : 'other';
  return { type: t, kind: famille, depot: 'application/octet-stream', extension: 'bin' };
}

/**
 * En-têtes posés sur TOUTE réponse d'une route qui sert un média de la
 * bibliothèque, refus compris. Même jeu que `/api/studios/media/[id]`.
 */
export const ENTETES_MEDIA_FERMES: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; sandbox",
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
};

/**
 * Comment servir ces octets · jamais un refus : la consigne est de ne retirer
 * l'accès à AUCUN média existant.
 *  - `inline` · type relu dans la liste fermée : servi tel quel, affichable ;
 *  - `telechargement` · tout le reste (SVG ancien, HTML, TIFF, Ogg, inconnu) :
 *    `application/octet-stream` en PIÈCE JOINTE, jamais inline, jamais avec le
 *    type déclaré. Le navigateur l'enregistre sans l'interpréter.
 * Les deux portent `ENTETES_MEDIA_FERMES` (`nosniff`, CSP en bac à sable). Le
 * 404 neutre reste à l'appelant pour l'asset inconnu ou d'un autre espace.
 */
export type DecisionMediaServi =
  | { mode: 'inline'; type: TypeMediaServi; entetes: Record<string, string> }
  | { mode: 'telechargement'; type: null; entetes: Record<string, string> };

/** Nom de fichier sûr dans un en-tête · `[A-Za-z0-9._-]`, sans point de tête. */
export function nomFichierSur(nom: string | null | undefined, repli: string): string {
  const n = (nom || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '').replace(/-+$/, '').slice(0, 100);
  return n || (repli || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64) || 'media';
}

/**
 * `id` nomme le fichier affichable (`<id>.<ext>`) ; `nom` (le nom de l'asset)
 * nomme la pièce jointe. Les deux sont assainis : ils ne peuvent pas casser
 * l'en-tête.
 */
export function decisionMediaServi(octets: Uint8Array, o: { id: string; nom?: string | null }): DecisionMediaServi {
  const type = typeMediaReel(octets);
  const id = (o.id || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64) || 'media';
  if (!type) {
    return {
      mode: 'telechargement',
      type: null,
      entetes: {
        ...ENTETES_MEDIA_FERMES,
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${nomFichierSur(o.nom, id)}"`,
      },
    };
  }
  return {
    mode: 'inline',
    type,
    entetes: {
      ...ENTETES_MEDIA_FERMES,
      'content-type': type,
      'content-disposition': `inline; filename="${id}.${TYPES_MEDIA_SERVIS[type].extension}"`,
    },
  };
}
