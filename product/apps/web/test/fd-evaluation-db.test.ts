import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Lot F-D · une release `staged` s'évalue, et SEULEMENT dans une campagne de
 * benchmark autorisée · vraie base (pglite), vrai registre, vraie campagne.
 *
 * Le fournisseur texte est un ESPION non simulé (`simule: false`, 0 $, ne sort
 * pas du processus) qui répond les sorties écrites des scénarios ; les médias
 * passent par un exécuteur factice SOUS la barrière de la campagne. On prouve :
 *  - hors campagne, une release staged n'est servie ni à une tâche
 *    utilisateur, ni épinglée par un devis, ni à Jarvis (0 appel) ;
 *  - dans la campagne approuvée et consommée, les 24 cas s'exécutent sur la
 *    release staged, traces marquées « évaluation », images jointes en pièces
 *    natives ; la campagne close, la release redevient inexécutable ;
 *  - fiches remplies ⇒ évaluation réelle passée ⇒ geste « Benchmark approuvé »
 *    ⇒ publication en production enfin possible (geste séparé).
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq } from '@tiktrends/db';
import { RUBRIQUE_REFERENCE, ficheVierge, sceller, type FicheRevue } from '@tiktrends/core';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { epinglerDevis, executerTache, resoudreConversationJarvis } from '../lib/studios/prompts/resolveur';
import { approuverBudgetBenchmark, joindreFichesRevue, lancerCampagneReelle, planEtDevis, PORTEE_BENCHMARK, semerPorteeBenchmark } from '../lib/studios/benchmark/programme';
import { genererJeu } from '../lib/studios/benchmark/jeu-synthetique';
import type { Jeu } from '../lib/studios/benchmark/scenarios';
import { acteurPlateforme, acteurSans } from './l2-outils';
import { espionScenarios, executeurFactice } from './fd-outils';
import { ENTREE_JARVIS_ROUTE, SORTIE_JARVIS_ROUTE } from './l2-adaptateur-simule';

const ADMIN = randomUUID();
const CLIENT = { ws: randomUUID(), brand: randomUUID() };
let releaseId = '';
let jeu: Jeu;
let campagne: Awaited<ReturnType<typeof lancerCampagneReelle>>;
let approbationId = '';

function espionSimple() {
  const appels: string[] = [];
  return { appels, a: { nom: 'espion', simule: false, modelePour: () => 'claude-sonnet-5', async appeler(x: { action: string }) { appels.push(x.action); return { texte: JSON.stringify(SORTIE_JARVIS_ROUTE), modele: 'claude-sonnet-5', jetonsEntree: 1, jetonsSortie: 1, coutUsd: 0 }; } } };
}
const tache = (o: Partial<Parameters<typeof executerTache>[0]> & { a: ReturnType<typeof espionSimple>['a'] }) => executerTache({
  templateKey: 'jarvis.route', portee: { workspaceId: PORTEE_BENCHMARK.workspaceId, brandId: PORTEE_BENCHMARK.brandId }, acteur: { userId: null, traceId: `t_${randomUUID()}` },
  taskInputs: ENTREE_JARVIS_ROUTE, contexte: { connaissances: false }, adaptateur: o.a, environnement: 'production', ...o,
});
const runsDe = async (rel: string) => (await db.select().from(schema.studioPromptRuns)).filter((r) => r.promptReleaseId === rel);

