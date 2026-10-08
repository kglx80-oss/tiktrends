/**
 * Routage `vision_analysis` · des liaisons média du contexte aux pièces
 * NATIVES d'un appel (blocs image de l'API Messages).
 *
 * Pourquoi dans le noyau du registre : le pack impose le contrat
 * (`rendering.mediaBindingContract` : « l'adaptateur résout mediaBindings en
 * pièces multimodales natives autorisées et enregistre leur correspondance
 * d'index/hash ; si modalité requise absente/non supportée, blocked avant
 * appel »). C'est une règle de routage, pure et testable, que l'adaptateur réel
 * ET l'adaptateur simulé appliquent à l'identique.
 *
 * ── Ce qui est tranché ───────────────────────────────────────────────────────
 *
 *  - Une liste d'identifiants ne prouve pas qu'une image a été vue : chaque
 *    liaison image d'une tâche vision devient UNE pièce, dont l'index natif
 *    est celui que la liaison déclare, et dont l'empreinte est RECALCULÉE sur
 *    les octets que le serveur a lus. La correspondance est rendue
 *    (`correspondances`) pour la trace.
 *  - Les octets viennent du SERVEUR (résolveur de médias dans la portée),
 *    jamais d'une URL fournie par le client : la pièce porte des octets, pas
 *    une adresse. Le type est relu dans les octets (`inspecterMedia`), jamais
 *    cru sur déclaration.
 *  - Une modalité que l'API ne reçoit pas en pièce native (vidéo, audio) bloque
 *    AVANT l'appel : aucune dérivation n'est inventée ici.
 *  - Bornes : nombre de pièces, octets par pièce, jetons par pièce (voir les
 *    constantes, chacune avec sa provenance).
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

import { inspecterMedia } from '../studios/execution/media';
import { sha256OctetsHex } from '../studios/version';
import { constat, type Constat, type LienMedia } from './types';

/**
 * Types envoyés · l'intersection de ce que le bloc `image` du SDK installé
 * accepte (`ImageBlockParam.Source.media_type` : png, jpeg, gif, webp ·
 * @anthropic-ai/sdk 0.27.3) et de ce que `inspecterMedia` sait RELIRE dans les
 * octets (png, jpeg, webp). Le GIF n'est pas relu : il est refusé.
 */
export const MIMES_VISION = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type MimeVision = (typeof MIMES_VISION)[number];

/**
 * Jetons d'entrée d'une image AU PLUS · 4 784, le plafond par image documenté
 * pour les modèles à vision haute résolution (`claude-sonnet-5`, routé par
 * défaut : 2 576 px sur le grand côté, « up to 4784 tokens per image at the
 * limit »). Une image plus grande est réduite par le fournisseur : le plafond
 * tient quelle que soit la taille envoyée. C'est la borne du devis.
 */
export const VISION_JETONS_IMAGE_MAX = 4784;

/**
 * Nombre de pièces par appel · MESURÉ sur les 24 cas du benchmark : au plus 3
 * images par tâche vision (F01 `quality.visual` : la sortie et deux
 * références) ; borne choisie avec une marge ×2 · 6.
 */
export const VISION_PIECES_MESUREES_MAX = 3;
export const VISION_PIECES_PAR_APPEL_MAX = 6;

/**
 * Octets d'une pièce · 3 750 000. Mesuré : la plus grosse image du jeu
 * synthétique fait 1 293 octets ; aucune sortie fal réelle n'a été lue (0 $).
 * La borne garde la pièce encodée en base64 (×4/3) sous 5 000 000 octets,
 * lecture prudente de la limite par image du fournisseur (à reconfirmer sur la
 * documentation vision avant la première exécution réelle).
 */
export const VISION_OCTETS_PIECE_MAX = 3_750_000;

/** Ce que le résolveur de médias du serveur a lu pour un identifiant, dans la portée. */
export type MediaResoluVision =
  | { ok: true; assetId: string; assetVersion: string; octets: Uint8Array }
  | { ok: false; assetId: string; motif: 'hors_portee' | 'absent' | 'non_stocke' | 'illisible' };

/** Une pièce NATIVE prête à partir · octets lus par le serveur, empreinte recalculée. */
export interface PieceNative {
  index: number;
  bindingId: string;
  assetId: string;
  mime: MimeVision;
  sha256: string;
  octets: Uint8Array;
  largeur: number | null;
  hauteur: number | null;
}

/** La correspondance liaison ↔ pièce, telle que la trace la garde (jamais les octets). */
export interface CorrespondancePiece {
  bindingId: string;
  assetId: string;
  assetVersion: string;
  sha256: string;
  nativeAttachmentIndex: number;
  mime: MimeVision;
  octets: number;
  largeur: number | null;
  hauteur: number | null;
  jetonsMax: number;
}

export type PlanPieces =
  | { ok: true; pieces: PieceNative[]; correspondances: CorrespondancePiece[]; jetonsImagesMax: number }
  | { ok: false; code: 'UNSUPPORTED_CAPABILITY' | 'MEDIA_NON_RESOLU' | 'MEDIA_ALTERE' | 'MEDIA_HORS_BORNES'; constats: Constat[] };

/**
 * Les pièces natives d'une tâche vision. `medias` : ce que le serveur a lu pour
 * chaque `assetId` des liaisons (résolveur dans la portée). Refus = AUCUNE pièce,
 * la tâche est bloquée avant l'appel.
 */
