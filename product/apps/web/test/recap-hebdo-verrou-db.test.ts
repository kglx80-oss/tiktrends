import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Le récap hebdomadaire · UNE semaine, UN jeu de lettres, qui se REPREND.
 *
 * La route `GET /api/cron/digest` écrit des notifications `digest` et envoie un
 * courriel à chaque propriétaire et administrateur d'une marque dont la semaine
 * porte quelque chose. Le worker la planifie (`weekly-digest`) et la retente ·
 * une crontab hors dépôt peut aussi la taper · le timer de déploiement peut la
 * tuer au milieu. Deux appels la même semaine doublaient tout ; un passage tué
 * ou en panne ne doit ni doubler ni perdre la semaine.
 *
 * On lit le RÉSULTAT · base réelle (pglite, migrations du dépôt), VRAIE route,
 * VRAIE lecture des faits, VRAI `sendMail` (seul le transport SMTP est
 * remplacé, il compte les envois et sait en refuser un) · le nombre de lignes
 * `notifications` et de courriels partis, et le verrou relu en base. Les
 * pannes sont RÉELLES · une insertion refusée par la base (déclencheur), une
 * table introuvable, un envoi refusé par le transport.
 * 0 $ · aucun appel réseau, aucun modèle.
 */

const h = vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  process.env.SMTP_URL = 'smtp://faux.exemple.test:25';
  process.env.CRON_SECRET = 'cron-de-test';
  return {
    courriels: [] as Array<{ to?: unknown; subject?: unknown }>,
    refuse: null as string | null,
    ids: { wsA: u(), wsB: u(), brandA: u(), brandB: u(), owner: u(), admin: u(), membre: u(), ownerB: u() },
  };
});

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: async (m: (typeof h.courriels)[number]) => {
        if (h.refuse && String(m.to) === h.refuse) throw new Error('550 boîte refusée (test)');
        h.courriels.push(m);
        return { messageId: 'faux' };
      },
    }),
  },
}));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

import { db, schema, eq, and, sql } from '@tiktrends/db';
import { avecCourrielRecap, avecMarquesRecap, avecNotificationRecap, cleVerrouRecap, etatInitialRecap, lireEtatRecap, SEUIL_ABANDON_RECAP_MS } from '@tiktrends/core';
import { GET as cronRecap } from '../app/api/cron/digest/route';

const ids = h.ids;
const LUNDI = new Date('2026-11-16T06:47:00Z');         // lundi 07:47 à Paris · semaine 2026-W47
const LUNDI_SUIVANT = new Date('2026-11-23T06:47:00Z'); // 2026-W48
const lundi = (iso: string) => new Date(`${iso}T06:47:00Z`);

type Reponse = { ok?: boolean; skipped?: string; week?: string; notified: number; mailed: number; error?: string; failedBrands?: number; failedMails?: number };

const appel = () => cronRecap(new Request('http://localhost/api/cron/digest', { headers: { authorization: 'Bearer cron-de-test' } }));

async function passage(instant: Date): Promise<{ status: number; corps: Reponse }> {
  vi.useFakeTimers({ toFake: ['Date'], now: instant });
  try {
    const r = await appel();
    return { status: r.status, corps: await r.json() as Reponse };
  } finally { vi.useRealTimers(); }
}

async function notificationsRecap(ws: string = ids.wsA): Promise<number> {
  return (await db!.select({ id: schema.notifications.id }).from(schema.notifications)
    .where(and(eq(schema.notifications.workspaceId, ws), eq(schema.notifications.type, 'digest')))).length;
}
const courrielsA = () => h.courriels.filter((c) => [ids.owner, ids.admin].some((u) => String(c.to).startsWith(u))).length;
const courrielsB = () => h.courriels.filter((c) => String(c.to).startsWith(ids.ownerB)).length;

