// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * La cloche (centre de notifications de la coquille, bandeau d'arrivée) et
 * « Quoi de neuf » de l'Accueil relisent le récap hebdomadaire (`digest`) et
 * le compte rendu du radar (`radar`) contre le droit ACTUEL de les lire · la
 * règle EXISTANTE de chacun, sous le rôle et la formule ACTUELS de l'espace DE
 * la notification · base RÉELLE (pglite, migrations du dépôt), VRAI récap (la
 * route du cron `GET /api/cron/digest`, qui écrit les notifications), VRAIE
 * action de la cloche (`fetchNotifications`), VRAI panneau rendu puis monté,
 * VRAIE page Radar de veille (`/adsmap/radar`) pour la parité · on lit le DOM
 * et la valeur renvoyée au client.
 *
 *  · le récap · réservé aux propriétaires et administrateurs de son espace
 *    (les destinataires du cron, `destinataireRecap`) · repassée membre ou
 *    retirée de l'espace · « Récap · réservé aux administrateurs de
 *    l'espace », sans texte ni lien ;
 *  · le radar · la règle de la page Radar de veille · la rubrique Résultats
 *    ouverte (rôle et formule, `gardeResultats`) ET administratrice · un
 *    membre (que l'émetteur prévient aussi), une formule sans Résultats, un
 *    retrait · « Radar de veille · plus accessible avec tes droits actuels » ;
 *  · qui a le droit · tout s'affiche EXACTEMENT comme avant (la ligne brute et
 *    la capture prise sur main 51507ba) ;
 *  · la cloche n'est PAS bornée à l'espace courant (décision de Kevin en
 *    attente) · l'espace d'une notification où la personne administre encore
 *    est montré comme aujourd'hui ;
 *  · le compte non lu ne bouge pas, rien n'est écrit ;
 *  · le coût · UNE requête pour le lot d'espaces, jamais une par notification ·
 *    une cloche sans récap ni radar garde son nombre de requêtes.
 *
 * Le compte rendu du radar est écrit comme `notifier` (W/lib/radar.ts) l'écrit
 * (le passage réel appelle la source et un modèle · 0 $ ici) · même type,
 * titre, adresse, destinataires (membres hors lecteurs client), texte composé
 * par la VRAIE règle (`radarDigest`). 0 $ · aucun appel réseau, aucun modèle.
 * Aucune date « à venir » (les trouvailles datent d'hier).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SessionT = { user: { id: string; email: string; name: string | null }; workspaceId: string; workspaceName: string; role: 'owner' | 'admin' | 'member' | 'client_viewer'; plan: string; equipe: null };
const h = vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return {
    session: null as SessionT | null, marque: null as string | null, requetes: [] as string[],
    ids: { wsA: u(), wsB: u(), brandA: u(), brandB: u(), ua: u(), ud: u(), um: u(), uv: u(), up: u() },
  };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  type Client = { query: (t: unknown, ...r: unknown[]) => Promise<unknown>; transaction: (cb: (tx: Client) => Promise<unknown>) => Promise<unknown> };
  const espionner = (c: Client) => { const q = c.query.bind(c); c.query = (t, ...r) => { h.requetes.push(String(t)); return q(t, ...r); }; };
  const client = (db as unknown as { session: { client: Client } }).session.client;
  espionner(client);
  const tr = client.transaction.bind(client);
  client.transaction = (cb) => tr((tx) => { espionner(tx); return cb(tx); });
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/dashboard', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/dashboard', host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));
// Un SMTP configuré et un envoi RÉUSSI simulés · sans SMTP, le récap répond 503 `smtp_absent` et laisse la semaine interrompue.
vi.mock('../lib/mailer', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/mailer')>()), smtpConfigure: () => true, sendMail: async () => ({ ok: true }) }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));

import { db, schema, eq, and } from '@tiktrends/db';
import { cleVerrouRecap, radarDigest } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import { GET as cronRecap } from '../app/api/cron/digest/route';
import { fetchNotifications, type NotifItem } from '../app/actions/notifications';
import { BandeauNotification, VueNotifications, useNotifications } from '../spatial/coquille/Notifications';
import { chargerAccueilSpatial } from '../app/(spatial)/sp/dashboard/chargement';
import { RefusResultats } from '../spatial/vues/resultats/communs';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 300_000 });

