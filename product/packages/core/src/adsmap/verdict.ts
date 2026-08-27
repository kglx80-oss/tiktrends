/**
 * ADSMAP · moteur de verdict (§6.5 et §6.6 du cahier des charges).
 *
 * Le principe qui gouverne tout le fichier : **un verdict absolu n'a de sens que
 * si chaque ad a eu une chance comparable**. En CBO, Meta concentre le budget sur
 * une ou deux annonces ; les autres n'ont jamais assez de données, et celle qui
 * est favorisée gagne par construction. Quand le protocole n'est pas respecté, le
 * moteur ne se tait pas : il dégrade honnêtement sa conclusion (RELATIVE_WINNER,
 * INSUFFICIENT_DELIVERY) plutôt que de produire un WINNER qui n'en est pas un.
 *
 * Pur : ni base, ni réseau, ni horloge. Les dates arrivent en paramètre.
 */

import { deriveMetrics, median, type AdMetrics, type DerivedMetrics } from './stats';

import type { VerdictValue, FunnelStage, KillReason } from './types';

/** Seuils par marque (§6.3). Réglés par l'assistant à partir des 30 derniers jours. */
export interface VerdictConfig {
  primaryKpi: 'cpa' | 'roas' | 'cpc' | 'hook_rate';
  targetCpa: number;
  targetRoas: number;
  minSpendMultiple: number;      // dépense ≥ n × cible avant de conclure sur le CPA
  minImpressions: number;
  minPurchasesWinner: number;
  babyTolerance: number;         // KPI ≤ cible × (1 + tolérance)
  loserMultiple: number;
  /**
   * Niveau des intervalles, UNILATÉRAL (addendum v2.1 · C1). Ne pas remonter
   * pour « conclure plus vite » : c'est `babyTolerance` qu'il faut ajuster si
   * l'équipe juge le seuil WINNER trop strict après deux lots.
   */
  ciLevelOneSided: number;
  leadingIndicators: { hookRate: number; holdRate: number; ctr: number };
  leadingRelative: number;       // ou ≥ n × médiane de la marque
  evaluationWindowDays: number;
  minSpendShare: number;         // part de la dépense attendue en dessous de laquelle il y a sous-diffusion
}

export const DEFAULT_VERDICT_CONFIG: VerdictConfig = {
  primaryKpi: 'cpa',
  targetCpa: 35,
  targetRoas: 2.5,
  minSpendMultiple: 3,
  minImpressions: 5000,
  minPurchasesWinner: 3,
  babyTolerance: 0.3,
  loserMultiple: 1.5,
  ciLevelOneSided: 0.80,
  leadingIndicators: { hookRate: 0.30, holdRate: 0.10, ctr: 0.012 },
  leadingRelative: 1.2,
  evaluationWindowDays: 7,
  minSpendShare: 0.35,
};

/** Médianes de la marque sur 90 jours · repères relatifs (§6.4). */
export interface BrandMedians { hookRate?: number | null; holdRate?: number | null; ctr?: number | null; cpa?: number | null }

export interface VerdictInput {
  metrics: AdMetrics;
  config: VerdictConfig;
  brandMedians: BrandMedians;
  comparable: boolean;           // protocole respecté (§6.2)
  spendShare?: number;           // part réelle de la dépense du batch, rapportée à 1/n
  batchRank?: number;            // rang sur le KPI primaire parmi les ads comparables du batch
  daysElapsed?: number;          // jours écoulés dans la fenêtre
}

export interface VerdictResult {
  computed: VerdictValue;
  comparable: boolean;
  failedStage: FunnelStage | null;
  killFlag: KillReason | null;
  derived: DerivedMetrics;
  daysRemaining: number | null;
  /** Pourquoi ce verdict, en une phrase affichable. */
  reason: string;
}

const fr = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/* -------------------------------------------------------------------------- */
/*  Kill rules (§6.5) · évaluées AVANT le verdict                             */
/* -------------------------------------------------------------------------- */

/**
 * Repère un budget qui brûle sans espoir, plus tôt que le verdict ne conclurait.
 * K3 est à part : la créa fonctionne (le CTR tient), c'est la page ou l'offre qui
 * ne convertit pas · on ne suggère donc PAS de couper, on renvoie vers le CRO.
 */
