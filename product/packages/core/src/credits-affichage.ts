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

/**
 * La case « Crédits » du résumé de formule (/billing) · lot 11.
 *
 * Le rail disait « Illimité » et le centre « ◈ 0 / 24 000 » pour le même
 * compte · l'allocation de la formule servait de dénominateur à un solde qui
 * n'existe pas. En illimité, la case dit « Illimité » et cite l'allocation à
 * part, comme ce qu'elle est · la dotation mensuelle de l'espace. Aucun quota
 * ni aucune règle ne change, seulement ce qui est montré.
 */
export function caseCreditsFormule(
  e: { balance: number; unlimited: boolean; allocation: number },
  formatNombre: (n: number) => string,
): { valeur: string; detail: string } {
  const a = afficherCredits({ balance: e.balance, unlimited: e.unlimited });
  if (a.mode !== 'solde') return { valeur: LIBELLE_CREDITS[a.mode], detail: ` · formule ${formatNombre(e.allocation)} / mois` };
  return { valeur: `◈ ${formatNombre(a.valeur)}`, detail: ` / ${formatNombre(e.allocation)}` };
}

/**
 * L'historique de crédits vide (/credits) · lot 11. Il promettait « tes crédits
 * se dépensent à chaque génération » à un compte illimité, dont les générations
 * ne débitent rien (`unlimitedCredits` · ni vérification ni débit). L'historique
 * est celui de l'ESPACE · il trace encore les recharges, les ajustements et
 * les dépenses des autres membres, ce que la copie dit.
 */
export function videHistoriqueCredits(illimite: boolean): { titre: string; pourquoi: string } {
  return illimite
    ? {
        titre: 'Aucun mouvement pour l’instant.',
        pourquoi: 'Ton accès est illimité · tes générations ne débitent pas de crédits. Les recharges, les ajustements et les dépenses des autres membres de l’espace s’afficheront ici.',
      }
    : {
        titre: 'Aucun mouvement pour l’instant.',
        pourquoi: 'Tes crédits se dépensent à chaque génération · lance une première créa et le détail s’affiche ici.',
      };
}

/**
 * Le pied de /billing quand le paiement en ligne n'est pas branché · lot 11.
 * Il disait « écris-nous depuis le Support pour faire évoluer ta formule » · or
 * un ticket du support reste dans l'espace et n'est lu que par ses admins (ceux
 * qui lisent déjà cette page). Aucun contact n'est inventé · on dit l'état.
 */
export const PIED_FACTURATION_SANS_PAIEMENT = {
  titre: 'Paiement en préparation.',
  texte: 'Le règlement en ligne n’est pas encore ouvert · la formule ne se change pas encore depuis l’application, et un ticket au support reste dans ton espace (seuls ses admins le lisent).',
} as const;

/**
 * L'introduction de /billing · lot 12. Elle disait à tout lecteur « les crédits
 * se consomment à chaque génération », y compris à un compte illimité, que rien
 * ne débite. L'allocation reste celle de l'ESPACE (les autres membres la
 * consomment) · on dit les deux, sans changer aucune règle.
 */
export function introFacturation(illimite: boolean): string {
  return illimite
    ? 'Chaque formule ouvre une allocation mensuelle de crédits pour l’espace, consommée par les générations de ses membres. Ton accès est illimité · tes propres générations ne la débitent pas.'
    : 'Chaque formule ouvre une allocation mensuelle de crédits : les crédits se consomment à chaque génération (image, vidéo, analyse), selon l’action.';
}
