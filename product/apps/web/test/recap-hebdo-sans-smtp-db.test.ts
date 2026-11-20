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
  return { ids: { ws: u(), brand: u(), owner: u(), admin: u(), wsB: u(), brandB: u(), ownerB: u() } };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

import { db, schema, eq, and, sql } from '@tiktrends/db';
import { cleVerrouRecap, lireEtatRecap, suiteRecap } from '@tiktrends/core';
import { GET as cronRecap } from '../app/api/cron/digest/route';

const ids = h.ids;
const LUNDI = new Date('2026-11-16T06:47:00Z');

async function passage(instant: Date = LUNDI): Promise<{ status: number; corps: Record<string, unknown> }> {
  vi.useFakeTimers({ toFake: ['Date'], now: instant });
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

  it('sans SMTP ET une marque en échec · 500 `digest_incomplet`, pas 503 · le worker retente, la marque est servie à la reprise', async () => {
    const instant = new Date('2026-11-23T06:47:00Z'); // 2026-W48
    await db!.insert(schema.workspaces).values({ id: ids.wsB, name: 'Atelier Brume', plan: 'plus', onboardedAt: new Date() });
    await db!.insert(schema.users).values({ id: ids.ownerB, email: `${ids.ownerB}@recap.test`, name: 'Bruno' });
    await db!.insert(schema.workspaceMembers).values({ workspaceId: ids.wsB, userId: ids.ownerB, role: 'owner' });
    await db!.insert(schema.brands).values({ id: ids.brandB, workspaceId: ids.wsB, name: 'Brume' });
    const veille = new Date(instant.getTime() - 86_400_000);
    await db!.insert(schema.marketCreatives).values([
      ...[1, 2].map((i) => ({ workspaceId: ids.ws, brandId: ids.brand, platform: 'meta', externalId: `w48-${i}`, hookType: 'avant_apres', radarSignal: 'advertiser_scaling', reportedAt: veille })),
      ...[1, 2].map((i) => ({ workspaceId: ids.wsB, brandId: ids.brandB, platform: 'meta', externalId: `w48b-${i}`, hookType: 'avant_apres', radarSignal: 'advertiser_scaling', reportedAt: veille })),
    ]);
    // Une VRAIE panne · la base refuse les notifications de l'espace B (comme `recap-hebdo-verrou-db`).
    await db!.execute(sql.raw(`create or replace function refuser_notif_test() returns trigger language plpgsql as $$ begin if new.workspace_id = '${ids.wsB}' then raise exception 'notification refusée (test)'; end if; return new; end $$;`));
    await db!.execute(sql.raw('create trigger refuser_notif_test before insert on notifications for each row execute function refuser_notif_test()'));

    const journal: string[] = [];
    const espions = (['error', 'log', 'warn'] as const).map((n) => vi.spyOn(console, n).mockImplementation((...a: unknown[]) => { journal.push(a.map(String).join(' ')); }));
    let r: Awaited<ReturnType<typeof passage>>;
    let reprise: Awaited<ReturnType<typeof passage>>;
    try {
      r = await passage(instant);
      await db!.execute(sql.raw('drop trigger if exists refuser_notif_test on notifications'));
      reprise = await passage(new Date(instant.getTime() + 60_000));
    } finally { for (const e of espions) e.mockRestore(); await db!.execute(sql.raw('drop trigger if exists refuser_notif_test on notifications')); }

    expect(r.status, 'une marque en échec sans SMTP répond 503 smtp_absent · le worker ne retente pas, ses notifications sont perdues').toBe(500);
    expect(r.corps).toMatchObject({ error: 'digest_incomplet', failedBrands: 1, notified: 2, skippedMails: 2 });
    expect(suiteRecap({ ok: false, status: r.status, detail: String(r.corps.error), corps: r.corps }, { reports: 0, tentative: 1, tentativesMax: 6 }).action, 'le worker ne retente pas la marque en échec').toBe('retenter');
    expect(journal.filter((x) => x.includes('@recap.test')), 'une adresse est écrite au journal').toEqual([]);
    // La VRAIE ligne journalisée par la route · elle dit ce qui a été servi, pas « lettres servies » quand une marque a échoué.
    const lignes = journal.filter((x) => x.includes('SMTP non configuré'));
    expect(lignes, 'le passage en échec, puis la reprise · une ligne « SMTP non configuré » chacun').toHaveLength(2);
    expect(lignes[0], 'une marque en échec sans SMTP est annoncée « lettres servies dans l’application »').toBe('[cron:digest] 2026-W48 · SMTP non configuré (SMTP_URL) · 1 lettre(s) servie(s) dans l’application · 1 marque(s) en échec, lettre(s) NON servie(s) · la tentative suivante les reprend · 2 courriel(s) non envoyé(s) · verrou laissé interrompu pour un rattrapage');
    expect(lignes[1], 'la reprise ne dit pas les deux lettres servies').toBe('[cron:digest] 2026-W48 · SMTP non configuré (SMTP_URL) · 2 lettre(s) servie(s) dans l’application · 3 courriel(s) non envoyé(s) · verrou laissé interrompu pour un rattrapage');
    expect(lignes.filter((x) => x.includes(ids.brand) || x.includes(ids.brandB) || x.includes(ids.ownerB)), 'un identifiant est écrit dans la ligne SMTP').toEqual([]);
    expect(reprise!.status, 'la reprise, marque réparée, reste sans SMTP').toBe(503);
    expect(reprise!.corps, 'la reprise ne sert pas la marque en échec, ou redouble la marque servie').toMatchObject({ error: 'smtp_absent', notified: 1, failedBrands: 0 });
    const nB = await db!.select({ id: schema.notifications.id }).from(schema.notifications).where(and(eq(schema.notifications.workspaceId, ids.wsB), eq(schema.notifications.type, 'digest')));
    expect(nB.length, 'la marque en échec n’a jamais reçu sa lettre').toBe(1);
  });
});