export function evaluateKillRules(d: DerivedMetrics, m: AdMetrics, cfg: VerdictConfig, med: BrandMedians): KillReason | null {
  // K1 · le hook ne prend pas, et l'intervalle haut reste sous la moitié de la marque.
  if (m.impressions >= 3000 && med.hookRate && d.hookRateCi && d.hookRateCi.hi < 0.5 * med.hookRate) return 'hook';

  // K2 · dépense engagée, aucun achat, et le clic est deux fois sous la marque.
  if (m.spend >= 2 * cfg.targetCpa && m.purchases === 0 && med.ctr && d.ctrCi && d.ctrCi.hi < 0.5 * med.ctr) return 'click';

  // K3 · le trafic est là et de qualité, mais rien ne se transforme : c'est la page.
  if (m.linkClicks >= 150 && m.purchases === 0 && med.ctr && d.ctr !== null && d.ctr >= med.ctr) return 'convert';

  // K4 · même dans l'hypothèse la plus favorable (borne basse unilatérale du CPA),
  // le coût dépasse la limite. Cf. addendum v2.1 · C1.5.
  if (m.spend >= cfg.minSpendMultiple * cfg.targetCpa && d.cpaLo !== null && d.cpaLo > cfg.loserMultiple * cfg.targetCpa) return 'cost';

  return null;
}

/* -------------------------------------------------------------------------- */
/*  Étape défaillante (§6.6)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Première étape du funnel dont la métrique tombe sous 0,8 × la médiane de la
 * marque. L'ordre compte : un hook qui ne prend pas rend le reste illisible, donc
 * on nomme la première marche cassée, pas la pire.
 */