const ids = h.ids;
const RECAP = 'Récap · réservé aux administrateurs de l’espace';
const RAISON_RECAP = 'Le récap de la semaine est réservé aux propriétaires et administrateurs de son espace · son texte n’est pas montré.';
const RADAR = 'Radar de veille · plus accessible avec tes droits actuels';
const RAISON_RADAR = 'Le radar de veille est réservé aux administrateurs de l’espace, sur une formule qui ouvre Résultats · son texte n’est pas montré.';
const SECRETS = /SECRET_/;
const MARQUE_A = 'Lumen SECRET_MARQUE';
const TROUVAILLE = 'SECRET_TROUVAILLE · l’accroche « avant / après » tient 21 jours chez Brume';

const qui = (id: string, nom: string, ws: string, role: SessionT['role']): SessionT => ({
  user: { id, email: `${id}@recap.test`, name: nom }, workspaceId: ws, workspaceName: ws === ids.wsA ? 'Maison Lumen' : 'Atelier Brume', role, plan: 'plus', equipe: null,
});
const anne = () => qui(ids.ua, 'Anne Propriétaire', ids.wsA, 'owner');
const ada = (role: SessionT['role'] = 'admin', ws = ids.wsA) => qui(ids.ud, 'Ada Admin', ws, role);
const zoe = () => qui(ids.um, 'Zoé Membre', ids.wsA, 'member');
const paul = () => qui(ids.up, 'Paul Ordinaire', ids.wsB, 'member');

/** Le compte rendu du radar, écrit comme `notifier` (W/lib/radar.ts) · membres hors lecteurs client, texte de `radarDigest`. */
async function radarCommeNotifier(workspaceId: string): Promise<void> {
  const corps = radarDigest([{ externalId: 'x1', advertiser: 'Brume', signal: 'advertiser_scaling', daysRunning: 21, traits: ['avant_apres'], unexplored: true, headline: TROUVAILLE }]);
  const membres = await db!.select({ uid: schema.workspaceMembers.userId, role: schema.workspaceMembers.role }).from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, workspaceId));
  const cibles = membres.filter((m) => m.role !== 'client_viewer').map((m) => m.uid);
  await db!.insert(schema.notifications).values(cibles.map((uid) => ({ workspaceId, userId: uid, type: 'radar', title: 'Radar de veille', body: corps.slice(0, 400), href: '/adsmap/radar' })));
}

/**
 * La VRAIE route du récap (cron du lundi) · elle écrit les notifications `digest`.
 * Elle ne passe qu'une fois par semaine (verrou `digest:<semaine>`) · chaque
 * relance du test joue une semaine NOUVELLE, on rend donc le verrou d'abord.
 */
async function lancerRecap(): Promise<{ notified: number }> {
  await db!.delete(schema.appSettings).where(eq(schema.appSettings.key, cleVerrouRecap(new Date())));
  vi.stubEnv('CRON_SECRET', 'cron-de-test');
  try {
    const r = await cronRecap(new Request('http://localhost/api/cron/digest', { headers: { authorization: 'Bearer cron-de-test' } }));
    expect(r.status, 'la route du récap a échoué').toBe(200);
    return await r.json() as { notified: number };
  } finally { vi.unstubAllEnvs(); }
}

