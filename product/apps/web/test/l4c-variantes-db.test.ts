import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L4-C · variantes, tests et apprentissage, au RÉSULTAT en base (pglite,
 * migrations réelles, lots produits par le VRAI chemin L3 : devis, approbation,
 * worker simulé, fichiers déposés et relus).
 *
 * FLOW-08 image 3 du lot 4 · FLOW-07 résultat ancien rangé dans sa version ·
 * FLOW-09 inconclusif puis itération qui garde sources, variable et parente ·
 * FLOW-01 hypothèse et sources jusqu'à la variante · SEC-02 portée de marque.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));

import { db, schema, eq } from '@tiktrends/db';
import { coutMaxRelectureUsd } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest, briefCanonique } from './l4c-harnais';
import { creerVariante, listerVariantes, filiationVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { lireApprentissage, relireApprentissage, iterer } from '../lib/studios/variantes/apprentissage';
import { enregistrerVersion } from '../lib/studios/depot';
import { deciderQualite } from '../lib/studios/execution/commandes';
import * as actionsVariantes from '../app/actions/studios/variantes';
import * as actionsTests from '../app/actions/studios/tests';
import { adaptateurSimule } from './l2-adaptateur-simule';

const ids = etat.ids;
const OPTIONS = { adsmapAcces: true, relecture: { disponible: false, raison: 'aucune release', coutMaxUsd: 0.14 } };
const SOURCES = [{ type: 'saved_ad', id: 'veille:pub_concurrente_1', observeLe: '2026-10-01' }];

const P = schema.studioProjects;
const VA = schema.studioVariants;

/** Projet de démonstration · quatre lots, le quatrième produit QUATRE images. */
const scene = { projectId: '', v1: '', lots: [] as string[], lot4: {} as Record<string, string> };

beforeAll(async () => {
  await semer(db, schema, ids);
  const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum anti-boutons', sources: SOURCES });
  scene.projectId = p.projectId;
  scene.v1 = p.versionId;
  for (const ops of [['keyframe:s1'], ['keyframe:s2'], ['keyframe:s1'], KEYFRAMES(4)]) {
    const j = await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, ops);
    expect(await executer(db, j)).toBe('completed');
    scene.lots.push(j);
  }
  scene.lot4 = await sortiesDuJob(db, scene.lots[3]!);
}, 60_000);

const compte = async () => ({
  variantes: (await db.select().from(VA)).length,
  liens: (await db.select().from(schema.studioTestLinks)).length,
  ads: (await db.select().from(schema.ads)).length,
  versions: (await db.select().from(schema.studioProjectVersions)).length,
  runs: (await db.select().from(schema.studioPromptRuns)).length,
});

