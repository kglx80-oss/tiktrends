/**
 * Studios · la consigne d'une PRISE · un plan vidéo filmé d'une traite, où
 * l'image, le mouvement, la voix, les lèvres et le son du lieu naissent
 * ensemble (référence §3.4 : « chaque prise naît d'un bloc »).
 *
 * Pur. Deux cas, décidés par le plan VALIDÉ de la version courante :
 *
 *  · plan muet (`speechMode` none, ou aucune narration) : la consigne est
 *    STRICTEMENT celle du mouvement (`consigneMouvementDuPlan`), rien n'est
 *    ajouté ;
 *  · prise parlée (voix off ou lipsync, narration présente) : la réplique
 *    validée du plan (`narration`), MOT POUR MOT entre guillemets, la langue du
 *    projet, le mode de parole, puis le mouvement, et « pas de musique, pas de
 *    sous-titres, aucun texte à l'écran » · la musique et les sous-titres
 *    viennent au montage, le texte et le logo aussi.
 *
 * La réplique n'est JAMAIS coupée ni reformulée : si elle ne tient pas dans la
 * consigne bornée (`CONSIGNE_MOUVEMENT_MAX`), c'est le mouvement qui est
 * raccourci, puis, s'il ne reste plus de place, la prise est refusée et dite.
 */

import type { ModeParole, PlanStudio } from '../document';
import {
  consigneMouvementDuPlan, parametresDuClip, CONSIGNE_MOUVEMENT_MAX, type ParametresClip,
} from '../fournisseurs/fal-video';
import { contientEmplacement } from '../fournisseurs/fal-image';

/** Langues d'une prise parlée · celles que le studio sait écrire. */
export const LANGUES_PRISE: Readonly<Record<string, string>> = { fr: 'français', en: 'anglais' };
/** La langue du projet · le studio rédige en français (storyboard, consignes, voix : `language: 'fr'`). */
export const LANGUE_PROJET = 'fr';

/** La phrase finale de `consigneMouvementDuPlan` · remplacée, dans une prise parlée, par la consigne de son. */
const FIN_MOUVEMENT = 'Mouvement naturel et fluide, aucun texte à l’écran.';
/** Ce qui ne naît pas dans la prise · posé au montage. */
export const CONSIGNE_SON_PRISE = 'Son : la voix et le son du lieu seulement · pas de musique, pas de sous-titres, aucun texte à l’écran.';

const MODE: Record<Exclude<ModeParole, 'none'>, string> = {
  voiceover: 'voix off · une voix hors champ dit la réplique, personne ne parle à l’image, les lèvres restent fermées',
  lipsync: 'face caméra · le personnage dit la réplique à l’image, les lèvres synchronisées sur chaque mot',
};

/** Une prise est parlée si son mode le demande ET qu'une narration existe (même règle que le graphe d'impact). */
export function estPriseParlee(p: Pick<PlanStudio, 'speechMode' | 'narration'>): boolean {
  return p.speechMode !== 'none' && p.narration.trim().length > 0;
}

/** La réplique telle qu'elle est envoyée · les mots du plan, espaces normalisés (aucun mot changé). */
export const repliqueDuPlan = (p: Pick<PlanStudio, 'narration'>): string => p.narration.replace(/\s+/g, ' ').trim();

export type ConsignePrise = { ok: true; consigne: string; parlee: boolean } | { ok: false; motif: string };

type PlanPrise = Pick<PlanStudio, 'action' | 'camera' | 'subject' | 'environment' | 'lighting' | 'framing' | 'narration' | 'speechMode'>;

export function consigneDeLaPrise(p: PlanPrise, langue: string = LANGUE_PROJET): ConsignePrise {
  const mouvement = consigneMouvementDuPlan(p);
  if (!estPriseParlee(p)) return { ok: true, consigne: mouvement, parlee: false };
  const nomLangue = LANGUES_PRISE[langue];
  if (!nomLangue) return { ok: false, motif: `Langue « ${langue} » · une prise parlée se fait en ${Object.values(LANGUES_PRISE).join(' ou ')}.` };
  const replique = repliqueDuPlan(p);
  const tete = `Prise parlée en ${nomLangue}, ${MODE[p.speechMode as Exclude<ModeParole, 'none'>]}. Réplique à dire mot pour mot, sans rien ajouter ni retirer : « ${replique} »`;
  const corps = mouvement.endsWith(FIN_MOUVEMENT) ? mouvement.slice(0, -FIN_MOUVEMENT.length).trim() : mouvement;
  const fin = `Mouvement naturel et fluide. ${CONSIGNE_SON_PRISE}`;
  const place = CONSIGNE_MOUVEMENT_MAX - tete.length - fin.length - 2;
  if (place < 0) {
    return { ok: false, motif: `Réplique trop longue pour une prise (${replique.length} caractères) · raccourcis la narration du plan, elle n’est jamais coupée.` };
  }
  const milieu = corps.length <= place ? corps : corps.slice(0, Math.max(0, place - 1)).replace(/\s+\S*$/, '') + '…';
  return { ok: true, consigne: [tete, milieu.length > 1 ? milieu : '', fin].filter(Boolean).join(' '), parlee: true };
}

/**
 * Les paramètres du clip d'un plan · ceux du catalogue (`parametresDuClip` :
 * image clé, modèle, durée, interdits) avec la consigne de la PRISE. Plan
 * muet : paramètres strictement identiques.
 */
export function parametresDeLaPrise(e: Parameters<typeof parametresDuClip>[0] & { langue?: string }): ParametresClip {
  const r = parametresDuClip(e);
  if (!r.ok) return r;
  const p = e.contenu.shots.byId[e.shotId] as PlanStudio;
  if (!estPriseParlee(p)) return r;
  const c = consigneDeLaPrise(p, e.langue ?? LANGUE_PROJET);
  if (!c.ok) return { ok: false, code: 'INVALID_SCHEMA', motif: c.motif };
  if (contientEmplacement(c.consigne)) return { ok: false, code: 'INVALID_SCHEMA', motif: 'Emplacement de gabarit non résolu dans la réplique du plan.' };
  return { ok: true, parametres: { ...r.parametres, consigne: c.consigne } };
}