beforeAll(async () => {
  await db!.insert(schema.workspaces).values([
    { id: ids.wsA, name: 'Maison Lumen', plan: 'plus', onboardedAt: new Date() },
    { id: ids.wsB, name: 'Atelier Brume', plan: 'plus', onboardedAt: new Date() },
  ]);
  await db!.insert(schema.users).values([
    { id: ids.ua, email: `${ids.ua}@recap.test`, name: 'Anne Propriétaire' }, { id: ids.ud, email: `${ids.ud}@recap.test`, name: 'Ada Admin' },
    { id: ids.um, email: `${ids.um}@recap.test`, name: 'Zoé Membre' }, { id: ids.uv, email: `${ids.uv}@recap.test`, name: 'Vic Lecteur' },
    { id: ids.up, email: `${ids.up}@recap.test`, name: 'Paul Ordinaire' },
  ]);
  await db!.insert(schema.workspaceMembers).values([
    { workspaceId: ids.wsA, userId: ids.ua, role: 'owner' }, { workspaceId: ids.wsA, userId: ids.ud, role: 'admin' },
    { workspaceId: ids.wsA, userId: ids.um, role: 'member' }, { workspaceId: ids.wsA, userId: ids.uv, role: 'client_viewer' },
    // Ada est AUSSI membre de B · c'est là que s'ouvre sa session une fois retirée de A. Paul n'est que de B.
    { workspaceId: ids.wsB, userId: ids.ud, role: 'member' }, { workspaceId: ids.wsB, userId: ids.up, role: 'member' },
  ]);
  await db!.insert(schema.brands).values([{ id: ids.brandA, workspaceId: ids.wsA, name: MARQUE_A }, { id: ids.brandB, workspaceId: ids.wsB, name: 'Brume' }]);
  // Deux trouvailles d'hier chez A, sur une voie jamais testée · la semaine de A mérite un récap, celle de B non.
  const hier = new Date(Date.now() - 86_400_000);
  await db!.insert(schema.marketCreatives).values([1, 2].map((i) => ({
    workspaceId: ids.wsA, brandId: ids.brandA, platform: 'meta', externalId: `trouvaille-${i}`, hookType: 'avant_apres', radarSignal: 'advertiser_scaling', reportedAt: hier,
  })));
  const r = await lancerRecap();
  expect(r.notified, 'préalable · le VRAI récap prévient la propriétaire et l’administratrice de A').toBe(2);
  await radarCommeNotifier(ids.wsA);
  // Paul · que des notifications ordinaires (aucun récap, aucun radar · le suivi des concurrents).
  await db!.insert(schema.notifications).values(Array.from({ length: 30 }, (_, i) => ({ workspaceId: ids.wsB, userId: ids.up, type: 'tracker', title: `${i} nouvelles pubs`, body: 'Tes concurrents ont publié', href: '/saved' })));
}, 300_000);

/* ───────────────────────────── outils ───────────────────────────── */

let root: Root | null = null;
const MAINTENANT = new Date();
const rien = () => {};
beforeEach(() => { h.session = ada(); h.marque = ids.brandA; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const panneau = (items: NotifItem[], nonLues: number) => renderToStaticMarkup(avecSpatial(
  <section className="notif glass" id="notif" aria-label="Notifications">
    <VueNotifications items={items} nonLues={nonLues} filtre="tout" maintenant={MAINTENANT} onFiltre={rien} onToutLire={rien} onOuvrir={rien} onMarquer={rien} />
  </section>,
));
/** La lecture de main · la ligne BRUTE de la table, telle que la cloche la renvoyait. */
async function brutes(userId: string, ordre?: NotifItem[]): Promise<NotifItem[]> {
  const N = schema.notifications;
  const l = (await db!.select().from(N).where(eq(N.userId, userId))).map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, href: r.href, read: r.readAt != null, createdAt: (r.createdAt as Date).toISOString() }));
  if (!ordre) return l;
  const par = new Map(l.map((n) => [n.id, n]));
  return ordre.map((n) => par.get(n.id)!);
}
const brute = async (userId: string, type: string) => {
  const l = (await brutes(userId)).filter((n) => n.type === type);
  expect(l, `une seule notification « ${type} »`).toHaveLength(1);
  return l[0]!;
};
async function traces() {
  const N = schema.notifications;
  return {
    notifs: (await db!.select({ id: N.id, lue: N.readAt, t: N.title, b: N.body, hr: N.href }).from(N)).map((n) => `${n.id}:${n.lue ? 'lue' : 'non'}:${n.t}:${n.b}:${n.hr}`).sort(),
    membres: (await db!.select().from(schema.workspaceMembers)).map((m) => `${m.workspaceId}:${m.userId}:${m.role}`).sort(),
    espaces: (await db!.select().from(schema.workspaces)).map((w) => `${w.id}:${w.plan}`).sort(),
    depense: (await db!.select().from(schema.aiSpend)).length,
  };
}
const nonLuesEnBase = async (userId: string) => (await brutes(userId)).filter((n) => !n.read).length;
const article = (d: ParentNode, id: string) => d.querySelector(`article[data-nid="${id}"]`);
const M = schema.workspaceMembers;
const W = schema.workspaces;
async function avecRole<T>(userId: string, role: SessionT['role'], f: () => Promise<T>): Promise<T> {
  const [avant] = await db!.select().from(M).where(and(eq(M.userId, userId), eq(M.workspaceId, ids.wsA)));
  await db!.update(M).set({ role }).where(and(eq(M.userId, userId), eq(M.workspaceId, ids.wsA)));
  try { return await f(); } finally { await db!.update(M).set({ role: avant!.role }).where(and(eq(M.userId, userId), eq(M.workspaceId, ids.wsA))); }
}
async function retireeDeA<T>(f: () => Promise<T>): Promise<T> {
  await db!.delete(M).where(and(eq(M.userId, ids.ud), eq(M.workspaceId, ids.wsA)));
  h.session = ada('member', ids.wsB);
  try { return await f(); } finally { await db!.insert(M).values({ workspaceId: ids.wsA, userId: ids.ud, role: 'admin' }); }
}
async function formule<T>(plan: string, f: () => Promise<T>): Promise<T> {
  await db!.update(W).set({ plan }).where(eq(W.id, ids.wsA));
  try { return await f(); } finally { await db!.update(W).set({ plan: 'plus' }).where(eq(W.id, ids.wsA)); }
}