describe('FLOW-08 · choisir l’image 3 du lot 4 puis la rattacher à Adsmap', () => {
  it('le lot 4 a livré quatre médias distincts ; l’image 3 devient « Image 3 du lot 4 »', async () => {
    expect(Object.keys(scene.lot4).sort()).toEqual(KEYFRAMES(4));
    expect(new Set(Object.values(scene.lot4)).size).toBe(4);
    const r = await creerVariante(ctxDe(ids, 'ua'), { assetId: scene.lot4['keyframe:s3'] });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.variante).toMatchObject({ libelle: 'Image 3 du lot 4', position: 3, lot: 4, operation: 'keyframe:s3', jobId: scene.lots[3], versionId: scene.v1, mediaAssetId: scene.lot4['keyframe:s3'] });
    const [ligne] = await db.select().from(VA).where(eq(VA.id, r.variante.id));
    expect(ligne).toMatchObject({ label: 'Image 3 du lot 4', mediaAssetId: scene.lot4['keyframe:s3'], projectVersionId: scene.v1 });
  });

  it('quatre images, quatre variantes distinctes · chaque média une seule fois', async () => {
    const r = await Promise.all(KEYFRAMES(4).map((op) => creerVariante(ctxDe(ids, 'ua'), { assetId: scene.lot4[op] })));
    const ok = r.map((x) => (x.ok ? x.variante : null));
    expect(ok.map((v) => v?.libelle)).toEqual(['Image 1 du lot 4', 'Image 2 du lot 4', 'Image 3 du lot 4', 'Image 4 du lot 4']);
    expect(new Set(ok.map((v) => v?.id)).size).toBe(4);
    expect(r.map((x) => x.ok && x.deja)).toEqual([false, false, true, false]);
    const lignes = await db.select().from(VA).where(eq(VA.projectId, scene.projectId));
    expect(lignes.length).toBe(4);
  });

  it('double clic simultané sur le même média · une variante', async () => {
    const clic = () => creerVariante(ctxDe(ids, 'ua'), { assetId: scene.lot4['keyframe:s2'] });
    const [a, b] = await Promise.all([clic(), clic()]);
    expect(a.ok && b.ok && a.variante.id === b.variante.id).toBe(true);
    expect((await db.select().from(VA).where(eq(VA.mediaAssetId, scene.lot4['keyframe:s2']!))).length).toBe(1);
  });

  it('rattacher · la fiche Adsmap porte l’image 3 exacte et sa filiation, pas seulement un identifiant de génération', async () => {
    const [v] = await db.select().from(VA).where(eq(VA.mediaAssetId, scene.lot4['keyframe:s3']!));
    const r = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v!.id, saisie: saisieTest() });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.lien).toMatchObject({ creee: true, adsmapHref: `/adsmap?ad=${r.lien.adsmapAdId}&depuis=studio` });
    const [ad] = await db.select().from(schema.ads).where(eq(schema.ads.id, r.lien.adsmapAdId));
    const [asset] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, scene.lot4['keyframe:s3']!));
    expect(ad).toMatchObject({ status: 'draft', format: 'static', adType: 'ideation', hypothesis: saisieTest().hypothese, testedVariable: 'hook', variableValue: 'Marre des boutons ?', workspaceId: ids.wsA });
    expect(ad!.sourceRef).toMatchObject({
      studioVariantId: v!.id, mediaAssetId: scene.lot4['keyframe:s3'], sha256: asset!.sha256, position: 3, lot: 4,
      operation: 'keyframe:s3', jobId: scene.lots[3], projectVersionId: scene.v1, libelle: 'Image 3 du lot 4', parentVariantId: null,
    });
    expect(ad!.sourceRef).not.toHaveProperty('generationId');
    const liens = await db.select().from(schema.studioTestLinks).where(eq(schema.studioTestLinks.variantId, v!.id));
    expect(liens.map((l) => l.adsmapAdId)).toEqual([r.lien.adsmapAdId]);
    // L'ad remonte à la marque par le graphe Adsmap existant (« À qualifier »), dans le concept du projet.
    const [c] = await db.select().from(schema.concepts).where(eq(schema.concepts.id, ad!.conceptId));
    expect(c!.sourceRef).toEqual({ studioProjectId: scene.projectId });
    const [projet] = await db.select().from(P).where(eq(P.id, scene.projectId));
    expect(projet!.testRefs).toEqual([expect.objectContaining({ type: 'test', linkId: r.lien.linkId, objectif: 'Baisser le CPA sous 30 €', metrique: 'cpa', periode: { debut: '2026-10-12', fin: '2026-10-19' }, protocole: 'abo_one_adset_per_ad', isolation: { statut: 'sans_parent', champs: [] } })]);
  });

  it('rattachement idempotent · deux clics simultanés puis un troisième ⇒ une fiche, un lien', async () => {
    const [v] = await db.select().from(VA).where(eq(VA.mediaAssetId, scene.lot4['keyframe:s4']!));
    const avant = await compte();
    const clic = () => rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v!.id, saisie: saisieTest() });
    const [a, b] = await Promise.all([clic(), clic()]);
    expect(a.ok && b.ok, JSON.stringify([a, b])).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.lien.linkId).toBe(b.lien.linkId);
    expect([a.deja, b.deja].sort()).toEqual([false, true]);
    const c = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v!.id, saisie: saisieTest() });
    expect(c.ok && c.deja && c.lien.linkId).toBe(a.lien.linkId);
    const apres = await compte();
    expect([apres.ads - avant.ads, apres.liens - avant.liens]).toEqual([1, 1]);
  });

  it('une fiche ne mesure qu’une variante · une saisie invalide n’écrit rien, ses erreurs sont nommées', async () => {
    const [v1] = await db.select().from(VA).where(eq(VA.mediaAssetId, scene.lot4['keyframe:s1']!));
    const [v3] = await db.select().from(VA).where(eq(VA.mediaAssetId, scene.lot4['keyframe:s3']!));
    const [lien3] = await db.select().from(schema.studioTestLinks).where(eq(schema.studioTestLinks.variantId, v3!.id));
    const avant = await compte();
    const r = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v1!.id, saisie: saisieTest({ adsmapAdId: lien3!.adsmapAdId }) });
    expect(!r.ok && r.code).toBe('INVARIANT_CONFLICT');
    const inv = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v1!.id, saisie: saisieTest({ hypothese: 'court', metrique: 'likes' }) });
    expect(!inv.ok && inv.code).toBe('INVALID_SCHEMA');
    expect(!inv.ok && inv.violations?.map((x) => x.chemin).sort()).toEqual(['hypothese', 'metrique']);
    expect(await compte()).toEqual(avant);
  });
});

