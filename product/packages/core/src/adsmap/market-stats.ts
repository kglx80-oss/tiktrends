/**
 * Ce que le MARCHÉ fait, par opposition à ce qui marche CHEZ NOUS.
 *
 * Jarvis avait jusqu'ici deux mémoires, et un trou entre les deux.
 *
 *  - La mémoire mesurée (`brand-stats.ts`) est solide : des verdicts, sur les
 *    pubs de cette marque, avec leur cause. Mais elle est VIDE au début, et une
 *    marque qui n'a pas encore testé n'en tire rien.
 *  - Les « patterns » distillés de la veille étaient du texte libre, extraits de
 *    la copy des concurrents. De l'opinion sur des mots.
 *
 * Ce fichier comble le trou : la même taxonomie fermée que l'analyse d'asset,
 * appliquée aux créas des concurrents. On peut alors dire « sur ce marché, 7 des
 * 10 pubs qui tiennent ouvrent sur un visage qui parle » · et surtout, mettre ce
 * constat FACE à ce que la marque gagne réellement.
 *
 * ── La difficulté centrale, et comment elle est traitée ───────────────────────
 *
 * Sur nos propres pubs, on a des verdicts : on sait ce qui a gagné. Sur celles
 * des concurrents, on n'a AUCUN chiffre de performance · ni CPA, ni conversion,
 * rien. Prétendre le contraire serait la pire chose que ce module puisse faire.
 *
 * On dispose en revanche d'un signal que personne ne peut truquer : **une pub
 * qui tourne encore après des semaines est une pub que son annonceur continue de
 * payer.** Personne ne finance longtemps une créa qui perd. C'est un proxy, pas
 * une mesure · le vocabulaire du fichier le dit partout (« éprouvée », jamais
 * « gagnante »), et les fonctions refusent de conclure sous un effectif minimal.
 *
 * Pur : ni base, ni réseau, ni horloge.
 */

import type { HookType, OpeningType, Talent } from './asset-taxonomy';

/** Une créa concurrente, décrite par l'agent A0 et accompagnée de ses signaux. */
export interface MarketAd {
  /** Identité · sert au dédoublonnage d'un annonceur qui décline la même créa. */
  advertiser?: string | null;
  platform?: string | null;

  // Dimensions décrites (mêmes valeurs fermées que pour nos propres créas).
  hookType?: HookType | null;
  openingType?: OpeningType | null;
  talent?: Talent | null;
  lengthBucket?: string | null;
  /** Format déclaré par la plateforme · vidéo, image, carrousel. */
  format?: string | null;

  // Signaux de persistance · le seul indice de performance dont on dispose.
  daysRunning: number;
  /** Progression de portée sur 30 jours · positive = l'annonceur pousse encore. */
  reachDelta30d?: number | null;
  /** Nombre de pubs vivantes de cet annonceur · un gros compte n'a pas le même sens. */
  liveAdsCount?: number | null;
}

/**
 * Une créa est « éprouvée » quand elle tient depuis assez longtemps, ou quand sa
 * portée progresse encore.
 *
 * Le seuil n'est pas une opinion sur le bon nombre de jours : c'est le point
 * au-delà duquel la reconduction devient une DÉCISION plutôt qu'un lancement.
 * En dessous de trois semaines, on regarde surtout des pubs qu'on n'a pas encore
 * eu le temps de couper.
 */
export const PROVEN_DAYS = 21;

export function isProven(ad: MarketAd): boolean {
  if (ad.daysRunning >= PROVEN_DAYS) return true;
  // Une portée qui progresse nettement dit que le budget MONTE · c'est le même
  // signal, lu plus tôt.
  return (ad.reachDelta30d ?? 0) > 0 && ad.daysRunning >= 7;
}

/* -------------------------------------------------------------------------- */
/*  Agrégation                                                                */
/* -------------------------------------------------------------------------- */

export type MarketDimension = 'hook_type' | 'opening_type' | 'talent' | 'length_bucket' | 'format';

export interface MarketRow {
  dimension: MarketDimension;
  key: string;
  /** Nombre de créas éprouvées portant cette valeur. */
  nProven: number;
  /** Nombre total de créas décrites portant cette valeur. */
  nTotal: number;
  /** Part de cette valeur PARMI les éprouvées · c'est ce qu'on lit. */
  shareOfProven: number;
  /** Part parmi toutes les créas · sert à repérer ce qui est sur-représenté. */
  shareOfAll: number;
  /** Nombre d'annonceurs distincts · un seul annonceur ne fait pas un marché. */
  advertisers: number;
}

