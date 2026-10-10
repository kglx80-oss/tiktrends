import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * F-A · réservations CONCURRENTES sur un vrai Postgres (le pool postgres-js
 * de `@tiktrends/db` ouvre plusieurs connexions : les transactions courent
 * vraiment en parallèle, ce que pglite ne fait pas).
 *
 * Ignoré sans `FA_PG_URL` (la CI n'a pas de Postgres). Base LOCALE seulement :
 *   FA_PG_URL=postgres://postgres@127.0.0.1:5433/tiktrends_fa pnpm exec vitest run test/fa-plafond-pg.test.ts
 * Les lignes `ai_spend` écrites sont supprimées à la fin.
 */

const URL_PG = process.env.FA_PG_URL ?? '';
const locale = /^postgres:\/\/[^@]*@(127\.0\.0\.1|localhost):\d+\//.test(URL_PG);

describe.skipIf(!locale)('plafond du worker · vingt réservations simultanées, une seule somme', () => {
  it('plafond de 5 images : exactement 5 réservations passent, jamais plus', async () => {
    process.env.DATABASE_URL = URL_PG;
    const { db, schema, inArray, reserverDepense } = await import('@tiktrends/db');
    const { BarriereDepenseStudio } = await import('@tiktrends/integrations');
    const { idDepenseDuJob } = await import('@tiktrends/core');
    const base = db as unknown as Parameters<typeof reserverDepense>[0];
    const [avant] = await db.select({ n: schema.aiSpend.id }).from(schema.aiSpend).limit(1);
    expect(avant, 'base locale non vide en ai_spend · restaurer avant le banc').toBeUndefined();

    const barriere = new BarriereDepenseStudio({
      port: { reserver: (l, o) => reserverDepense(base, l, o), annuler: async () => false },
      env: { AI_SPEND_CAP_USD: '0.4' },
    });
    const jobs = Array.from({ length: 20 }, () => randomUUID());
    let appels = 0;
    const issues = await Promise.allSettled(jobs.map((jobId) => barriere.sousPlafondStudio({ workspaceId: randomUUID(), jobId, usd: 0.08, modele: 'fal_image' }, async () => { appels += 1; return 'ok'; })));
    try {
      const passees = issues.filter((r) => r.status === 'fulfilled').length;
      const lignes = await db.select().from(schema.aiSpend).where(inArray(schema.aiSpend.id, jobs.map(idDepenseDuJob)));
      expect({ passees, appels, lignes: lignes.length, somme: Math.round(lignes.reduce((s, l) => s + l.actualUsd, 0) * 100) / 100 })
        .toEqual({ passees: 5, appels: 5, lignes: 5, somme: 0.4 });
    } finally {
      await db.delete(schema.aiSpend).where(inArray(schema.aiSpend.id, jobs.map(idDepenseDuJob)));
    }
  }, 60_000);
});
