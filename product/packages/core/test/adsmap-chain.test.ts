import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildImportPlan } from '../src/adsmap/import-sheet';
import { buildName, buildUniqueNames, parseNaming } from '../src/naming';
import { rollupDaily, brandMediansFrom, rankByCpa, matchByName, matchByBatchVariant, type DailyRow } from '../src/adsmap/rollup';
import { checkProtocol, summarizeProtocol, type ProtocolAd, type ProtocolRules } from '../src/adsmap/protocol';
import { computeVerdict, DEFAULT_VERDICT_CONFIG } from '../src/adsmap/verdict';
import { checkAdReady, checkVerdictValidation, formatViolations } from '../src/adsmap/invariants';
import { findGaps, iterationParentSet, countGraph, summarizeGaps, type GraphNodeShape } from '../src/adsmap/graph';
import { buildJarvisMemory, computeBrandStats, type StatSourceAd } from '../src/adsmap/brand-stats';

/**
 * ADSMAP · la chaîne entière, sur le fichier réel.
 *
 * Chaque maillon a ses tests. Aucun ne vérifiait la JOINTURE entre eux, et c'est
 * là que les modules meurent : le nom qu'on écrit n'est pas celui que le parser
 * relit, l'agrégat n'a pas la forme que le moteur attend, le verdict ne remonte
 * pas jusqu'à la mémoire de Jarvis.
 *
 * Ce fichier fait passer les données du tableau TrueFords par tout le parcours :
 *
 *   import → nom de régie → rattachement → agrégat → protocole → verdict
 *          → invariant d'arbitrage → lecture du graphe → mémoire de Jarvis
 *
 * Il ne remplace pas un essai sur le vrai compte publicitaire · il garantit que
 * rien ne casse aux jointures, ce qu'aucun test unitaire ne dit.
 */

const CSV = readFileSync(join(__dirname, 'fixtures/sheet-truefords.csv'), 'utf8');
const AUJOURD_HUI = new Date('2026-08-27');
const MOTIF = '{brand}_B{batch}_{concept}_{variant}_{variable}';
const MARQUE = 'TrueFords';

const plan = buildImportPlan(CSV, { today: AUJOURD_HUI });

/** Une journée de métriques crédible · sert à faire tourner la chaîne. */
const jour = (date: string, o: Partial<DailyRow> = {}): DailyRow => ({
  date, spend: 20, impressions: 4000, linkClicks: 48, purchases: 1,
  video3s: 1200, thruplays: 420, ...o,
});

describe('import → nom de régie → rattachement', () => {
  it('chaque ad importée reçoit un nom que le parser sait relire', () => {
    // C'est la jointure la plus fragile de tout le module : un nom illisible
    // rend l'ad invisible à la mesure, et la panne ne se voit qu'à la synchro.
    const titreParCle = new Map(plan.concepts.map((c) => [c.key, c.title]));

    for (const ad of plan.ads) {
      const nom = buildName(MOTIF, {
        brand: MARQUE,
        batch: ad.batchNumber ?? 0,
        concept: titreParCle.get(ad.conceptKey) ?? 'concept',
        variant: ad.variantCode,
        variable: ad.testedVariable ?? 'controle',
      });
      const relu = parseNaming(nom, MOTIF);
      expect(relu, `nom illisible : ${nom}`).not.toBeNull();
      expect(relu!.variant).toBe(ad.variantCode);
      expect(relu!.batch).toBe(String(ad.batchNumber ?? 0));
    }
  });

  it('les noms générés d’un même lot restent distincts', () => {
    // Le fichier réel contient le piège : deux concepts de même titre sous deux
    // angles différents. Nommés un par un, ils produisent le même nom · les deux
    // ads resteraient sans mesure, `matchByName` refusant de trancher (à raison).
    // `buildUniqueNames` traite le lot comme un ENSEMBLE, ce qu'un nom seul ne
    // peut pas faire.
    const titreParCle = new Map(plan.concepts.map((c) => [c.key, c.title]));
    const parLot = new Map<number, typeof plan.ads>();
    for (const ad of plan.ads) {
      if (ad.batchNumber === null) continue;
      parLot.set(ad.batchNumber, [...(parLot.get(ad.batchNumber) ?? []), ad]);
    }

    let collisionsEvitees = 0;
    for (const [lot, membres] of parLot) {
      const valeurs = membres.map((ad) => ({
        brand: MARQUE, batch: lot,
        concept: titreParCle.get(ad.conceptKey) ?? 'concept',
        variant: ad.variantCode, variable: ad.testedVariable ?? 'controle',
      }));
      const naifs = valeurs.map((v) => buildName(MOTIF, v));
      const uniques = buildUniqueNames(MOTIF, valeurs);

      expect(new Set(uniques).size, `collision dans le lot ${lot}`).toBe(uniques.length);
      for (const n of uniques) expect(parseNaming(n, MOTIF)).not.toBeNull();
      if (new Set(naifs).size !== naifs.length) collisionsEvitees++;
    }
    // Le fichier réel DOIT contenir au moins un cas · sans quoi ce test ne
    // vérifierait rien et passerait pour de mauvaises raisons.
    expect(collisionsEvitees).toBeGreaterThan(0);
  });

  it('un nom généré se rattache à l’annonce correspondante du compte', () => {
    const nom = buildName(MOTIF, { brand: MARQUE, batch: 12, concept: 'Listicle 3 erreurs', variant: 'v2', variable: 'hook' });
    const candidats = [
      { adId: '1', adName: nom },
      { adId: '2', adName: buildName(MOTIF, { brand: MARQUE, batch: 12, concept: 'Listicle 3 erreurs', variant: 'v1', variable: 'hook' }) },
    ];
    expect(matchByName(nom, candidats)).toBe('1');
    // Le repli lot + variante trouve la même annonce sans le nom généré.
    expect(matchByBatchVariant(12, 'v2', candidats)).toBe('1');
  });
});

