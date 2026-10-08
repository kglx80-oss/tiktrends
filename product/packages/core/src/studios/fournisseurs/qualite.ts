/**
 * Studios · G-B · contrôle qualité posé par le WORKER à la finalisation
 * (cahier 01 §4.4 point 5, §4.6 ; recette IMG-03).
 *
 * Pur. Jusqu'ici le contrôle des composants obligatoires (`verdictComposants`,
 * L5-C) n'était appliqué que si l'écran envoyait un POST après avoir vu le
 * média : un média que personne n'ouvrait restait `pending`. Le worker le pose
 * désormais lui-même, dans la transaction de `completed`, pour :
 *
 *   · l'image du studio Image (`keyframe:s_image`) ;
 *   · toute retouche masquée (instantané `studio_retouche/1`).
 *
 * Le worker n'a AUCUN contrôle visuel (la vision n'est pas routée vers lui) :
 * le verdict est donc `requires_review`, jamais `passed`, quels que soient les
 * composants. Les autres jobs gardent la règle L3 (`verdictQualiteAuto`).
 */

import { verdictComposants, type VerdictComposants } from '../produit/composants';
import { verdictQualiteAuto, type ConstatSortie } from '../execution/media';
import { OPERATION_IMAGE } from '../image/parcours';
import { estParametresRetouche } from './retouche';

/** Le worker doit-il poser le contrôle des composants à la finalisation de ce job ? */
export function controleComposantsAFinalisation(e: { operations: ReadonlyArray<{ operation: string }>; parametres: unknown }): boolean {
  return estParametresRetouche(e.parametres) || e.operations.some((o) => o.operation === OPERATION_IMAGE);
}

export type QualiteFinalisation =
  | { statut: 'pending'; verdict: null; motif: string }
  | { statut: 'requires_review' | 'rejected'; verdict: VerdictComposants | null; motif: string };

/**
 * Le statut qualité posé à `completed`. `requis` = composants obligatoires du
 * produit épinglé dans la version DU JOB (jamais reçus du client).
 */
export function qualiteAFinalisation(e: {
  concerne: boolean;
  requis: readonly string[];
  constats: ReadonlyArray<ConstatSortie | null | undefined>;
}): QualiteFinalisation {
  if (!e.concerne) {
    return verdictQualiteAuto(e.constats) === 'requires_review'
      ? { statut: 'requires_review', verdict: null, motif: 'constat négatif du contrôle · aucune relance' }
      : { statut: 'pending', verdict: null, motif: 'aucun constat' };
  }
  const verdict = verdictComposants({ requis: e.requis, controle: null });
  // Sans contrôle visuel, rien n'est jamais « passé » : seul un relecteur tranche.
  if (verdict.statut === 'passed') return { statut: 'requires_review', verdict: { ...verdict, statut: 'requires_review', raison: 'Revue requise · aucun contrôle visuel dans le worker.' }, motif: 'aucun contrôle visuel dans le worker' };
  return { statut: verdict.statut, verdict, motif: verdict.raison };
}
