/**
 * ADSMAP · mémoire calculée de la marque (§8.1) et score de pré-lancement (§8.3 A7).
 *
 * Le principe du cahier des charges : **la mémoire est calculée avant d'être
 * rédigée**. Jusqu'ici Jarvis recevait du texte libre — des patterns distillés
 * depuis la veille, des créas notées au pouce. C'est de l'opinion. Ici on lui
 * donne ce que la marque a réellement mesuré : « listicle, 3 gagnantes sur 8
 * concluantes » se discute moins qu'« utilise des listicles ».
 *
 * Deux sorties :
 *  - `computeBrandStats` agrège les verdicts par dimension ;
 *  - `prelaunchScore` s'en sert pour situer un concept AVANT de dépenser.
 *
 * Le score est volontairement calculé en code, pas par un LLM : le cahier des
 * charges l'impose (§8.3 A7), et une note produite par le même modèle qui a écrit
 * le concept ne vaudrait rien.
 *
 * Pur : ni base, ni réseau.
 */

import type { VerdictValue } from './types';
import { median } from './stats';

export type StatDimension =
  | 'mechanism' | 'hook_type' | 'format' | 'length_bucket'
  | 'awareness' | 'avatar' | 'talent' | 'opening_type' | 'element'
  /**
   * La coquille dans laquelle la créa a été composée.
   *
   * Elle n'existait pas comme dimension parce qu'elle n'existait pas tout court
   * · les sept gabarits rendaient la même composition. Maintenant qu'il y en a
   * quatre, « l'affiche claire gagne deux fois sur trois chez toi » est un fait
   * mesurable, et c'est le genre de fait qui fait changer une décision.
   */
  | 'layout';

/** Une ad, réduite à ce qui sert à apprendre. */
export interface StatSourceAd {
  mechanism?: string | null;
  format?: string | null;
  awareness?: string | null;
  avatar?: string | null;
  hookType?: string | null;
  openingType?: string | null;
  talent?: string | null;
  lengthBucket?: string | null;
  /** Coquille de composition · lue via le pont ad → génération. */
  layout?: string | null;
  elementKeys?: string[];
  verdict: VerdictValue | null;
  /** Un verdict hors protocole compte, mais moins · cf. `WEIGHT_NON_COMPARABLE`. */
  comparable: boolean;
  hookRate?: number | null;
  holdRate?: number | null;
  ctr?: number | null;
  cpa?: number | null;
}

export interface StatRow {
  dimension: StatDimension;
  key: string;
  nAds: number;
  nConclusive: number;
  nWinners: number;
  nBaby: number;
  hitRate: number | null;      // (gagnantes + naissantes) / concluantes
  hookRateMedian: number | null;
  holdRateMedian: number | null;
  ctrMedian: number | null;
  cpaMedian: number | null;
}

/** Verdicts qui tranchent · les autres n'apprennent rien. */
const CONCLUSIFS: VerdictValue[] = ['winner', 'baby_winner', 'relative_winner', 'loser'];
const GAGNANTS: VerdictValue[] = ['winner', 'baby_winner', 'relative_winner'];

/** En dessous, un taux n'est qu'une anecdote · on l'affiche mais on ne s'en sert pas. */
export const MIN_N_CONCLUSIVE = 3;

const DIMENSIONS: Array<[StatDimension, (a: StatSourceAd) => string | string[] | null | undefined]> = [
  ['mechanism', (a) => a.mechanism],
  ['format', (a) => a.format],
  ['hook_type', (a) => a.hookType],
  ['opening_type', (a) => a.openingType],
  ['talent', (a) => a.talent],
  ['length_bucket', (a) => a.lengthBucket],
  ['awareness', (a) => a.awareness],
  ['avatar', (a) => a.avatar],
  ['element', (a) => a.elementKeys],
  ['layout', (a) => a.layout],
];

/** Agrège les verdicts par dimension. Une ad peut compter dans plusieurs éléments. */
export function computeBrandStats(ads: StatSourceAd[]): StatRow[] {
  const acc = new Map<string, { dim: StatDimension; key: string; ads: StatSourceAd[] }>();

  for (const a of ads) {
    for (const [dim, lire] of DIMENSIONS) {
      const v = lire(a);
      const cles = Array.isArray(v) ? v : v ? [v] : [];
      for (const k of cles) {
        if (!k) continue;
        const id = `${dim}||${k}`;
        if (!acc.has(id)) acc.set(id, { dim, key: k, ads: [] });
        acc.get(id)!.ads.push(a);
      }
    }
  }

  return [...acc.values()].map(({ dim, key, ads: liste }) => {
    const conclusives = liste.filter((a) => a.verdict && CONCLUSIFS.includes(a.verdict));
    const winners = conclusives.filter((a) => a.verdict === 'winner');
    const baby = conclusives.filter((a) => a.verdict === 'baby_winner' || a.verdict === 'relative_winner');
    const gagnantes = conclusives.filter((a) => a.verdict && GAGNANTS.includes(a.verdict));
    const med = (f: (a: StatSourceAd) => number | null | undefined) =>
      median(liste.map(f).filter((x): x is number => typeof x === 'number' && Number.isFinite(x)));

    return {
      dimension: dim, key,
      nAds: liste.length,
      nConclusive: conclusives.length,
      nWinners: winners.length,
      nBaby: baby.length,
      hitRate: conclusives.length ? gagnantes.length / conclusives.length : null,
      hookRateMedian: med((a) => a.hookRate),
      holdRateMedian: med((a) => a.holdRate),
      ctrMedian: med((a) => a.ctr),
      cpaMedian: med((a) => a.cpa),
    };
  }).sort((a, b) => b.nConclusive - a.nConclusive);
}

