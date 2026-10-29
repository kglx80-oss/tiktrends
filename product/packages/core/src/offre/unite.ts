/**
 * L'offre · le changement d'unité du crédit (÷ 10), règle pure. Pur.
 *
 * Décision du 29/10, point 3 · un ancien crédit vaut `FACTEUR_UNITE` nouveaux.
 * Le barème, les allocations, les recharges et l'essai passent dans la
 * nouvelle unité dans LA MÊME PR que la conversion des soldes : le déploiement
 * part de `main` chaque minute, un barème ×10 servi sur des soldes non
 * convertis débiterait dix fois trop.
 *
 * ── Comment la conversion s'applique ─────────────────────────────────────────
 *
 * La migration (0061) est ADDITIVE · elle ajoute `workspaces.credit_unit`
 * (défaut 1 = ancienne unité) et `credit_unit_converted_at`, rien d'autre ·
 * l'ancien code, qui tourne encore pendant la migration (`ops/deploy.sh`), ne
 * voit rien (garde `d1-deploiement`, fenêtre inverse).
 *
 * Le NOUVEAU code convertit chaque espace une fois, dans une transaction, par
 * un UPDATE conditionnel `WHERE credit_unit = 1` (miroir SQL :
 * `packages/db/src/unite-credits.ts`) :
 *  · au démarrage des workers (balayage de tous les espaces) ;
 *  · ET avant toute écriture de solde (débit, remboursement, allocation,
 *    recharge, don) · un espace n'est jamais débité au nouveau barème sur un
 *    solde non converti, même si le balayage n'est pas encore passé.
 * Un second passage ne trouve plus rien (`credit_unit = 10`) : idempotent.
 *
 * Les RÉSERVATIONS studio ouvertes au moment de la conversion restent écrites
 * dans l'ancienne unité (registre immuable) · le crédit qu'elles rendent est
 * multiplié par `facteurRendu` (réservation antérieure à la conversion).
 */
import { FACTEUR_UNITE } from './bareme';

/** L'unité en vigueur dans le code · ce que la colonne `credit_unit` vaut après conversion. */
export const UNITE_CREDIT_COURANTE = FACTEUR_UNITE;
/** L'unité d'un espace jamais converti (défaut de la colonne). */
export const UNITE_CREDIT_ANCIENNE = 1;

export const MOTIF_CONVERSION_UNITE = `Conversion des crédits · nouvelle unité (×${FACTEUR_UNITE})`;
export const REF_CONVERSION_UNITE = 'unite-credit-x10';

export interface SoldesUnite {
  solde: number;
  derniereAllocation: number;
  creditsEssai: number;
  /** Poche d'abonnement restante · `null` = jamais suivie (migration 0060). */
  abonnementRestant: number | null;
  horsAbonnementConsommes: number;
}

/** Les soldes d'un espace dans la nouvelle unité · chaque compteur ×10, `null` reste `null`. */
export function convertirSoldes(s: SoldesUnite): SoldesUnite & { delta: number } {
  const x = (n: number) => n * FACTEUR_UNITE;
  return {
    solde: x(s.solde),
    derniereAllocation: x(s.derniereAllocation),
    creditsEssai: x(s.creditsEssai),
    abonnementRestant: s.abonnementRestant === null ? null : x(s.abonnementRestant),
    horsAbonnementConsommes: x(s.horsAbonnementConsommes),
    delta: x(s.solde) - s.solde,
  };
}

/**
 * Le facteur d'un rendu de crédits RÉSERVÉS · une réservation écrite avant la
 * conversion de l'espace est en ancienne unité, elle rend ×10.
 */
export function facteurRendu(reserveLe: Date, convertiLe: Date | null): number {
  if (!convertiLe) return 1; // espace pas encore converti · tout est en ancienne unité, rien à corriger
  return reserveLe.getTime() < convertiLe.getTime() ? FACTEUR_UNITE : 1;
}

/**
 * Une ligne du journal dans l'unité courante · les lignes antérieures à la
 * conversion (ancienne unité) sont multipliées, la ligne de conversion
 * elle-même est exclue (ce n'est ni une consommation ni un achat).
 */
export function deltaUniteCourante(l: { delta: number; createdAt: Date; reason?: string | null }, convertiLe: Date | null): number {
  if (l.reason === MOTIF_CONVERSION_UNITE) return 0;
  if (convertiLe && l.createdAt.getTime() < convertiLe.getTime()) return l.delta * FACTEUR_UNITE;
  return l.delta;
}
