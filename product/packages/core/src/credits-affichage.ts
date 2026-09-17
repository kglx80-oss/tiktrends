/**
 * Comment AFFICHER un solde de crédits · une seule vérité, partout.
 *
 * La puce du rail disait « Illimité » au fondateur, mais l'écran de pilotage
 * affichait « Solde crédits · 0 » pour le même compte · deux surfaces, deux
 * vérités contradictoires sur le même état (CDC v7 · N09). Un compte illimité ou
 * exempté n'a pas un solde de zéro · il n'a pas de solde à opposer. La règle qui
 * tranche « qu'est-ce qu'on montre » est une DÉCISION pure · elle vit ici, et
 * chaque écran la partage plutôt que de recalculer sa propre version.
 */

export type AffichageCredits =
  | { mode: 'illimite' }
  | { mode: 'exempte' }
  | { mode: 'solde'; valeur: number };

/** Le libellé des modes sans solde · le même mot sur tous les écrans. */
export const LIBELLE_CREDITS: Record<'illimite' | 'exempte', string> = {
  illimite: 'Illimité',
  exempte: 'Exempté',
};

/**
 * Ce qu'un écran doit montrer pour un compte donné.
 *
 * - `unlimited` (fondateur/créateur) → « Illimité », jamais un chiffre ;
 * - `exempt` (dispensé de crédits, plafond fournisseur conservé côté serveur) →
 *   « Exempté » ;
 * - sinon → le solde réel, jamais négatif (un solde à zéro reste zéro, mais on
 *   ne prétend pas « zéro » là où il n'y a simplement pas de solde à compter).
 */
export function afficherCredits(e: { balance: number; unlimited: boolean; exempt?: boolean }): AffichageCredits {
  if (e.unlimited) return { mode: 'illimite' };
  if (e.exempt) return { mode: 'exempte' };
  return { mode: 'solde', valeur: Math.max(0, e.balance) };
}

/** Le texte prêt à afficher · le solde est formaté par l'appelant (locale). */
export function texteCredits(a: AffichageCredits, formatNombre: (n: number) => string): string {
  return a.mode === 'solde' ? formatNombre(a.valeur) : LIBELLE_CREDITS[a.mode];
}