/** Taux de réussite global de la marque · référence de toutes les comparaisons. */
export function globalHitRate(ads: StatSourceAd[]): number | null {
  const c = ads.filter((a) => a.verdict && CONCLUSIFS.includes(a.verdict));
  if (!c.length) return null;
  return c.filter((a) => a.verdict && GAGNANTS.includes(a.verdict)).length / c.length;
}

/* -------------------------------------------------------------------------- */
/*  Mémoire injectée dans les prompts                                         */
/* -------------------------------------------------------------------------- */

const DIM_LABEL: Record<StatDimension, string> = {
  mechanism: 'Mécanismes', hook_type: 'Types d’accroche', format: 'Formats',
  length_bucket: 'Durées', awareness: 'Stades de conscience', avatar: 'Avatars',
  talent: 'Talents', opening_type: 'Ouvertures', element: 'Éléments réutilisés',
  layout: 'Mises en page',
};

const pctFr = (x: number) => `${Math.round(x * 100)} %`;

/**
 * Met la mémoire en forme pour un prompt.
 *
 * Compact volontairement : top et bas de chaque dimension, avec le nombre de cas.
 * Un modèle qui reçoit « listicle 3/8 (37 %) » sait quoi en faire ; un modèle qui
 * reçoit trente lignes les moyenne toutes et n'en fait rien. Les dimensions sous
 * le seuil de matière ne sont pas affichées du tout · mieux vaut ne rien dire
 * qu'affirmer sur deux cas.
 */
export function formatStatsForPrompt(rows: StatRow[], opts: { perDimension?: number; minN?: number } = {}): string {
  const perDim = opts.perDimension ?? 4;
  const minN = opts.minN ?? MIN_N_CONCLUSIVE;

  const parDim = new Map<StatDimension, StatRow[]>();
  for (const r of rows) {
    if (r.nConclusive < minN || r.hitRate === null) continue;
    parDim.set(r.dimension, [...(parDim.get(r.dimension) ?? []), r]);
  }
  if (!parDim.size) return '';

  const blocs: string[] = [];
  for (const [dim, liste] of parDim) {
    const tri = [...liste].sort((a, b) => (b.hitRate ?? 0) - (a.hitRate ?? 0));
    const haut = tri.slice(0, perDim);
    const bas = tri.length > perDim * 2 ? tri.slice(-perDim).reverse() : [];
    const ligne = (r: StatRow) => `${r.key} ${pctFr(r.hitRate!)} (${r.nWinners + r.nBaby}/${r.nConclusive})`;
    const parts = [`${DIM_LABEL[dim]} · ce qui marche : ${haut.map(ligne).join(' ; ')}`];
    if (bas.length) parts.push(`ce qui ne marche pas : ${bas.map(ligne).join(' ; ')}`);
    blocs.push(parts.join(' — '));
  }
  return blocs.join('\n');
}

/**
 * Bloc de mémoire complet, prêt à injecter.
 * Renvoie une chaîne vide s'il n'y a pas assez de matière · un bloc « aucune
 * donnée » occuperait du contexte pour rien et inviterait le modèle à broder.
 */
export function buildJarvisMemory(ads: StatSourceAd[], opts: { learnings?: string[]; rules?: string | null } = {}): string {
  const stats = computeBrandStats(ads);
  const tableau = formatStatsForPrompt(stats);
  const global = globalHitRate(ads);
  const morceaux: string[] = [];

  if (tableau) {
    const entete = global !== null
      ? `MESURÉ SUR CETTE MARQUE (taux de réussite global ${pctFr(global)} sur ${ads.filter((a) => a.verdict && CONCLUSIFS.includes(a.verdict)).length} tests concluants) :`
      : 'MESURÉ SUR CETTE MARQUE :';
    morceaux.push(`${entete}\n${tableau}`);
  }
  if (opts.learnings?.length) {
    morceaux.push(`APPRENTISSAGES VALIDÉS (ne pas retester ce qui a été réfuté) :\n- ${opts.learnings.slice(0, 12).join('\n- ')}`);
  }
  return morceaux.join('\n\n');
}

/* -------------------------------------------------------------------------- */
/*  Score de pré-lancement · agent A7 (§8.3)                                  */
/* -------------------------------------------------------------------------- */

export interface PrelaunchInput {
  mechanism?: string | null;
  hookType?: string | null;
  openingType?: string | null;
  format?: string | null;
  lengthBucket?: string | null;
  awareness?: string | null;
  /** Éléments réutilisés depuis la bibliothèque · le meilleur signal disponible. */
  elementKeys?: string[];
  /** Coquille envisagée · elle se mesure comme le reste. */
  layout?: string | null;
}

