import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * CDC v8 · provenance Veille→Adsmap · la source se retrouve-t-elle DEPUIS LE TEST
 * ADSMAP ? On exerce l'action RÉELLE `adDetailAction` sur une vraie base (pglite) ·
 * une ad suivie depuis une génération sourcée doit rendre sa source ; une ad sans
 * génération sourcée (importée, saisie, ou issue d'une génération sans provenance)
 * ne doit pas s'en inventer. On lit le RÉSULTAT (`detail.sourceVeille`), pas un appel.
 *
 * La source est résolue À LA LECTURE depuis `generations.input.sourceVeille`
 * (écrite au studio, cf. provenance-veille.test.ts) via `ads.sourceRef.generationId` ·
 * une ad déjà suivie avant ce correctif l'affiche donc aussi.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsId: randomUUID(), brandId: randomUUID() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

vi.mock('../lib/adsmap-guard', () => ({
  adsmapGuard: async () => ({
    s: { user: { id: ids.wsId, email: 'x@test.local', name: null }, workspaceId: ids.wsId, workspaceName: 'Agence', role: 'admin', plan: 'business' },
    brand: { id: ids.brandId, name: 'Klorea', workspaceId: ids.wsId },
  }),
}));

import { db, schema } from '@tiktrends/db';
import { adDetailAction } from '../app/actions/adsmap-verdict';

const SOURCE = { plateforme: 'meta', id: '789', annonceur: 'Neva' };

/** Une génération de la marque · avec ou sans source de veille. */
async function generation(input: Record<string, unknown>): Promise<string> {
  const [g] = await db.insert(schema.generations).values({ brandId: ids.brandId, kind: 'ad', input }).returning({ id: schema.generations.id });
  return g!.id;
}

/** Une ad Adsmap rattachée au graphe minimal · `sourceRef` pilote la provenance. */
async function ad(sourceRef: unknown): Promise<string> {
  const [persona] = await db.insert(schema.personas).values({ brandId: ids.brandId, name: 'P' }).returning();
  const [desire] = await db.insert(schema.desires).values({ workspaceId: ids.wsId, personaId: persona!.id, label: 'D' }).returning();
  const [angle] = await db.insert(schema.angles).values({ workspaceId: ids.wsId, desireId: desire!.id, label: 'A', mechanism: 'demo' }).returning();
  const [concept] = await db.insert(schema.concepts).values({ workspaceId: ids.wsId, angleId: angle!.id, title: 'C' }).returning();
  const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsId, conceptId: concept!.id, variantCode: 'v1', sourceRef }).returning();
  return a!.id;
}

let adSourcee = '';
let adGenSansSource = '';
let adSansGen = '';

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.wsId, name: 'Agence' });
  await db.insert(schema.brands).values({ id: ids.brandId, workspaceId: ids.wsId, name: 'Klorea' });

  const genSourcee = await generation({ template: 'benefits', headline: 'X', sourceVeille: SOURCE });
  const genSansSource = await generation({ template: 'benefits', headline: 'Y' });

  adSourcee = await ad({ generationId: genSourcee });
  adGenSansSource = await ad({ generationId: genSansSource });
  adSansGen = await ad(null);
});

describe('provenance · la source de veille se retrouve depuis le test Adsmap', () => {
  it('une ad suivie d’une génération sourcée rend sa source · plateforme, identifiant, annonceur', async () => {
    const r = await adDetailAction(adSourcee);
    expect(r.error).toBeUndefined();
    expect(r.detail!.sourceVeille, 'la provenance remonte jusqu’au tiroir Adsmap').toEqual(SOURCE);
  });

  it('une génération sans provenance ne fait pas apparaître de source', async () => {
    const r = await adDetailAction(adGenSansSource);
    expect(r.detail!.sourceVeille).toBeNull();
  });

  it('une ad sans génération liée (importée, saisie) n’invente pas de source', async () => {
    const r = await adDetailAction(adSansGen);
    expect(r.detail!.sourceVeille).toBeNull();
  });
});