beforeAll(async () => {
  process.env.AI_SPEND_CAP_USD = '50';
  await db.insert(schema.users).values({ id: ADMIN, email: 'admin-evaluation@studios.test' });
  await db.insert(schema.workspaces).values({ id: CLIENT.ws, name: 'Client réel', plan: 'business' });
  await db.insert(schema.brands).values({ id: CLIENT.brand, workspaceId: CLIENT.ws, name: 'Marque cliente' });
  await semerPorteeBenchmark();
  const a = acteurPlateforme(ADMIN);
  const imp = await depot.importerPack(a);
  if (!imp.ok) throw new Error('import');
  for (const l of await depot.listerVersions()) if (l.status === 'draft') await depot.validerVersion(a, { id: l.id });
  const r = await depot.creerRelease(a, { motif: 'release candidate F-D' });
  if (!r.ok) throw new Error(JSON.stringify(r));
  releaseId = r.id;
  const ev = await depot.evaluerRelease(a, { releaseId });
  if (!ev.ok || !ev.testsStructurels) throw new Error('évaluation structurelle');
  jeu = await genererJeu();
}, 60_000);
afterAll(() => { delete process.env.AI_SPEND_CAP_USD; });

describe('hors campagne · une release staged n’est servie à personne (0 appel)', () => {
  it('tâche utilisateur, devis épinglé, Jarvis, devis studio · refusés', async () => {
    const s = espionSimple();
    expect(await tache({ a: s.a })).toMatchObject({ ok: false, code: 'RELEASE_ACTIVE_ABSENTE' });
    expect(await tache({ a: s.a, epinglage: { promptReleaseId: releaseId } })).toMatchObject({ ok: false, code: 'RELEASE_NON_PUBLIEE' });
    expect(await resoudreConversationJarvis()).toMatchObject({ ok: true, origine: 'repli_1_0_0', release: null });
    expect(await epinglerDevis()).toMatchObject({ ok: false, constats: [{ code: 'RELEASE_ACTIVE_ABSENTE' }] });
    expect(s.appels).toEqual([]);
    expect(await runsDe(releaseId)).toEqual([]);
  });

  it('mode évaluation sans approbation, puis avec une approbation non consommée · refusé, rien d’écrit', async () => {
    const s = espionSimple();
    expect(await tache({ a: s.a, evaluation: { releaseId, approbationId: randomUUID() } })).toMatchObject({ ok: false, code: 'CAMPAGNE_ABSENTE' });
    const ap = await approuverBudgetBenchmark(acteurPlateforme(ADMIN), { releaseId, cas: null, budgetUsd: '10', motif: 'Benchmark de la release candidate' });
    if (!ap.ok) throw new Error(JSON.stringify(ap.refus));
    approbationId = ap.approbationId;
    expect(await tache({ a: s.a, evaluation: { releaseId, approbationId } })).toMatchObject({ ok: false, code: 'CAMPAGNE_NON_DEMARREE' });
    expect(s.appels).toEqual([]);
    expect(await runsDe(releaseId)).toEqual([]);
  });

  it('publication en production refusée tant que le benchmark n’est pas approuvé', async () => {
    const r = await depot.publierRelease(acteurPlateforme(ADMIN), { releaseId, attendue: null, environnement: 'production' });
    expect(r.ok ? [] : r.constats.map((c) => c.code)).toEqual(['BENCHMARK_NON_APPROUVE']);
  });
});