async function verrou(instant: Date) {
  const [l] = await db!.select({ value: schema.appSettings.value }).from(schema.appSettings).where(eq(schema.appSettings.key, cleVerrouRecap(instant)));
  return l?.value as Record<string, unknown> | undefined;
}

/** Deux trouvailles du radar la veille de `instant` · la semaine de la marque mérite un récap. */
async function trouvailles(instant: Date, tag: string, ws = ids.wsA, brand = ids.brandA): Promise<void> {
  const veille = new Date(instant.getTime() - 86_400_000);
  await db!.insert(schema.marketCreatives).values([1, 2].map((i) => ({
    workspaceId: ws, brandId: brand, platform: 'meta', externalId: `trouvaille-${tag}-${i}`, hookType: 'avant_apres', radarSignal: 'advertiser_scaling', reportedAt: veille,
  })));
}

/** Une VRAIE panne d'insertion · la base refuse les notifications de l'espace `ws` (ou de tous). */
async function refuserNotifications(ws: string | null): Promise<void> {
  const cond = ws ? `new.workspace_id = '${ws}'` : 'true';
  await db!.execute(sql.raw(`create or replace function refuser_notif_test() returns trigger language plpgsql as $$ begin if ${cond} then raise exception 'notification refusée (test)'; end if; return new; end $$;`));
  await db!.execute(sql.raw('drop trigger if exists refuser_notif_test on notifications'));
  await db!.execute(sql.raw('create trigger refuser_notif_test before insert on notifications for each row execute function refuser_notif_test()'));
}
async function accepterNotifications(): Promise<void> {
  await db!.execute(sql.raw('drop trigger if exists refuser_notif_test on notifications;'));
}

beforeAll(async () => {
  await db!.insert(schema.workspaces).values([
    { id: ids.wsA, name: 'Maison Lumen', plan: 'plus', onboardedAt: new Date() },
    { id: ids.wsB, name: 'Atelier Brume', plan: 'plus', onboardedAt: new Date() },
  ]);
  await db!.insert(schema.users).values([
    { id: ids.owner, email: `${ids.owner}@recap.test`, name: 'Anne' },
    { id: ids.admin, email: `${ids.admin}@recap.test`, name: 'Ada' },
    { id: ids.membre, email: `${ids.membre}@recap.test`, name: 'Zoé' },
    { id: ids.ownerB, email: `${ids.ownerB}@recap.test`, name: 'Bruno' },
  ]);
  await db!.insert(schema.workspaceMembers).values([
    { workspaceId: ids.wsA, userId: ids.owner, role: 'owner' },
    { workspaceId: ids.wsA, userId: ids.admin, role: 'admin' },
    { workspaceId: ids.wsA, userId: ids.membre, role: 'member' },
    { workspaceId: ids.wsB, userId: ids.ownerB, role: 'owner' },
  ]);
  await db!.insert(schema.brands).values([
    { id: ids.brandA, workspaceId: ids.wsA, name: 'Lumen' },
    { id: ids.brandB, workspaceId: ids.wsB, name: 'Brume' },
  ]);
  await trouvailles(LUNDI, 'w47');
});

