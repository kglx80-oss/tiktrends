import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Le récap hebdomadaire · UNE semaine, UN passage.
 *
 * La route `GET /api/cron/digest` écrit des notifications `digest` et envoie un
 * courriel à chaque propriétaire et administrateur d'une marque dont la semaine
 * porte quelque chose. Le worker la planifie désormais (`weekly-digest`) · et
 * une crontab hors dépôt peut déjà la taper sur la machine. Deux appels la même
 * semaine doublaient tout.
 *
 * On lit le RÉSULTAT · base réelle (pglite, migrations du dépôt), VRAIE route,
 * VRAI `sendMail` (seul le transport SMTP est remplacé, il compte les envois) ·
 * le nombre de lignes `notifications` et de courriels partis.
 * 0 $ · aucun appel réseau, aucun modèle.
 */

const h = vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  process.env.SMTP_URL = 'smtp://faux.exemple.test:25';
  process.env.CRON_SECRET = 'cron-de-test';
  return {
    courriels: [] as Array<{ to?: unknown; subject?: unknown }>,
    panne: false,
    ids: { ws: u(), brand: u(), owner: u(), admin: u(), membre: u() },
  };
});

vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: async (m: (typeof h.courriels)[number]) => { h.courriels.push(m); return { messageId: 'faux' }; } }) } }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
// Une panne AVANT tout envoi (la lecture des faits de la semaine) · le reste est la vraie lecture.
vi.mock('../lib/digest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/digest')>();
  return {
    ...actual,
    weeklyDigests: async (...a: Parameters<typeof actual.weeklyDigests>) => {
      if (h.panne) throw new Error('panne de lecture simulée');
      return actual.weeklyDigests(...a);
    },
  };
});

import { db, schema, eq, and } from '@tiktrends/db';
import { cleVerrouRecap } from '@tiktrends/core';
import { GET as cronRecap } from '../app/api/cron/digest/route';

const ids = h.ids;
const LUNDI = new Date('2026-11-16T06:47:00Z');         // lundi 07:47 à Paris · semaine 2026-W47
const LUNDI_SUIVANT = new Date('2026-11-23T06:47:00Z'); // semaine 2026-W48

type Reponse = { ok?: boolean; skipped?: string; week?: string; notified: number; mailed: number; error?: string };

async function passage(instant: Date): Promise<{ status: number; corps: Reponse }> {
  vi.useFakeTimers({ toFake: ['Date'], now: instant });
  try {
    const r = await cronRecap(new Request('http://localhost/api/cron/digest', { headers: { authorization: 'Bearer cron-de-test' } }));
    return { status: r.status, corps: await r.json() as Reponse };
  } finally { vi.useRealTimers(); }
}

async function notificationsRecap(): Promise<number> {
  return (await db!.select({ id: schema.notifications.id }).from(schema.notifications)
    .where(and(eq(schema.notifications.workspaceId, ids.ws), eq(schema.notifications.type, 'digest')))).length;
}

async function verrou(instant: Date): Promise<unknown> {
  const [l] = await db!.select({ value: schema.appSettings.value }).from(schema.appSettings).where(eq(schema.appSettings.key, cleVerrouRecap(instant)));
  return l?.value;
}

/** Deux trouvailles du radar la veille de `instant` · la semaine de la marque mérite un récap. */
async function trouvailles(instant: Date, tag: string): Promise<void> {
  const veille = new Date(instant.getTime() - 86_400_000);
  await db!.insert(schema.marketCreatives).values([1, 2].map((i) => ({
    workspaceId: ids.ws, brandId: ids.brand, platform: 'meta', externalId: `trouvaille-${tag}-${i}`, hookType: 'avant_apres', radarSignal: 'advertiser_scaling', reportedAt: veille,
  })));
}

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Maison Lumen', plan: 'plus', onboardedAt: new Date() });
  await db!.insert(schema.users).values([
    { id: ids.owner, email: `${ids.owner}@recap.test`, name: 'Anne' },
    { id: ids.admin, email: `${ids.admin}@recap.test`, name: 'Ada' },
    { id: ids.membre, email: `${ids.membre}@recap.test`, name: 'Zoé' },
  ]);
  await db!.insert(schema.workspaceMembers).values([
    { workspaceId: ids.ws, userId: ids.owner, role: 'owner' },
    { workspaceId: ids.ws, userId: ids.admin, role: 'admin' },
    { workspaceId: ids.ws, userId: ids.membre, role: 'member' },
  ]);
  await db!.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Lumen' });
  await trouvailles(LUNDI, 'w47');
});