describe('campagne réelle autorisée sur la release staged · 24 cas', () => {
  let espion: ReturnType<typeof espionScenarios>;
  beforeAll(async () => {
    const pd = planEtDevis(null);
    if (!pd.ok) throw new Error('plans');
    espion = espionScenarios(jeu, pd.plans);
    campagne = await lancerCampagneReelle({ budgetBrut: '10', releaseId, cas: null, adaptateur: espion.a, medias: executeurFactice(jeu), racine: null, jeu });
  }, 180_000);

  it('la campagne part, les 24 cas s’exécutent, tous les invariants passent, la revue humaine reste à faire', () => {
    if (!campagne.ok) throw new Error(JSON.stringify(campagne.refus));
    expect(campagne.resultat.resultats.map((x) => x.statut)).toEqual(Array(24).fill('execute'));
    expect(campagne.resultat.rapport.verdict).toMatchObject({ mode: 'reel', statut: 'REVUE_HUMAINE_REQUISE', invariants: { echoues: 0, nonEvaluables: 0 } });
    expect(campagne).toMatchObject({ evaluationReelle: false });
  });

  it('chaque trace est servie par la release STAGED et marquée évaluation (campagne, statut)', async () => {
    if (!campagne.ok) throw new Error('campagne');
    const runs = await runsDe(releaseId);
    const ids = campagne.resultat.rapport.cas.flatMap((c) => c.runIds);
    expect(runs.map((r) => r.id).sort()).toEqual([...ids].sort());
    for (const r of runs) expect((r.config as { evaluation: unknown }).evaluation, r.templateKey).toEqual({ mode: 'benchmark', approbationId, releaseStatut: 'staged' });
    expect((await depot.lireReleaseParId(releaseId))!.status).toBe('staged');
    expect(await depot.lirePointeur()).toBeNull();
  });

  it('vision : les images ont été jointes en pièces natives, liaison ↔ index ↔ empreinte tracée', async () => {
    const vues = espion.appels.filter((x) => x.profil === 'vision_analysis');
    expect(vues.length).toBe(10);
    const f07 = vues.find((x) => x.pieces?.some((p) => p.assetId === 'f07-boite'))!;
    expect(f07.pieces!.map((p) => [p.index, p.assetId, p.mime])).toEqual([[0, 'f07-boite', 'image/png'], [1, 'f01-lunettes-bleues', 'image/png']]);
    expect(f07.pieces![0]!.sha256).toBe(jeu.get('f07-boite')!.sha256);
    const run = (await runsDe(releaseId)).filter((r) => r.templateKey === 'quality.visual' && JSON.stringify((r.config as { mediaBindings: unknown }).mediaBindings).includes('f07-boite'))[0]!;
    expect((run.config as { mediaBindings: Array<{ bindingId: string; nativeAttachmentIndex: number; sha256: string }> }).mediaBindings.map((m) => [m.bindingId, m.nativeAttachmentIndex, m.sha256]))
      .toEqual([['b_f07-boite', 0, jeu.get('f07-boite')!.sha256], ['b_f01-lunettes-bleues', 1, jeu.get('f01-lunettes-bleues')!.sha256]]);
  });

  it('campagne close : la même approbation n’exécute plus rien sur la release staged', async () => {
    const s = espionSimple();
    const r = await tache({ a: s.a, evaluation: { releaseId, approbationId } });
    expect(r.ok ? [] : r.constats.map((c) => c.code)).toEqual(['CAMPAGNE_CLOSE']);
    const r2 = await tache({ a: s.a, evaluation: { releaseId, approbationId }, portee: { workspaceId: CLIENT.ws, brandId: CLIENT.brand } });
    expect(r2.ok ? [] : r2.constats.map((c) => c.code)).toEqual(['PORTEE_NON_SYNTHETIQUE', 'CAMPAGNE_CLOSE']);
    expect(s.appels).toEqual([]);
  });
});

