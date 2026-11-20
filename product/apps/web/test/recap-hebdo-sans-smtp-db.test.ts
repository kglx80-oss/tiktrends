import { describe, expect, it, vi } from 'vitest';

/**
 * Le récap hebdomadaire SANS SMTP configuré · une CONFIGURATION, pas une
 * panne. Les notifications sont servies, aucun courriel n'est tenté, aucune
 * adresse n'est écrite au journal, une seule ligne par passage, et la route
 * répond 503 `smtp_absent` (le worker n'en fait ni retente ni ALERTE). Le
 * verrou reste `interrompu` · un appel à la main, une fois `SMTP_URL` posée,
 * enverra les courriels sans redoubler les notifications.
 *
 * Base réelle (pglite), VRAIE route, VRAI mailer (sans SMTP_URL).
 * 0 $ · aucun appel réseau.
 */

const h = vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  delete process.env.SMTP_URL;
  process.env.CRON_SECRET = 'cron-de-test';
  return { ids: { ws: u(), brand: u(), owner: u(), admin: u() } };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

import { db, schema, eq, and } from '@tiktrends/db';
import { cleVerrouRecap, lireEtatRecap } from '@tiktrends/core';
import { GET as cronRecap } from '../app/api/cron/digest/route';

const ids = h.ids;
const LUNDI = new Date('2026-11-16T06:47:00Z');

async function passage(): Promise<{ status: number; corps: Record<string, unknown> }> {
  vi.useFakeTimers({ toFake: ['Date'], now: LUNDI });
  try {
    const r = await cronRecap(new Request('http://localhost/api/cron/digest', { headers: { authorization: 'Bearer cron-de-test' } }));
    return { status: r.status, corps: await r.json() as Record<string, unknown> };
  } finally { vi.useRealTimers(); }
}

describe('sans SMTP, la semaine n’est pas « servie »', () => {
  it('503 smtp_absent, une seule ligne, aucune adresse au journal, verrou interrompu, notifications jamais doublées', async () => {
    await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Maison Lumen', plan: 'plus', onboardedAt: new Date() });
    await db!.insert(schema.users).values([{ id: ids.owner, email: `${ids.owner}@recap.test`, name: 'Anne' }, { id: ids.admin, email: `${ids.admin}@recap.test`, name: 'Ada' }]);
    await db!.insert(schema.workspaceMembers).values([{ workspaceId: ids.ws, userId: ids.owner, role: 'owner' }, { workspaceId: ids.ws, userId: ids.admin, role: 'admin' }]);
    await db!.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Lumen' });
    const veille = new Date(LUNDI.getTime() - 86_400_000);
    await db!.insert(schema.marketCreatives).values([1, 2].map((i) => ({ workspaceId: ids.ws, brandId: ids.brand, platform: 'meta', externalId: `t-${i}`, hookType: 'avant_apres', radarSignal: 'advertiser_scaling', reportedAt: veille })));

    const journal: string[] = [];
    const avis: string[] = [];
    const garder = (t: string[]) => (...a: unknown[]) => { t.push(a.map(String).join(' ')); };
    const espions = [
      vi.spyOn(console, 'error').mockImplementation(garder(journal)),
      vi.spyOn(console, 'log').mockImplementation(garder(journal)),
      vi.spyOn(console, 'warn').mockImplementation(garder(avis)),
    ];
    let r: Awaited<ReturnType<typeof passage>>;
    let relance: Awaited<ReturnType<typeof passage>>;
    try { r = await passage(); relance = await passage(); } finally { for (const e of espions) e.mockRestore(); }

    expect(r.status, 'sans SMTP, la route ne dit pas « configuration » (503 smtp_absent)').toBe(503);
    expect(r.corps).toMatchObject({ error: 'smtp_absent', notified: 2, mailed: 0, skippedMails: 2 });
    expect([...journal, ...avis].filter((x) => x.includes('@recap.test')), 'une adresse est écrite au journal').toEqual([]);
    expect(journal.filter((x) => x.includes('[mail:skip]')), 'des courriels ont été tentés sans SMTP').toEqual([]);
    const [l] = await db!.select({ value: schema.appSettings.value }).from(schema.appSettings).where(eq(schema.appSettings.key, cleVerrouRecap(LUNDI)));
    expect(lireEtatRecap(l?.value)?.etat).toBe('interrompu');
    expect(lireEtatRecap(l?.value)?.servis[ids.brand]?.courriels ?? [], 'un courriel sauté est noté envoyé').toEqual([]);
    expect(avis.filter((x) => x.includes('SMTP non configuré')), 'aucune ligne (ou plusieurs) pour un passage sans SMTP').toHaveLength(2); // une par passage · deux passages
    expect(relance!.status).toBe(503);
    expect(relance!.corps, 'la relance renvoie les notifications').toMatchObject({ notified: 0, skippedMails: 2 });
    const n = await db!.select({ id: schema.notifications.id }).from(schema.notifications).where(and(eq(schema.notifications.workspaceId, ids.ws), eq(schema.notifications.type, 'digest')));
    expect(n.length).toBe(2);
  });
});