describe('le récap hebdomadaire · un seul passage par semaine ISO', () => {
  it('deux appels le même lundi · un seul jeu de notifications et de courriels', async () => {
    const premier = await passage(LUNDI);
    expect(premier.status).toBe(200);
    expect(premier.corps, 'préalable · le premier passage prévient la propriétaire et l’administratrice').toMatchObject({ ok: true, notified: 2, mailed: 2 });
    expect(await notificationsRecap()).toBe(2);
    expect(courrielsA()).toBe(2);

    // Une crontab restée sur la machine, une relance à la main · même semaine, trois jours plus tard.
    const second = await passage(new Date(LUNDI.getTime() + 3 * 86_400_000));
    expect(second.status).toBe(200);
    expect(await notificationsRecap(), 'notifications du récap en double dans la même semaine').toBe(2);
    expect(courrielsA(), 'courriels du récap en double dans la même semaine').toBe(2);
    expect(second.corps, 'le second passage de la semaine a renvoyé quelque chose').toMatchObject({ ok: true, skipped: 'deja_passe', week: '2026-W47', notified: 0, mailed: 0 });
    expect(premier.corps.week).toBe('2026-W47');
    expect(await verrou(LUNDI)).toMatchObject({ etat: 'fait' });
  });

  it('deux appels SIMULTANÉS · un seul jeu de lettres', async () => {
    const instant = lundi('2026-11-30'); // 2026-W49
    await trouvailles(instant, 'w49');
    const avant = { n: await notificationsRecap(), m: courrielsA() };
    vi.useFakeTimers({ toFake: ['Date'], now: instant });
    let corps: Reponse[];
    try {
      corps = await Promise.all([appel(), appel()].map((p) => p.then((r) => r.json() as Promise<Reponse>)));
    } finally { vi.useRealTimers(); }
    expect(await notificationsRecap() - avant.n, 'deux passages simultanés · notifications du récap en double').toBe(2);
    expect(courrielsA() - avant.m, 'deux passages simultanés · courriels du récap en double').toBe(2);
    expect(corps.filter((c) => c.skipped === 'deja_passe' || c.error === 'en_cours').length, 'deux passages simultanés ont tous deux servi').toBe(1);
  });

  it('la semaine suivante · la lettre repart (le verrou est par semaine, pas pour toujours)', async () => {
    await trouvailles(LUNDI_SUIVANT, 'w48');
    const avant = { n: await notificationsRecap(), m: courrielsA() };
    const r = await passage(LUNDI_SUIVANT);
    expect(r.corps, 'la semaine suivante n’a pas reçu sa lettre').toMatchObject({ ok: true, notified: 2, mailed: 2 });
    expect(await notificationsRecap() - avant.n).toBe(2);
    expect(courrielsA() - avant.m).toBe(2);
  });
});

describe('un passage interrompu après la marque 1 sur 2 · la relance sert la marque 2, ne double pas la marque 1', () => {
  it('panne sur la marque 2, puis passage TUÉ (verrou resté « en cours ») · 409 tant qu’il bat, reprise une fois muet', async () => {
    const instant = lundi('2026-12-07'); // 2026-W50
    await trouvailles(instant, 'w50');
    await trouvailles(instant, 'w50b', ids.wsB, ids.brandB);
    const avant = { a: await notificationsRecap(ids.wsA), b: await notificationsRecap(ids.wsB), ma: courrielsA(), mb: courrielsB() };

    await refuserNotifications(ids.wsB);
    let r: Awaited<ReturnType<typeof passage>>;
    try { r = await passage(instant); } finally { await accepterNotifications(); }
    expect(r.status, 'une marque en échec doit faire échouer le passage (le worker retente)').toBe(500);
    expect(r.corps).toMatchObject({ error: 'digest_incomplet', notified: 2, failedBrands: 1 });
    expect(await notificationsRecap(ids.wsA) - avant.a, 'préalable · la marque 1 est servie').toBe(2);
    expect(await notificationsRecap(ids.wsB) - avant.b, 'préalable · la marque 2 ne l’est pas').toBe(0);
    expect((await verrou(instant))?.etat, 'un passage en échec a été classé « fait »').toBe('interrompu');

    // Le processus tué à ce moment-là · rien n'a écrit « interrompu », le verrou dit encore « en cours ».
    const tue = async (muetMs: number) => {
      const v = await verrou(instant);
      await db!.update(schema.appSettings).set({ value: { ...v, etat: 'en_cours', battement: new Date(instant.getTime() - muetMs).toISOString() } }).where(eq(schema.appSettings.key, cleVerrouRecap(instant)));
    };
    await tue(60_000);
    const pendant = await passage(instant);
    expect(pendant.status, 'un passage qui bat encore a été doublé').toBe(409);
    expect(pendant.corps.error).toBe('en_cours');

    await tue(SEUIL_ABANDON_RECAP_MS + 60_000);
    const reprise = await passage(instant);
    expect(reprise.status, 'un verrou abandonné n’est pas repris').toBe(200);
    expect(reprise.corps.skipped).toBeUndefined();
    expect(await notificationsRecap(ids.wsB) - avant.b, 'la reprise n’a pas servi la marque 2').toBe(1);
    expect(courrielsB() - avant.mb).toBe(1);
    expect(await notificationsRecap(ids.wsA) - avant.a, 'la reprise a doublé les notifications de la marque 1').toBe(2);
    expect(courrielsA() - avant.ma, 'la reprise a doublé les courriels de la marque 1').toBe(2);
    expect(lireEtatRecap(await verrou(instant))).toMatchObject({ etat: 'fait', reprises: 1 });

    const encore = await passage(instant);
    expect(encore.corps.skipped).toBe('deja_passe');
  });
});

