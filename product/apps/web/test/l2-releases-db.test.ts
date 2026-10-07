import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * PROMPT-07, PROMPT-09, SEC-09 et la règle de production, au niveau BASE.
 *
 * Vraie base (pglite + migrations), vrai dépôt. On lit le pointeur, les
 * statuts et l'audit APRÈS chaque geste :
 *  - en production, une release sans benchmark approuvé ne devient pas active ;
 *  - un admin d'espace (aucun octroi plateforme) ne publie ni ne revient ;
 *  - publication et rollback = compare-and-set du pointeur, deux publications
 *    concurrentes sur la même attente : une seule passe ;
 *  - rollback : pointeur seul, versions et statuts intacts ;
 *  - une release qui rompt un contrat consommé est bloquée AVANT exposition.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq } from '@tiktrends/db';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { acteurPlateforme, acteurSans } from './l2-outils';

const A = acteurPlateforme();
const R = schema.studioPromptReleases;
const V = schema.studioPromptVersions;
const ids = { a: '', b: '', c: '' };

const pointeur = async () => (await depot.lirePointeur())?.releaseId ?? null;
const statut = async (id: string) => (await db.select({ s: R.status }).from(R).where(eq(R.id, id)))[0]?.s;
const codes = (r: { ok: boolean; constats?: Array<{ code: string }> }) => (r.ok ? [] : r.constats!.map((c) => c.code));

/** Une recette modifiée (éclairage) · nouvelle version validée, puis une release staged évaluée. */
async function releaseAvecEclairage(eclairage: string): Promise<string> {
  const base = (await depot.listerVersions()).find((l) => l.key === 'photo_clean' && l.status === 'validated')!;
  const b = await depot.enregistrerBrouillon(A, { baseId: base.id, champs: { lighting: eclairage }, motif: 'Recette inoffensive pour la preuve' });
  if (!b.ok) throw new Error(JSON.stringify(b.constats));
  const v = await depot.validerVersion(A, { id: b.id });
  if (!v.ok) throw new Error(JSON.stringify(v.constats));
  const r = await depot.creerRelease(A, { motif: eclairage });
  if (!r.ok) throw new Error(JSON.stringify(r.constats));
  const ev = await depot.evaluerRelease(A, { releaseId: r.id });
  if (!ev.ok) throw new Error(JSON.stringify(ev.constats));
  return r.id;
}

beforeAll(async () => {
  expect((await depot.importerPack(A)).ok).toBe(true);
  for (const l of await depot.listerVersions()) {
    const v = await depot.validerVersion(A, { id: l.id });
    if (!v.ok) throw new Error(`${l.key} : ${JSON.stringify(v.constats)}`);
  }
  const r = await depot.creerRelease(A, { motif: 'A' });
  if (!r.ok) throw new Error(JSON.stringify(r.constats));
  ids.a = r.id;
});

describe('évaluation et règle de production', () => {
  it('une release non évaluée ne se publie même pas en test', async () => {
    const r = await depot.publierRelease(A, { releaseId: ids.a, attendue: null, environnement: 'test' });
    expect(codes(r)).toContain('TESTS_STRUCTURELS_ABSENTS');
    expect(await pointeur()).toBeNull();
  });

  it('évaluer · tests structurels réussis, F01–F24 « non exécutés », pointeur intact', async () => {
    const ev = await depot.evaluerRelease(A, { releaseId: ids.a });
    expect(ev.ok && ev.testsStructurels).toBe(true);
    expect(ev.ok && ev.benchmark.length).toBe(24);
    expect(ev.ok && ev.benchmark.every((c) => c.statut === 'non_execute' && /budget requis/i.test(c.motif))).toBe(true);
    const [l] = await db.select().from(schema.studioPromptEvaluations).where(eq(schema.studioPromptEvaluations.releaseId, ids.a));
    expect(l).toMatchObject({ kind: 'structural', passed: true });
    expect(await statut(ids.a)).toBe('staged');
    expect(await pointeur()).toBeNull();
  });

  it('en PRODUCTION, sans benchmark approuvé · refus BENCHMARK_NON_APPROUVE, rien ne bouge', async () => {
    const r = await depot.publierRelease(A, { releaseId: ids.a, attendue: null, environnement: 'production' });
    expect(codes(r)).toEqual(['BENCHMARK_NON_APPROUVE']);
    expect(await pointeur()).toBeNull();
    expect(await statut(ids.a)).toBe('staged');
  });

  it('SEC-09 · un admin d’espace ne publie pas, n’évalue pas, ne crée pas de release', async () => {
    const sans = acteurSans();
    expect(codes(await depot.publierRelease(sans, { releaseId: ids.a, attendue: null, environnement: 'test' }))).toContain('FORBIDDEN');
    expect(codes(await depot.evaluerRelease(sans, { releaseId: ids.a }))).toContain('FORBIDDEN');
    expect(codes(await depot.creerRelease(sans, {}))).toEqual(['FORBIDDEN']);
    expect(await pointeur()).toBeNull();
  });

  it('en test (recette locale) · publication, pointeur sur A, audit', async () => {
    const r = await depot.publierRelease(A, { releaseId: ids.a, attendue: null, environnement: 'test' });
    expect(r.ok).toBe(true);
    expect(await pointeur()).toBe(ids.a);
    expect(await statut(ids.a)).toBe('active');
    const au = await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.action, 'prompt.release.publier'));
    expect(au).toHaveLength(1);
    expect(au[0]).toMatchObject({ versionBefore: null, versionAfter: ids.a, workspaceId: null });
  });
});