export function planifierPiecesVision(liaisons: ReadonlyArray<LienMedia>, medias: ReadonlyMap<string, MediaResoluVision>): PlanPieces {
  const nonImage = liaisons.filter((l) => l.modality !== 'image');
  if (nonImage.length) {
    return { ok: false, code: 'UNSUPPORTED_CAPABILITY', constats: nonImage.map((l) => constat('MODALITE_NON_SUPPORTEE', l.bindingId, `Modalité « ${l.modality} » sans pièce native dans ce routage · bloqué avant appel, aucune dérivation inventée.`)) };
  }
  if (liaisons.length > VISION_PIECES_PAR_APPEL_MAX) {
    return { ok: false, code: 'MEDIA_HORS_BORNES', constats: [constat('VISION_TROP_DE_PIECES', 'mediaBindings', `${liaisons.length} images pour un appel · au plus ${VISION_PIECES_PAR_APPEL_MAX}.`)] };
  }
  const indices = liaisons.map((l) => l.nativeAttachmentIndex).sort((a, b) => a - b);
  if (indices.some((v, i) => v !== i)) {
    return { ok: false, code: 'MEDIA_HORS_BORNES', constats: [constat('VISION_INDEX_INCOHERENTS', 'mediaBindings', `Index natifs ${indices.join(', ')} · attendus 0 à ${liaisons.length - 1}, chacun une fois.`)] };
  }
  const pieces: PieceNative[] = [];
  const correspondances: CorrespondancePiece[] = [];
  const constats: Constat[] = [];
  let code: Extract<PlanPieces, { ok: false }>['code'] = 'MEDIA_NON_RESOLU';
  for (const l of [...liaisons].sort((a, b) => a.nativeAttachmentIndex - b.nativeAttachmentIndex)) {
    const m = medias.get(l.assetId);
    if (!m || !m.ok) { constats.push(constat('MEDIA_NON_RESOLU', l.bindingId, `Média « ${l.assetId} » non lu dans la portée de la tâche (${m && !m.ok ? m.motif : 'absent'}) · aucune substitution.`)); continue; }
    const sha = sha256OctetsHex(m.octets);
    if (m.assetVersion !== l.assetVersion || sha !== l.sha256) {
      code = 'MEDIA_ALTERE';
      constats.push(constat('MEDIA_ALTERE', l.bindingId, `Média « ${l.assetId} » : version ou empreinte lue différente de la liaison.`));
      continue;
    }
    if (m.octets.length > VISION_OCTETS_PIECE_MAX) {
      code = 'MEDIA_HORS_BORNES';
      constats.push(constat('VISION_PIECE_TROP_LOURDE', l.bindingId, `${m.octets.length} octets · au plus ${VISION_OCTETS_PIECE_MAX}.`));
      continue;
    }
    const entete = inspecterMedia(m.octets);
    const mime = entete?.mime;
    if (!entete || !mime || !(MIMES_VISION as readonly string[]).includes(mime)) {
      code = 'MEDIA_HORS_BORNES';
      constats.push(constat('VISION_TYPE_REFUSE', l.bindingId, `Type relu dans les octets « ${mime ?? 'illisible'} » · images png, jpeg ou webp seulement.`));
      continue;
    }
    const p: PieceNative = { index: l.nativeAttachmentIndex, bindingId: l.bindingId, assetId: l.assetId, mime: mime as MimeVision, sha256: sha, octets: m.octets, largeur: entete.largeur, hauteur: entete.hauteur };
    pieces.push(p);
    correspondances.push({ bindingId: l.bindingId, assetId: l.assetId, assetVersion: l.assetVersion, sha256: sha, nativeAttachmentIndex: p.index, mime: p.mime, octets: m.octets.length, largeur: p.largeur, hauteur: p.hauteur, jetonsMax: VISION_JETONS_IMAGE_MAX });
  }
  if (constats.length) return { ok: false, code, constats };
  return { ok: true, pieces, correspondances, jetonsImagesMax: pieces.length * VISION_JETONS_IMAGE_MAX };
}

/**
 * Le contrat qu'un ADAPTATEUR vérifie avant d'appeler (réel ou simulé) :
 * pièces seulement pour le profil vision, index 0..n-1 dans l'ordre, empreinte
 * égale aux octets, type relu autorisé, bornes. Liste vide = conforme.
 */
export function controlerPiecesAppel(profil: string, pieces: ReadonlyArray<PieceNative>): Constat[] {
  const out: Constat[] = [];
  if (pieces.length && profil !== 'vision_analysis') out.push(constat('PIECES_HORS_VISION', profil, 'Des pièces natives ne partent qu’avec le profil vision_analysis.'));
  if (pieces.length > VISION_PIECES_PAR_APPEL_MAX) out.push(constat('VISION_TROP_DE_PIECES', 'pieces', `${pieces.length} pièces · au plus ${VISION_PIECES_PAR_APPEL_MAX}.`));
  pieces.forEach((p, i) => {
    if (p.index !== i) out.push(constat('VISION_INDEX_INCOHERENTS', `pieces/${i}`, `Pièce ${i} déclarée à l’index ${p.index}.`));
    if (p.octets.length > VISION_OCTETS_PIECE_MAX) out.push(constat('VISION_PIECE_TROP_LOURDE', `pieces/${i}`, `${p.octets.length} octets.`));
    if (sha256OctetsHex(p.octets) !== p.sha256) out.push(constat('MEDIA_ALTERE', `pieces/${i}`, 'Empreinte de la pièce différente de ses octets.'));
    const m = inspecterMedia(p.octets)?.mime;
    if (!m || m !== p.mime || !(MIMES_VISION as readonly string[]).includes(m)) out.push(constat('VISION_TYPE_REFUSE', `pieces/${i}`, `Type relu « ${m ?? 'illisible'} » · déclaré « ${p.mime} ».`));
  });
  return out;
}