/**
 * La capture prise sur main 51507ba (avant toute modification) · ce que
 * renvoyait la cloche d'Ada, administratrice de A (titre, texte, lien) · le
 * récap du VRAI cron et le compte rendu du radar.
 */
const CAPTURE_MAIN_ADA = [
  {
    type: 'digest', title: `2 piste(s) jamais testée(s) tiennent chez les concurrents de ${MARQUE_A}.`,
    body: `2 piste(s) jamais testée(s) tiennent chez les concurrents de ${MARQUE_A}.\nRadar · 2 trouvaille(s), dont 2 sur une voie jamais testée.\n→ Regarder ce que le radar a trouvé · 2 piste(s) que tu n'as jamais testée(s) tiennent chez tes concurrents.`,
    href: '/adsmap/radar',
  },
  { type: 'radar', title: 'Radar de veille', body: `1 piste(s) que tu n'as jamais testée(s) tiennent chez tes concurrents. ${TROUVAILLE}`, href: '/adsmap/radar' },
];
const normaliser = (items: NotifItem[]) => items.map((n) => ({ type: n.type, title: n.title, body: n.body, href: n.href })).sort((a, b) => a.type.localeCompare(b.type));

/* ───────────────────────────── 1 · qui a le droit, rien ne change ───────────────────────────── */

describe('qui a le droit · la cloche s’affiche exactement comme avant', () => {
  it('Ada administratrice de A · récap et radar égaux à la ligne brute ET à la capture prise sur main · même HTML du panneau · rien n’est écrit', async () => {
    const avant = await traces();
    const r = await fetchNotifications();
    expect(r.items.length, 'préalable · le récap et le radar ont prévenu Ada').toBe(2);
    expect(r.items, 'une administratrice actuelle ne voit plus son récap ou son radar comme avant').toEqual(await brutes(ids.ud, r.items));
    expect(normaliser(r.items), 'écart avec la capture prise sur main').toEqual(CAPTURE_MAIN_ADA);
    expect(panneau(r.items, r.unread), 'le rendu du panneau a changé pour qui a le droit').toBe(panneau(await brutes(ids.ud, r.items), r.unread));
    expect(await traces(), 'lire la cloche a écrit').toEqual(avant);
  });

  it('Anne propriétaire · ses deux notifications lues comme avant', async () => {
    h.session = anne();
    const r = await fetchNotifications();
    expect(r.items.length).toBe(2);
    expect(r.items).toEqual(await brutes(ids.ua, r.items));
  });
});

/* ───────────────────────────── 2 · le droit perdu, rien ne fuit ───────────────────────────── */