describe('FLOW-01 · hypothèse et sources persistées jusqu’à la variante', () => {
  it('la variante porte l’hypothèse et la variable du brief ; sa filiation rend les sources', async () => {
    const [v] = await db.select().from(VA).where(eq(VA.mediaAssetId, scene.lot4['keyframe:s3']!));
    expect(v).toMatchObject({ hypothesis: 'Une accroche douleur fait mieux cliquer qu’une accroche bénéfice', testedVariable: 'hook' });
    const f = await filiationVariante(ctxDe(ids, 'ua'), { variantId: v!.id });
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.maillons[0]).toMatchObject({ libelle: 'Image 3 du lot 4', sourceIds: ['veille:pub_concurrente_1', 'veille:pub_concurrente_2'], jobId: scene.lots[3] });
    expect(f.maillons[0]!.tests.length).toBe(1);
    expect(f.sourcesProjet).toEqual(SOURCES);
  });
});

describe('FLOW-07 · un résultat d’une version ancienne reste dans SA version', () => {
  it('lot lancé sur v1, brief modifié (v2) pendant la génération ⇒ la sortie est rangée en v1, v2 reste courante', async () => {
    const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum FLOW-07' });
    const job = await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, ['keyframe:s1']);
    const v2 = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: p.versionId, changes: [{ op: 'replace', path: '/brief', newValue: briefCanonique({ texts: ['Fini les boutons'] }), reason: 'texte' }] });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    const [avant] = await db.select().from(P).where(eq(P.id, p.projectId));
    expect(await executer(db, job)).toBe('completed');
    const s = await sortiesDuJob(db, job);
    const r = await creerVariante(ctxDe(ids, 'ua'), { assetId: s['keyframe:s1'] });
    expect(r.ok && r.variante.versionId).toBe(p.versionId);
    const [apres] = await db.select().from(P).where(eq(P.id, p.projectId));
    expect(apres!.currentVersionId).toBe(v2.version.id);
    expect([apres!.currentVersionId, apres!.rowVersion]).toEqual([avant!.currentVersionId, avant!.rowVersion]);
    const l = await listerVariantes(ctxDe(ids, 'ua'), { projectId: p.projectId }, OPTIONS);
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect(l.donnees.lots[0]!.versionId).toBe(p.versionId);
    expect(l.donnees.variantes[0]!.versionId).toBe(p.versionId);
    expect(l.donnees.projet.versionCouranteId).toBe(v2.version.id);
  });

  it('un média écarté à la relecture ne devient pas une variante', async () => {
    const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua });
    const job = await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, ['keyframe:s1']);
    await executer(db, job);
    const q = await deciderQualite(ctxDe(ids, 'ua'), { jobId: job }, 'rejected');
    expect(q.ok).toBe(true);
    const r = await creerVariante(ctxDe(ids, 'ua'), { assetId: (await sortiesDuJob(db, job))['keyframe:s1'] });
    expect(!r.ok && r.code).toBe('QUALITY_REVIEW_REQUIRED');
    expect((await db.select().from(VA).where(eq(VA.projectId, p.projectId))).length).toBe(0);
  });
});