describe('fiches humaines puis geste « Benchmark approuvé »', () => {
  const remplies = (): FicheRevue[] => {
    const pd = planEtDevis(null);
    if (!pd.ok) throw new Error('plans');
    return pd.plans.flatMap((p) => { const f = ficheVierge(p, RUBRIQUE_REFERENCE, 'reel'); return f ? [{ ...f, sorties: f.sorties.map((s) => ({ ...s, relecteur: 'Relectrice A', notes: Object.fromEntries(RUBRIQUE_REFERENCE.dimensions.map((d) => [d, 2])) as typeof s.notes })) }] : []; });
  };
  let fichesPassees = '';
  let fichesVides = '';

  it('fiches vides : jointes, non passées ; fiches remplies et nommées : évaluation réelle PASSÉE', async () => {
    if (!campagne.ok) throw new Error('campagne');
    const vides = await joindreFichesRevue(acteurPlateforme(ADMIN), { releaseId, rapport: campagne.resultat.rapport, fiches: campagne.resultat.resultats.flatMap((r) => (r.fiche ? [r.fiche] : [])) });
    expect(vides).toMatchObject({ ok: true, passed: false });
    fichesVides = vides.ok ? vides.evaluationId : '';
    const ok = await joindreFichesRevue(acteurPlateforme(ADMIN), { releaseId, rapport: campagne.resultat.rapport, fiches: remplies() });
    expect(ok).toMatchObject({ ok: true, passed: true, motifs: [] });
    fichesPassees = ok.ok ? ok.evaluationId : '';
    // Un rapport retouché après coup : son empreinte ne tient plus ; rescellé, ce n'est plus celui que la campagne a joint.
    const avant = (await db.select().from(schema.studioPromptEvaluations)).length;
    const maquille = await joindreFichesRevue(acteurPlateforme(ADMIN), { releaseId, rapport: { ...campagne.resultat.rapport, depenseUsdMicros: 1 }, fiches: remplies() });
    expect(maquille).toMatchObject({ ok: false, refus: [{ code: 'RAPPORT_ALTERE' }] });
    const { empreinte: _e, ...corps } = campagne.resultat.rapport;
    const rescelle = await joindreFichesRevue(acteurPlateforme(ADMIN), { releaseId, rapport: sceller({ ...corps, depenseUsdMicros: 1 }), fiches: remplies() });
    expect(rescelle).toMatchObject({ ok: false, refus: [{ code: 'RAPPORT_NON_JOINT' }] });
    expect((await db.select().from(schema.studioPromptEvaluations)).length).toBe(avant);
  });

  it('le geste refuse : un admin d’espace, une évaluation sans fiches, des fiches non passées', async () => {
    const avant = (await depot.lireReleaseParId(releaseId))!.evaluation;
    const campagneId = campagne.ok ? campagne.evaluationId : '';
    const r1 = await depot.approuverBenchmark(acteurSans(ADMIN), { releaseId, evaluationId: fichesPassees, motif: 'x' });
    const r2 = await depot.approuverBenchmark(acteurPlateforme(ADMIN), { releaseId, evaluationId: campagneId, motif: 'Lecture du rapport' });
    const r3 = await depot.approuverBenchmark(acteurPlateforme(ADMIN), { releaseId, evaluationId: fichesVides, motif: 'Lecture du rapport' });
    expect([r1, r2, r3].map((r) => (r.ok ? [] : r.constats.map((c) => c.code)))).toEqual([['FORBIDDEN'], ['FICHES_ABSENTES'], ['EVALUATION_NON_PASSEE', 'FICHES_NON_REMPLIES']]);
    expect((await depot.lireReleaseParId(releaseId))!.evaluation).toEqual(avant);
  });

  it('évaluation réelle passée + fiches remplies : benchmark approuvé, rien publié ; la publication en production devient possible', async () => {
    const r = await depot.approuverBenchmark(acteurPlateforme(ADMIN), { releaseId, evaluationId: fichesPassees, motif: 'Fiches relues, 24 cas conformes' });
    expect(r).toMatchObject({ ok: true });
    const l = (await depot.lireReleaseParId(releaseId))!;
    expect(l.status).toBe('staged');
    expect(l.evaluation).toMatchObject({ benchmarkApprouve: true, approuvePar: ADMIN, benchmarkEvaluationId: fichesPassees, testsStructurels: true });
    expect(await depot.lirePointeur()).toBeNull();
    const audit = await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.action, 'prompt.benchmark.approuver'));
    expect(audit.map((x) => [x.actorId, x.targetId, x.reason])).toEqual([[ADMIN, releaseId, 'Fiches relues, 24 cas conformes']]);
    const pub = await depot.publierRelease(acteurPlateforme(ADMIN), { releaseId, attendue: null, environnement: 'production' });
    expect(pub).toMatchObject({ ok: true });
  });
});
