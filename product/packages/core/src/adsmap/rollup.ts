/**
 * ADSMAP · agrégation des métriques quotidiennes et rattachement des annonces.
 *
 * Deux problèmes que la synchro quotidienne doit résoudre avant de pouvoir
 * calculer quoi que ce soit, et qui n'ont rien à faire dans un worker :
 *
 *  1. **Agréger** les lignes datées sur la fenêtre d'évaluation (§6.3). Une somme
 *     naïve sur tout l'historique donnerait un verdict sur une ad qui tourne
 *     depuis trois mois et une autre depuis deux jours · incomparables.
 *
 *  2. **Rattacher** une annonce Meta à une ad de la carte. C'est le maillon
 *     faible de tout le module : si le rattachement se trompe, chaque chiffre
 *     en aval est faux sans que rien ne le signale. On préfère donc ne PAS
 *     rattacher plutôt que de deviner · une ambiguïté renvoie `null`.
 *
 * Pur : ni base, ni réseau, ni horloge.
 */

import { deriveMetrics, median, type AdMetrics } from './stats';
import type { BrandMedians } from './verdict';

/* -------------------------------------------------------------------------- */
/*  Agrégation                                                                */
/* -------------------------------------------------------------------------- */

/** Une journée d'une annonce, telle que la table `metrics_daily` la porte. */
export interface DailyRow {
  date: string;                 // AAAA-MM-JJ
  spend: number;
  impressions: number;
  linkClicks: number;
  purchases: number;
  purchaseValue?: number;
  video3s?: number;
  thruplays?: number;
  videoP50?: number;
}