/**
 * Effectif minimal avant de dire quoi que ce soit d'une valeur.
 *
 * Sous ce seuil, on décrirait le hasard. Le même chiffre que pour la mémoire
 * mesurée, pour la même raison.
 */
export const MIN_N_MARKET = 3;
/** Une tendance portée par un seul annonceur n'est pas une tendance de marché. */
export const MIN_ADVERTISERS = 2;

const DIMS: Array<{ dim: MarketDimension; get: (a: MarketAd) => string | null | undefined }> = [
  { dim: 'hook_type', get: (a) => a.hookType },
  { dim: 'opening_type', get: (a) => a.openingType },
  { dim: 'talent', get: (a) => a.talent },
  { dim: 'length_bucket', get: (a) => a.lengthBucket },
  { dim: 'format', get: (a) => a.format },
];

export function computeMarketStats(ads: MarketAd[]): MarketRow[] {
  const eprouvees = ads.filter(isProven);
  if (!eprouvees.length) return [];

  const out: MarketRow[] = [];
  for (const { dim, get } of DIMS) {
    const avecValeur = ads.filter((a) => !!get(a));
    const eprouveesAvecValeur = eprouvees.filter((a) => !!get(a));
    if (!eprouveesAvecValeur.length) continue;

    const cles = new Set(eprouveesAvecValeur.map((a) => get(a)!));
    for (const key of cles) {
      const pourCle = eprouveesAvecValeur.filter((a) => get(a) === key);
      const total = avecValeur.filter((a) => get(a) === key);
      const annonceurs = new Set(pourCle.map((a) => a.advertiser).filter(Boolean));
      out.push({
        dimension: dim, key,
        nProven: pourCle.length,
        nTotal: total.length,
        shareOfProven: pourCle.length / eprouveesAvecValeur.length,
        shareOfAll: avecValeur.length ? total.length / avecValeur.length : 0,
        advertisers: annonceurs.size,
      });
    }
  }
  return out.sort((a, b) => b.shareOfProven - a.shareOfProven);
}

/** Ne garde que ce sur quoi on peut parler sans mentir. */
export function significantRows(rows: MarketRow[]): MarketRow[] {
  return rows.filter((r) => r.nProven >= MIN_N_MARKET && r.advertisers >= MIN_ADVERTISERS);
}

/* -------------------------------------------------------------------------- */
/*  Confrontation marché / marque                                             */
/* -------------------------------------------------------------------------- */

/** Une ligne de la mémoire mesurée, réduite à ce qu'on compare. */
export interface BrandRow { dimension: string; key: string; hitRate: number | null; nConclusive: number }

export type ContrastKind = 'confirme' | 'contredit' | 'inexploite';

export interface Contrast {
  dimension: MarketDimension;
  key: string;
  kind: ContrastKind;
  /** Phrase affichable · dit le marché ET la marque dans le même souffle. */
  statement: string;
}

const LABEL: Record<MarketDimension, string> = {
  hook_type: 'accroche', opening_type: 'ouverture', talent: 'présence à l’écran',
  length_bucket: 'durée', format: 'format',
};

const pct = (x: number) => `${Math.round(x * 100)} %`;

/**
 * Là où la marque et le marché divergent.
 *
 * C'est la seule sortie de ce fichier qui vaille vraiment quelque chose. Savoir
 * ce que fait le marché est une donnée de culture générale ; savoir que le
 * marché fait X quand NOUS gagnons avec Y est une décision.
 *
 * Trois cas, et le troisième est le plus utile : une pratique majoritaire chez
 * les concurrents que la marque n'a jamais essayée est une piste dont le coût
 * d'entrée est déjà payé par d'autres.
 */
