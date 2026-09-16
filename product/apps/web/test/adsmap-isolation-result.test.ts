import { describe, it, expect, vi, beforeAll } from 'vitest';

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsId: randomUUID(), aId: randomUUID(), bId: randomUUID() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

// La marque active est A · le guard ne dépend pas du cookie ici.
vi.mock('../lib/adsmap-guard', () => ({
  adsmapGuard: async () => ({
    s: { user: { id: ids.wsId, email: 'x@test.local', name: null }, workspaceId: ids.wsId, workspaceName: 'Agence', role: 'admin', plan: 'business' },
    brand: { id: ids.aId, name: 'Marque A', workspaceId: ids.wsId },
  }),
}));

import { db, schema } from '@tiktrends/db';
import { listAdsAction } from '../app/actions/adsmap';

/**
 * Le pendant RÉSULTAT du garde de source `adsmap-scope-marque.test.ts` (#516) ·
 * la fuite la plus grave (la vue Table d'une agence montrait, et exportait en
 * CSV, les ads de TOUTES ses marques). On sème deux marques et on vérifie, sur
 * une vraie base, que `listAdsAction` (marque active A) ne rend QUE les ads de A.
 */
async function ad(brandId: string, variantCode: string): Promise<string> {
  const [persona] = await db.insert(schema.personas).values({ brandId, name: 'P' }).returning();
  const [desire] = await db.insert(schema.desires).values({ workspaceId: ids.wsId, personaId: persona!.id, label: 'D' }).returning();
  const [angle] = await db.insert(schema.angles).values({ workspaceId: ids.wsId, desireId: desire!.id, label: 'A', mechanism: 'demo' }).returning();
  const [concept] = await db.insert(schema.concepts).values({ workspaceId: ids.wsId, angleId: angle!.id, title: 'C' }).returning();
  const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsId, conceptId: concept!.id, variantCode }).returning();
  return a!.id;
}

let adsA: string[];
let adB: string;

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.wsId, name: 'Agence' });
  await db.insert(schema.brands).values([
    { id: ids.aId, workspaceId: ids.wsId, name: 'Marque A' },
    { id: ids.bId, workspaceId: ids.wsId, name: 'Marque B' },
  ]);
  adsA = [await ad(ids.aId, 'a1'), await ad(ids.aId, 'a2')];
  adB = await ad(ids.bId, 'b1');
});

describe('ADSMAP · listAdsAction (marque active) isole la marque', () => {
  it('ne rend QUE les ads de la marque active, jamais celles d’une autre marque de l’espace', async () => {
    const res = await listAdsAction();
    expect(res.error).toBeUndefined();
    const ids_ = (res.rows ?? []).map((r) => r.id).sort();
    expect(ids_, 'exactement les deux ads de A').toEqual([...adsA].sort());
    expect(ids_, 'jamais l’ad de B').not.toContain(adB);
  });
});