describe('le droit perdu · la notification reste, sans titre, ni texte, ni lien', () => {
  it('Ada repassée membre · récap et radar neutres · aucun SECRET dans la valeur renvoyée ni dans le panneau · compte inchangé · rien n’est écrit', async () => {
    const avantCompte = (await fetchNotifications()).unread;
    const { r, html, avant, apres } = await avecRole(ids.ud, 'member', async () => {
      h.session = ada('member');
      const avant = await traces();
      const r = await fetchNotifications();
      return { r, html: panneau(r.items, r.unread), avant, apres: await traces() };
    });
    expect(JSON.stringify(r), 'la valeur renvoyée au client laisse fuir le récap ou le radar').not.toMatch(SECRETS);
    expect(html, 'le panneau laisse fuir le récap ou le radar').not.toMatch(SECRETS);
    expect(r.unread, 'le compte de la cloche a changé').toBe(avantCompte);
    expect(r.items.map((n) => n.id).sort(), 'une notification a disparu').toEqual((await brutes(ids.ud)).map((n) => n.id).sort());
    const d = dom(html);
    for (const [type, titre, raison] of [['digest', RECAP, RAISON_RECAP], ['radar', RADAR, RAISON_RADAR]] as const) {
      const n = await brute(ids.ud, type);
      expect(r.items.find((i) => i.id === n.id), `« ${type} » · droit perdu`).toMatchObject({ title: titre, body: raison, href: null });
      const a = article(d, n.id)!;
      expect(texte(a.querySelector('strong'))).toBe(titre);
      expect(texte(a.querySelector('p'))).toBe(raison);
      expect(a.querySelector('[data-nread]'), `un lien « Ouvrir » reste sur « ${type} »`).toBeNull();
    }
    expect(apres, 'relire la cloche a écrit ou changé un droit').toEqual(avant);
  });

  it('Ada retirée de l’espace A (session dans B) · récap et radar de A neutres · aucun SECRET', async () => {
    const r = await retireeDeA(() => fetchNotifications());
    expect(JSON.stringify(r), 'une ex-administratrice retirée de l’espace lit encore le récap ou le radar').not.toMatch(SECRETS);
    expect(r.items.find((i) => i.type === 'digest')).toMatchObject({ title: RECAP, body: RAISON_RECAP, href: null });
    expect(r.items.find((i) => i.type === 'radar')).toMatchObject({ title: RADAR, body: RAISON_RADAR, href: null });
  });

  it('Zoé, membre · l’émetteur la prévient du radar, mais la page Radar de veille est réservée aux administrateurs · texte non montré', async () => {
    h.session = zoe();
    const r = await fetchNotifications();
    expect(r.items.map((i) => i.type), 'préalable · Zoé n’a que le radar (le récap va aux administrateurs)').toEqual(['radar']);
    expect(JSON.stringify(r), 'un membre lit le compte rendu du radar').not.toMatch(SECRETS);
    expect(r.items[0]).toMatchObject({ title: RADAR, body: RAISON_RADAR, href: null });
  });

  it('formule sans Résultats (Core) · Ada administratrice · le radar se ferme (la page le refuse), le récap reste (il ne dépend que du rôle)', async () => {
    const r = await formule('core', () => fetchNotifications());
    expect(r.items.find((i) => i.type === 'radar'), 'le radar reste lisible sur une formule qui ferme Résultats').toMatchObject({ title: RADAR, body: RAISON_RADAR, href: null });
    const recap = await brute(ids.ud, 'digest');
    expect(r.items.find((i) => i.type === 'digest'), 'le récap d’une administratrice dépend de sa formule').toEqual(recap);
  });

  it('le VRAI panneau monté puis le bandeau · Ada repassée membre · rien de SECRET dans le DOM, « Ouvrir » absent', async () => {
    await avecRole(ids.ud, 'member', async () => {
      h.session = ada('member');
      function Cloche() {
        const n = useNotifications(0);
        return <section id="notif"><VueNotifications items={n.items} nonLues={n.nonLues} filtre="tout" maintenant={MAINTENANT} onFiltre={rien} onToutLire={n.toutLire} onOuvrir={n.marquer} onMarquer={n.marquer} /></section>;
      }
      document.body.innerHTML = '<div id="app"></div>';
      root = createRoot(document.getElementById('app')!);
      await act(async () => { root!.render(avecSpatial(<Cloche />)); });
      await vi.waitFor(() => expect(document.querySelectorAll('article[data-nid]').length, 'la cloche montée ne liste pas les notifications').toBe(2));
      expect(document.body.innerHTML, 'le panneau monté laisse fuir le récap ou le radar').not.toMatch(SECRETS);
      expect(texte(document.querySelector('.pill')), 'la pastille des non lues').toBe(`${await nonLuesEnBase(ids.ud)} non lues`);
      const n = await brute(ids.ud, 'digest');
      expect(texte(article(document, n.id)!.querySelector('strong'))).toBe(RECAP);
      expect(article(document, n.id)!.querySelector('[data-nread]'), 'un lien « Ouvrir » reste sur le récap (panneau monté)').toBeNull();
      for (const item of (await fetchNotifications()).items) {
        const bandeau = renderToStaticMarkup(avecSpatial(<BandeauNotification n={item} maintenant={MAINTENANT} onOuvrir={rien} onTout={rien} onFermer={rien} />));
        expect(bandeau, `le bandeau d’arrivée laisse fuir « ${item.type} »`).not.toMatch(SECRETS);
        expect(dom(bandeau).querySelector('[data-nread]')).toBeNull();
      }
    });
  });

  it('« Quoi de neuf » de l’Accueil · la même relecture · Ada repassée membre, aucun SECRET dans les nouveautés', async () => {
    const { nouveautes } = await avecRole(ids.ud, 'member', () => chargerAccueilSpatial(ada('member') as never, {}));
    expect(nouveautes, 'préalable · l’Accueil lit les notifications').not.toBeNull();
    expect(JSON.stringify(nouveautes), '« Quoi de neuf » laisse fuir le récap ou le radar').not.toMatch(SECRETS);
    expect(nouveautes!.filter((x) => x.action === null).length, 'récap et radar neutres, sans lien').toBe(2);
    const dans = await chargerAccueilSpatial(ada() as never, {});
    expect(JSON.stringify(dans.nouveautes), 'administratrice actuelle · « Quoi de neuf » inchangé').toMatch(/SECRET_TROUVAILLE/);
  });
});