afterEach(() => { h.panne = false; });

describe('le récap hebdomadaire · un seul passage par semaine ISO', () => {
  it('deux appels le même lundi · un seul jeu de notifications et de courriels', async () => {
    const premier = await passage(LUNDI);
    expect(premier.status).toBe(200);
    expect(premier.corps, 'préalable · le premier passage prévient la propriétaire et l’administratrice').toMatchObject({ ok: true, notified: 2, mailed: 2 });
    expect(await notificationsRecap()).toBe(2);
    expect(h.courriels.length).toBe(2);

    // Une crontab restée sur la machine, une relance à la main · même semaine, trois jours plus tard.
    const second = await passage(new Date(LUNDI.getTime() + 3 * 86_400_000));
    expect(second.status).toBe(200);
    expect(await notificationsRecap(), 'notifications du récap en double dans la même semaine').toBe(2);
    expect(h.courriels.length, 'courriels du récap en double dans la même semaine').toBe(2);
    expect(second.corps, 'le second passage de la semaine a renvoyé quelque chose').toMatchObject({ ok: true, skipped: 'deja_passe', week: '2026-W47', notified: 0, mailed: 0 });
    expect(premier.corps.week).toBe('2026-W47');
    expect(await verrou(LUNDI)).toMatchObject({ etat: 'fait', notified: 2, mailed: 2 });
  });

  it('deux appels SIMULTANÉS · un seul passe', async () => {
    const instant = new Date('2026-11-30T06:47:00Z'); // 2026-W49
    await trouvailles(instant, 'w49');
    const avant = { n: await notificationsRecap(), m: h.courriels.length };
    vi.useFakeTimers({ toFake: ['Date'], now: instant });
    let corps: Reponse[];
    try {
      const appel = () => cronRecap(new Request('http://localhost/api/cron/digest', { headers: { authorization: 'Bearer cron-de-test' } })).then((r) => r.json() as Promise<Reponse>);
      corps = await Promise.all([appel(), appel()]);
    } finally { vi.useRealTimers(); }
    expect(await notificationsRecap() - avant.n, 'deux passages simultanés · notifications du récap en double').toBe(2);
    expect(h.courriels.length - avant.m, 'deux passages simultanés · courriels du récap en double').toBe(2);
    expect(corps.filter((c) => c.skipped === 'deja_passe').length, 'deux passages simultanés ont tous deux envoyé').toBe(1);
  });

  it('la semaine suivante · la lettre repart (le verrou est par semaine, pas pour toujours)', async () => {
    await trouvailles(LUNDI_SUIVANT, 'w48');
    const avant = { n: await notificationsRecap(), m: h.courriels.length };
    const r = await passage(LUNDI_SUIVANT);
    expect(r.corps, 'la semaine suivante n’a pas reçu sa lettre').toMatchObject({ ok: true, notified: 2, mailed: 2 });
    expect(await notificationsRecap() - avant.n).toBe(2);
    expect(h.courriels.length - avant.m).toBe(2);
  });

  it('une panne avant tout envoi · le verrou est rendu, la relance de la semaine passe une fois', async () => {
    const instant = new Date('2026-12-07T06:47:00Z'); // 2026-W50
    await trouvailles(instant, 'w50');
    const avant = { n: await notificationsRecap(), m: h.courriels.length };
    h.panne = true;
    const casse = await passage(instant);
    expect(casse.status).toBe(500);
    expect(await verrou(instant), 'le verrou d’un passage qui n’a rien envoyé est resté pris').toBeUndefined();
    h.panne = false;
    const relance = await passage(instant);
    expect(relance.corps, 'la relance après une panne sans envoi n’est pas passée').toMatchObject({ ok: true, notified: 2, mailed: 2 });
    const encore = await passage(instant);
    expect(await notificationsRecap() - avant.n, 'après la relance · notifications du récap en double').toBe(2);
    expect(h.courriels.length - avant.m, 'après la relance · courriels du récap en double').toBe(2);
    expect(encore.corps.skipped).toBe('deja_passe');
  });
});