describe('une panne RÉELLE · jamais « fait », la relance sert une fois', () => {
  it('la liste des marques illisible · 500, verrou interrompu, la relance sert', async () => {
    const instant = lundi('2026-12-14'); // 2026-W51
    await trouvailles(instant, 'w51');
    const avant = { n: await notificationsRecap(), m: courrielsA() };
    await db!.execute(sql.raw('alter table brands rename to brands_en_panne_test'));
    let r: Awaited<ReturnType<typeof passage>>;
    try { r = await passage(instant); } finally { await db!.execute(sql.raw('alter table brands_en_panne_test rename to brands')); }
    expect(r.status, 'une liste des marques illisible a été prise pour une semaine vide').toBe(500);
    expect((await verrou(instant))?.etat, 'une liste des marques illisible a classé la semaine « fait »').toBe('interrompu');
    const relance = await passage(instant);
    expect(relance.corps).toMatchObject({ ok: true, notified: 2, mailed: 2 });
    expect(await notificationsRecap() - avant.n).toBe(2);
    expect(courrielsA() - avant.m).toBe(2);
  });

  it('toutes les notifications refusées par la base · rien n’est compté, verrou interrompu, la relance sert une fois', async () => {
    const instant = lundi('2026-12-21'); // 2026-W52
    await trouvailles(instant, 'w52');
    const avant = { n: await notificationsRecap(), m: courrielsA() };
    await refuserNotifications(null);
    let r: Awaited<ReturnType<typeof passage>>;
    try { r = await passage(instant); } finally { await accepterNotifications(); }
    expect(r.status).toBe(500);
    expect(r.corps.notified, 'des tentatives refusées sont comptées comme notifications').toBe(0);
    expect(await notificationsRecap() - avant.n).toBe(0);
    const v = lireEtatRecap(await verrou(instant));
    expect(v?.etat, 'des notifications refusées ont classé la semaine « fait »').toBe('interrompu');
    expect(v?.servis[ids.brandA]?.notifies ?? [], 'un refus est noté « servi »').toEqual([]);
    const relance = await passage(instant);
    expect(relance.corps).toMatchObject({ ok: true, notified: 2 });
    expect(await notificationsRecap() - avant.n).toBe(2);
    // Les courriels de la marque n'étaient pas partis (la marque a échoué avant) · ils partent à la relance, une fois.
    expect(courrielsA() - avant.m).toBe(2);
  });

  it('un courriel refusé par le service d’envoi · 500 et console.error, la relance ne renvoie que lui', async () => {
    const instant = lundi('2026-12-28'); // 2026-W53
    await trouvailles(instant, 'w53');
    const avant = { n: await notificationsRecap(), m: courrielsA() };
    const erreurs: string[] = [];
    const espion = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { erreurs.push(a.map(String).join(' ')); });
    h.refuse = `${ids.admin}@recap.test`;
    let r: Awaited<ReturnType<typeof passage>>;
    try { r = await passage(instant); } finally { h.refuse = null; espion.mockRestore(); }
    expect(r.status).toBe(500);
    expect(r.corps).toMatchObject({ error: 'digest_incomplet', notified: 2, mailed: 1, failedMails: 1 });
    expect(erreurs.some((e) => e.includes('1 courriel(s) attendu(s) non parti(s)')), 'aucun console.error pour un courriel attendu non parti').toBe(true);
    const relance = await passage(instant);
    expect(relance.corps).toMatchObject({ ok: true, notified: 0, mailed: 1 });
    expect(await notificationsRecap() - avant.n, 'la relance a doublé les notifications').toBe(2);
    expect(courrielsA() - avant.m, 'la relance a renvoyé le courriel déjà parti').toBe(2);
  });
});