describe('FLOW-09 · résultat insuffisant ⇒ inconclusif ; itérer garde sources, variable et parente', () => {
  it('verdict Adsmap « inconclusive » · lecture inconclusive, même variable', async () => {
    const [v] = await db.select().from(VA).where(eq(VA.mediaAssetId, scene.lot4['keyframe:s3']!));
    const [lien] = await db.select().from(schema.studioTestLinks).where(eq(schema.studioTestLinks.variantId, v!.id));
    await db.insert(schema.verdicts).values({ adId: lien!.adsmapAdId, workspaceId: ids.wsA, computed: 'inconclusive', comparable: true });
    const r = await lireApprentissage(ctxDe(ids, 'ua'), { linkId: lien!.id });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.test.lecture).toMatchObject({ conclusion: 'inconclusif', motif: 'donnees_insuffisantes', variableSuivante: 'hook', garderVariable: true });
  });

  it('relecture IA sans release publiée · refus honnête, lecture pure rendue, aucun appel, aucune trace', async () => {
    const [v] = await db.select().from(VA).where(eq(VA.mediaAssetId, scene.lot4['keyframe:s3']!));
    const [lien] = await db.select().from(schema.studioTestLinks).where(eq(schema.studioTestLinks.variantId, v!.id));
    const f = adaptateurSimule(() => ({}));
    const avant = await compte();
    const r = await relireApprentissage(ctxDe(ids, 'ua'), { linkId: lien!.id, coutAnnonceUsd: coutMaxRelectureUsd('modele-simule') }, { adaptateur: f, environnement: 'test', modele: 'modele-simule' });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.indisponible?.code).toBe('RELEASE_ACTIVE_ABSENTE');
    expect(r.indisponible?.message).toContain('pas encore activée');
    expect(r.relecture).toBeNull();
    expect(r.test.lecture.conclusion).toBe('inconclusif');
    expect(f.recues.length).toBe(0);
    expect(await compte()).toEqual(avant);
  });

  it('itérer · nouvelle version enfant de celle de la variante, brief gardé (sources, hypothèse), même variable, aucune génération', async () => {
    const [v] = await db.select().from(VA).where(eq(VA.mediaAssetId, scene.lot4['keyframe:s3']!));
    const [projet] = await db.select().from(P).where(eq(P.id, scene.projectId));
    const jobsAvant = (await db.select().from(schema.studioJobs)).length;
    const devisAvant = (await db.select().from(schema.studioQuotes)).length;
    const r = await iterer(ctxDe(ids, 'ua'), { variantId: v!.id, baseVersionId: projet!.currentVersionId });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r).toMatchObject({ variable: 'hook', variableGardee: true, version: { n: 2, parentId: scene.v1 } });
    const [nv] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, r.version.id));
    const brief = (nv!.content as { brief: Record<string, unknown> }).brief;
    const parent = briefCanonique();
    expect(brief.facts).toEqual(parent.facts);
    expect(brief.hypothesisId).toBe('h_douleur');
    expect(brief.testedVariable).toBe('hook');
    expect(brief.references).toEqual(parent.references);
    const [apres] = await db.select().from(P).where(eq(P.id, scene.projectId));
    expect(apres!.currentVersionId).toBe(r.version.id);
    expect((apres!.testRefs as unknown[]).at(-1)).toMatchObject({ type: 'iteration', versionId: r.version.id, parentVariantId: v!.id, variable: 'hook', variableGardee: true, sourceIds: ['veille:pub_concurrente_1', 'veille:pub_concurrente_2'] });
    expect((await db.select().from(schema.studioJobs)).length).toBe(jobsAvant);
    expect((await db.select().from(schema.studioQuotes)).length).toBe(devisAvant);
  });

  it('le lot suivant hérite de la parente sans la redemander · filiation serveur durable', async () => {
    const [v] = await db.select().from(VA).where(eq(VA.mediaAssetId, scene.lot4['keyframe:s3']!));
    const job = await lancerLot(db, ctxDe(ids, 'ua'), scene.projectId, ['keyframe:s2']);
    expect(await executer(db, job)).toBe('completed');
    const s = await sortiesDuJob(db, job);
    const r = await creerVariante(ctxDe(ids, 'ua'), { assetId: s['keyframe:s2'] });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.variante).toMatchObject({ parentVariantId: v!.id, libelle: 'Image 1 du lot 5' });
    const f = await filiationVariante(ctxDe(ids, 'ua'), { variantId: r.variante.id });
    expect(f.ok && f.maillons.map((m) => m.libelle)).toEqual(['Image 1 du lot 5', 'Image 3 du lot 4']);
    expect(f.ok && f.maillons.map((m) => m.sourceIds)).toEqual([['veille:pub_concurrente_1', 'veille:pub_concurrente_2'], ['veille:pub_concurrente_1', 'veille:pub_concurrente_2']]);
  });

  it('itérer sur une version de base périmée ⇒ 409 avec le diff, rien n’est écrit', async () => {
    const [v] = await db.select().from(VA).where(eq(VA.mediaAssetId, scene.lot4['keyframe:s3']!));
    const avant = await compte();
    const r = await iterer(ctxDe(ids, 'ua'), { variantId: v!.id, baseVersionId: scene.v1 });
    expect(!r.ok && r.code).toBe('VERSION_CONFLICT');
    expect(!r.ok && r.conflit?.versionCouranteId).toBeTruthy();
    expect(await compte()).toEqual(avant);
  });
});

