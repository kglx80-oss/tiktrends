/**
 * ADSMAP · statistiques du moteur de verdict (§6.4 du cahier des charges).
 *
 * Pourquoi des intervalles plutôt que des points : une ad à 2 achats pour 90 € de
 * dépense affiche un CPA de 45 €, mais avec deux achats seulement ce chiffre ne
 * distingue pas 30 € de 90 €. Conclure sur la valeur ponctuelle, c'est ce qui
 * produit des verdicts que le batch suivant contredit.
 *
 * Deux lois suffisent :
 *  - les ACHATS sont un comptage sur une fenêtre → Poisson (Garwood) ;
 *  - les TAUX (hook, hold, CTR) sont une proportion sur des impressions → Wilson.
 *
 * Les intervalles sont UNILATÉRAUX à 80 % (addendum v2.1 · C1). Le bilatéral à
 * 90 % initialement spécifié exigeait ~25 conversions par ad pour conclure, ce
 * qui est hors d'atteinte d'un budget de test à 3 × le CPA cible : la règle
 * WINNER échouait sur son propre cas de référence.
 *
 * Tout est pur : aucune base, aucun réseau, aucune horloge.
 */

/* -------------------------------------------------------------------------- */
/*  Quantile du chi²                                                          */
/* -------------------------------------------------------------------------- */
/*
 * Le cahier des charges demande un intervalle de Poisson exact « par quantiles
 * chi² ». JavaScript n'a pas de fonction quantile, et le repérage en §6.4 le
 * signalait comme un manque. On l'implémente donc plutôt que de l'approximer :
 * c'est le cœur statistique du produit, et une approximation silencieuse
 * fausserait exactement les cas limites que l'Annexe A vérifie.
 *
 * Méthode : quantile de la loi gamma par recherche dichotomique sur sa fonction
 * de répartition (série + fraction continue de la gamma incomplète régularisée),
 * puis chi²(p, k) = 2 × gammaQuantile(p, k/2).
 */