/* ───────────────────────────── 3 · la même règle que la source, pas d'une autre ───────────────────────────── */

describe('la règle EXISTANTE de chaque source · ni élargie ni restreinte', () => {
  const PAGE_RADAR = () => import('../app/(spatial)/sp/adsmap/radar/page');
  /** La VRAIE page Radar de veille s'ouvre-t-elle (ni l'écran de refus de Résultats, ni le renvoi des non-administrateurs) ? */
  async function pageRadarOuverte(): Promise<boolean> {
    const m = await PAGE_RADAR() as { default: () => Promise<React.ReactElement> };
    try {
      const el = await m.default();
      renderToStaticMarkup(avecSpatial(el));
      return el.type !== RefusResultats;
    } catch (e) { if (/^REDIRECT /.test((e as Error).message)) return false; throw e; }
  }
  const radarLu = async () => { const r = await fetchNotifications(); const x = r.items.find((i) => i.type === 'radar'); return !!x && x.title !== RADAR; };

  it('le radar · lisible dans la cloche EXACTEMENT quand la vraie page Radar de veille s’ouvre (rôle × formule)', async () => {
    const cas: Array<[string, SessionT['role'], string, () => SessionT]> = [
      ['propriétaire, Plus', 'owner', 'plus', anne], ['administratrice, Plus', 'admin', 'plus', () => ada()],
      ['membre, Plus', 'member', 'plus', zoe], ['administratrice, Core', 'admin', 'core', () => ada('admin')],
      ['administratrice, Business', 'admin', 'business', () => ada('admin')],
    ];
    for (const [nom, , plan, s] of cas) {
      await formule(plan, async () => {
        h.session = { ...s(), plan };
        const page = await pageRadarOuverte();
        expect(await radarLu(), `${nom} · la cloche ne suit pas la page Radar de veille (page ${page ? 'ouverte' : 'fermée'})`).toBe(page);
      });
    }
    // Préalable · la parité regarde bien les deux issues.
    h.session = ada(); expect(await pageRadarOuverte(), 'préalable · la page s’ouvre à l’administratrice Plus').toBe(true);
    h.session = zoe(); expect(await pageRadarOuverte(), 'préalable · la page se ferme au membre').toBe(false);
  });

  it('le récap · lisible EXACTEMENT par qui le VRAI cron prévient aujourd’hui (propriétaire, administrateur)', async () => {
    const N = schema.notifications;
    for (const role of ['owner', 'admin', 'member', 'client_viewer'] as const) {
      await avecRole(ids.ud, role, async () => {
        const avant = (await db!.select({ id: N.id }).from(N).where(and(eq(N.userId, ids.ud), eq(N.type, 'digest')))).map((x) => x.id);
        await lancerRecap();
        const nouvelles = (await db!.select({ id: N.id }).from(N).where(and(eq(N.userId, ids.ud), eq(N.type, 'digest')))).filter((x) => !avant.includes(x.id));
        const prevenue = nouvelles.length > 0;
        h.session = ada(role);
        const r = await fetchNotifications();
        const lus = r.items.filter((i) => i.type === 'digest').map((i) => i.title !== RECAP);
        // Les relances du test retirées · rien ne reste de la parité (base de test en mémoire).
        for (const x of nouvelles) await db!.delete(N).where(eq(N.id, x.id));
        expect(lus.every((x) => x === prevenue), `${role} · la cloche ne suit pas les destinataires du récap (cron ${prevenue ? 'prévient' : 'ne prévient pas'})`).toBe(true);
      });
    }
  });
});

