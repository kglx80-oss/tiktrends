/**
 * Studios · L4 · une réponse tardive ne change jamais de marque (cahier 01
 * §4.1, recette FLOW-03).
 *
 * Pur. Deux gardes, une par côté :
 *
 *  · CLIENT · `reponseApplicable` · chaque demande part avec un numéro et la
 *    marque cible du moment ; sa réponse n'est appliquée que si elle est la
 *    DERNIÈRE demande ET que la marque n'a pas changé entre-temps ET que le
 *    serveur a répondu pour cette même marque.
 *  · SERVEUR · `propositionValidePour` · une proposition d'hypothèses est
 *    scellée (jeton signé côté serveur) avec l'espace, la marque, les sources
 *    et l'empreinte de chaque hypothèse. La créer pour une autre marque, une
 *    autre sélection ou une hypothèse modifiée est refusé.
 */

import { empreinteContenu } from '../version';
import type { HypotheseTest } from './hypotheses';

export interface DemandeEnCours { seq: number; brandId: string }

export function reponseApplicable(demande: DemandeEnCours, courant: DemandeEnCours, reponseBrandId: string | null | undefined): boolean {
  return demande.seq === courant.seq && demande.brandId === courant.brandId && reponseBrandId === courant.brandId;
}

/** Durée de validité d'une proposition · au-delà, on repropose (le contexte a pu changer). */
export const DUREE_PROPOSITION_MS = 2 * 60 * 60 * 1000;

export interface ScellePropositions {
  v: 1;
  workspaceId: string;
  brandId: string;
  sourceIds: string[];
  /** Empreinte de chaque hypothèse proposée, dans l'ordre. */
  hypotheses: string[];
  runId: string | null;
  expireLe: number;
}

export function empreinteHypothese(h: HypotheseTest): string {
  const { id, statement, sourceIds, variable, control, treatment, invariants, metric, decisionRule, limitations } = h;
  return empreinteContenu({ id, statement, sourceIds, variable, control, treatment, invariants, metric, decisionRule, limitations });
}

export function scellerPropositions(e: Omit<ScellePropositions, 'v' | 'hypotheses' | 'expireLe'> & { hypotheses: readonly HypotheseTest[]; maintenant: number }): ScellePropositions {
  return {
    v: 1,
    workspaceId: e.workspaceId,
    brandId: e.brandId,
    sourceIds: [...e.sourceIds].sort(),
    hypotheses: e.hypotheses.map(empreinteHypothese),
    runId: e.runId,
    expireLe: e.maintenant + DUREE_PROPOSITION_MS,
  };
}

export type RefusProposition = 'autre_espace' | 'autre_marque' | 'autres_sources' | 'hypothese_modifiee' | 'expiree';

export const TEXTES_REFUS_PROPOSITION: Readonly<Record<RefusProposition, string>> = {
  autre_espace: 'Cette proposition ne vient pas de ton espace · repropose des hypothèses.',
  autre_marque: 'Cette proposition a été faite pour une autre marque · repropose des hypothèses pour la marque choisie.',
  autres_sources: 'La sélection de sources a changé depuis la proposition · repropose des hypothèses.',
  hypothese_modifiee: 'L’hypothèse a été modifiée depuis la proposition · enregistre-la comme hypothèse rédigée.',
  expiree: 'La proposition a expiré · repropose des hypothèses.',
};

export function propositionValidePour(
  s: ScellePropositions,
  cible: { workspaceId: string; brandId: string; sourceIds: readonly string[]; hypothese: HypotheseTest; maintenant: number },
): RefusProposition | null {
  if (s.workspaceId !== cible.workspaceId) return 'autre_espace';
  if (s.brandId !== cible.brandId) return 'autre_marque';
  const a = [...cible.sourceIds].sort();
  if (a.length !== s.sourceIds.length || a.some((x, i) => x !== s.sourceIds[i])) return 'autres_sources';
  if (!s.hypotheses.includes(empreinteHypothese(cible.hypothese))) return 'hypothese_modifiee';
  if (cible.maintenant > s.expireLe) return 'expiree';
  return null;
}