const LN_PI = Math.log(Math.PI);
const G_COEF = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** log Γ(x) · approximation de Lanczos (g = 7, n = 9), précise à ~1e-13. */
export function logGamma(x: number): number {
  if (x < 0.5) return LN_PI - Math.log(Math.sin(Math.PI * x)) - logGamma(1 - x); // réflexion
  const z = x - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < G_COEF.length; i++) a += G_COEF[i]! / (z + i + 1);
  const t = z + G_COEF.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * P(a, x) · gamma incomplète régularisée inférieure.
 * Série pour x < a+1, fraction continue au-delà : c'est là que chacune converge.
 */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (a <= 0) return 1;
  if (x < a + 1) {
    // Développement en série.
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 500; n++) {
      ap++;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // Fraction continue (Lentz) pour la partie supérieure, puis complément.
  const tiny = 1e-300;
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i <= 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Quantile de la loi gamma (forme `a`, échelle 1) par dichotomie sur gammaP. */
function gammaQuantile(p: number, a: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  // Borne haute élargie jusqu'à dépasser p (la moyenne vaut a, l'écart-type √a).
  let hi = Math.max(1, a + 10 * Math.sqrt(a) + 10);
  while (gammaP(a, hi) < p && hi < 1e12) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (gammaP(a, mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Quantile du chi² à `k` degrés de liberté. */
export function chi2Quantile(p: number, k: number): number {
  if (k <= 0) return 0;
  return 2 * gammaQuantile(p, k / 2);
}

/* -------------------------------------------------------------------------- */
/*  Intervalles                                                               */
/* -------------------------------------------------------------------------- */

export interface Interval { lo: number; hi: number }

/**
 * Intervalle exact de Garwood sur un comptage (achats), UNILATÉRAL au niveau `level`.
 * Chaque borne est une borne unilatérale à `level` · cf. table C1.4 de l'addendum.
 * Zéro achat donne une borne basse à 0 : on ne sait rien du plancher, seulement
 * du plafond. C'est exactement ce que le moteur doit refuser de trancher.
 */
export function poissonInterval(count: number, level = 0.8): Interval {
  const n = Math.max(0, Math.floor(count));
  const lo = n === 0 ? 0 : chi2Quantile(1 - level, 2 * n) / 2;
  const hi = chi2Quantile(level, 2 * n + 2) / 2;
  return { lo, hi };
}

/** Intervalle de Wilson unilatéral sur une proportion (hook rate, CTR…). */
export function wilsonInterval(successes: number, trials: number, level = 0.8): Interval {
  if (trials <= 0) return { lo: 0, hi: 1 };
  const s = Math.max(0, Math.min(successes, trials));
  const z = normalQuantile(level); // unilatéral, même niveau que Poisson
  const p = s / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const centre = (p + z2 / (2 * trials)) / denom;
  const demi = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denom;
  return { lo: Math.max(0, centre - demi), hi: Math.min(1, centre + demi) };
}

/** Quantile de la loi normale centrée réduite · Acklam, précis à ~1e-9. */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+1, 2.209460984245205e+2, -2.759285104469687e+2, 1.383577518672690e+2, -3.066479806614716e+1, 2.506628277459239];
  const b = [-5.447609879822406e+1, 1.615858368580409e+2, -1.556989798598866e+2, 6.680131188771972e+1, -1.328068155288572e+1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
           ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - pl) return -normalQuantile(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
         (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** Médiane d'un échantillon (ignore les valeurs non finies). */
export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/* -------------------------------------------------------------------------- */
/*  Métriques dérivées                                                        */
/* -------------------------------------------------------------------------- */

/** Agrégat brut d'une ad sur la fenêtre d'évaluation. */
export interface AdMetrics {
  spend: number;
  impressions: number;
  video3sViews?: number;
  thruplays?: number;
  videoP50?: number;          // repli de hold_rate quand thruplays manque
  linkClicks: number;
  purchases: number;
  purchaseValue?: number;
}

export interface DerivedMetrics {
  hookRate: number | null;
  holdRate: number | null;
  ctr: number | null;
  cvr: number | null;
  cpa: number | null;         // null si aucun achat : un CPA infini n'est pas un chiffre
  roas: number | null;
  cpaLo: number | null;       // borne basse unilatérale (hypothèse haute d'achats)
  cpaHi: number | null;       // borne haute unilatérale · Infinity quand zéro achat
  hookRateCi: Interval | null;
  ctrCi: Interval | null;
}

const ratio = (a: number | undefined, b: number): number | null =>
  a === undefined || !b ? null : a / b;

/**
 * Métriques dérivées et intervalles.
 * `holdRate` retombe sur p50 quand les thruplays manquent, comme le prévoit §6.4.
 */
export function deriveMetrics(m: AdMetrics, level = 0.8): DerivedMetrics {
  const imp = Math.max(0, m.impressions);
  const hold = m.thruplays ?? m.videoP50;
  const purch = poissonInterval(m.purchases, level);

  return {
    hookRate: ratio(m.video3sViews, imp),
    holdRate: ratio(hold, imp),
    ctr: ratio(m.linkClicks, imp),
    cvr: m.linkClicks ? m.purchases / m.linkClicks : null,
    cpa: m.purchases > 0 ? m.spend / m.purchases : null,
    roas: m.spend > 0 && m.purchaseValue !== undefined ? m.purchaseValue / m.spend : null,
    // Plus d'achats → CPA plus bas : les bornes s'inversent.
    cpaLo: purch.hi > 0 ? m.spend / purch.hi : null,
    cpaHi: purch.lo > 0 ? m.spend / purch.lo : Infinity,
    hookRateCi: m.video3sViews !== undefined && imp > 0 ? wilsonInterval(m.video3sViews, imp, level) : null,
    ctrCi: imp > 0 ? wilsonInterval(m.linkClicks, imp, level) : null,
  };
}