export function diagnoseFailedStage(d: DerivedMetrics, m: AdMetrics, med: BrandMedians): FunnelStage | null {
  const sous = (val: number | null | undefined, ref: number | null | undefined) =>
    val !== null && val !== undefined && ref !== null && ref !== undefined && ref > 0 && val < 0.8 * ref;

  if (sous(d.hookRate, med.hookRate)) return 'hook';
  if (sous(d.holdRate, med.holdRate)) return 'hold';
  if (sous(d.ctr, med.ctr)) return 'click';
  // CONVERT : le trafic arrive mais n'achète pas.
  if (m.linkClicks >= 50 && m.purchases === 0) return 'convert';
  if (med.cpa && d.cpa !== null && d.cpa > med.cpa) return 'convert';
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Verdict (§6.6) · première règle vraie l'emporte                           */
/* -------------------------------------------------------------------------- */

/**
 * Nombre d'indicateurs avancés au vert.
 *
 * Le §6.6 écrit « ≥ seuil absolu OU ≥ leading_relative × médiane marque ». Pris
 * littéralement, le « ou » ABAISSE la barre pour une marque médiocre : avec une
 * médiane de hook à 22 %, le seuil relatif tombe à 26,4 % et n'importe quelle ad
 * à 27 % passerait, alors que le seuil absolu est à 30 %.
 *
 * Deux raisons de lire « le plus exigeant des deux » plutôt que « l'un ou
 * l'autre » : c'est le sens métier (une marque qui performe déjà bien doit
 * dépasser SA médiane, pas un plancher générique), et c'est la seule lecture qui
 * reproduit l'Annexe A · le cas « bordure de fenêtre », à 30,0 % / 10,0 % /
 * 1,20 %, tombe pile sur les trois seuils absolus et doit rester non concluant.
 *
 * Comparaisons strictes, pour la même raison : un seuil atteint n'est pas franchi.
 */
function leadingCount(d: DerivedMetrics, cfg: VerdictConfig, med: BrandMedians): number {
  const ok = (val: number | null, abs: number, ref?: number | null) => {
    if (val === null) return false;
    const seuil = ref ? Math.max(abs, cfg.leadingRelative * ref) : abs;
    return val > seuil;
  };
  return [
    ok(d.hookRate, cfg.leadingIndicators.hookRate, med.hookRate),
    ok(d.holdRate, cfg.leadingIndicators.holdRate, med.holdRate),
    ok(d.ctr, cfg.leadingIndicators.ctr, med.ctr),
  ].filter(Boolean).length;
}

export function computeVerdict(input: VerdictInput): VerdictResult {
  const { metrics: m, config: cfg, brandMedians: med, comparable } = input;
  const d = deriveMetrics(m, cfg.ciLevelOneSided);
  const killFlag = evaluateKillRules(d, m, cfg, med);
  const failedStage = diagnoseFailedStage(d, m, med);
  const daysRemaining = input.daysElapsed !== undefined
    ? Math.max(0, cfg.evaluationWindowDays - input.daysElapsed)
    : null;

  const out = (computed: VerdictValue, reason: string): VerdictResult => ({
    computed, comparable, killFlag, derived: d, daysRemaining,
    // Un gagnant n'a pas d'étape défaillante à nommer.
    failedStage: computed === 'winner' ? null : failedStage,
    reason,
  });

  const babyCeil = cfg.targetCpa * (1 + cfg.babyTolerance);

  // 1 · Hors protocole ET sous-diffusée : l'ad n'a jamais eu sa chance.
  if (!comparable && input.spendShare !== undefined && input.spendShare < cfg.minSpendShare) {
    return out('insufficient_delivery', `Diffusion trop faible (${Math.round(input.spendShare * 100)} % de la dépense attendue) : relance en ABO pour obtenir un verdict.`);
  }

  // 2 · Pas assez de matière pour conclure quoi que ce soit.
  if (m.spend < cfg.minSpendMultiple * cfg.targetCpa && m.impressions < cfg.minImpressions) {
    return out('inconclusive', `Trop peu de données (${fr(m.spend)} € dépensés, ${fr(m.impressions)} impressions).`);
  }

  // 3 · Même au mieux, le coût dépasse la limite.
  if (killFlag === 'cost') {
    return out('loser', `Même dans l'hypothèse la plus favorable, le CPA reste au-dessus de ${fr(cfg.loserMultiple * cfg.targetCpa)} €.`);
  }

  // 4 · Gagnant : assez d'achats, cible tenue, et le haut de l'intervalle la tient aussi.
  if (comparable && m.purchases >= cfg.minPurchasesWinner && d.cpa !== null && d.cpa <= cfg.targetCpa && d.cpaHi !== null && d.cpaHi <= babyCeil) {
    return out('winner', `CPA ${fr(d.cpa)} € sous la cible, tenu jusqu'au haut de l'intervalle (${fr(d.cpaHi)} €).`);
  }

  // 5 · Gagnant naissant : cible presque tenue, ou signaux avancés convaincants.
  if (comparable) {
    if (d.cpa !== null && d.cpa <= babyCeil) {
      return out('baby_winner', `CPA ${fr(d.cpa)} € dans la tolérance (jusqu'à ${fr(babyCeil)} €) : à itérer avant de scaler.`);
    }
    if (m.purchases < cfg.minPurchasesWinner && leadingCount(d, cfg, med) >= 2) {
      return out('baby_winner', 'Trop peu d’achats pour trancher, mais au moins deux indicateurs avancés sont au vert.');
    }
  }

  // 6 · Hors protocole : au mieux un gagnant relatif, et seulement en tête du batch.
  if (!comparable && input.batchRank === 1 && d.cpa !== null && d.cpa <= babyCeil) {
    return out('relative_winner', `Meilleure ad du lot (CPA ${fr(d.cpa)} €), mais protocole non respecté : comparaison seulement relative.`);
  }

  // 7 · Perdant : assez dépensé, coût trop haut.
  if (m.spend >= cfg.minSpendMultiple * cfg.targetCpa && (d.cpa === null || d.cpa > cfg.targetCpa * cfg.loserMultiple)) {
    return out('loser', d.cpa === null
      ? `${fr(m.spend)} € dépensés sans aucun achat.`
      : `CPA ${fr(d.cpa)} € au-delà de la limite de ${fr(cfg.targetCpa * cfg.loserMultiple)} €.`);
  }

  // 8 · Rien de tranché.
  return out('inconclusive', daysRemaining !== null && daysRemaining > 0
    ? `Pas encore concluant · ${daysRemaining} jour(s) restants dans la fenêtre.`
    : 'Pas concluant sur la fenêtre d’évaluation.');
}

/* -------------------------------------------------------------------------- */
/*  Rangs intra-batch (§6.4)                                                  */
/* -------------------------------------------------------------------------- */

export interface BatchAd { adId: string; cpa: number | null; spend: number }

/**
 * Classe les ads d'un lot sur le CPA (le plus bas gagne). Une ad sans achat n'est
 * pas classée première par défaut : elle est renvoyée en fin de classement.
 */
export function rankBatch(ads: BatchAd[]): Map<string, { rank: number; relToMedian: number | null }> {
  const avecCpa = ads.filter((a) => a.cpa !== null) as Array<BatchAd & { cpa: number }>;
  const med = median(avecCpa.map((a) => a.cpa));
  const tri = [...avecCpa].sort((a, b) => a.cpa - b.cpa);
  const out = new Map<string, { rank: number; relToMedian: number | null }>();
  tri.forEach((a, i) => out.set(a.adId, { rank: i + 1, relToMedian: med ? a.cpa / med : null }));
  // Sans achat : pas de CPA, donc pas de rang exploitable.
  for (const a of ads) if (!out.has(a.adId)) out.set(a.adId, { rank: tri.length + 1, relToMedian: null });
  return out;
}
