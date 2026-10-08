import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

/**
 * Lot F-C · mode RÉEL du benchmark, sur une VRAIE base (pglite).
 *
 * Aucun fournisseur réel n'est jamais appelé : l'« adaptateur réel » est un
 * ESPION non simulé (`simule: false`) qui compte les appels et ne sort pas du
 * processus. On prouve :
 *  - chaque refus (sans budget, budget < devis, budget > reste du plafond,
 *    sans approbation, devis non chiffrable, exécuteur absent) laisse 0 appel
 *    et 0 ligne dans chaque table, et aucun dossier ;
 *  - la porte s'ouvre quand les trois conditions sont réunies (contrôle positif),
 *    l'approbation ne sert qu'une fois, la campagne s'arrête avant de dépasser.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema } from '@tiktrends/db';
import type { AdaptateurModele } from '../lib/studios/prompts/adaptateur';
import type { ExecuteurMedias } from '../lib/studios/benchmark/campagne';
import { encoder } from '../lib/studios/benchmark/jeu-synthetique';
import { imageVide } from '@tiktrends/core';
import { eq } from '@tiktrends/db';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { approuverBudgetBenchmark, lancerCampagneReelle, planEtDevis } from '../lib/studios/benchmark/programme';
import { SCENARIOS } from '../lib/studios/benchmark/scenarios';
import { acteurPlateforme, acteurSans, publierRegistreDeTest } from './l2-outils';

const CAS = ['F04', 'F17', 'F21'];
const ADMIN = randomUUID();
let releaseId = '';

function espion(coutUsd = 0) {
  const appels: string[] = [];
  const a: AdaptateurModele = {
    nom: 'espion-reel', simule: false,
    modelePour: (p) => (p === 'reasoning_structured' ? 'claude-sonnet-5' : null),
    async appeler(x) {
      appels.push(x.action);
      const cle = x.action.replace('studio-prompt:', '');
      const rep = cle === 'jarvis.route' ? SCENARIOS.F21!.simule.route!(0, undefined as never)
        : cle === 'document.patch' ? SCENARIOS.F04!.simule.patch!(0, undefined as never)
        : cle === 'storyboard.plan' ? SCENARIOS.F14!.simule.storyboard!(0, undefined as never)
        : cle === 'image.compile' ? SCENARIOS.F14!.simule.compile!(0, undefined as never) : SCENARIOS.F17!.simule.lot!(0, undefined as never);
      return { texte: JSON.stringify(rep), modele: 'claude-sonnet-5', jetonsEntree: 100, jetonsSortie: 100, coutUsd };
    },
  };
  return { a, appels };
}

const TABLES = { runs: schema.studioPromptRuns, depenses: schema.aiSpend, evaluations: schema.studioPromptEvaluations, audit: schema.studioAuditEvents, espaces: schema.workspaces, jobs: schema.studioJobs, devis: schema.studioQuotes };
async function lignes(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [k, t] of Object.entries(TABLES)) out[k] = (await db.select().from(t)).length;
  return out;
}

async function refusSansTrace(e: Partial<Parameters<typeof lancerCampagneReelle>[0]>): Promise<string[]> {
  const s = espion();
  const racine = mkdtempSync(join(tmpdir(), 'fc-reel-refus-'));
  const avant = await lignes();
  const r = await lancerCampagneReelle({ budgetBrut: '1', cas: CAS, adaptateur: s.a, medias: null, racine, ...e });
  expect(r.ok, 'la campagne réelle aurait dû être refusée').toBe(false);
  expect(s.appels, 'aucun appel ne doit partir').toEqual([]);
  expect(await lignes(), 'aucune ligne ne doit être écrite').toEqual(avant);
  expect(readdirSync(racine), 'aucun dossier de preuve').toEqual([]);
  return r.ok ? [] : r.refus.map((c) => c.code);
}

const approuver = (budgetUsd = '1', cas: string[] | null = CAS) => approuverBudgetBenchmark(acteurPlateforme(ADMIN), { releaseId, cas, budgetUsd, motif: 'Benchmark de recette' });

beforeAll(async () => {
  await db.insert(schema.users).values({ id: ADMIN, email: 'admin-ia@studios.test' });
  releaseId = await publierRegistreDeTest(depot, acteurPlateforme(ADMIN));
});
beforeEach(() => { process.env.AI_SPEND_CAP_USD = '10'; });
afterEach(() => { delete process.env.AI_SPEND_CAP_USD; });

describe('devis de la sélection', () => {
  it('F04 + F17 + F21 = 4 appels bornés = 0,528 $', () => {
    const pd = planEtDevis(CAS);
    expect(pd.ok && pd.devis.ok && pd.devis.totalUsdMicros).toBe(528_000);
  });
});

describe('approbation ADMIN', () => {
  it('refusée sans prompt.evaluate, sans personne, sur un devis non chiffrable ou un budget < devis · rien d’écrit', async () => {
    const avant = await lignes();
    expect(await approuverBudgetBenchmark(acteurSans(ADMIN), { releaseId, cas: CAS, budgetUsd: '1', motif: 'x' })).toMatchObject({ ok: false, refus: [{ code: 'FORBIDDEN' }] });
    expect(await approuverBudgetBenchmark(acteurPlateforme(null), { releaseId, cas: CAS, budgetUsd: '1', motif: 'x' })).toMatchObject({ ok: false, refus: [{ code: 'FORBIDDEN' }] });
    expect(await approuver('100', null)).toMatchObject({ ok: false, refus: [{ code: 'DEVIS_NON_CHIFFRABLE' }] });
    expect(await approuver('0.5')).toMatchObject({ ok: false, refus: [{ code: 'BUDGET_INFERIEUR_AU_DEVIS' }] });
    expect(await lignes()).toEqual(avant);
  });
});

describe('--reel refusé · 0 appel, 0 ligne, 0 dossier', () => {
  it('sans approbation', async () => {
    expect(await refusSansTrace({})).toEqual(['APPROBATION_ABSENTE']);
  });

  it('avec une approbation enregistrée : sans budget', async () => {
    expect(await approuver()).toMatchObject({ ok: true });
    expect(await refusSansTrace({ budgetBrut: undefined })).toEqual(['BUDGET_ABSENT']);
    expect(await refusSansTrace({ budgetBrut: 'beaucoup' })).toEqual(['BUDGET_INVALIDE']);
  });

  it('budget inférieur au devis agrégé', async () => {
    expect(await refusSansTrace({ budgetBrut: '0.5' })).toEqual(['BUDGET_INFERIEUR_AU_DEVIS']);
  });

  it('budget au-delà du reste du plafond AI_SPEND_CAP_USD', async () => {
    process.env.AI_SPEND_CAP_USD = '0.6';
    expect(await refusSansTrace({ budgetBrut: '0.9' })).toEqual(['BUDGET_AU_DELA_DU_PLAFOND']);
  });

  it('budget au-delà de ce que l’ADMIN a approuvé', async () => {
    expect(await refusSansTrace({ budgetBrut: '2' })).toEqual(['APPROBATION_BUDGET_INFERIEUR']);
  });

  it('devis complet non chiffrable (vision non routée)', async () => {
    expect(await refusSansTrace({ cas: null, budgetBrut: '100' })).toEqual(['DEVIS_NON_CHIFFRABLE', 'BUDGET_AU_DELA_DU_PLAFOND', 'APPROBATION_ABSENTE', 'EXECUTEUR_NON_BRANCHE']);
  });

  it('aucun adaptateur réel configuré, ou un adaptateur simulé', async () => {
    expect(await refusSansTrace({ adaptateur: null })).toEqual(['EXECUTEUR_NON_BRANCHE']);
    expect(await refusSansTrace({ adaptateur: { ...espion().a, simule: true } })).toEqual(['EXECUTEUR_NON_BRANCHE']);
  });

  it('un cas qui génère des images sans exécuteur média réel branché', async () => {
    const codes = await refusSansTrace({ cas: ['F14'] });
    expect(codes).toContain('EXECUTEUR_NON_BRANCHE');
  });
});

describe('contrôle positif · la porte s’ouvre seulement avec les trois conditions', () => {
  it('budget = devis, sous le plafond, approbation valide : la campagne part, une seule fois', async () => {
    const s = espion();
    const racine = mkdtempSync(join(tmpdir(), 'fc-reel-ok-'));
    const r = await lancerCampagneReelle({ budgetBrut: '0.528', cas: CAS, adaptateur: s.a, medias: null, racine });
    if (!r.ok) throw new Error(JSON.stringify(r.refus));
    expect(s.appels).toEqual(['studio-prompt:jarvis.route', 'studio-prompt:document.patch', 'studio-prompt:batch.plan', 'studio-prompt:jarvis.route']);
    const runIds = r.resultat.rapport.cas.flatMap((c) => c.runIds);
    const runs = (await db.select().from(schema.studioPromptRuns)).filter((x) => runIds.includes(x.id));
    expect(runs).toHaveLength(4);
    expect(runs.every((x) => (x.config as { simule: boolean }).simule === false && x.promptReleaseId === releaseId)).toBe(true);
    expect(r.resultat.rapport).toMatchObject({ mode: 'reel', banniere: expect.stringMatching(/^RÉEL/) });
    expect(JSON.parse(readFileSync(join(r.resultat.dossier!, 'F04', 'oracle.json'), 'utf8')).mode).toBe('RÉEL');
    // Campagne partielle : jamais une évaluation réelle de la release.
    expect(r).toMatchObject({ evaluationReelle: false });
    const ev = (await db.select().from(schema.studioPromptEvaluations)).find((x) => x.id === r.evaluationId)!;
    expect(ev).toMatchObject({ kind: 'benchmark', passed: false });

    const s2 = espion();
    const avant = await lignes();
    const bis = await lancerCampagneReelle({ budgetBrut: '0.528', cas: CAS, adaptateur: s2.a, medias: null, racine: null });
    expect(bis).toMatchObject({ ok: false, refus: [{ code: 'APPROBATION_CONSOMMEE' }] });
    expect(s2.appels).toEqual([]);
    expect(await lignes()).toEqual(avant);
  });

  it('deux campagnes lancées EN MÊME TEMPS sur une approbation : une seule part', async () => {
    expect(await approuver('0.528')).toMatchObject({ ok: true });
    const a = espion(); const b = espion();
    const [x, y] = await Promise.all([
      lancerCampagneReelle({ budgetBrut: '0.528', cas: CAS, adaptateur: a.a, medias: null, racine: null }),
      lancerCampagneReelle({ budgetBrut: '0.528', cas: CAS, adaptateur: b.a, medias: null, racine: null }),
    ]);
    expect([x.ok, y.ok].sort()).toEqual([false, true]);
    expect((x.ok ? y : x)).toMatchObject({ ok: false, refus: [{ code: 'APPROBATION_CONSOMMEE' }] });
    expect(a.appels.length + b.appels.length).toBe(4);
  });

  it('arrêt AVANT l’appel qui ferait dépasser le budget', async () => {
    expect(await approuver('0.528')).toMatchObject({ ok: true });
    const s = espion(0.3);
    const r = await lancerCampagneReelle({ budgetBrut: '0.528', cas: CAS, adaptateur: s.a, medias: null, racine: null });
    if (!r.ok) throw new Error(JSON.stringify(r.refus));
    expect(s.appels).toHaveLength(2);
    expect(r.resultat.rapport.depenseUsdMicros).toBe(600_000);
    expect(r.resultat.rapport.arrete).toMatch(/^Arrêt avant F17\/lot#0/);
    expect(r.resultat.resultats.map((x) => [x.cas, x.statut])).toEqual([['F04', 'execute'], ['F17', 'arrete_budget'], ['F21', 'arrete_budget']]);
  });
});

describe('médias réels · toujours sous la barrière de dépense', () => {
  it('F14 avec un exécuteur média (espion) : chaque génération écrit sa ligne ai_spend au barème, sous sousPlafond', async () => {
    expect(await approuver('0.424', ['F14'])).toMatchObject({ ok: true });
    const produits: string[] = [];
    const medias: ExecuteurMedias = {
      nom: 'espion-medias', profils: ['image_generation'],
      async produire(d) { produits.push(`${d.etapeId}#${d.sortie}`); return [{ octets: await encoder(imageVide(16, 16, [9, 9, 9, 255])), mime: 'image/png' }]; },
    };
    const s = espion();
    const r = await lancerCampagneReelle({ budgetBrut: '0.424', cas: ['F14'], adaptateur: s.a, medias, racine: null });
    if (!r.ok) throw new Error(JSON.stringify(r.refus));
    expect(produits).toEqual(['generation#0', 'generation#1']);
    const lignesDepense = await db.select().from(schema.aiSpend).where(eq(schema.aiSpend.action, 'studio-benchmark:F14:generation'));
    expect(lignesDepense.map((l) => [l.provider, l.model, l.actualUsd])).toEqual([['fal', 'fal_image', 0.08], ['fal', 'fal_image', 0.08]]);
    expect(r.resultat.rapport.depenseUsdMicros).toBe(2 * 80_000);
  });
});