describe('Isolation · un test ne prétend pas isoler la variable si plusieurs champs ont changé', () => {
  it('enfant dont texte ET style ont changé ⇒ « plusieurs », et un gagnant face à une perdante reste inconclusif', async () => {
    const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum isolation' });
    const j1 = await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, ['keyframe:s1']);
    await executer(db, j1);
    const parent = await creerVariante(ctxDe(ids, 'ua'), { assetId: (await sortiesDuJob(db, j1))['keyframe:s1'] });
    if (!parent.ok) throw new Error(parent.code);
    const lp = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: parent.variante.id, saisie: saisieTest() });
    if (!lp.ok) throw new Error(lp.code);
    await db.insert(schema.verdicts).values({ adId: lp.lien.adsmapAdId, workspaceId: ids.wsA, computed: 'loser', comparable: true });

    const v2 = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: p.versionId, changes: [
      { op: 'replace', path: '/brief', newValue: briefCanonique({ texts: ['Fini les boutons'], styleIntent: 'néon' }), reason: 'deux champs' },
    ] });
    if (!v2.ok) throw new Error(v2.code);
    const j2 = await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, ['keyframe:s1']);
    await executer(db, j2);
    const enfant = await creerVariante(ctxDe(ids, 'ua'), { assetId: (await sortiesDuJob(db, j2))['keyframe:s1'], parentVariantId: parent.variante.id });
    if (!enfant.ok) throw new Error(enfant.code);
    const le = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: enfant.variante.id, saisie: saisieTest() });
    expect(le.ok && le.lien.isolation).toMatchObject({ statut: 'plusieurs', champs: ['brief.styleIntent', 'brief.texts'], pretendIsoler: false });
    if (!le.ok) return;
    // Parente perdante non gagnante · l'arête d'itération Adsmap n'est PAS posée (checkIteration), la fiche rejoint le concept.
    expect(le.lien.areteIteration).toBe(false);
    const [adE] = await db.select().from(schema.ads).where(eq(schema.ads.id, le.lien.adsmapAdId));
    const [adP] = await db.select().from(schema.ads).where(eq(schema.ads.id, lp.lien.adsmapAdId));
    expect([adE!.conceptId, adE!.variantCode, adE!.adType]).toEqual([adP!.conceptId, `${adP!.variantCode}-i1`, 'new']);
    await db.insert(schema.verdicts).values({ adId: le.lien.adsmapAdId, workspaceId: ids.wsA, computed: 'winner', comparable: true });
    const lu = await lireApprentissage(ctxDe(ids, 'ua'), { linkId: le.lien.linkId });
    expect(lu.ok && lu.test.lecture).toMatchObject({ conclusion: 'inconclusif', motif: 'variable_non_isolee' });
  });

  it('un seul champ changé face à une parente gagnante ⇒ isolé, arête d’itération Adsmap posée', async () => {
    const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum isolé' });
    const j1 = await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, ['keyframe:s1']);
    await executer(db, j1);
    const parent = await creerVariante(ctxDe(ids, 'ua'), { assetId: (await sortiesDuJob(db, j1))['keyframe:s1'] });
    if (!parent.ok) throw new Error(parent.code);
    const lp = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: parent.variante.id, saisie: saisieTest() });
    if (!lp.ok) throw new Error(lp.code);
    await db.insert(schema.verdicts).values({ adId: lp.lien.adsmapAdId, workspaceId: ids.wsA, computed: 'baby_winner', validated: 'baby_winner', status: 'validated', comparable: true });
    const it1 = await iterer(ctxDe(ids, 'ua'), { variantId: parent.variante.id, baseVersionId: p.versionId, variable: 'opening_visual' });
    if (!it1.ok) throw new Error(it1.code);
    expect(it1).toMatchObject({ variable: 'opening_visual', variableGardee: false });
    const [vIt] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, it1.version.id));
    const briefIt = (vIt!.content as { brief: Record<string, unknown> }).brief;
    const v3 = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: it1.version.id, changes: [
      { op: 'replace', path: '/brief', newValue: { ...briefIt, composition: 'flacon en ouverture, plein cadre' }, reason: 'un champ' },
    ] });
    if (!v3.ok) throw new Error(v3.code);
    const j2 = await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, ['keyframe:s1']);
    await executer(db, j2);
    // v3 n'est pas la version créée par l'itération : la parente est donnée explicitement.
    const enfantP = await creerVariante(ctxDe(ids, 'ua'), { assetId: (await sortiesDuJob(db, j2))['keyframe:s1'], parentVariantId: parent.variante.id });
    if (!enfantP.ok) throw new Error(enfantP.code);
    const le = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: enfantP.variante.id, saisie: saisieTest({ variable: 'opening_visual', valeurVariable: 'plein cadre' }) });
    expect(le.ok, JSON.stringify(le)).toBe(true);
    if (!le.ok) return;
    expect(le.lien.isolation).toMatchObject({ statut: 'isole', champs: ['brief.composition'], pretendIsoler: true });
    expect(le.lien.areteIteration).toBe(true);
    const aretes = await db.select().from(schema.iterationEdges).where(eq(schema.iterationEdges.childAdId, le.lien.adsmapAdId));
    expect(aretes.map((a) => [a.parentAdId, a.changedVariable])).toEqual([[lp.lien.adsmapAdId, 'opening_visual']]);
  });
});

