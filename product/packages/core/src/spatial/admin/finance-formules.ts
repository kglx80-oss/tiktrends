/**
 * « Finance · MRR & marges » · les indicateurs de l'ancienne page
 * `/admin/finance`, portés TELS QUELS dans l'écran Spatial « Revenus & MRR ».
 *
 * ── Rien n'est redéfini ici ─────────────────────────────────────────────────
 *
 * La définition du MRR est une décision du propriétaire, en attente. Ce module
 * ne fait que DÉPLACER dans le noyau le calcul que la page V5 faisait en
 * ligne, à l'identique : mêmes formules payantes (Core, Plus, Business), mêmes
 * fonctions (`analyzePlanNet`, `analyzePlanRisk`, `CREDIT_EUR`), même cible de
 * marge brute (la cible unique `MARGE_CIBLE`, 70 % depuis le 29/10), même base (la formule de CHAQUE espace, abonnement Stripe
 * actif ou non, × le prix du catalogue du code). L'écran Spatial calcule son
 * propre MRR autrement (`mrrPlateforme` · abonnements Stripe actifs aux tarifs
 * en vigueur) · les deux restent affichés, chacun avec sa base, sans trancher.
 */
import { analyzePlanNet, analyzePlanRisk, CREDIT_EUR, type PlanNet, type PlanRisk } from '../../economics';
import { MARGE_CIBLE } from '../../offre/marges';

/** Les formules payantes de l'ancienne page, dans son ordre. */
export const FORMULES_FINANCE = ['core', 'plus', 'business'] as const;
/** La marge brute cible · la cible unique de la plateforme (`offre/marges.ts`). */
export const MARGE_BRUTE_CIBLE = MARGE_CIBLE;

export interface LigneFinanceFormule {
  plan: string;
  libelle: string;
  prix: number;
  credits: number;
  clients: number;
  net: PlanNet;
  risque: PlanRisk;
  /** Crédits maximum pour tenir la marge brute cible au prix actuel. */
  creditsOptimaux: number;
  surAlloue: boolean;
}

export interface FinanceFormules {
  lignes: LigneFinanceFormule[];
  mrr: number;
  arr: number;
  beneficeNetMensuel: number;
  clientsPayants: number;
  arpa: number;
}

/**
 * Le calcul de l'ancienne page, à l'identique. `formules` · la formule de
 * chaque espace (une formule inconnue compte comme Starter, comme avant).
 */
export function financeParFormule(p: {
  formules: readonly string[];
  prix: Readonly<Record<string, number>>;
  credits: Readonly<Record<string, number>>;
  libelles: Readonly<Record<string, string>>;
  markup: number;
  taux: number;
}): FinanceFormules {
  const n: Record<string, number> = { starter: 0, core: 0, plus: 0, business: 0 };
  for (const f of p.formules) { const k = f in n ? f : 'starter'; n[k]!++; }
  const lignes = FORMULES_FINANCE.map((plan): LigneFinanceFormule => {
    const prix = p.prix[plan] ?? 0;
    const credits = p.credits[plan] ?? 0;
    const libelle = p.libelles[plan] ?? plan;
    const net = analyzePlanNet(libelle, prix, credits, p.markup, p.taux);
    const risque = analyzePlanRisk(libelle, prix, credits, Math.round(MARGE_BRUTE_CIBLE * 100));
    const creditsOptimaux = Math.floor((prix * (1 - MARGE_BRUTE_CIBLE) * p.markup) / CREDIT_EUR);
    return { plan, libelle, prix, credits, clients: n[plan]!, net, risque, creditsOptimaux, surAlloue: credits > creditsOptimaux * 1.1 };
  });
  const mrr = lignes.reduce((t, r) => t + r.prix * r.clients, 0);
  const clientsPayants = lignes.reduce((t, r) => t + r.clients, 0);
  return {
    lignes, mrr, arr: mrr * 12,
    beneficeNetMensuel: lignes.reduce((t, r) => t + r.net.netEur * r.clients, 0),
    clientsPayants, arpa: clientsPayants > 0 ? mrr / clientsPayants : 0,
  };
}

/** Le format monétaire de l'ancienne page · 3 décimales sous 1 €, aucune dès 100 €, 2 sinon. */
export function eurosFinance(n: number): string {
  const d = Math.abs(n) < 1 ? 3 : Math.abs(n) >= 100 ? 0 : 2;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
}
