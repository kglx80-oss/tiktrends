/**
 * Studios · L3 · instantané IMMUABLE qu'un job exécute (cahier 01 §6.1).
 *
 * Pur. Écrit par la commande d'approbation, lu par le worker. Il contient ce
 * qu'il faut pour exécuter ET pour régler, sans jamais relire le projet courant
 * (qui a pu changer) ni copier un secret fournisseur.
 */

import type { LigneDevis, ProfilOperation } from './tarifs';
import type { EpinglageDevis } from './devis';

export const OPERATION_JOB_STUDIO = 'studio.generation';

export interface SnapshotJob {
  v: 1;
  quoteId: string;
  projectVersionId: string;
  contentHash: string;
  impactPlanHash: string;
  pricingVersion: string;
  lignes: LigneDevis[];
  epinglage: EpinglageDevis | null;
  /** Montant réservé au registre · le règlement ne peut pas le dépasser. */
  reserve: { credits: number; usdMicros: number };
  /** Paramètres natifs du fournisseur, déjà résolus et expurgés. */
  parametres: Record<string, unknown>;
}

export function operationsDuSnapshot(s: SnapshotJob): Array<{ operation: string; profil: ProfilOperation }> {
  return s.lignes.map((l) => ({ operation: l.operation, profil: l.profil }));
}

const entier = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** Lecture défensive · `null` si la forme n'est pas celle qu'on a écrite. */
export function lireSnapshotJob(x: unknown): SnapshotJob | null {
  if (typeof x !== 'object' || x === null) return null;
  const s = x as Partial<SnapshotJob>;
  if (s.v !== 1 || typeof s.quoteId !== 'string' || typeof s.projectVersionId !== 'string') return null;
  if (!Array.isArray(s.lignes) || s.lignes.length === 0) return null;
  for (const l of s.lignes) {
    if (typeof l?.operation !== 'string' || !entier(l.credits) || !entier(l.usdMicros) || !entier(l.unites)) return null;
  }
  if (!s.reserve || !entier(s.reserve.credits) || !entier(s.reserve.usdMicros)) return null;
  return s as SnapshotJob;
}
