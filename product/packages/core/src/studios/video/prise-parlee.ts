/**
 * Studios · la consigne d'une PRISE · un plan vidéo filmé d'une traite, où
 * l'image, le mouvement, la voix, les lèvres et le son du lieu naissent
 * ensemble (référence §3.4 : « chaque prise naît d'un bloc »).
 *
 * Pur. La prise n'est PARLÉE que si le modèle choisi rend la voix native
 * (`audio` des paramètres du clip, décidé par le catalogue vidéo) : sans voix
 * native (Kling, défaut), la consigne reste muette · demander une réplique à
 * un modèle muet ferait articuler des lèvres en silence, raccourcirait le
 * mouvement et ferait payer pour rien. Ensuite, deux cas, décidés par le plan
 * VALIDÉ de la version courante :
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
import { compterMots, dureePlanMs, MOTS_PAR_SECONDE_NARRATION } from './plans';
import {
  consigneMouvementDuPlan, parametresDuClip, CONSIGNE_MOUVEMENT_MAX, type ParametresClip,
} from '../fournisseurs/fal-video';
import { contientEmplacement } from '../fournisseurs/fal-image';
import { entreeCatalogueVideo, langueDuProjet, modeleRendLaVoix } from '../fournisseurs/catalogue-video';

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

type PlanPrise = Pick<PlanStudio, 'action' | 'camera' | 'subject' | 'environment' | 'lighting' | 'framing' | 'narration' | 'speechMode'> & Partial<Pick<PlanStudio, 'estimatedDurationMs' | 'actualDurationMs'>>;

export function consigneDeLaPrise(p: PlanPrise, langue: string = LANGUE_PROJET): ConsignePrise {
  const mouvement = consigneMouvementDuPlan(p);
  if (!estPriseParlee(p)) return { ok: true, consigne: mouvement, parlee: false };
  const nomLangue = LANGUES_PRISE[langue];
  if (!nomLangue) return { ok: false, motif: `Langue « ${langue} » · une prise parlée se fait en ${Object.values(LANGUES_PRISE).join(' ou ')}.` };
  const replique = repliqueDuPlan(p);
  if (/[«»]/.test(replique)) return { ok: false, motif: 'La réplique contient des guillemets « » · ils délimitent la réplique dans la consigne, retire-les de la narration du plan.' };
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

/** La virgule française · « 5,6 ». */
const fr = (n: number, d = 1) => n.toFixed(d).replace(/\.0+$/, '').replace('.', ',');

/**
 * La prise d'un clip · les paramètres du catalogue, avec la consigne PARLÉE
 * seulement si la voix native est demandée au modèle (`audio`) et que le plan
 * parle. Refus AVANT le devis : réplique qui ne tient pas dans la durée du
 * clip (`compterMots` / `MOTS_PAR_SECONDE_NARRATION`), guillemets, emplacement.
 */
export function priseDuClip<P extends { consigne: string; dureeS: number; audio?: unknown; modele?: string | null }>(parametres: P, p: PlanPrise, langue: string = LANGUE_PROJET):
  { ok: true; parametres: P } | { ok: false; code: 'INVALID_SCHEMA'; motif: string } {
  // Deux conditions · la voix native est DEMANDÉE au clip (`audio`), et le modèle la REND dans cette langue
  // (`modeleRendLaVoix`, la seule source du catalogue) · sinon le clip est muet et la consigne celle d'avant.
  if (parametres.audio !== true || !modeleRendLaVoix(entreeCatalogueVideo(parametres.modele ?? null), langue) || !estPriseParlee(p)) return { ok: true, parametres };
  const mots = compterMots(p.narration);
  const secondes = mots / MOTS_PAR_SECONDE_NARRATION;
  // Ce qui sera VU de la prise · le plus court du clip et du plan (au montage, le clip est coupé à la durée du
  // plan) : une réplique plus longue serait coupée, le clip payé pour rien.
  const planS = typeof p.estimatedDurationMs === 'number' ? dureePlanMs(p as Pick<PlanStudio, 'estimatedDurationMs' | 'actualDurationMs'>) / 1000 : Infinity;
  const borne = Math.min(parametres.dureeS, planS);
  if (secondes > borne) {
    const quoi = planS < parametres.dureeS ? `le plan en dure ${fr(planS)}` : `le clip en dure ${fr(parametres.dureeS)}`;
    return { ok: false, code: 'INVALID_SCHEMA', motif: `La réplique se dit en ${fr(secondes)} s environ (${mots} mots à ${fr(MOTS_PAR_SECONDE_NARRATION)} mots par seconde), ${quoi} · raccourcis-la ou allonge le plan, rien n’est parti.` };
  }
  const c = consigneDeLaPrise(p, langue);
  if (!c.ok) return { ok: false, code: 'INVALID_SCHEMA', motif: c.motif };
  if (contientEmplacement(c.consigne)) return { ok: false, code: 'INVALID_SCHEMA', motif: 'Emplacement de gabarit non résolu dans la réplique du plan.' };
  return { ok: true, parametres: { ...parametres, consigne: c.consigne } };
}

/**
 * Les paramètres du clip d'un plan · ceux du catalogue (`parametresDuClip` :
 * image clé, modèle, durée, voix native, interdits) avec la consigne de la
 * PRISE (`priseDuClip`). Plan muet ou modèle sans voix native : paramètres
 * strictement identiques.
 */
export function parametresDeLaPrise(e: Parameters<typeof parametresDuClip>[0] & { langue?: string }): ParametresClip {
  const r = parametresDuClip(e);
  if (!r.ok) return r;
  const x = priseDuClip(r.parametres, e.contenu.shots.byId[e.shotId] as PlanStudio, e.langue ?? langueDuProjet(e.contenu));
  return x.ok ? { ...r, parametres: x.parametres } : x;
}