export interface PrelaunchScore {
  band: 'low' | 'med' | 'high';
  /** Probabilité estimée que l'accroche tienne · 0 à 1. */
  pHookOk: number;
  /** Probabilité estimée d'un test concluant et gagnant · 0 à 1. */
  pConclusiveWin: number;
  /** Ce qui a pesé, en clair · un score sans justification ne se corrige pas. */
  drivers: string[];
  /** Vrai quand la marque n'a pas encore assez de matière · le score est alors indicatif. */
  thin: boolean;
}

/** Poids relatifs des dimensions · la où le signal est le plus fort en premier. */
const POIDS_HOOK: Array<[StatDimension, keyof PrelaunchInput, number]> = [
  ['element', 'elementKeys', 3],
  ['hook_type', 'hookType', 3],
  ['opening_type', 'openingType', 2],
  ['mechanism', 'mechanism', 2],
];
const POIDS_WIN: Array<[StatDimension, keyof PrelaunchInput, number]> = [
  ['element', 'elementKeys', 3],
  ['mechanism', 'mechanism', 3],
  // La coquille pèse comme le format · c'est une décision de forme, mesurée sur
  // les mêmes verdicts, et elle ne prétend pas peser plus que le mécanisme.
  ['layout', 'layout', 2],
  ['format', 'format', 2],
  ['awareness', 'awareness', 2],
  ['hook_type', 'hookType', 1],
  ['length_bucket', 'lengthBucket', 1],
];

function agreger(
  poids: Array<[StatDimension, keyof PrelaunchInput, number]>,
  input: PrelaunchInput, index: Map<string, StatRow>, base: number, drivers: string[],
): { p: number; appuis: number } {
  let somme = base, total = 1, appuis = 0;

  for (const [dim, champ, w] of poids) {
    const brut = input[champ];
    const cles = Array.isArray(brut) ? brut : brut ? [String(brut)] : [];
    for (const k of cles) {
      const r = index.get(`${dim}||${k}`);
      if (!r || r.hitRate === null || r.nConclusive < MIN_N_CONCLUSIVE) continue;
      somme += r.hitRate * w;
      total += w;
      appuis++;
      const ecart = r.hitRate - base;
      const sens = ecart > 0.05 ? 'au-dessus' : ecart < -0.05 ? 'en dessous' : 'dans';
      drivers.push(`${DIM_LABEL[dim]} « ${r.key} » : ${pctFr(r.hitRate)} de réussite sur ${r.nConclusive} tests, ${sens} de la moyenne de la marque.`);
    }
  }
  return { p: somme / total, appuis };
}

/**
 * Situe un concept avant de dépenser.
 *
 * La bande est RELATIVE à la marque, pas absolue : une marque dont le taux de
 * réussite global est de 10 % ne doit pas voir tous ses concepts en « faible »,
 * sinon l'indicateur ne dit plus rien et personne ne le regarde.
 */
export function prelaunchScore(input: PrelaunchInput, stats: StatRow[], globalRate: number | null): PrelaunchScore {
  const index = new Map(stats.map((r) => [`${r.dimension}||${r.key}`, r]));
  // Sans historique, on part d'un a priori neutre plutôt que d'inventer.
  const base = globalRate ?? 0.25;
  const drivers: string[] = [];

  const hook = agreger(POIDS_HOOK, input, index, base, drivers);
  const win = agreger(POIDS_WIN, input, index, base, drivers);
  const appuis = hook.appuis + win.appuis;
  const thin = appuis < 2;

  if (thin) {
    drivers.push(appuis === 0
      ? 'Aucun test comparable dans l’historique de cette marque : ce score est indicatif, pas une prévision.'
      : 'Peu de tests comparables : ce score se précisera au fil des lots.');
  }

  // Bandes relatives : 25 % au-dessus ou en dessous de la moyenne de la marque.
  const ecart = win.p - base;
  const band: PrelaunchScore['band'] =
    thin ? 'med'
    : ecart > 0.25 * Math.max(base, 0.1) ? 'high'
    : ecart < -0.25 * Math.max(base, 0.1) ? 'low'
    : 'med';

  const arrondi = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 100) / 100;
  return { band, pHookOk: arrondi(hook.p), pConclusiveWin: arrondi(win.p), drivers: drivers.slice(0, 6), thin };
}

/** Phrase de synthèse affichable à côté du concept. */
export function summarizePrelaunch(s: PrelaunchScore): string {
  if (s.thin) return 'Pas assez d’historique pour se prononcer · à traiter comme une piste neuve.';
  if (s.band === 'high') return `Profil favorable · ${pctFr(s.pConclusiveWin)} de réussite attendue au vu des tests passés.`;
  if (s.band === 'low') return `Profil défavorable · ${pctFr(s.pConclusiveWin)} attendus, sous la moyenne de la marque. À retravailler avant de dépenser.`;
  return `Profil dans la moyenne de la marque (${pctFr(s.pConclusiveWin)}).`;
}
