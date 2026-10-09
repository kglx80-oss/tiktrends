/**
 * R6 · le budget d'essai (registre E2/E3) VOIT les réconciliations (R5).
 *
 * ── Le défaut réparé ──────────────────────────────────────────────────────────
 *
 * R5 a donné au propriétaire le geste « réconcilier avec la facture »
 * (`ai_spend_reconciliations`) et le plafond commun retient désormais le
 * montant FACTURÉ. Le registre d'essai, lui, ne lisait pas la table : une
 * ligne réconciliée y restait « à réconcilier », comptée au maximum réservé,
 * et l'engagement qui la portait aussi. La facture saisie ne libérait rien
 * du budget d'essai de 15 $.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 *  · une ligne réconciliée compte son montant FACTURÉ, y compris quand il
 *    dépasse le réservé (`classerLigneEssaiReconciliee`, R5) ;
 *  · un engagement `incertain` dont TOUTES les lignes rattachées (au moins
 *    une) sont réconciliées ne compte plus rien au-delà d'elles : il vaut le
 *    facturé. Une seule ligne non réconciliée, ou aucune ligne rattachée
 *    (rien ne prouve ce qui a été facturé) ⇒ il reste au MAXIMUM réservé ;
 *  · un engagement `regle` a été réglé, à sa clôture, au montant de ses
 *    lignes tel qu'il était alors (une ligne à réconcilier y entrait à son
 *    maximum). Une réconciliation postérieure ne doit pas le regonfler : une
 *    ligne réconciliée le couvre pour son ancien maximum (ou le facturé s'il
 *    est plus haut), et seule la ligne, au facturé, est comptée ;
 *  · un engagement `engage` (ouvert) ou `libere` · inchangé.
 *
 * Jamais de sous-compte : une ligne compte toujours au moins son facturé ;
 * un engagement réglé compte toujours au moins ce qu'il a réglé AU-DELÀ de
 * ce que ses lignes couvraient à sa clôture.
 *
 * Pur · ni fichier, ni base, ni réseau. Le registre (`apps/web/scripts/
 * recette/registre.ts`) passe ses lignes et ses engagements.
 */

import { bilanBudgetEssai } from './depense-prudente';
import { partEngagement, type BilanEssaiEngage, type EngagementEssai } from './engagement-essai';

/** Une ligne du registre vue par le bilan · `etat: 'reconciliee'` et `actualMicros` (montant de la ligne en base) suffisent. */
export interface LigneEssaiBilan {
  regleMicros: number;
  incertainMicros: number;
  engagement?: string | null;
  etat?: string;
  /** Montant `actual_usd` de la ligne en base (micro-dollars) · le maximum compté AVANT la réconciliation. */
  actualMicros?: number;
}

const pos = (n: number | undefined | null) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
const reconciliee = (l: LigneEssaiBilan) => l.etat === 'reconciliee';

/** Un engagement `incertain` dont toutes les lignes rattachées (au moins une) sont réconciliées. */
export function engagementIncertainReconcilie(
  g: Pick<EngagementEssai, 'id' | 'etat'>, lignes: ReadonlyArray<LigneEssaiBilan>,
): boolean {
  if (g.etat !== 'incertain') return false;
  const siennes = lignes.filter((l) => l.engagement === g.id);
  return siennes.length > 0 && siennes.every(reconciliee);
}

/**
 * Ce qu'un engagement compte au-delà de ses lignes, réconciliations
 * comprises (voir l'en-tête du module).
 */
export function partEngagementReconciliee(
  g: Pick<EngagementEssai, 'id' | 'etat' | 'reserveMicros' | 'regleMicros'>, lignes: ReadonlyArray<LigneEssaiBilan>,
): { engage: number; incertain: number; regle: number } {
  if (engagementIncertainReconcilie(g, lignes)) return { engage: 0, incertain: 0, regle: 0 };
  const siennes = lignes.filter((l) => l.engagement === g.id);
  const couverture = siennes.reduce((s, l) => s + (g.etat === 'regle' && reconciliee(l)
    ? Math.max(pos(l.regleMicros) + pos(l.incertainMicros), pos(l.actualMicros))
    : pos(l.regleMicros) + pos(l.incertainMicros)), 0);
  return partEngagement(g, couverture);
}

/**
 * Le bilan du registre, réconciliations comprises · même forme que
 * `bilanEssaiAvecEngagements` (E3), que toute décision existante
 * (`decisionDepenseEssai`) lit sans changement.
 */
export function bilanEssaiReconcilie(e: {
  autoriseMicros: number;
  anterieuresMicros: number;
  lignes: ReadonlyArray<LigneEssaiBilan>;
  engagements: ReadonlyArray<Pick<EngagementEssai, 'id' | 'etat' | 'reserveMicros' | 'regleMicros'>>;
}): BilanEssaiEngage {
  let engageMicros = 0;
  let engagementsOuverts = 0;
  const pseudo: Array<{ regleMicros: number; incertainMicros: number }> = [];
  for (const g of e.engagements) {
    const p = partEngagementReconciliee(g, e.lignes);
    if (g.etat === 'engage') engagementsOuverts += 1;
    engageMicros += p.engage;
    pseudo.push({ regleMicros: p.regle, incertainMicros: p.engage + p.incertain });
  }
  const b = bilanBudgetEssai({ autoriseMicros: e.autoriseMicros, anterieuresMicros: e.anterieuresMicros, lignes: [...e.lignes, ...pseudo] });
  return { ...b, engageMicros, engagementsOuverts };
}