describe('compare-and-set et rollback (PROMPT-07)', () => {
  it('deux publications simultanées attendant A · une seule passe, l’autre VERSION_CONFLICT', async () => {
    ids.b = await releaseAvecEclairage('lumière studio diffuse, très légèrement plus chaude');
    ids.c = await releaseAvecEclairage('lumière studio diffuse, très légèrement plus froide');
    const [x, y] = await Promise.all([
      depot.publierRelease(A, { releaseId: ids.b, attendue: ids.a, environnement: 'test' }),
      depot.publierRelease(A, { releaseId: ids.c, attendue: ids.a, environnement: 'test' }),
    ]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    const perdant = x.ok ? y : x;
    expect(codes(perdant)).toContain('VERSION_CONFLICT');
    const gagnant = x.ok ? ids.b : ids.c;
    expect(await pointeur()).toBe(gagnant);
    expect(await statut(x.ok ? ids.c : ids.b)).toBe('staged');
    // Pour la suite : B est la release servie.
    if (gagnant !== ids.b) {
      const r = await depot.publierRelease(A, { releaseId: ids.b, attendue: ids.c, environnement: 'test' });
      expect(r.ok).toBe(true);
    }
    expect(await pointeur()).toBe(ids.b);
  });

  it('rollback vers A · pointeur seul, B reste publiée, versions et statuts intacts', async () => {
    const versionsAvant = await db.select({ id: V.id, s: V.status, h: V.contentHash }).from(V);
    const r = await depot.rollbackRelease(A, { releaseId: ids.a, attendue: ids.b, environnement: 'test' });
    expect(r.ok).toBe(true);
    expect(await pointeur()).toBe(ids.a);
    expect(await statut(ids.b)).toBe('active');
    expect(await statut(ids.a)).toBe('active');
    expect(await db.select({ id: V.id, s: V.status, h: V.contentHash }).from(V)).toEqual(versionsAvant);
  });

  it('rollback avec une attente périmée · VERSION_CONFLICT, pointeur inchangé', async () => {
    const r = await depot.rollbackRelease(A, { releaseId: ids.b, attendue: ids.b, environnement: 'test' });
    expect(codes(r)).toContain('VERSION_CONFLICT');
    expect(await pointeur()).toBe(ids.a);
  });

  it('retirer la release pointée · refus ; une autre · retirée', async () => {
    expect(codes(await depot.retirerRelease(A, { releaseId: ids.a }))).toContain('RELEASE_EN_SERVICE');
    expect((await depot.retirerRelease(A, { releaseId: ids.c })).ok).toBe(true);
    expect(await statut(ids.c)).toBe('retired');
  });

  it('SEC-09 · rollback par un admin d’espace · refus, pointeur inchangé', async () => {
    expect(codes(await depot.rollbackRelease(acteurSans(), { releaseId: ids.b, attendue: ids.a, environnement: 'test' }))).toContain('FORBIDDEN');
    expect(await pointeur()).toBe(ids.a);
  });
});

describe('PROMPT-09 · rupture de contrat consommé', () => {
  it('un champ de contrat ne s’édite pas dans l’ADMIN', async () => {
    const base = (await depot.listerVersions()).find((l) => l.key === 'brief.build')!;
    const r = await depot.enregistrerBrouillon(A, { baseId: base.id, champs: { outputSchemaRef: '03-CONTRATS.schema.json#/$defs/text_write_output' }, motif: 'tentative' });
    expect(codes(r)).toEqual(['CHAMP_NON_EDITABLE']);
  });

  it('une version validée au contrat divergent (écrite en base) · release refusée, publication bloquée', async () => {
    const base = (await db.select().from(V).where(eq(V.key, 'brief.build')))[0]!;
    const { empreinteContenu } = await import('../lib/studios/prompts/noyau');
    const contenu: Record<string, unknown> = { ...(base.content as Record<string, unknown>), version: '1.0.1', outputSchemaRef: '03-CONTRATS.schema.json#/$defs/text_write_output' };
    contenu.contentHash = empreinteContenu(contenu);
    await db.insert(V).values({ key: 'brief.build', version: 1_000_001, kind: 'template', scope: 'platform', status: 'validated', content: contenu, contentHash: contenu.contentHash as string, origin: 'test', reason: 'contrat divergent' });
    const r = await depot.creerRelease(A, { choix: { 'template:brief.build': '1.0.1' } });
    expect(codes(r)).toContain('SCHEMA_INCOMPATIBLE');

    // Même entrée glissée dans une release staged écrite à la main · la publication la bloque.
    const [ref] = await db.select().from(R).where(eq(R.id, ids.a));
    const entrees = JSON.parse(JSON.stringify(ref!.entries)) as { templates: Array<{ cle: string; version: string; contentHash: string }> };
    const t = entrees.templates.find((x) => x.cle === 'brief.build')!;
    t.version = '1.0.1'; t.contentHash = contenu.contentHash as string;
    const [forgee] = await db.insert(R).values({ scope: 'platform', entries: entrees, releaseHash: ref!.releaseHash, status: 'staged', evaluation: ref!.evaluation }).returning();
    const p = await depot.publierRelease(A, { releaseId: forgee!.id, attendue: ids.a, environnement: 'test' });
    expect(codes(p)).toContain('SCHEMA_INCOMPATIBLE');
    expect(await pointeur()).toBe(ids.a);
  });
});
