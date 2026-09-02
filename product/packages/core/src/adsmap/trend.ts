/**
 * Est-ce que ça marche mieux qu'avant ?
 *
 * ── La question que personne ne posait ───────────────────────────────────────
 *
 * Quatre mises en page, un cadrage revu, des budgets de texte, deux mesures
 * corrigées. Aucun écran ne disait si le taux de réussite avait bougé.
 *
 * Sans réponse, chaque changement est un pari qu'on n'encaisse jamais · on
 * accumule des améliorations dont personne ne peut dire si elles en sont.
 *
 * ── Deux fenêtres qui se touchent, pas une date de sortie ────────────────────
 *
 * On compare les `days` derniers jours aux `days` précédents. C'est délibéré :
 * caler la coupure sur la date d'un déploiement laisserait croire que l'écart
 * mesure CE changement-là, alors que tout a bougé en même temps — le produit,
 * le marché, la saison, ce que la marque a appris.
 *
 * Deux fenêtres glissantes répondent à « est-ce que ça va mieux », pas à
 * « grâce à quoi ». C'est moins flatteur et c'est vrai.
 *
 * ── Le silence est la réponse par défaut ─────────────────────────────────────
 *
 * Même exigence qu'ailleurs · un effectif minimal par fenêtre, et des
 * intervalles de Wilson disjoints. Deux taux qui se touchent ne se départagent
 * pas, et l'annoncer comme un progrès serait la manière la plus simple de se
 * mentir sur son propre produit.
 *
 * Pur : ni base, ni horloge · le `now` est fourni.
 */

import { wilsonInterval } from './stats';

export interface TrendAd {
  /** Date de création de l'ad · en millisecondes. */
  at: number;
  verdict: string | null;
}

export interface TrendWindow {
  n: number;
  wins: number;
  rate: number | null;
  lo: number;
  hi: number;
}

export interface TrendResult {
  recent: TrendWindow;
  previous: TrendWindow;
  /** Écart de taux en points · `null` quand une fenêtre est trop mince. */
  liftPoints: number | null;
  /** Vrai seulement si les intervalles ne se chevauchent PAS. */
  conclusive: boolean;
  days: number;
  summary: string;
}

const GAGNANTS = new Set(['winner', 'baby_winner', 'relative_winner']);
const NON_CONCLUANTS = new Set(['inconclusive', 'insufficient_delivery']);

/** Sous ce seuil, une fenêtre ne se compare à rien. */
export const MIN_N_WINDOW = 5;

function fenetre(ads: TrendAd[]): TrendWindow {
  // Une ad non concluante n'apprend rien · même règle que partout ailleurs.
  const conclues = ads.filter((a) => a.verdict && !NON_CONCLUANTS.has(a.verdict));
  const wins = conclues.filter((a) => GAGNANTS.has(a.verdict!)).length;
  const n = conclues.length;
  if (!n) return { n: 0, wins: 0, rate: null, lo: 0, hi: 1 };
  const ci = wilsonInterval(wins, n, 0.8);
  return { n, wins, rate: wins / n, lo: ci.lo, hi: ci.hi };
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function creativeTrend(ads: TrendAd[], now: number, days = 30): TrendResult {
  const jour = 86_400_000;
  const debutRecent = now - days * jour;
  const debutPrecedent = now - 2 * days * jour;

  const recent = fenetre(ads.filter((a) => a.at >= debutRecent && a.at <= now));
  const previous = fenetre(ads.filter((a) => a.at >= debutPrecedent && a.at < debutRecent));

  const assez = recent.n >= MIN_N_WINDOW && previous.n >= MIN_N_WINDOW;
  const liftPoints = assez && recent.rate !== null && previous.rate !== null
    ? recent.rate - previous.rate
    : null;
  const conclusive = assez && (recent.lo > previous.hi || previous.lo > recent.hi);

  return {
    recent, previous, liftPoints, conclusive, days,
    summary: resume(recent, previous, liftPoints, conclusive, days),
  };
}

function resume(a: TrendWindow, b: TrendWindow, lift: number | null, conclusive: boolean, days: number): string {
  if (a.n < MIN_N_WINDOW && b.n < MIN_N_WINDOW) {
    return `Pas encore de quoi comparer deux périodes · il faut ${MIN_N_WINDOW} tests conclus sur `
      + `${days} jours de chaque côté, on en a ${a.n} et ${b.n}.`;
  }
  if (b.n < MIN_N_WINDOW) {
    return `${a.n} test(s) conclus ces ${days} derniers jours, mais seulement ${b.n} sur les `
      + `${days} précédents · il n'y a pas encore de passé auquel comparer.`;
  }
  if (a.n < MIN_N_WINDOW) {
    return `Seulement ${a.n} test(s) conclus ces ${days} derniers jours · trop peu pour dire si `
      + 'quelque chose a changé. Il faut lancer, pas seulement générer.';
  }

  const chiffres = `${pct(a.rate!)} ces ${days} jours (${a.wins}/${a.n}) contre ${pct(b.rate!)} avant (${b.wins}/${b.n})`;
  if (!conclusive) {
    const sens = (lift ?? 0) >= 0 ? 'en hausse' : 'en baisse';
    return `${chiffres} · ${sens}, mais les intervalles se chevauchent : l'écart ne prouve rien encore.`;
  }
  return lift! > 0
    ? `Ça va mieux · ${chiffres}. L'écart tient hors des intervalles.`
    : `Attention · ça va moins bien : ${chiffres}. À regarder avant d'ajouter autre chose.`;
}
