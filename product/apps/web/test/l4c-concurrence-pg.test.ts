import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * L4-C · idempotence sur Postgres 16 RÉEL · DEUX connexions distinctes (pglite
 * sérialise tout et ne prouve rien ici). Lancé seulement si `L4C_PG_URL`
 * désigne une base LOCALE (127.0.0.1 / localhost) ; sinon ignoré (la CI n'a pas
 * de Postgres). Restaurer la base ensuite (`pg_restore --clean`).
 *
 *   L4C_PG_URL=postgres://postgres@127.0.0.1:5433/tiktrends_l4c pnpm exec vitest run test/l4c-concurrence-pg.test.ts
 *
 * 10 manches : deux onglets choisissent la MÊME sortie en même temps ⇒ une
 * variante ; deux onglets rattachent la même variante en même temps ⇒ une fiche
 * Adsmap, un lien ; deux variantes visent la même fiche ⇒ un lien, un refus.
 */

const URL_PG = process.env.L4C_PG_URL ?? '';
const LOCALE = /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_PG);

vi.mock('../lib/auth', () => ({ getSession: async () => null }));

import { schema, sql, eq, inArray } from '@tiktrends/db';
import { semer, idsStudios } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, saisieTest } from './l4c-harnais';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = idsStudios();
let c1: BaseStudio;
let c2: BaseStudio;
let projectId = '';

async function connexion(): Promise<BaseStudio> {
  vi.resetModules();
  process.env.DATABASE_URL = URL_PG;
  const m = await import('@tiktrends/db');
  delete process.env.DATABASE_URL;
  return m.db as BaseStudio;
}

async function pid(b: BaseStudio): Promise<number> {
  const r = await b.transaction(async (tx) => tx.execute(sql`select pg_backend_pid() as pid`));
  const rows = (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<{ pid: number }>;
  return Number(rows[0]!.pid);
}

describe.skipIf(!LOCALE)('Postgres réel · deux connexions · L4-C', () => {
  beforeAll(async () => {
    c1 = await connexion();
    c2 = await connexion();
    await semer(c1, schema, ids);
    projectId = (await projetAvecBrief(c1, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum concurrence' })).projectId;
  }, 60_000);
  afterAll(async () => {
    for (const c of [c1, c2]) await (c as unknown as { session: { client: { end: () => Promise<void> } } }).session.client.end().catch(() => {});
  });

  it('les deux clients sont deux sessions Postgres distinctes', async () => {
    const [a, b] = await Promise.all([pid(c1), pid(c2)]);
    expect(a).not.toBe(b);
  });

  it('10 manches · même sortie choisie deux fois en même temps ⇒ une variante ; même rattachement ⇒ une fiche, un lien', async () => {
    const bilan: string[] = [];
    for (let manche = 0; manche < 10; manche++) {
      const job = await lancerLot(c1, ctxDe(ids, 'ua'), projectId, ['keyframe:s1']);
      expect(await executer(c1, job)).toBe('completed');
      const asset = (await sortiesDuJob(c1, job))['keyframe:s1']!;
      const [a, b] = await Promise.all([
        creerVariante(ctxDe(ids, 'ua'), { assetId: asset }, c1),
        creerVariante(ctxDe(ids, 'ua'), { assetId: asset }, c2),
      ]);
      expect(a.ok && b.ok, JSON.stringify([a, b])).toBe(true);
      if (!a.ok || !b.ok) return;
      const variantes = await c1.select().from(schema.studioVariants).where(eq(schema.studioVariants.mediaAssetId, asset));
      const [r1, r2] = await Promise.all([
        rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: a.variante.id, saisie: saisieTest() }, c1),
        rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: a.variante.id, saisie: saisieTest() }, c2),
      ]);
      expect(r1.ok && r2.ok, JSON.stringify([r1, r2])).toBe(true);
      if (!r1.ok || !r2.ok) return;
      const liens = await c1.select().from(schema.studioTestLinks).where(eq(schema.studioTestLinks.variantId, a.variante.id));
      const ads = liens.length ? await c1.select().from(schema.ads).where(inArray(schema.ads.id, liens.map((l) => l.adsmapAdId))) : [];
      const fiches = await c1.select({ id: schema.ads.id }).from(schema.ads).where(sql`${schema.ads.sourceRef}->>'studioVariantId' = ${a.variante.id}`);
      const ligne = `${a.variante.id === b.variante.id}/${variantes.length}/${[a.deja, b.deja].sort().join(',')}/${r1.lien.linkId === r2.lien.linkId}/${liens.length}/${ads.length}/${fiches.length}/${[r1.deja, r2.deja].sort().join(',')}`;
      bilan.push(ligne);
      expect(ligne, `manche ${manche}`).toBe('true/1/false,true/true/1/1/1/false,true');
    }
    expect(new Set(bilan).size).toBe(1);
  }, 120_000);

  it('deux variantes visent la MÊME fiche Adsmap en même temps ⇒ un lien, un refus INVARIANT_CONFLICT', async () => {
    const job = await lancerLot(c1, ctxDe(ids, 'ua'), projectId, ['keyframe:s1', 'keyframe:s2', 'keyframe:s3']);
    await executer(c1, job);
    const s = await sortiesDuJob(c1, job);
    const [v0, v1, v2] = [await creerVariante(ctxDe(ids, 'ua'), { assetId: s['keyframe:s1'] }, c1), await creerVariante(ctxDe(ids, 'ua'), { assetId: s['keyframe:s2'] }, c1), await creerVariante(ctxDe(ids, 'ua'), { assetId: s['keyframe:s3'] }, c1)];
    if (!v0.ok || !v1.ok || !v2.ok) throw new Error('variantes');
    // Une fiche Adsmap NEUVE, dans le concept du projet, liée à aucune variante.
    const r0 = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v0.variante.id, saisie: saisieTest() }, c1);
    if (!r0.ok) throw new Error(r0.code);
    const [ad0] = await c1.select().from(schema.ads).where(eq(schema.ads.id, r0.lien.adsmapAdId));
    const [fiche] = await c1.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: ad0!.conceptId, variantCode: `libre-${Date.now()}`, format: 'static', status: 'draft' }).returning();
    const [a, b] = await Promise.all([
      rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v1.variante.id, saisie: saisieTest({ adsmapAdId: fiche!.id }) }, c1),
      rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v2.variante.id, saisie: saisieTest({ adsmapAdId: fiche!.id }) }, c2),
    ]);
    const codes = [a, b].map((r) => (r.ok ? 'ok' : r.code)).sort();
    expect(codes, JSON.stringify([a, b])).toEqual(['INVARIANT_CONFLICT', 'ok']);
    const liens = await c1.select().from(schema.studioTestLinks).where(eq(schema.studioTestLinks.adsmapAdId, fiche!.id));
    expect(liens.length).toBe(1);
  }, 60_000);
});
