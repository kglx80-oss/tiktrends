/**
 * Tour de contrôle · « Crédits & marges » (vague 4 · écran V5 `/credits` sans
 * fragment de maquette). Pur.
 *
 * Le MODÈLE ÉCONOMIQUE du code (`economics.ts`) · coût réel estimé par action,
 * barème de crédits, règle maison « coût réel × markup », marge nette après
 * frais de paiement et impôt sur les sociétés, pire cas par formule. Mêmes
 * calculs que l'écran V5 retiré · seule la mise en forme vit ici.
 */
import { analyzeCosts, analyzePlanNet, analyzePlanRisk, repricingSuggestions } from '../../economics';

/** Marge brute visée même au pire cas (l'écran V5 · `TARGET_MARGIN`). */
export const MARGE_PLANCHER_CIBLE = 70;

/**
 * Les euros de l'écran · décimales par palier (petits coûts < 1 € au millième,
 * montants courants au centime, gros montants ≥ 100 € sans décimale) · évite
 * l'illusion « 33,333 € ».
 */
export function eurosParPalier(n: number): string {
  const d = n < 1 ? 3 : n >= 100 ? 0 : 2;
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
}

export interface ForfaitPayable { libelle: string; prix: number; credits: number }

export interface EcranCreditsMarges {
  operations: Array<{ action: string; libelle: string; unite: string; fournisseur: string; cout: string; credits: number; revente: string; marge: string; margeAtteinte: boolean; reco: number | null }>;
  nets: Array<{ forfait: string; prix: number; coutApi: string; frais: string; brut: string; brutPct: number; impot: string; net: number; netPct: number; netAn: number }>;
  risques: Array<{ forfait: string; prix: number; pleine: number; plancher: number; classe: 'g' | 'w' | 'r'; action: string; coutMax: string; prixConseille: number | null; sain: boolean }>;
  corrections: Array<{ action: string; libelle: string; marge: string; actuel: number; reco: number; hausse: boolean }>;
  /** La lecture tirée des chiffres · jamais un texte figé. */
  lecture: string;
}

/**
 * Ce que l'écran affiche · les formules PAYANTES seulement (une formule gratuite
 * n'a ni marge ni impôt).
 */
export function ecranCreditsMarges(p: { forfaits: readonly ForfaitPayable[]; markup: number; taux: number }): EcranCreditsMarges {
  const payants = p.forfaits.filter((f) => f.prix > 0);
  const risques = payants.map((f) => {
    const r = analyzePlanRisk(f.libelle, f.prix, f.credits, MARGE_PLANCHER_CIBLE);
    return {
      forfait: f.libelle, prix: f.prix, pleine: r.bestMarginPct, plancher: r.worstMarginPct,
      classe: (r.worstMarginPct >= MARGE_PLANCHER_CIBLE ? 'g' : r.worstMarginPct >= 40 ? 'w' : 'r') as 'g' | 'w' | 'r',
      action: r.worstAction, coutMax: eurosParPalier(r.worstRealCostEur),
      prixConseille: r.recommendedPriceEur > r.priceEur ? r.recommendedPriceEur : null, sain: r.healthy,
    };
  });
  return {
    operations: analyzeCosts(p.markup).map((a) => ({
      action: a.action, libelle: a.label, unite: a.unit, fournisseur: a.provider, cout: eurosParPalier(a.realEur), credits: a.credits,
      revente: eurosParPalier(a.resaleEur), marge: `×${a.marginX.toFixed(1)}`, margeAtteinte: a.marginX >= p.markup * 0.9, reco: a.aligned ? null : a.recommendedCredits,
    })),
    nets: payants.map((f) => {
      const n = analyzePlanNet(f.libelle, f.prix, f.credits, p.markup, p.taux);
      return {
        forfait: f.libelle, prix: f.prix, coutApi: eurosParPalier(n.apiCostEur), frais: eurosParPalier(n.paymentFeeEur),
        brut: `${Math.round(n.grossEur)} €`, brutPct: n.grossPct, impot: eurosParPalier(n.taxEur), net: Math.round(n.netEur), netPct: n.netPct, netAn: Math.round(n.netEur * 12),
      };
    }),
    risques,
    corrections: repricingSuggestions(p.markup).map((a) => ({ action: a.action, libelle: a.label, marge: `×${a.marginX.toFixed(1)}`, actuel: a.credits, reco: a.recommendedCredits, hausse: a.recommendedCredits > a.credits })),
    lecture: lectureRentabilite(risques),
  };
}

/**
 * La lecture directeur, TIRÉE des chiffres · quelle action plombe la marge
 * plancher, et sur quelles formules. Remplace le paragraphe figé de l'écran V5
 * (qui nommait la vidéo quoi que disent les chiffres).
 */
export function lectureRentabilite(risques: ReadonlyArray<{ forfait: string; plancher: number; action: string; sain: boolean }>): string {
  if (risques.length === 0) return 'Aucune formule payante · rien à mesurer.';
  const fragiles = risques.filter((r) => !r.sain);
  if (fragiles.length === 0) return `Toutes les formules payantes tiennent ${MARGE_PLANCHER_CIBLE} % de marge brute même au pire cas.`;
  const parAction = new Map<string, string[]>();
  for (const r of fragiles) parAction.set(r.action, [...(parAction.get(r.action) ?? []), r.forfait]);
  const [action, forfaits] = [...parAction.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
  return `${fragiles.length} formule${fragiles.length > 1 ? 's' : ''} sous ${MARGE_PLANCHER_CIBLE} % au pire cas · l’action qui tire la marge plancher vers le bas est « ${action} » (${forfaits.join(', ')}). Deux leviers · la reprixer dans le barème (colonne Reco), ou encadrer son volume par formule.`;
}