export function contrastMarketVsBrand(
  market: MarketRow[], brand: BrandRow[], globalHitRate: number | null,
): Contrast[] {
  const parCle = new Map(brand.map((b) => [`${b.dimension}::${b.key}`, b]));
  const out: Contrast[] = [];

  for (const m of significantRows(market)) {
    // On ne commente que ce qui est majoritaire · une valeur à 15 % du marché
    // n'est pas « ce que fait le marché ».
    if (m.shareOfProven < 0.4) continue;

    const b = parCle.get(`${m.dimension}::${m.key}`);
    const quoi = `${LABEL[m.dimension]} « ${m.key} »`;
    const marche = `${pct(m.shareOfProven)} des créas qui tiennent sur ce marché`;

    if (!b || b.nConclusive < 3) {
      out.push({
        dimension: m.dimension, key: m.key, kind: 'inexploite',
        statement: `${quoi} · ${marche}, et tu ne l’as jamais assez testée pour conclure. Le coût d’entrée a déjà été payé par d’autres.`,
      });
      continue;
    }
    if (b.hitRate === null) continue;

    const reference = globalHitRate ?? 0;
    if (b.hitRate >= reference) {
      out.push({
        dimension: m.dimension, key: m.key, kind: 'confirme',
        statement: `${quoi} · ${marche}, et chez toi ${pct(b.hitRate)} de réussite sur ${b.nConclusive} tests. Le marché et tes chiffres disent la même chose.`,
      });
    } else {
      out.push({
        dimension: m.dimension, key: m.key, kind: 'contredit',
        statement: `${quoi} · ${marche}, mais chez toi seulement ${pct(b.hitRate)} sur ${b.nConclusive} tests. Ce qui marche ailleurs ne marche pas ici · suis tes chiffres, pas le marché.`,
      });
    }
  }

  // Les contradictions d'abord : ce sont elles qui évitent de dépenser à côté.
  const rang: Record<ContrastKind, number> = { contredit: 0, inexploite: 1, confirme: 2 };
  return out.sort((a, b) => rang[a.kind] - rang[b.kind]);
}

/* -------------------------------------------------------------------------- */
/*  Bloc de prompt                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Ce qui est injecté dans les générations.
 *
 * Renvoie une chaîne VIDE quand il n'y a pas de matière · on ne fabrique pas
 * d'autorité à partir de rien, et un bloc « le marché fait peut-être ceci » vaut
 * moins que pas de bloc du tout.
 *
 * Le texte dit explicitement au modèle que ces chiffres ne sont PAS des mesures
 * de performance. Sans cette phrase, un modèle traite « 70 % du marché » comme
 * « 70 % de réussite », et la nuance qui fait tout le travail de ce fichier
 * disparaît au moment de s'en servir.
 */
export function buildMarketMemory(
  market: MarketRow[], opts: { contrasts?: Contrast[]; sampleSize?: number } = {},
): string {
  const sig = significantRows(market);
  if (!sig.length) return '';

  const lignes: string[] = [
    'CE QUE FAIT LE MARCHÉ (créas concurrentes qui tiennent dans la durée).',
    'Attention : ce sont des parts d’usage, PAS des taux de réussite · on ne connaît',
    'aucun chiffre de performance des concurrents. Une pub qui tourne longtemps est',
    'une pub que son annonceur continue de payer, rien de plus.',
    '',
  ];
  if (opts.sampleSize) lignes.push(`Observé sur ${opts.sampleSize} créa(s) décrites.`, '');

  const parDim = new Map<MarketDimension, MarketRow[]>();
  for (const r of sig) parDim.set(r.dimension, [...(parDim.get(r.dimension) ?? []), r]);

  for (const [dim, rows] of parDim) {
    const top = rows.slice(0, 3)
      .map((r) => `${r.key} ${pct(r.shareOfProven)} (${r.nProven} créas, ${r.advertisers} annonceurs)`)
      .join(' · ');
    lignes.push(`${LABEL[dim]} : ${top}`);
  }

  if (opts.contrasts?.length) {
    lignes.push('', 'CE QUE ÇA DONNE FACE À TES PROPRES RÉSULTATS :');
    for (const c of opts.contrasts.slice(0, 5)) lignes.push(`- ${c.statement}`);
  }

  return lignes.join('\n');
}

/** Une phrase pour l'écran · nomme la divergence la plus utile, pas la liste. */
export function summarizeMarket(market: MarketRow[], contrasts: Contrast[], sampleSize: number): string {
  const sig = significantRows(market);
  if (!sig.length) {
    return sampleSize > 0
      ? `${sampleSize} créa(s) décrites, pas encore assez pour dégager une pratique de marché · il en faut au moins ${MIN_N_MARKET} par valeur, sur ${MIN_ADVERTISERS} annonceurs.`
      : 'Aucune créa concurrente décrite · lance l’analyse depuis la Veille.';
  }
  const contredit = contrasts.find((c) => c.kind === 'contredit');
  if (contredit) return contredit.statement;
  const inexploite = contrasts.find((c) => c.kind === 'inexploite');
  if (inexploite) return inexploite.statement;
  const top = sig[0]!;
  return `${LABEL[top.dimension]} « ${top.key} » domine ce marché · ${pct(top.shareOfProven)} des créas qui tiennent.`;
}
