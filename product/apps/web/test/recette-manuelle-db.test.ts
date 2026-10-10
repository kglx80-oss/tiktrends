import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Recette manuelle (mandat du propriétaire, 10/10) · au niveau BASE.
 *
 * En production, une release sans benchmark approuvé ne devient pas active.
 * Le propriétaire a retiré le benchmark des préalables : un accord nominatif
 * « recette manuelle » (motif, audit, tests structurels réussis sur la même
 * empreinte) la rend publiable. On lit le pointeur, le statut et l'audit
 * APRÈS chaque geste ; un admin d'espace n'obtient rien.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq } from '@tiktrends/db';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { randomUUID } from 'node:crypto';
import { acteurPlateforme, acteurSans } from './l2-outils';

const ADMIN = randomUUID();
const A = acteurPlateforme(ADMIN);
const R = schema.studioPromptReleases;
let id = '';
let importees = 0;
let valideesEnBloc = 0;

const pointeur = async () => (await depot.lirePointeur())?.releaseId ?? null;
const statut = async (x: string) => (await db.select({ s: R.status }).from(R).where(eq(R.id, x)))[0]?.s;
const codes = (r: { ok: boolean; constats?: Array<{ code: string }> }) => (r.ok ? [] : r.constats!.map((c) => c.code));
const audits = async () => db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.action, 'prompt.recette_manuelle.approuver'));

beforeAll(async () => {
  await db.insert(schema.users).values({ id: ADMIN, email: 'proprietaire-recette@studios.test' });
  const imp = await depot.importerPack(A);
  if (!imp.ok) throw new Error(JSON.stringify(imp.constats));
  importees = imp.crees;
  const v = await depot.validerImportsDuPack(A);
  if (!v.ok) throw new Error(JSON.stringify(v.constats));
  valideesEnBloc = v.validees;
  const r = await depot.creerRelease(A, { motif: 'Mise en ligne Studios' });
  if (!r.ok) throw new Error(JSON.stringify(r.constats));
  id = r.id;
});

describe('mise en service · validation en un geste des brouillons importés', () => {
  it('tous les brouillons importés sont validés d’un geste, aucun ne reste en brouillon', async () => {
    expect(importees).toBeGreaterThan(20);
    expect(valideesEnBloc).toBe(importees);
    expect((await depot.listerVersions()).filter((l) => l.status === 'draft')).toEqual([]);
  });

  it('un brouillon ÉDITÉ par un ADMIN n’est jamais validé en bloc ; un admin d’espace ne lance rien', async () => {
    const base = (await depot.listerVersions()).find((l) => l.key === 'photo_clean' && l.status === 'validated')!;
    const b = await depot.enregistrerBrouillon(A, { baseId: base.id, champs: { lighting: 'lumière rasante' }, motif: 'Essai d’édition' });
    expect(b.ok).toBe(true);
    expect(codes(await depot.validerImportsDuPack(acteurSans(randomUUID())))).toContain('FORBIDDEN');
    const v = await depot.validerImportsDuPack(A);
    expect(v.ok && v.validees).toBe(0);
    expect((await depot.listerVersions()).filter((l) => l.status === 'draft').map((l) => l.key)).toEqual(['photo_clean']);
  });
});

describe('recette manuelle · release publiable en production sans benchmark', () => {
  it('avant évaluation · refus TESTS_STRUCTURELS_ABSENTS, rien n’est écrit', async () => {
    expect(codes(await depot.approuverRecetteManuelle(A, { releaseId: id, motif: 'Tests manuels avec Codex' }))).toEqual(['TESTS_STRUCTURELS_ABSENTS']);
    expect(await audits()).toHaveLength(0);
  });

  it('un admin d’espace ne l’accorde pas ; sans motif non plus', async () => {
    expect((await depot.evaluerRelease(A, { releaseId: id })).ok).toBe(true);
    expect(codes(await depot.approuverRecetteManuelle(acteurSans(randomUUID()), { releaseId: id, motif: 'x' }))).toContain('FORBIDDEN');
    expect(codes(await depot.approuverRecetteManuelle(A, { releaseId: id, motif: '   ' }))).toEqual(['MOTIF_ABSENT']);
    expect(await audits()).toHaveLength(0);
  });

  it('sans l’accord · la production refuse toujours (BENCHMARK_NON_APPROUVE)', async () => {
    expect(codes(await depot.publierRelease(A, { releaseId: id, attendue: null, environnement: 'production' }))).toEqual(['BENCHMARK_NON_APPROUVE']);
    expect(await pointeur()).toBeNull();
  });

  it('avec l’accord · audit nominatif, puis publication en production, pointeur sur la release', async () => {
    const ok = await depot.approuverRecetteManuelle(A, { releaseId: id, motif: 'Mandat du 10/10 · tests manuels avec Codex' });
    expect(ok.ok).toBe(true);
    const au = await audits();
    expect(au).toHaveLength(1);
    expect(au[0]).toMatchObject({ targetId: id, reason: 'Mandat du 10/10 · tests manuels avec Codex', actorId: A.userId });
    expect(await statut(id)).toBe('staged');
    expect(await pointeur()).toBeNull();
    const pub = await depot.publierRelease(A, { releaseId: id, attendue: null, environnement: 'production' });
    expect(codes(pub)).toEqual([]);
    expect(await pointeur()).toBe(id);
    expect(await statut(id)).toBe('active');
  });

  it('une release publiée ne reçoit plus l’accord (une seule fois, sur une release en attente)', async () => {
    expect(codes(await depot.approuverRecetteManuelle(A, { releaseId: id, motif: 'encore' }))).toContain('RELEASE_NON_STAGED');
  });
});