/* ───────────────────────────── 4 · la cloche n'est pas bornée à l'espace courant ───────────────────────────── */

describe('la cloche n’est pas bornée à l’espace courant (décision de Kevin en attente)', () => {
  it('Ada, session dans B, encore administratrice de A · le récap et le radar de A montrés COMME AUJOURD’HUI', async () => {
    h.session = ada('member', ids.wsB);
    const r = await fetchNotifications();
    for (const type of ['digest', 'radar']) expect(r.items.find((i) => i.type === type), `${type} · un espace où elle administre encore est neutralisé`).toEqual(await brute(ids.ud, type));
  });
});

/* ───────────────────────────── 5 · le coût ───────────────────────────── */

describe('le coût · UNE requête pour le lot d’espaces, jamais une par notification', () => {
  const compter = async (s: SessionT) => {
    h.session = s;
    h.requetes.length = 0;
    const r = await fetchNotifications();
    return { n: h.requetes.length, r };
  };

  it('20 récaps et radars sur 2 espaces · autant de requêtes que 2 sur un seul · une cloche sans récap ni radar · deux lectures, comme avant', async () => {
    const un = await compter(ada());
    expect(un.r.items.length).toBe(2);
    const N = schema.notifications;
    // Ada administratrice de B le temps du semis · 18 de plus, mêlés sur A et B.
    await db!.update(M).set({ role: 'admin' }).where(and(eq(M.userId, ids.ud), eq(M.workspaceId, ids.wsB)));
    const ajout = await db!.insert(N).values(Array.from({ length: 18 }, (_, i) => ({
      workspaceId: i % 2 ? ids.wsA : ids.wsB, userId: ids.ud, type: i % 3 ? 'radar' : 'digest', title: `Lot ${i}`, body: `corps ${i}`, href: '/adsmap/radar',
    }))).returning({ id: N.id });
    try {
      const vingt = await compter(ada());
      expect(vingt.r.items.length, 'préalable · 20 notifications').toBe(20);
      expect(new Set(vingt.r.items.map((i) => i.type)), 'préalable · que des récaps et des radars').toEqual(new Set(['digest', 'radar']));
      expect(vingt.r.items.every((i) => i.title !== RECAP && i.title !== RADAR), 'une administratrice de A et B voit un récap ou un radar neutre').toBe(true);
      expect(vingt.n, `la relecture fait une requête par notification ou par espace (${vingt.n} pour 20 sur 2 espaces, ${un.n} pour 2 sur un)`).toBe(un.n);
      expect(un.n, `la relecture du récap et du radar coûte ${un.n - 2} lectures`).toBe(3);
    } finally {
      for (const x of ajout) await db!.delete(N).where(eq(N.id, x.id));
      await db!.update(M).set({ role: 'member' }).where(and(eq(M.userId, ids.ud), eq(M.workspaceId, ids.wsB)));
    }
    const p = await compter(paul());
    expect(p.r.unread).toBe(30);
    expect(p.n, `la cloche sans récap ni radar paie la relecture (${p.n} requêtes)`).toBe(2);
  });
});
