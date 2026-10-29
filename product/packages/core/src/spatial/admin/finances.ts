/**
 * Tour de contrôle (Spatial, rubrique Admin) · rentabilité, coûts et marges.
 * Pur.
 *
 * Deux sources, jamais mélangées :
 *  · la DÉPENSE RÉELLE chez les fournisseurs, relevée en dollars par la
 *    barrière de dépense (`ai_spend`) · elle reste en dollars ;
 *  · le MODÈLE ÉCONOMIQUE du code (`economics.ts`) · coût estimé par action,
 *    valeur d'un crédit, frais de paiement · en euros, et présenté comme tel.
 * Aucun taux de change n'est supposé · une part « dollars ÷ euros » ne
 * s'affiche pas.
 */
import { analyzePlanNet, COST_MODEL, CREDIT_EUR } from '../../economics';
import { CREDIT_COSTS } from '../../credits';
import type { LigneForfait } from './plateforme';
import { MARGE_CIBLE } from '../../offre/marges';

/**
 * Marge brute jugée saine · la cible unique de la plateforme (`MARGE_CIBLE`,
 * `offre/marges.ts`, décision du 29/10). Sous ce seuil, une opération est « à revoir ».
 */
export const MARGE_CIBLE_PCT = Math.round(MARGE_CIBLE * 100);

export interface RentabiliteForfait extends LigneForfait {
  /** Coût IA par abonné si toute l'allocation est consommée (pire cas, €). */
  coutIaPireCas: number;
  fraisPaiement: number;
  /** Marge brute en pourcents · prix − coût IA pire cas − frais de paiement. */
  margePct: number;
}

/** La rentabilité par formule payante · `analyzePlanNet` (modèle économique du code). */
export function rentabiliteForfaits(lignes: readonly LigneForfait[], markup?: number): RentabiliteForfait[] {
  return lignes.map((l) => {
    const n = analyzePlanNet(l.libelle, l.prix, l.credits, markup);
    return { ...l, coutIaPireCas: n.apiCostEur, fraisPaiement: n.paymentFeeEur, margePct: l.prix > 0 ? (n.grossEur / l.prix) * 100 : 0 };
  });
}

/** Marge brute de la plateforme, pondérée par le MRR de chaque formule · `null` sans revenu. */
export function margeBrutePonderee(r: readonly RentabiliteForfait[]): number | null {
  const mrr = r.reduce((s, x) => s + x.mrr, 0);
  if (mrr <= 0) return null;
  return r.reduce((s, x) => s + x.margePct * x.mrr, 0) / mrr;
}

export interface CoutFournisseur { fournisseur: string; usd: number; appels: number; part: number; largeur: number }

/** La dépense réelle par fournisseur · part du total et largeur relative au plus gros. */
export function coutsParFournisseur(lignes: ReadonlyArray<{ fournisseur: string; usd: number; appels: number }>): CoutFournisseur[] {
  const total = lignes.reduce((s, l) => s + l.usd, 0);
  const max = Math.max(0, ...lignes.map((l) => l.usd));
  return [...lignes]
    .sort((a, b) => b.usd - a.usd)
    .map((l) => ({ ...l, part: total > 0 ? (l.usd / total) * 100 : 0, largeur: max > 0 ? (l.usd / max) * 100 : 0 }));
}

export interface MargeOperation { action: string; libelle: string; credits: number; revenuEur: number; coutEur: number; margePct: number; aRevoir: boolean }

/**
 * La marge par opération · crédits débités × valeur d'un crédit, face au coût
 * fournisseur ESTIMÉ du modèle économique (`COST_MODEL`). Triée de la plus
 * fragile à la plus confortable.
 */
export function margesOperations(): MargeOperation[] {
  return COST_MODEL.map((c) => {
    const credits = CREDIT_COSTS[c.action];
    const revenuEur = credits * CREDIT_EUR;
    const margePct = revenuEur > 0 ? ((revenuEur - c.realEur) / revenuEur) * 100 : 0;
    return { action: c.action, libelle: c.label, credits, revenuEur, coutEur: c.realEur, margePct, aRevoir: margePct < MARGE_CIBLE_PCT };
  }).sort((a, b) => a.margePct - b.margePct);
}

/** La valeur de revente d'un crédit (€) · exposée pour la légende de l'écran. */
export const VALEUR_CREDIT_EUR = CREDIT_EUR;

/* ─────────────────────────────── Le MRR tracé ─────────────────────────────── */

/**
 * Le tracé du MRR (`svg.rvchart`, 600 × 190) · un point par mois CONNU, les
 * mois sans relevé restent vides. Moins de deux points · aucune ligne.
 */
export function traceMrr(valeurs: ReadonlyArray<number | null>, largeur = 600, haut = 18, bas = 168): { ligne: string; aire: string } | null {
  const pts = valeurs.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map((p) => p.v)) || 1;
  const x = (i: number) => 8 + (i * (largeur - 16)) / Math.max(1, valeurs.length - 1);
  const y = (v: number) => bas - (v / max) * (bas - haut) * 0.92;
  const ligne = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const aire = `${ligne} L${x(pts[pts.length - 1]!.i).toFixed(0)} ${bas} L${x(pts[0]!.i).toFixed(0)} ${bas} Z`;
  return { ligne, aire };
}

/** La part de chaque formule dans le MRR, en pourcents. */
export function partsMrr(lignes: readonly LigneForfait[]): Array<LigneForfait & { part: number }> {
  const total = lignes.reduce((s, l) => s + l.mrr, 0);
  return lignes.map((l) => ({ ...l, part: total > 0 ? (l.mrr / total) * 100 : 0 }));
}

/**
 * La note sous la répartition du MRR · la formule qui porte le plus de revenu,
 * et les comptes qui ont consommé PLUS que leur dotation sur 30 jours (un fait,
 * pas un seuil choisi) · candidats à la formule supérieure. `null` sans revenu.
 */
export function noteRepartitionMrr(
  parts: ReadonlyArray<LigneForfait & { part: number }>,
  depassements: Readonly<Record<string, number>>,
): string | null {
  const tete = [...parts].sort((a, b) => b.mrr - a.mrr)[0];
  if (!tete || tete.mrr <= 0) return null;
  let note = `${tete.libelle} porte ${Math.round(tete.part)} % du MRR.`;
  const i = parts.findIndex((p) => p.forfait === tete.forfait);
  const n = depassements[tete.forfait] ?? 0;
  const suivant = parts[i + 1];
  if (n > 0 && suivant) note += ` ${n} compte${n > 1 ? 's' : ''} ${tete.libelle} ${n > 1 ? 'ont' : 'a'} consommé plus que ${n > 1 ? 'leur' : 'sa'} dotation sur 30 jours : candidat${n > 1 ? 's' : ''} à ${suivant.libelle}.`;
  return note;
}
