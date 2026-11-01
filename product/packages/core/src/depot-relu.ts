/**
 * Enregistrement d'un téléversement · le type se RELIT dans l'objet déposé ·
 * la règle, pure (ni base, ni réseau).
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * Après un envoi présigné, le navigateur appelle `registerUploadedAssetAction`
 * avec le `mimeType` QU'IL DÉCLARE, et ce type était enregistré tel quel en
 * colonne `mime_type`. Un appel direct à l'action déclarait `image/png` pour
 * un objet qui contenait du HTML ou du SVG : la ligne mentait sur ce qu'elle
 * désignait, et tout lecteur qui se fiait à la colonne était trompé.
 *
 * ── La règle (`decisionDepotRelu`) ───────────────────────────────────────────
 *
 * Le serveur relit le DÉBUT de l'objet (`OCTETS_RELUS_DEPOT` octets) et sa
 * TAILLE (`HEAD`), puis décide :
 *  1. le type déclaré passe d'abord la règle du dépôt (`decisionDepot` · liste
 *     blanche, plafond par famille, fichier vide refusé) ; la taille jugée est
 *     la taille RELUE, jamais celle annoncée ;
 *  2. un contenu de balisage (`<` en tête, après BOM et espaces · HTML, SVG,
 *     XML) est refusé, quel que soit le type déclaré ;
 *  3. un type SERVI relu (`typeMediaReel`) est retenu s'il est de la même
 *     famille que le déclaré (image, vidéo, son) · le type enregistré est le
 *     type RELU (un JPEG déclaré PNG s'enregistre `image/jpeg`) ;
 *  4. un PDF relu (`%PDF-`) n'est admis que déclaré PDF, et s'enregistre en
 *     `application/octet-stream`, comme son dépôt ;
 *  5. des octets inconnus ne sont admis que pour un média RARE déclaré
 *     (`image/tiff`, `audio/ogg`… · ceux que `decisionDepot` dépose déjà en
 *     `application/octet-stream`), et s'enregistrent en
 *     `application/octet-stream` ;
 *  6. tout le reste est refusé · l'appelant SUPPRIME l'objet qu'on vient de
 *     déposer (jamais une donnée existante : il vérifie qu'aucune ligne ne le
 *     référence).
 *
 * ── Combien d'octets lire · mesuré ───────────────────────────────────────────
 *
 * Préfixe minimal pour que `typeMediaReel(début)` rende le même verdict que
 * `typeMediaReel(fichier entier)`, mesuré sur de vrais fichiers (ffmpeg 6 et
 * Pillow 13, plus les fixtures audio `l6b-*` du dépôt) :
 *
 * | Type             | Fichier mesuré                          | Préfixe minimal | Boîte `ftyp` |
 * | ---------------- | --------------------------------------- | --------------- | ------------ |
 * | image/png        | ffmpeg · Pillow                         | 8               | ·            |
 * | image/jpeg       | ffmpeg · Pillow                         | 4               | ·            |
 * | image/gif        | ffmpeg · Pillow                         | 6               | ·            |
 * | image/webp       | ffmpeg · Pillow                         | 12              | ·            |
 * | image/avif       | ffmpeg libaom · Pillow                  | 12              | 32           |
 * | image/heic       | iPhone (structure `ftyp` reconstituée)  | 12              | 24           |
 * | video/mp4        | ffmpeg (isom, faststart, mp42)          | 12              | 32           |
 * | video/quicktime  | ffmpeg                                  | 12              | 20           |
 * | video/webm       | ffmpeg                                  | 4               | ·            |
 * | audio/mpeg       | ffmpeg ID3 · trame nue · l6b CBR, Xing  | 4               | ·            |
 * | audio/wav        | ffmpeg · l6b 16k, LIST                  | 12              | ·            |
 * | audio/mp4        | ffmpeg AAC                              | 12              | 28           |
 *
 * Les vrais fichiers tranchent en 12 octets, mais une famille ISO-BMFF ne se
 * décide qu'après TOUTE la boîte `ftyp` : une marque compatible `avif` en fin
 * de liste fait d'une « HEIC » une AVIF. `typeMediaReel` borne cette boîte à
 * 256 octets et ne lit jamais au-delà · 256 est donc le plus petit préfixe qui
 * rend le même verdict pour TOUT fichier (garde : une `ftyp` de 256 octets dont
 * la dernière marque est `avif` donne `image/avif` à 256 et `image/heic` à 255).
 * Le PDF (`%PDF-`, 5 octets) et le balisage (BOM, espaces, `<`) tiennent dans
 * la même fenêtre.
 */

import { TYPES_MEDIA_SERVIS, typeMediaReel, type TypeMediaServi } from './medias-servis';
import { decisionDepot, TYPE_DEPOT_NEUTRE, type FamilleDepot } from './depot-fichiers';