describe('SEC-02 · portée de marque et rôle, réévalués dans chaque commande', () => {
  it('membre restreint à A1 · un projet de A2 est introuvable (neutre), rien n’est écrit', async () => {
    const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.ua, titre: 'Projet A2 secret' });
    const job = await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, ['keyframe:s1']);
    await executer(db, job);
    const asset = (await sortiesDuJob(db, job))['keyframe:s1'];
    const avant = await compte();
    for (const qui of ['ur', 'ub'] as const) {
      const l = await listerVariantes(ctxDe(ids, qui), { projectId: p.projectId }, OPTIONS);
      expect(!l.ok && [l.code, l.targetIds, l.message]).toEqual(['NOT_FOUND', [], expect.stringContaining('introuvable')]);
      const c = await creerVariante(ctxDe(ids, qui), { assetId: asset });
      expect(!c.ok && c.code).toBe('NOT_FOUND');
    }
    expect(await compte()).toEqual(avant);
    const okA = await creerVariante(ctxDe(ids, 'ua'), { assetId: asset });
    expect(okA.ok).toBe(true);
    if (!okA.ok) return;
    for (const qui of ['ur', 'ub'] as const) {
      expect((await rattacherVarianteAuTest(ctxDe(ids, qui), { variantId: okA.variante.id, saisie: saisieTest() }) as { code?: string }).code).toBe('NOT_FOUND');
      expect((await iterer(ctxDe(ids, qui), { variantId: okA.variante.id, baseVersionId: p.versionId }) as { code?: string }).code).toBe('NOT_FOUND');
      expect((await filiationVariante(ctxDe(ids, qui), { variantId: okA.variante.id }) as { code?: string }).code).toBe('NOT_FOUND');
    }
  });

  it('actions · le lecteur consulte mais ne choisit pas ; sans l’offre Adsmap, pas de rattachement', async () => {
    etat.session = session(ids, 'uv');
    const l = await actionsVariantes.listerVariantes({ projectId: scene.projectId });
    expect(l.ok && l.donnees.droits.proposer).toBe(false);
    const c = await actionsVariantes.creerVariante({ assetId: scene.lot4['keyframe:s1'] });
    expect(!c.ok && c.code).toBe('FORBIDDEN');
    etat.session = session(ids, 'ua'); // offre core · Adsmap fermé
    const [v] = await db.select().from(VA).where(eq(VA.mediaAssetId, scene.lot4['keyframe:s1']!));
    const r = await actionsTests.rattacherVarianteAuTest({ variantId: v!.id, saisie: saisieTest() });
    expect(!r.ok && [r.code, r.message]).toEqual(['FORBIDDEN', expect.stringContaining('offre Plus')]);
    const l2 = await actionsVariantes.listerVariantes({ projectId: scene.projectId });
    expect(l2.ok && l2.donnees.adsmap.acces).toBe(false);
    expect(l2.ok && l2.donnees.relecture).toMatchObject({ disponible: false, coutMaxUsd: expect.any(Number) });
    etat.session = session(ids, 'ua', { plan: 'plus' });
    const r2 = await actionsTests.rattacherVarianteAuTest({ variantId: v!.id, saisie: saisieTest() });
    expect(r2.ok, JSON.stringify(r2)).toBe(true);
    etat.session = null;
    const anonyme = await actionsVariantes.listerVariantes({ projectId: scene.projectId });
    expect(!anonyme.ok && anonyme.code).toBe('AUTH_REQUIRED');
  });
});

describe('Lecture pure · lister n’écrit rien', () => {
  it('listerVariantes et filiationVariante · aucune ligne écrite, journal d’audit inchangé', async () => {
    const audit = async () => (await db.select().from(schema.studioAuditEvents)).length;
    const avant = { ...(await compte()), audit: await audit() };
    const l = await listerVariantes(ctxDe(ids, 'ua'), { projectId: scene.projectId }, OPTIONS);
    expect(l.ok).toBe(true);
    if (l.ok) for (const v of l.donnees.variantes) await filiationVariante(ctxDe(ids, 'ua'), { variantId: v.id });
    expect({ ...(await compte()), audit: await audit() }).toEqual(avant);
    if (!l.ok) return;
    const lot4 = l.donnees.lots.find((x) => x.jobId === scene.lots[3]);
    expect(lot4?.sorties.map((s) => [s.position, s.varianteId !== null])).toEqual([[1, true], [2, true], [3, true], [4, true]]);
  });
});