export interface Rollup {
  metrics: AdMetrics;
  /** Nombre de journées effectivement remontées · sert à `daysElapsed`. */
  days: number;
  firstDate: string | null;
  lastDate: string | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

/**
 * Somme les journées comprises dans la fenêtre.
 *
 * `since` et `until` sont inclusives et comparées comme des chaînes : le format
 * AAAA-MM-JJ se trie dans l'ordre chronologique, ce qui évite de fabriquer des
 * `Date` et de se retrouver décalé d'un jour selon le fuseau du serveur.
 */
export function rollupDaily(rows: DailyRow[], window?: { since?: string; until?: string }): Rollup {
  const dans = rows.filter((r) => {
    if (window?.since && r.date < window.since) return false;
    if (window?.until && r.date > window.until) return false;
    return true;
  });
  const dates = dans.map((r) => r.date).sort();

  // Les champs vidéo restent `undefined` si AUCUNE journée n'en porte : un zéro
  // ferait croire à un hook nul, alors que la donnée est simplement absente
  // (créa statique, ou champ non demandé). `deriveMetrics` sait lire l'absence.
  const opt = (get: (r: DailyRow) => number | undefined): number | undefined => {
    const vals = dans.map(get).filter((v): v is number => typeof v === 'number');
    return vals.length ? sum(vals) : undefined;
  };

  return {
    metrics: {
      spend: sum(dans.map((r) => r.spend)),
      impressions: sum(dans.map((r) => r.impressions)),
      linkClicks: sum(dans.map((r) => r.linkClicks)),
      purchases: sum(dans.map((r) => r.purchases)),
      purchaseValue: opt((r) => r.purchaseValue),
      video3sViews: opt((r) => r.video3s),
      thruplays: opt((r) => r.thruplays),
      videoP50: opt((r) => r.videoP50),
    },
    days: new Set(dates).size,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  };
}

/** Fenêtre d'évaluation à partir d'une date de lancement · bornes incluses. */
export function evaluationWindow(launchedAt: string, days: number): { since: string; until: string } {
  const d = new Date(`${launchedAt}T00:00:00Z`);
  const fin = new Date(d.getTime() + Math.max(0, days - 1) * 86_400_000);
  return { since: launchedAt, until: fin.toISOString().slice(0, 10) };
}

/* -------------------------------------------------------------------------- */
/*  Repères de marque (§6.4)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Médianes de la marque, calculées sur les ads qui ont assez de matière.
 *
 * Le seuil d'impressions n'est pas cosmétique : une ad à 200 impressions produit
 * un taux d'accroche de 0 % ou de 50 % au hasard, et une poignée de ces ads suffit
 * à écraser la médiane · tous les verdicts suivants seraient calés sur du bruit.
 */
export function brandMediansFrom(metrics: AdMetrics[], minImpressions = 1000): BrandMedians {
  const utiles = metrics.filter((m) => m.impressions >= minImpressions);
  if (!utiles.length) return {};
  const d = utiles.map((m) => deriveMetrics(m));
  const col = (get: (x: (typeof d)[number]) => number | null) =>
    median(d.map(get).filter((x): x is number => x !== null && Number.isFinite(x)));

  return {
    hookRate: col((x) => x.hookRate),
    holdRate: col((x) => x.holdRate),
    ctr: col((x) => x.ctr),
    // Le CPA ne se médiane que sur les ads qui ont converti : inclure les autres
    // reviendrait à médianer des « pas de chiffre ».
    cpa: median(d.map((x) => x.cpa).filter((x): x is number => x !== null && Number.isFinite(x))),
  };
}

/**
 * Rang de chaque ad d'un lot sur le KPI primaire · 1 = la meilleure.
 * Les ads sans CPA (aucun achat) sont classées en dernier, à égalité : elles ne
 * sont pas « les pires », elles sont hors classement.
 */
export function rankByCpa(ads: Array<{ adId: string; cpa: number | null }>): Record<string, number> {
  const avec = ads.filter((a) => a.cpa !== null && Number.isFinite(a.cpa)).sort((a, b) => a.cpa! - b.cpa!);
  const out: Record<string, number> = {};
  avec.forEach((a, i) => { out[a.adId] = i + 1; });
  const dernier = avec.length + 1;
  for (const a of ads) if (!(a.adId in out)) out[a.adId] = dernier;
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Rattachement des annonces                                                 */
/* -------------------------------------------------------------------------- */

export interface NameCandidate { adId: string; adName: string }

/** Jetons significatifs d'un nom · la ponctuation de nommage ne dit rien. */
function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

const norm = (s: string) => tokens(s).join(' ');

/**
 * Rattache par le nom attendu (§8.6).
 *
 * Trois passes, de la plus sûre à la plus tolérante, et un principe unique :
 * **une ambiguïté n'est jamais tranchée**. Deux annonces qui collent aussi bien
 * renvoient `null`, et l'ad restera non rattachée jusqu'à ce qu'un humain colle
 * l'identifiant. Un mauvais rattachement, lui, produirait des verdicts faux que
 * personne ne songerait à remettre en cause.
 */
export function matchByName(expected: string, candidates: NameCandidate[]): string | null {
  const cible = norm(expected);
  if (!cible) return null;

  const exact = candidates.filter((c) => norm(c.adName) === cible);
  if (exact.length === 1) return exact[0]!.adId;
  if (exact.length > 1) return null;

  // 2 · Le nom attendu est contenu dans le nom réel · cas courant, l'équipe
  // ajoute un suffixe de date ou de plateforme après le nom généré.
  const inclus = candidates.filter((c) => norm(c.adName).includes(cible));
  if (inclus.length === 1) return inclus[0]!.adId;
  if (inclus.length > 1) return null;

  // 3 · Tous les jetons attendus présents, dans n'importe quel ordre.
  const attendus = tokens(expected);
  const couvre = candidates.filter((c) => {
    const t = new Set(tokens(c.adName));
    return attendus.every((x) => t.has(x));
  });
  return couvre.length === 1 ? couvre[0]!.adId : null;
}

/**
 * Repli quand aucun nom généré n'a été posé : on cherche le lot et la variante.
 *
 * Volontairement exigeant sur les deux à la fois. « v2 » seul se retrouve dans
 * la moitié d'un compte publicitaire, et « B3 » seul désigne tout un lot.
 */
export function matchByBatchVariant(
  batchNumber: number, variantCode: string, candidates: NameCandidate[],
): string | null {
  const lot = `b${batchNumber}`;
  const variante = norm(variantCode);
  if (!variante) return null;

  const hits = candidates.filter((c) => {
    const t = tokens(c.adName);
    return t.includes(lot) && t.includes(variante);
  });
  return hits.length === 1 ? hits[0]!.adId : null;
}
