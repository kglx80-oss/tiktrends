/**
 * ADSMAP · des journées mesurées aux verdicts, pour les mesures IMPORTÉES.
 *
 * La synchro Meta (`apps/web/lib/adsmap-sync.ts`, `syncBrand`) enchaîne, sur
 * les journées lues chez Meta : repères de marque (90 jours) → agrégat de
 * chaque ad sur SA fenêtre d'évaluation → protocole lot par lot → rang au CPA
 * → verdict. Les mesures d'un export CSV doivent passer par EXACTEMENT les
 * mêmes briques, dans le même ordre (`brandMediansFrom`, `evaluationWindow`,
 * `rollupDaily`, `checkProtocol`, `rankByCpa`, `computeVerdict`) · sinon un
 * lot mesuré par fichier et un lot mesuré par la connexion ne se
 * compareraient plus. Ce module est la version PURE de cet enchaînement, pour
 * des journées qui ne viennent pas toutes de Meta · c'est AUSSI celle de la
 * synchro · `syncBrand` et l'import passent tous deux par
 * `recalculerVerdicts` (`apps/web/lib/adsmap-mesures.ts`), sur les journées
 * RETENUES (`retenirJournees`, `mesures-retenues.ts`) · il n'y a plus qu'une
 * logique de verdict.
 *
 * Une entrée est une journée (`debut = fin`) ou une période exportée d'un bloc ·
 * une période qui touche la fenêtre d'évaluation compte ENTIÈRE (elle ne se
 * découpe pas) · l'écran le dit et conseille l'export « par jour ».
 *
 * Pur · ni base, ni réseau, ni horloge (`aujourdhui` arrive en paramètre).
 */

import { checkProtocol, summarizeProtocol, type ProtocolCheck, type ProtocolAd, type ProtocolRules } from './protocol';
import { brandMediansFrom, evaluationWindow, rankByCpa, rollupDaily, type DailyRow } from './rollup';
import { deriveMetrics, type AdMetrics } from './stats';
import { computeVerdict, type VerdictConfig, type VerdictResult } from './verdict';
import type { EntreeMesure, ProtocoleLigne } from './mesures-csv';

/** Repères de marque · fenêtre du §6.4, la même que la synchro. */
export const FENETRE_MEDIANES_JOURS = 90;

export interface AdAMesurer {
  id: string;
  lotId: string | null;
  lotNumero: number | null;
  /** AAAA-MM-JJ · `null` sans date de lancement (la fenêtre part alors de la première journée, comme la synchro). */
  lanceLe: string | null;
  /** Les entrées RETENUES (journées Meta et entrées CSV après `retenirMesures`). */
  entrees: readonly EntreeMesure[];
  /** Ce que la dernière ligne dit du protocole · nom d'annonce, ensemble, campagne, budget. */
  protocole: ProtocoleLigne & { nomAnnonce: string | null };
}

export interface VerdictMesure {
  adId: string;
  res: VerdictResult;
  metrics: AdMetrics;
  jours: number;
}

export interface ResultatVerdictsMesures {
  verdicts: VerdictMesure[];
  protocoles: Array<{ lotId: string; check: ProtocolCheck; resume: string }>;
}

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const jourMs = (s: string) => Date.parse(`${s}T00:00:00Z`);
const entre = (a: string, b: string) => Math.round((jourMs(b) - jourMs(a)) / 86_400_000);

/** Les entrées qui touchent une fenêtre, ramenées au format de l'agrégation pure. */
function journeesDans(entrees: readonly EntreeMesure[], fenetre?: { since?: string; until?: string }): { rows: DailyRow[]; jours: number } {
  const dans = entrees.filter((e) => (!fenetre?.since || e.fin >= fenetre.since) && (!fenetre?.until || e.debut <= fenetre.until));
  const rows = dans.map((e) => ({
    date: e.debut, spend: e.mesures.spend, impressions: e.mesures.impressions, linkClicks: e.mesures.linkClicks,
    purchases: e.mesures.purchases, purchaseValue: e.mesures.purchaseValue,
    video3s: e.mesures.video3s || undefined, thruplays: e.mesures.thruplays || undefined, videoP50: e.mesures.videoP50 || undefined,
  }));
  const jours = new Set<string>();
  for (const e of dans) for (let t = jourMs(e.debut); t <= jourMs(e.fin); t += 86_400_000) jours.add(ymd(t));
  return { rows, jours: jours.size };
}