describe('agrégat → protocole → verdict', () => {
  const regles: ProtocolRules = {
    structure: 'abo_one_adset_per_ad',
    campaignNamePattern: '[ADSMAP] TEST {brand} B{batch}',
    budgetVarianceTolerance: 0.2,
    minSpendShare: 0.35,
  };
  const fenetre = { since: '2026-08-01', until: '2026-08-07' };
  const journees = ['01', '02', '03', '04', '05', '06', '07'].map((d) => `2026-08-${d}`);

  it('un lot propre produit des verdicts comparables', () => {
    const ads = [
      { id: 'a', rows: journees.map((d) => jour(d, { purchases: 2 })) },        // CPA 10
      { id: 'b', rows: journees.map((d) => jour(d, { purchases: 1 })) },        // CPA 20
      { id: 'c', rows: journees.map((d) => jour(d, { purchases: 0 })) },        // aucun achat
    ];
    const agreges = new Map(ads.map((a) => [a.id, rollupDaily(a.rows, fenetre)]));
    const medianes = brandMediansFrom([...agreges.values()].map((r) => r.metrics));

    const protoAds: ProtocolAd[] = ads.map((a) => ({
      adId: a.id, adName: a.id, adsetId: `set-${a.id}`, campaignId: 'c1',
      campaignName: '[ADSMAP] TEST TrueFords B12',
      adsetDailyBudget: 20, spend: agreges.get(a.id)!.metrics.spend,
      campaignBudgetOptimization: false,
    }));
    const check = checkProtocol(protoAds, regles, { brandName: MARQUE, batchNumber: 12 });
    expect(check.compliant).toBe(true);
    expect(summarizeProtocol(check)).toContain('comparables');

    const rangs = rankByCpa(ads.map((a) => {
      const m = agreges.get(a.id)!.metrics;
      return { adId: a.id, cpa: m.purchases ? m.spend / m.purchases : null };
    }));
    expect(rangs.a).toBe(1);

    const cfg = { ...DEFAULT_VERDICT_CONFIG, targetCpa: 15 };
    const v = computeVerdict({
      metrics: agreges.get('a')!.metrics, config: cfg, brandMedians: medianes,
      comparable: true, spendShare: check.spendShare.a, batchRank: rangs.a, daysElapsed: 7,
    });
    expect(v.computed).toBe('winner');
    expect(v.comparable).toBe(true);
    expect(v.failedStage).toBeNull();
  });

  it('en CBO, la meilleure ad ne peut plus être qu’une gagnante relative', () => {
    // Le protocole décide de ce que le verdict a le droit d'affirmer · c'est la
    // jointure qui donne son sens à tout le module.
    const rows = journees.map((d) => jour(d, { purchases: 2 }));
    const roll = rollupDaily(rows, fenetre);
    const protoAds: ProtocolAd[] = [
      { adId: 'a', adName: 'a', adsetId: 's1', campaignId: 'c1', campaignName: '[ADSMAP] TEST TrueFords B12', adsetDailyBudget: null, spend: roll.metrics.spend, campaignBudgetOptimization: true },
      { adId: 'b', adName: 'b', adsetId: 's1', campaignId: 'c1', campaignName: '[ADSMAP] TEST TrueFords B12', adsetDailyBudget: null, spend: 10, campaignBudgetOptimization: true },
    ];
    const check = checkProtocol(protoAds, regles, { brandName: MARQUE, batchNumber: 12 });
    expect(check.compliant).toBe(false);
    expect(check.violations.some((x) => x.code === 'cbo')).toBe(true);

    const v = computeVerdict({
      metrics: roll.metrics, config: { ...DEFAULT_VERDICT_CONFIG, targetCpa: 15 },
      brandMedians: {}, comparable: false, spendShare: check.spendShare.a, batchRank: 1, daysElapsed: 7,
    });
    expect(v.computed).toBe('relative_winner');
  });

  it('une ad sous-diffusée n’est pas déclarée perdante · elle n’a pas été testée', () => {
    const forte = rollupDaily(journees.map((d) => jour(d, { spend: 40, purchases: 2 })), fenetre);
    const faible = rollupDaily([jour('2026-08-01', { spend: 3, impressions: 300, purchases: 0 })], fenetre);
    const protoAds: ProtocolAd[] = [
      { adId: 'forte', adName: 'forte', adsetId: 's1', campaignId: 'c1', campaignName: 'x', adsetDailyBudget: 40, spend: forte.metrics.spend, campaignBudgetOptimization: true },
      { adId: 'faible', adName: 'faible', adsetId: 's1', campaignId: 'c1', campaignName: 'x', adsetDailyBudget: 40, spend: faible.metrics.spend, campaignBudgetOptimization: true },
    ];
    const check = checkProtocol(protoAds, regles, { brandName: MARQUE, batchNumber: 12 });
    expect(check.underDelivered).toContain('faible');

    const v = computeVerdict({
      metrics: faible.metrics, config: DEFAULT_VERDICT_CONFIG, brandMedians: {},
      comparable: false, spendShare: check.spendShare.faible, batchRank: 2, daysElapsed: 7,
    });
    expect(v.computed).toBe('insufficient_delivery');
  });
});