// En dernier · les trouvailles de 2027 entrent dans la fenêtre (bornée en bas seulement) des passages antérieurs.
describe('reprises · un passage interrompu ou tué', () => {
  it('un passage « interrompu » (erreur rattrapée) · la relance reprend tout de suite, sans attendre le seuil', async () => {
    const instant = lundi('2027-01-04'); // 2027-W01
    await trouvailles(instant, 'w01');
    await trouvailles(instant, 'w01b', ids.wsB, ids.brandB);
    const avant = { a: await notificationsRecap(ids.wsA), b: await notificationsRecap(ids.wsB) };
    await refuserNotifications(ids.wsB);
    try { expect((await passage(instant)).status).toBe(500); } finally { await accepterNotifications(); }
    const relance = await passage(new Date(instant.getTime() + 60_000));
    expect(relance.corps, 'la relance d’un passage interrompu n’a pas repris').toMatchObject({ ok: true, notified: 1 });
    expect(await notificationsRecap(ids.wsA) - avant.a).toBe(2);
    expect(await notificationsRecap(ids.wsB) - avant.b).toBe(1);
  });

  it('un passage TUÉ après la marque 1 (redéploiement) · le verrou « en cours » muet est repris, la marque 2 servie, la marque 1 pas doublée', async () => {
    const instant = lundi('2027-01-11'); // 2027-W02
    await trouvailles(instant, 'w02');
    await trouvailles(instant, 'w02b', ids.wsB, ids.brandB);
    // Ce qu'un passage tué laisse en base · la marque 1 servie et notée, le verrou « en cours », plus de battement.
    const t = new Date(instant.getTime() - SEUIL_ABANDON_RECAP_MS - 60_000);
    let e = avecMarquesRecap(etatInitialRecap('passage-tue', t), [ids.brandA, ids.brandB], t);
    for (const u of [ids.owner, ids.admin]) e = avecCourrielRecap(avecNotificationRecap(e, ids.brandA, u, t), ids.brandA, u, t);
    await db!.insert(schema.appSettings).values({ key: cleVerrouRecap(instant), value: e });
    const avant = { a: await notificationsRecap(ids.wsA), b: await notificationsRecap(ids.wsB), ma: courrielsA(), mb: courrielsB() };

    const r = await passage(instant);
    expect(r.corps.skipped, 'un verrou abandonné répond « déjà passé » · la marque 2 est perdue pour la semaine').toBeUndefined();
    expect(await notificationsRecap(ids.wsB) - avant.b, 'la reprise n’a pas servi la marque 2').toBe(1);
    expect(courrielsB() - avant.mb).toBe(1);
    expect(await notificationsRecap(ids.wsA) - avant.a, 'la reprise a doublé les notifications de la marque 1').toBe(0);
    expect(courrielsA() - avant.ma, 'la reprise a doublé les courriels de la marque 1').toBe(0);
    expect(r.corps).toMatchObject({ ok: true, notified: 1, mailed: 1 });
  });
});