/**
 * Les verdicts de ces ads, lot par lot · même enchaînement que la synchro.
 * `ads` doit porter TOUTES les ads mesurées des lots concernés (le protocole et
 * le rang se lisent sur le lot entier) · `reperes` les ads de la marque qui
 * servent aux médianes (souvent les mêmes, plus les autres lots).
 */
export function verdictsDesMesures(
  ads: readonly AdAMesurer[],
  ctx: { config: VerdictConfig; regles: ProtocolRules; marque: string; aujourdhui: string; reperes?: readonly AdAMesurer[] },
): ResultatVerdictsMesures {
  const cfg = ctx.config;
  const mesurees = ads.filter((a) => a.entrees.length > 0);

  // 1 · Repères de marque · sur 90 jours.
  const debutMedianes = ymd(jourMs(ctx.aujourdhui) - FENETRE_MEDIANES_JOURS * 86_400_000);
  const medianes = brandMediansFrom((ctx.reperes ?? mesurees).filter((a) => a.entrees.length)
    .map((a) => rollupDaily(journeesDans(a.entrees, { since: debutMedianes }).rows).metrics));

  // 2 · Agrégat de chaque ad sur SA fenêtre d'évaluation.
  const agreges = new Map<string, { metrics: AdMetrics; jours: number }>();
  for (const a of mesurees) {
    const toutes = journeesDans(a.entrees);
    const depart = a.lanceLe ?? rollupDaily(toutes.rows).firstDate;
    const fenetre = depart ? evaluationWindow(depart, cfg.evaluationWindowDays) : undefined;
    const lu = journeesDans(a.entrees, fenetre);
    agreges.set(a.id, {
      metrics: rollupDaily(lu.rows).metrics,
      jours: depart ? Math.max(0, Math.min(cfg.evaluationWindowDays, entre(depart, ctx.aujourdhui) + 1)) : lu.jours,
    });
  }

  // 3 · Protocole, lot par lot.
  const lots = new Map<string, AdAMesurer[]>();
  for (const a of mesurees) if (a.lotId) lots.set(a.lotId, [...(lots.get(a.lotId) ?? []), a]);
  const comparable = new Map<string, boolean>();
  const part = new Map<string, number>();
  const rang = new Map<string, number>();
  const protocoles: ResultatVerdictsMesures['protocoles'] = [];
  for (const [lotId, membres] of lots) {
    const protoAds: ProtocolAd[] = membres.map((a) => ({
      adId: a.id,
      adName: a.protocole.nomAnnonce ?? '',
      // Sans identifiant d'ensemble dans le fichier, son NOM (dans sa campagne) le désigne · deux annonces du même ensemble se voient.
      adsetId: a.protocole.ensembleId ?? (a.protocole.ensemble ? `nom:${a.protocole.campagne ?? ''}/${a.protocole.ensemble}` : null),
      campaignId: a.protocole.campagneId,
      campaignName: a.protocole.campagne,
      adsetDailyBudget: a.protocole.budgetJour,
      spend: agreges.get(a.id)?.metrics.spend ?? 0,
      campaignBudgetOptimization: a.protocole.cbo,
    }));
    const check = checkProtocol(protoAds, ctx.regles, { brandName: ctx.marque, batchNumber: membres[0]!.lotNumero ?? 0 });
    protocoles.push({ lotId, check, resume: summarizeProtocol(check) });
    const rangs = rankByCpa(membres.map((a) => ({ adId: a.id, cpa: deriveMetrics(agreges.get(a.id)!.metrics, cfg.ciLevelOneSided).cpa })));
    for (const a of membres) {
      comparable.set(a.id, check.compliant && !check.underDelivered.includes(a.id));
      part.set(a.id, check.spendShare[a.id] ?? 0);
      rang.set(a.id, rangs[a.id] ?? 0);
    }
  }

  // 4 · Verdicts.
  const verdicts: VerdictMesure[] = [];
  for (const a of mesurees) {
    const agg = agreges.get(a.id)!;
    const res = computeVerdict({
      metrics: agg.metrics, config: cfg, brandMedians: medianes,
      // Une ad hors lot n'a pas de témoin · jamais comparable (même règle que la synchro).
      comparable: comparable.get(a.id) ?? false,
      spendShare: part.get(a.id), batchRank: rang.get(a.id), daysElapsed: agg.jours,
    });
    verdicts.push({ adId: a.id, res, metrics: agg.metrics, jours: agg.jours });
  }
  return { verdicts, protocoles };
}
