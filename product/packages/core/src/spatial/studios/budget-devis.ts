import { partSolde } from '../conso';

/**
 * Spatial · assistant Nouveau projet · étape « Format & devis » · lot 8 V5
 * (PC B23 jauge de budget, PC C5 « Réduire les variantes » / « Garder un seul
 * format »).
 *
 * Pur. La jauge LIT le solde de crédits déjà chargé par la coquille · elle ne
 * calcule aucun prix (le prix exact vient du devis serveur, immuable) et ne
 * touche aucun crédit. Les réductions ne sont proposées qu'après un REFUS
 * de budget du serveur (`BUDGET_EXCEEDED`), et seulement celles qui
 * réduisent vraiment la demande affichée · elles changent le choix à l'écran,
 * rien n'est envoyé avant le prochain « Voir le devis serveur ».
 */

export interface CreditsDevis { solde: number; dotation: number; illimite: boolean }

const nombre = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.max(0, Math.round(n))).replace(/ | /g, ' ');

/** La jauge · part du solde (anneau) et sa phrase. */
export function jaugeBudgetDevis(c: CreditsDevis): { part: number; phrase: string } {
  if (c.illimite) return { part: 100, phrase: 'Crédits illimités pour ton espace · le devis serveur dit le montant exact avant tout débit.' };
  const sur = c.dotation > 0 ? ` sur ${nombre(c.dotation)}` : '';
  return {
    part: partSolde(c.solde, c.dotation),
    phrase: `Ton solde · ${nombre(c.solde)} crédit${c.solde > 1 ? 's' : ''}${sur} · le devis serveur le compare au montant exact, rien n’est débité ici.`,
  };
}

export type CleReductionDevis = 'un_visuel' | 'un_format';

/** Les réductions proposées après un refus de budget · seulement celles qui réduisent quelque chose. */
export function reductionsDevis(e: { refusBudget: boolean; nombre: number; formats: number }): Array<{ cle: CleReductionDevis; libelle: string; effet: string }> {
  if (!e.refusBudget) return [];
  const r: Array<{ cle: CleReductionDevis; libelle: string; effet: string }> = [];
  if (e.nombre > 1) r.push({ cle: 'un_visuel', libelle: 'Réduire les variantes', effet: `1 visuel par format au lieu de ${e.nombre}` });
  if (e.formats > 1) r.push({ cle: 'un_format', libelle: 'Garder un seul format', effet: `le format source seul au lieu de ${e.formats}` });
  return r;
}