describe('invariants d’arbitrage', () => {
  it('les ads importées sans hypothèse sont retenues avant le lancement', () => {
    // Le §13 les redescend en brouillon avec un drapeau · l'écran de lot doit
    // dire ce qui manque, pas les laisser partir.
    const incompletes = plan.ads.filter((a) => !a.hypothesis);
    expect(incompletes.length).toBeGreaterThan(0);

    const violations = checkAdReady({
      status: 'ready', adType: 'ideation',
      hypothesis: incompletes[0]!.hypothesis, testedVariable: incompletes[0]!.testedVariable,
      offerId: null, landingPageId: null,
    });
    expect(violations.length).toBeGreaterThan(0);
    const message = formatViolations(violations)!;
    expect(message).toContain('offre');
    expect(message).toContain('page de destination');
  });

  it('un verdict ne se clôt pas sans apprentissage', () => {
    expect(checkVerdictValidation({ status: 'validated', validatedLearnings: 0 })).toHaveLength(1);
    expect(checkVerdictValidation({ status: 'validated', validatedLearnings: 1 })).toHaveLength(0);
  });
});

describe('graphe → mémoire de Jarvis', () => {
  it('l’import laisse des branches à travailler, et le canvas les nomme', () => {
    // Le fichier d'origine n'a pas de colonne avatar : tout arrive sous un
    // persona d'attente. Le graphe doit le refléter, pas le masquer.
    const nodes: GraphNodeShape[] = [
      { id: 'p', kind: 'persona', parentId: null, childCount: plan.desires.length },
      ...plan.desires.map((d): GraphNodeShape => ({
        id: `d:${d.label}`, kind: 'desire', parentId: 'p',
        childCount: plan.angles.filter((a) => a.desireLabel === d.label).length,
      })),
      ...plan.ads.map((a, i): GraphNodeShape => ({
        id: `ad:${i}`, kind: 'ad', parentId: 'c', childCount: 0, verdict: a.verdict,
      })),
    ];
    const gaps = findGaps(nodes, iterationParentSet([]));
    const counts = countGraph(nodes, gaps);

    expect(counts.ads).toBe(plan.ads.length);
    // Le fichier contient des gagnantes, et l'import ne crée aucune itération
    // vers elles · c'est exactement la première priorité que le canvas doit dire.
    expect(counts.winners).toBeGreaterThan(0);
    expect(counts.gaps.winner_no_iteration).toBeGreaterThan(0);
    expect(summarizeGaps(counts)).toContain('gagnante');
  });

  it('les verdicts remontent jusqu’à une mémoire que Jarvis peut lire', () => {
    const ads: StatSourceAd[] = plan.ads.map((a) => ({
      mechanism: 'listicle', format: a.format, awareness: null, avatar: null,
      hookType: null, openingType: null, talent: null, lengthBucket: null,
      verdict: a.verdict as StatSourceAd['verdict'],
      comparable: false, hookRate: null, holdRate: null, ctr: null, cpa: null,
    }));

    const stats = computeBrandStats(ads);
    expect(stats.length).toBeGreaterThan(0);

    const memoire = buildJarvisMemory(ads, { learnings: ['Les listicles courts tiennent mieux sur cet avatar.'] });
    expect(memoire).not.toBe('');
    expect(memoire).toContain('listicle');
  });

  it('sans verdict, la mémoire reste vide plutôt que d’inventer', () => {
    const sansRien: StatSourceAd[] = [{
      mechanism: null, format: 'static', awareness: null, avatar: null,
      hookType: null, openingType: null, talent: null, lengthBucket: null,
      verdict: null, comparable: false, hookRate: null, holdRate: null, ctr: null, cpa: null,
    }];
    expect(buildJarvisMemory(sansRien, {})).toBe('');
  });
});