/** Octets relus au début de l'objet · voir le tableau mesuré ci-dessus. */
export const OCTETS_RELUS_DEPOT = 256;

export const MESSAGES_REFUS_RELU = {
  balisage: 'Fichier refusé · son contenu est une page ou un dessin vectoriel (HTML, SVG, XML), pas un média.',
  incoherent: 'Fichier refusé · son contenu ne correspond pas au type annoncé.',
} as const;

/** L'objet n'a pas pu être relu · rien n'est enregistré, rien n'est supprimé. */
export const MESSAGES_RELECTURE_DEPOT = {
  hors_espace: 'Ce fichier n’a pas été téléversé depuis cet espace.',
  absent: 'Fichier introuvable dans le stockage · relance le téléversement.',
  illisible: 'Lecture du fichier impossible pour l’instant · réessaie dans un instant.',
} as const;

/** Ce que disent les premiers octets · un type servi, un PDF, du balisage, ou rien de reconnu. */
export type LectureDepot = TypeMediaServi | 'application/pdf' | 'balisage' | null;

const ESPACE = new Set([0x09, 0x0a, 0x0c, 0x0d, 0x20]);

/** Premier caractère non blanc · UTF-8 (BOM facultatif), UTF-16 LE ou BE (BOM). */
function premierCaractere(o: Uint8Array): number | null {
  let i = 0;
  let pas = 1;
  let decalage = 0;
  if (o[0] === 0xef && o[1] === 0xbb && o[2] === 0xbf) i = 3;
  else if (o[0] === 0xff && o[1] === 0xfe) { i = 2; pas = 2; }
  else if (o[0] === 0xfe && o[1] === 0xff) { i = 2; pas = 2; decalage = 1; }
  for (; i + pas <= o.length; i += pas) {
    const c = o[i + decalage]!;
    if (pas === 2 && o[i + 1 - decalage] !== 0) return null;
    if (!ESPACE.has(c)) return c;
  }
  return null;
}

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

function contientPdf(o: Uint8Array): boolean {
  for (let i = 0; i + PDF.length <= o.length; i++) {
    if (PDF.every((b, k) => o[i + k] === b)) return true;
  }
  return false;
}

/**
 * Ce que disent les `OCTETS_RELUS_DEPOT` premiers octets (le reste est
 * ignoré). Le balisage passe AVANT les signatures : un texte qui commence par
 * `<` n'est jamais un média.
 */
export function lectureDepot(octets: Uint8Array): LectureDepot {
  const o = octets.subarray(0, OCTETS_RELUS_DEPOT);
  if (premierCaractere(o) === 0x3c) return 'balisage';
  const servi = typeMediaReel(o);
  if (servi) return servi;
  if (contientPdf(o)) return 'application/pdf';
  return null;
}

export type KindDepot = 'image' | 'video' | 'audio' | 'other';

export type DecisionDepotRelu =
  | { ok: true; contentType: string; famille: FamilleDepot; kind: KindDepot; taille: number }
  | { ok: false; erreur: string };

/**
 * La décision d'enregistrement · `nom` sert seulement à reconnaître un type
 * absent par son extension (celle de la CLÉ, forcée par le serveur au dépôt).
 */
export function decisionDepotRelu(f: { nom: string; typeDeclare: string; octets: Uint8Array; taille: number }): DecisionDepotRelu {
  const d = decisionDepot({ nom: f?.nom, type: f?.typeDeclare, taille: f?.taille });
  if (!d.ok) return d;
  if (!(f.octets instanceof Uint8Array)) return { ok: false, erreur: MESSAGES_REFUS_RELU.incoherent };
  const lu = lectureDepot(f.octets);
  const accepte = (contentType: string, famille: FamilleDepot): DecisionDepotRelu =>
    ({ ok: true, contentType, famille, kind: famille === 'document' ? 'other' : famille, taille: f.taille });

  if (lu === 'balisage') return { ok: false, erreur: MESSAGES_REFUS_RELU.balisage };
  if (lu === 'application/pdf') {
    return d.famille === 'document' ? accepte(TYPE_DEPOT_NEUTRE, 'document') : { ok: false, erreur: MESSAGES_REFUS_RELU.incoherent };
  }
  if (lu) {
    const famille = TYPES_MEDIA_SERVIS[lu].famille;
    return famille === d.famille ? accepte(lu, famille) : { ok: false, erreur: MESSAGES_REFUS_RELU.incoherent };
  }
  // Octets inconnus · admis seulement pour un média rare, déjà déposé neutre.
  if (d.contentType === TYPE_DEPOT_NEUTRE && d.famille !== 'document') return accepte(TYPE_DEPOT_NEUTRE, d.famille);
  return { ok: false, erreur: MESSAGES_REFUS_RELU.incoherent };
}
