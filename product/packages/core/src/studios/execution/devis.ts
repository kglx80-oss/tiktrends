/**
 * Studios · L3 · devis immuable et conditions d'approbation (cahier 01 §9.2, §9.3).
 *
 * Pur. Le serveur lit la base, ce module DÉCIDE.
 *
 * ── Ce que l'empreinte d'entrées (`inputHash`) fige ──────────────────────────
 *
 * Portée (espace, marque, projet), version exacte du projet et empreinte de son
 * contenu, empreinte du plan d'impact, lignes devisées (opérations, unités,
 * crédits, micro-dollars), version de grille, release de prompt épinglée. Deux
 * devis aux mêmes entrées ont la même empreinte (c'est voulu : elle décrit
 * l'intention) mais deux identifiants distincts · deux variantes volontaires ne
 * sont jamais dédupliquées (COST-02).
 *
 * ── Ce qui invalide une approbation ──────────────────────────────────────────
 *
 * Toute variation du snapshot d'entrées, du coût devisé, de la version projet ;
 * un devis expiré ; une révocation explicite (grille ou release). Une NOUVELLE
 * grille ou une nouvelle release active ne périme PAS un devis encore valide :
 * il a été épinglé, il reste exécutable (cahier 01 §9.3).
 */

import type { CodeErreurStudio } from '../erreurs';
import { empreinteContenu } from '../version';
import type { LigneDevis } from './tarifs';

/** Durée de validité d'un devis · choix de politique, pas une mesure : assez pour relire et cliquer, assez court pour que la grille courante s'applique vite. */
export const VALIDITE_DEVIS_MS = 30 * 60_000;
export const VALIDITE_DEVIS_MIN_MS = 60_000;
export const VALIDITE_DEVIS_MAX_MS = 24 * 3_600_000;

export interface EpinglageDevis {
  promptReleaseId: string;
  releaseHash: string;
}

export interface EntreesDevis {
  workspaceId: string;
  brandId: string;
  projectId: string;
  projectVersionId: string;
  contentHash: string;
  impactPlanHash: string;
  pricingVersion: string;
  lignes: ReadonlyArray<LigneDevis>;
  epinglage: EpinglageDevis | null;
}

export function empreinteEntreesDevis(e: EntreesDevis): string {
  return empreinteContenu({
    workspaceId: e.workspaceId,
    brandId: e.brandId,
    projectId: e.projectId,
    projectVersionId: e.projectVersionId,
    contentHash: e.contentHash,
    impactPlanHash: e.impactPlanHash,
    pricingVersion: e.pricingVersion,
    lignes: e.lignes.map((l) => ({ operation: l.operation, profil: l.profil, unites: l.unites, credits: l.credits, usdMicros: l.usdMicros })),
    epinglage: e.epinglage,
  });
}

export function dureeValidite(demandee: unknown): number {
  if (typeof demandee !== 'number' || !Number.isFinite(demandee)) return VALIDITE_DEVIS_MS;
  return Math.min(VALIDITE_DEVIS_MAX_MS, Math.max(VALIDITE_DEVIS_MIN_MS, Math.trunc(demandee)));
}

export function expirationDevis(maintenant: Date, dureeMs: number = VALIDITE_DEVIS_MS): Date {
  return new Date(maintenant.getTime() + dureeMs);
}

/** Ce que l'approbation relit du devis stocké. */
export interface DevisFige {
  id: string;
  projectVersionId: string;
  inputHash: string;
  maximumCredits: number;
  expiresAt: Date;
  pricingVersion: string;
  promptReleaseId: string | null;
}

/** Ce que la personne a VU et approuve · renvoyé par le navigateur. */
export interface DemandeApprobation {
  inputHash: unknown;
  creditsAnnonces: unknown;
}

export interface EtatAuMomentDApprouver {
  maintenant: Date;
  versionCouranteId: string | null;
  /** Grilles explicitement révoquées (erreur de prix) · bloque même un devis valide. */
  grillesRevoquees?: ReadonlyArray<string>;
  /** Motif de révocation de la release épinglée, s'il y en a une. */
  revocationRelease?: string | null;
}

export type VerdictApprobation = { ok: true } | { ok: false; code: CodeErreurStudio; motif: string };

export function verifierApprobation(d: DevisFige, demande: DemandeApprobation, etat: EtatAuMomentDApprouver): VerdictApprobation {
  if (!(etat.maintenant.getTime() < d.expiresAt.getTime())) {
    return { ok: false, code: 'QUOTE_EXPIRED', motif: 'Le devis a expiré · demande un nouveau devis avant de lancer.' };
  }
  if (typeof demande.inputHash !== 'string' || demande.inputHash !== d.inputHash) {
    return { ok: false, code: 'VERSION_CONFLICT', motif: 'Les entrées ont changé depuis le devis · demande un nouveau devis.' };
  }
  if (typeof demande.creditsAnnonces !== 'number' || !Number.isInteger(demande.creditsAnnonces) || demande.creditsAnnonces !== d.maximumCredits) {
    return { ok: false, code: 'VERSION_CONFLICT', motif: 'Le prix affiché ne correspond pas au devis · recharge le devis avant d’approuver.' };
  }
  if (etat.versionCouranteId !== d.projectVersionId) {
    return { ok: false, code: 'VERSION_CONFLICT', motif: 'Le projet a changé depuis le devis · demande un nouveau devis.' };
  }
  if (etat.grillesRevoquees?.includes(d.pricingVersion)) {
    return { ok: false, code: 'QUOTE_EXPIRED', motif: 'La grille de prix de ce devis a été révoquée · demande un nouveau devis.' };
  }
  if (d.promptReleaseId && etat.revocationRelease) {
    return { ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: `La consigne épinglée a été révoquée · ${etat.revocationRelease}` };
  }
  return { ok: true };
}
