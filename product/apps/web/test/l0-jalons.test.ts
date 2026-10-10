import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Chantier L0 · les lectures Jarvis ne datent plus les jalons (BASE-03).
 *
 * `jarvisStats` appelait `recordMilestones` au passage · ouvrir
 * `/jarvis/sources`, ou le préflight d'un Studio (dès 25 caractères, et dès le
 * montage d'un Studio prérempli), INSÉRAIT des jalons. Leur `reached_at`
 * valait « le jour où quelqu'un a regardé », et le récapitulatif hebdomadaire
 * qui le lit dépendait des visites.
 *
 * On appelle les VRAIES lectures (`jarvisStats`, `jarvisSnapshot`,
 * `preflightAction`) contre une vraie base (pglite) dont chaque instruction est
 * espionnée · zéro écriture, zéro jalon. Puis la COMMANDE (`daterJalons`,
 * appelée par `invalidateJarvisMemory` depuis les actions qui changent les
 * verdicts) date les jalons, une seule fois.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), owner: randomUUID(), brand: randomUUID(), brand2: randomUUID() };
});
const espion = vi.hoisted(() => ({ actif: false, ecritures: [] as string[] }));
const h = vi.hoisted(() => ({ session: null as unknown }));

/** Une instruction qui modifie la base · le reste (select, with … select) est une lecture. */
const ECRITURE = /\binsert\s+into\b|\bupdate\s+"?[a-z_]+"?\s+set\b|\bdelete\s+from\b|\btruncate\b|\bmerge\s+into\b/i;

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { PGlite } = await import('@electric-sql/pglite');
  const proto = PGlite.prototype as unknown as { query: (sql: string, ...rest: unknown[]) => Promise<unknown> };
  const query = proto.query;
  proto.query = function (this: unknown, sql: string, ...rest: unknown[]) {
    if (espion.actif && ECRITURE.test(sql)) espion.ecritures.push(sql.replace(/\s+/g, ' ').slice(0, 160));
    return query.call(this, sql, ...rest);
  };
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', async (orig) => ({ ...(await orig<typeof import('../lib/brands')>()), getActiveBrand: async () => ({ id: ids.brand, name: 'Neva', logoUrl: null, url: null, category: null }) }));

import { db, schema, eq } from '@tiktrends/db';

async function empreinte(): Promise<string> {
  const j = await db.select().from(schema.statMilestones).orderBy(schema.statMilestones.id);
  const v = await db.select().from(schema.verdicts).orderBy(schema.verdicts.adId);
  return JSON.stringify({ j, v });
}

/** Lance une lecture sous espion · rend les instructions d'écriture vues. */
async function sousEspion<T>(f: () => Promise<T>): Promise<{ r: T; ecritures: string[] }> {
  espion.ecritures = []; espion.actif = true;
  try {
    const r = await f();
    // Laisse partir ce qui serait « fire and forget » (void …) avant de regarder.
    await new Promise((ok) => setTimeout(ok, 30));
    return { r, ecritures: [...espion.ecritures] };
  } finally { espion.actif = false; }
}

/** Une chaîne Adsmap qui franchit le seuil (≥ 3 verdicts concluants sur `demo`). */
async function semerVerdicts(ws: string, brand: string, n: number) {
  const [p] = await db.insert(schema.personas).values({ brandId: brand, name: `Persona ${brand.slice(0, 4)}` }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: p!.id, label: 'Dormir' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: d!.id, label: 'Démo', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: a!.id, title: 'Concept' }).returning();
  for (let i = 0; i < n; i++) {
    const [ad] = await db.insert(schema.ads).values({ workspaceId: ws, conceptId: c!.id, variantCode: `V${i}`, format: 'static', status: 'done' }).returning();
    await db.insert(schema.verdicts).values({ adId: ad!.id, workspaceId: ws, computed: i % 2 ? 'loser' : 'winner', status: 'computed', comparable: true });
  }
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.ws, name: 'L0', plan: 'plus' });
  await db.insert(schema.users).values({ id: ids.owner, email: 'owner@l0.test' });
  await db.insert(schema.brands).values([{ id: ids.brand, workspaceId: ids.ws, name: 'Neva' }, { id: ids.brand2, workspaceId: ids.ws, name: 'Seconde' }]);
  await semerVerdicts(ids.ws, ids.brand, 4);
  await semerVerdicts(ids.ws, ids.brand2, 3);
  h.session = { user: { id: ids.owner, email: 'owner@l0.test', name: null }, workspaceId: ids.ws, workspaceName: 'L0', role: 'owner', plan: 'plus', equipe: null };
});

describe('Lectures Jarvis · statistiques et /jarvis/sources', () => {
  it('jarvisStats et jarvisSnapshot n’insèrent aucun jalon', async () => {
    const { jarvisStats } = await import('../lib/jarvis-memory');
    const { jarvisSnapshot } = await import('../lib/jarvis-state');
    const avant = await empreinte();
    const { r: stats, ecritures } = await sousEspion(async () => {
      const s = await jarvisStats(ids.brand, ids.ws);
      await jarvisSnapshot(ids.brand, ids.ws);
      return s;
    });
    // La lecture a bien de quoi franchir le seuil · sinon le test serait vert pour rien.
    expect(stats.stats.find((x) => x.dimension === 'mechanism' && x.key === 'demo')?.nConclusive).toBe(4);
    expect(ecritures, `écriture pendant une lecture Jarvis :\n${ecritures.join('\n')}`).toEqual([]);
    expect(await empreinte()).toBe(avant);
    const jalons = await db.select().from(schema.statMilestones);
    expect(jalons.length, 'des jalons ont été datés par une simple lecture').toBe(0);
  });
});

describe('Les jalons sont datés par les COMMANDES qui changent les verdicts', () => {
  it('daterJalons · date les seuils franchis, puis ne refait rien (idempotente)', async () => {
    const { daterJalons } = await import('../lib/jarvis-memory');
    expect(await daterJalons(ids.brand)).toBeGreaterThan(0);
    const n = (await db.select().from(schema.statMilestones).where(eq(schema.statMilestones.brandId, ids.brand))).length;
    expect(n).toBeGreaterThan(0);
    expect(await daterJalons(ids.brand), 'rejouer a proposé de nouveaux jalons').toBe(0);
    expect((await db.select().from(schema.statMilestones).where(eq(schema.statMilestones.brandId, ids.brand))).length).toBe(n);
  });

  it('invalidateJarvisMemory (appelée par les commandes d’arbitrage) date les jalons de la marque', async () => {
    const { invalidateJarvisMemory } = await import('../lib/jarvis-memory');
    invalidateJarvisMemory(ids.brand2);
    await vi.waitFor(async () => {
      const j = await db.select().from(schema.statMilestones).where(eq(schema.statMilestones.brandId, ids.brand2));
      expect(j.length, 'la commande n’a pas daté les jalons').toBeGreaterThan(0);
    });
  });

});
