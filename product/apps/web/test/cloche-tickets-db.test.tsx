// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * La cloche (centre de notifications de la coquille, bandeau d'arrivée) et
 * « Quoi de neuf » de l'Accueil relisent chaque notification de support
 * (`ticket_new`, `ticket_reply`, `ticket_status`) contre la règle d'accès au
 * ticket · celle de la page du ticket (`peutLireTicket` · un administrateur de
 * l'espace du ticket lit tous ceux de l'espace, un membre seulement les siens),
 * sous le rôle ACTUEL · base RÉELLE (pglite, migrations du dépôt), VRAIES
 * actions du support (ouvrir un ticket, répondre, changer le statut), VRAIE
 * action de la cloche (`fetchNotifications`), VRAI panneau rendu puis monté ·
 * on lit le DOM et la valeur renvoyée au client.
 *
 *  · un administrateur actuel · tout s'affiche EXACTEMENT comme avant (la
 *    ligne brute de la table, la capture prise sur main 8fc3bf0) ;
 *  · l'administratrice repassée membre, puis retirée de l'espace · les tickets
 *    des AUTRES membres deviennent « Ticket · plus accessible avec ton rôle
 *    actuel », sans titre, sans texte, sans lien · `SECRET_…` n'apparaît ni
 *    dans le HTML, ni dans la valeur renvoyée · le compte non lu est inchangé,
 *    rien n'est écrit ;
 *  · l'auteur garde TOUJOURS ses notifications de ticket (même lecteur client) ;
 *  · la cloche n'est PAS bornée à l'espace courant (décision de Kevin en
 *    attente) · un ticket d'un autre espace où la personne est encore
 *    administratrice reste montré tel quel ;
 *  · le coût · UNE requête pour le lot de tickets, jamais une par notification ·
 *    une cloche sans ticket garde son nombre de requêtes.
 * 0 $ · aucun appel réseau, aucune dépense. Aucune date « à venir ».
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios & Record<'um' | 'ux' | 'ud' | 'up', string>,
  session: null as SessionTest | null, marque: null as string | null, requetes: [] as string[],
}));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u(), um: u(), ux: u(), ud: u(), up: u() };
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
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));

import { db, schema, eq, and } from '@tiktrends/db';
import { semer } from './studios-semis';
import { projetAvecBrief } from './l4c-harnais';
import { avecSpatial } from './spatial/fournisseur';
import { createTicketAction, replyTicketAction, setTicketStatusAction } from '../app/actions/support';
import { commenterProjet } from '../app/actions/studios/activite';
import { fetchNotifications, type NotifItem } from '../app/actions/notifications';
import { BandeauNotification, VueNotifications, useNotifications } from '../spatial/coquille/Notifications';
import { chargerAccueilSpatial } from '../app/(spatial)/sp/dashboard/chargement';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 300_000 });

const ids = h.ids;
const NOM_ANNE = 'Anne Propriétaire';
const NOM_ADA = 'Ada Admin';
const NOM_ZOE = 'Zoé Martin';
const NOM_MAX = 'Max Durand';
const TICKET = 'Ticket · plus accessible avec ton rôle actuel';
const RAISON = 'Ce ticket est réservé à son auteur et aux administrateurs de son espace · son texte n’est pas montré.';
const SECRETS = /SECRET_/;
const K = { zoe: '', ada: '', b: '' };
type Role = SessionTest['role'];

const qui = (id: string, nom: string, ws: string, role: Role): SessionTest => ({
  user: { id, email: `${id}@tickets.test`, name: nom }, workspaceId: ws, workspaceName: ws === ids.wsA ? 'Espace A' : 'Espace B', role, plan: 'plus', equipe: null,
});
const anne = () => qui(ids.ua, NOM_ANNE, ids.wsA, 'owner');
const ada = (role: Role = 'admin', ws = ids.wsA) => qui(ids.ud, NOM_ADA, ws, role);
const zoe = (role: Role = 'member') => qui(ids.um, NOM_ZOE, ids.wsA, role);
const max = () => qui(ids.ux, NOM_MAX, ids.wsA, 'member');

/** Une VRAIE action du support · elle redirige (`redirect` jette) · on rend l'adresse. */
async function agir(s: SessionTest, f: (fd: FormData) => Promise<void>, champs: Record<string, string>): Promise<string> {
  h.session = s;
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  try { await f(fd); } catch (e) {
    const m = /^REDIRECT (.*)$/.exec((e as Error).message);
    if (m) return m[1]!;
    throw e;
  }
  throw new Error('l’action n’a pas redirigé');
}
const idDe = (adresse: string) => { const m = /^\/support\/([0-9a-f-]{36})\?ok=created$/.exec(adresse); if (!m) throw new Error(`ouverture refusée · ${adresse}`); return m[1]!; };

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  await db.update(schema.users).set({ name: NOM_ANNE }).where(eq(schema.users.id, ids.ua));
  for (const [id, nom, role] of [[ids.ud, NOM_ADA, 'admin'], [ids.um, NOM_ZOE, 'member'], [ids.ux, NOM_MAX, 'member'], [ids.up, 'Paul Ordinaire', 'member']] as const) {
    await db.insert(schema.users).values({ id, email: `${id}@tickets.test`, name: nom });
    await db.insert(schema.workspaceMembers).values({ workspaceId: ids.wsA, userId: id, role });
  }
  // Ada est AUSSI de l'espace B (administratrice plus bas) · c'est là que s'ouvre sa session une fois retirée de A.
  await db.insert(schema.workspaceMembers).values({ workspaceId: ids.wsB, userId: ids.ud, role: 'member' });

  // Par les VRAIES actions du support.
  K.zoe = idDe(await agir(zoe(), createTicketAction, { type: 'bug', title: 'SECRET_TITRE_ZOE', body: 'SECRET_CORPS_ZOE' })); // ticket_new → Anne, Ada
  expect(await agir(ada(), replyTicketAction, { ticketId: K.zoe, body: 'SECRET_REPONSE_ADA' })).toBe(`/support/${K.zoe}?ok=reply`); // ticket_reply → Zoé
  expect(await agir(zoe(), replyTicketAction, { ticketId: K.zoe, body: 'SECRET_RELANCE_ZOE' })).toBe(`/support/${K.zoe}?ok=reply`); // ticket_reply → Anne, Ada
  expect(await agir(ada(), setTicketStatusAction, { ticketId: K.zoe, status: 'resolved' })).toBe(`/support/${K.zoe}?ok=status`); // ticket_status → Zoé
  K.ada = idDe(await agir(ada(), createTicketAction, { type: 'question', title: 'PROPRE_TITRE_ADA', body: 'PROPRE_CORPS_ADA' })); // ticket_new → Anne
  expect(await agir(anne(), replyTicketAction, { ticketId: K.ada, body: 'PROPRE_REPONSE_ANNE' })).toBe(`/support/${K.ada}?ok=reply`); // ticket_reply → Ada (autrice)
  // Un ticket de l'espace B · ouvert par Zoé, membre de B le temps de l'ouvrir · Ada en devient l'administratrice ensuite.
  await db.insert(schema.workspaceMembers).values({ workspaceId: ids.wsB, userId: ids.um, role: 'member' });
  await db.update(schema.workspaceMembers).set({ role: 'admin' }).where(and(eq(schema.workspaceMembers.userId, ids.ud), eq(schema.workspaceMembers.workspaceId, ids.wsB)));
  K.b = idDe(await agir(qui(ids.um, NOM_ZOE, ids.wsB, 'member'), createTicketAction, { type: 'question', title: 'AUTRE_ESPACE_TITRE', body: 'AUTRE_ESPACE_CORPS' })); // ticket_new → Ada (B)

  // Forgées · un ticket d'un autre membre prévenu à Max · une notification de l'espace B qui pointe un ticket de A · un ticket introuvable · une adresse informe.
  await db.insert(schema.notifications).values([
    { workspaceId: ids.wsA, userId: ids.ux, type: 'ticket_reply', title: 'SECRET_FORGEE_MAX titre', body: 'SECRET_FORGEE_MAX corps', href: `/support/${K.zoe}` },
    { workspaceId: ids.wsB, userId: ids.ux, type: 'ticket_new', title: 'SECRET_FORGEE_ESPACE titre', body: 'SECRET_FORGEE_ESPACE corps', href: `/support/${K.zoe}` },
    { workspaceId: ids.wsA, userId: ids.ux, type: 'ticket_status', title: 'SECRET_INTROUVABLE titre', body: 'SECRET_INTROUVABLE corps', href: '/support/00000000-0000-4000-8000-000000000000' },
    { workspaceId: ids.wsA, userId: ids.ux, type: 'ticket_new', title: 'SECRET_INFORME titre', body: 'SECRET_INFORME corps', href: '/support/pas-un-id' },
  ]);
}, 300_000);

/* ───────────────────────────── outils ───────────────────────────── */

let root: Root | null = null;
const MAINTENANT = new Date();
const rien = () => {};
beforeEach(() => { h.session = ada(); h.marque = ids.brandA1; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const panneau = (items: NotifItem[], nonLues: number) => renderToStaticMarkup(avecSpatial(
  <section className="notif glass" id="notif" aria-label="Notifications">
    <VueNotifications items={items} nonLues={nonLues} filtre="tout" maintenant={MAINTENANT} onFiltre={rien} onToutLire={rien} onOuvrir={rien} onMarquer={rien} />
  </section>,
));
/** La lecture de main · la ligne BRUTE de la table, telle que la cloche la renvoyait (dans l'ordre de la cloche). */
async function brutes(userId: string, ordre?: NotifItem[]): Promise<NotifItem[]> {
  const N = schema.notifications;
  const l = (await db.select().from(N).where(eq(N.userId, userId))).map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, href: r.href, read: r.readAt != null, createdAt: (r.createdAt as Date).toISOString() }));
  if (!ordre) return l;
  const par = new Map(l.map((n) => [n.id, n]));
  return ordre.map((n) => par.get(n.id)!);
}
async function notifDe(userId: string, type: string, debut: string) {
  const l = (await brutes(userId)).filter((n) => n.type === type && `${n.title} ${n.body ?? ''}`.includes(debut));
  expect(l, `une seule notification « ${type} » pour « ${debut} »`).toHaveLength(1);
  return l[0]!;
}
async function traces() {
  const N = schema.notifications;
  return {
    notifs: (await db.select({ id: N.id, lue: N.readAt, t: N.title, b: N.body, hr: N.href }).from(N)).map((n) => `${n.id}:${n.lue ? 'lue' : 'non'}:${n.t}:${n.b}:${n.hr}`).sort(),
    tickets: (await db.select().from(schema.tickets)).map((t) => `${t.id}:${t.status}:${t.title}`).sort(),
    membres: (await db.select().from(schema.workspaceMembers)).map((m) => `${m.workspaceId}:${m.userId}:${m.role}`).sort(),
    depense: (await db.select().from(schema.aiSpend)).length,
  };
}
const nonLuesEnBase = async (userId: string) => (await brutes(userId)).filter((n) => !n.read).length;
const article = (d: ParentNode, id: string) => d.querySelector(`article[data-nid="${id}"]`);
/** Normalisée · les identifiants tirés au sort remplacés par leur nom. */
const normaliser = (items: NotifItem[]) => items.map((n) => ({ type: n.type, title: n.title, body: n.body, href: n.href?.replace(K.zoe, '<ticket Zoé>').replace(K.ada, '<ticket Ada>').replace(K.b, '<ticket B>') ?? null }))
  .sort((a, b) => `${a.type}${a.title}`.localeCompare(`${b.type}${b.title}`));

async function repasseeMembre<T>(f: () => Promise<T>): Promise<T> {
  const M = schema.workspaceMembers;
  await db.update(M).set({ role: 'member' }).where(and(eq(M.userId, ids.ud), eq(M.workspaceId, ids.wsA)));
  h.session = ada('member');
  try { return await f(); } finally { await db.update(M).set({ role: 'admin' }).where(and(eq(M.userId, ids.ud), eq(M.workspaceId, ids.wsA))); }
}
async function retireeDeA<T>(f: () => Promise<T>): Promise<T> {
  const M = schema.workspaceMembers;
  await db.delete(M).where(and(eq(M.userId, ids.ud), eq(M.workspaceId, ids.wsA)));
  h.session = ada('admin', ids.wsB);
  try { return await f(); } finally { await db.insert(M).values({ workspaceId: ids.wsA, userId: ids.ud, role: 'admin' }); }
}

/**
 * La capture prise sur main 8fc3bf0 (avant toute modification) · ce que
 * renvoyait la cloche d'Ada, administratrice de A et de B · identifiants normalisés.
 */
const CAPTURE_MAIN_ADA = [
  { type: 'ticket_new', title: 'Nouveau bug : SECRET_TITRE_ZOE', body: `De ${NOM_ZOE}`, href: '/support/<ticket Zoé>' },
  { type: 'ticket_new', title: 'Nouveau question : AUTRE_ESPACE_TITRE', body: `De ${NOM_ZOE}`, href: '/support/<ticket B>' },
  { type: 'ticket_reply', title: `Réponse à : PROPRE_TITRE_ADA`, body: 'PROPRE_REPONSE_ANNE', href: '/support/<ticket Ada>' },
  { type: 'ticket_reply', title: `Réponse de ${NOM_ZOE} : SECRET_TITRE_ZOE`, body: 'SECRET_RELANCE_ZOE', href: '/support/<ticket Zoé>' },
];

/* ───────────────────────────── 1 · un administrateur actuel, rien ne change ───────────────────────────── */

describe('un administrateur actuel · la cloche s’affiche exactement comme avant', () => {
  it('Ada administratrice · ses notifications de ticket égales à la ligne brute ET à la capture prise sur main · même HTML du panneau · rien n’est écrit', async () => {
    const avant = await traces();
    const r = await fetchNotifications();
    expect(r.items.length, 'préalable · les vraies actions ont prévenu Ada').toBe(4);
    expect(r.items, 'un administrateur actuel ne voit plus ses tickets comme avant').toEqual(await brutes(ids.ud, r.items));
    expect(normaliser(r.items), 'écart avec la capture prise sur main').toEqual([...CAPTURE_MAIN_ADA].sort((a, b) => `${a.type}${a.title}`.localeCompare(`${b.type}${b.title}`)));
    expect(panneau(r.items, r.unread), 'le rendu du panneau a changé pour un administrateur actuel').toBe(panneau(await brutes(ids.ud, r.items), r.unread));
    expect(await traces(), 'lire la cloche a écrit').toEqual(avant);
  });

  it('Anne propriétaire · ses tickets lus comme avant (la règle de la page · propriétaire au moins administratrice)', async () => {
    h.session = anne();
    const r = await fetchNotifications();
    expect(r.items.length).toBe(3);
    expect(r.items).toEqual(await brutes(ids.ua, r.items));
  });
});

/* ───────────────────────────── 2 · le rôle perdu, rien ne fuit ───────────────────────────── */

describe('le rôle perdu · la notification reste, sans titre, ni texte, ni lien', () => {
  it('Ada repassée membre · les tickets de Zoé neutres · aucun SECRET dans la valeur renvoyée ni dans le panneau · son propre ticket intact · compte inchangé', async () => {
    const avantCompte = (await fetchNotifications()).unread;
    const avant = await traces();
    const { r, html } = await repasseeMembre(async () => { const r = await fetchNotifications(); return { r, html: panneau(r.items, r.unread) }; });
    expect(JSON.stringify(r), 'la valeur renvoyée au client laisse fuir le titre ou le texte d’un ticket d’un autre membre').not.toMatch(SECRETS);
    expect(html, 'le panneau laisse fuir le titre ou le texte d’un ticket d’un autre membre').not.toMatch(SECRETS);
    expect(r.unread, 'le compte de la cloche a changé').toBe(avantCompte);
    expect(r.unread).toBe(await nonLuesEnBase(ids.ud));
    expect(r.items.map((n) => n.id).sort(), 'une notification a disparu').toEqual((await brutes(ids.ud)).map((n) => n.id).sort());
    const d = dom(html);
    for (const [type, debut] of [['ticket_new', 'SECRET_TITRE_ZOE'], ['ticket_reply', 'SECRET_RELANCE_ZOE']] as const) {
      const n = await notifDe(ids.ud, type, debut);
      const x = r.items.find((i) => i.id === n.id)!;
      expect([x.title, x.body, x.href], `« ${type} » d’un ticket d’un autre membre, rôle perdu`).toEqual([TICKET, RAISON, null]);
      const a = article(d, n.id)!;
      expect(texte(a.querySelector('strong'))).toBe(TICKET);
      expect(texte(a.querySelector('p'))).toBe(RAISON);
      expect(a.querySelector('[data-nread]'), 'un lien « Ouvrir » reste sur un ticket plus accessible').toBeNull();
      expect(texte(a), 'l’auteur du ticket reste visible').not.toMatch(/Zoé/);
    }
    // L'autrice garde ses tickets · la réponse d'Anne à SON ticket, intacte.
    const sien = await notifDe(ids.ud, 'ticket_reply', 'PROPRE_REPONSE_ANNE');
    expect(r.items.find((i) => i.id === sien.id), 'l’autrice ne voit plus la réponse à son propre ticket').toEqual((await brutes(ids.ud)).find((x) => x.id === sien.id));
    expect(await traces(), 'relire la cloche a écrit ou changé un droit').toEqual(avant);
  });

  it('Ada retirée de l’espace A (session dans B) · les tickets de A des autres neutres · son propre ticket intact · aucun SECRET', async () => {
    const avantCompte = (await fetchNotifications()).unread;
    const r = await retireeDeA(() => fetchNotifications());
    expect(JSON.stringify(r), 'une ex-administratrice retirée de l’espace voit encore ses tickets').not.toMatch(SECRETS);
    expect(r.unread, 'le compte de la cloche a changé').toBe(avantCompte);
    for (const debut of ['SECRET_TITRE_ZOE', 'SECRET_RELANCE_ZOE']) {
      const n = (await brutes(ids.ud)).find((x) => `${x.title} ${x.body}`.includes(debut))!;
      expect(r.items.find((i) => i.id === n.id), debut).toMatchObject({ title: TICKET, body: RAISON, href: null });
    }
    const sien = await notifDe(ids.ud, 'ticket_reply', 'PROPRE_REPONSE_ANNE');
    expect(r.items.find((i) => i.id === sien.id), 'l’autrice retirée ne voit plus la réponse à son propre ticket').toEqual((await brutes(ids.ud)).find((x) => x.id === sien.id));
  });

  it('le VRAI panneau monté puis le bandeau · Ada repassée membre · rien de SECRET dans le DOM, « Ouvrir » absent', async () => {
    await repasseeMembre(async () => {
      function Cloche() {
        const n = useNotifications(0);
        return <section id="notif"><VueNotifications items={n.items} nonLues={n.nonLues} filtre="tout" maintenant={MAINTENANT} onFiltre={rien} onToutLire={n.toutLire} onOuvrir={n.marquer} onMarquer={n.marquer} /></section>;
      }
      document.body.innerHTML = '<div id="app"></div>';
      root = createRoot(document.getElementById('app')!);
      await act(async () => { root!.render(avecSpatial(<Cloche />)); });
      await vi.waitFor(() => expect(document.querySelectorAll('article[data-nid]').length, 'la cloche montée ne liste pas les notifications').toBe(4));
      expect(document.body.innerHTML).not.toMatch(SECRETS);
      expect(texte(document.querySelector('.pill')), 'la pastille des non lues').toBe(`${await nonLuesEnBase(ids.ud)} non lues`);
      const n = await notifDe(ids.ud, 'ticket_new', 'SECRET_TITRE_ZOE');
      expect(texte(article(document, n.id)!.querySelector('strong'))).toBe(TICKET);
      expect(article(document, n.id)!.querySelector('[data-nread]'), 'un lien « Ouvrir » reste sur un ticket plus accessible (panneau monté)').toBeNull();
      const item = (await fetchNotifications()).items.find((i) => i.id === n.id)!;
      const bandeau = renderToStaticMarkup(avecSpatial(<BandeauNotification n={item} maintenant={MAINTENANT} onOuvrir={rien} onTout={rien} onFermer={rien} />));
      expect(bandeau, 'le bandeau d’arrivée laisse fuir le ticket').not.toMatch(SECRETS);
      expect(texte(dom(bandeau)), 'le bandeau ne dit pas que le ticket n’est plus accessible').toContain(TICKET);
      expect(dom(bandeau).querySelector('[data-nread]')).toBeNull();
    });
  });

  it('« Quoi de neuf » de l’Accueil · la même relecture · Ada repassée membre, aucun SECRET dans les nouveautés', async () => {
    const { nouveautes } = await repasseeMembre(() => chargerAccueilSpatial(ada('member') as never, {}));
    expect(nouveautes, 'préalable · l’Accueil lit les notifications').not.toBeNull();
    expect(JSON.stringify(nouveautes), '« Quoi de neuf » laisse fuir le ticket d’un autre membre').not.toMatch(SECRETS);
    expect(nouveautes!.filter((x) => x.texte.startsWith(TICKET) && x.action === null).length, 'les tickets plus accessibles, neutres, sans lien').toBe(2);
    const dans = await chargerAccueilSpatial(ada() as never, {});
    expect(JSON.stringify(dans.nouveautes), 'administratrice actuelle · « Quoi de neuf » inchangé').toMatch(/SECRET_TITRE_ZOE/);
  });
});

/* ───────────────────────────── 3 · l'auteur, l'autre espace, les forgées ───────────────────────────── */

describe('l’auteur garde ses tickets · la cloche n’est pas bornée à l’espace courant · une forgée n’est pas lue sur parole', () => {
  it('Zoé, autrice · réponse et statut intacts · même repassée lectrice client', async () => {
    for (const role of ['member', 'client_viewer'] as const) {
      h.session = zoe(role);
      const r = await fetchNotifications();
      expect(r.items.length, `${role} · préalable`).toBe(2);
      expect(r.items, `${role} · l’autrice ne voit plus ses notifications de ticket`).toEqual(await brutes(ids.um, r.items));
      expect(JSON.stringify(r)).toMatch(/SECRET_REPONSE_ADA/);
    }
  });

  it('autre espace · Ada, session dans B, encore administratrice de A · ses tickets de A montrés COMME AUJOURD’HUI (la cloche n’est pas bornée à l’espace courant)', async () => {
    const M = schema.workspaceMembers;
    // Ada repassée membre de B, sa session dans B · A reste un espace où elle administre.
    await db.update(M).set({ role: 'member' }).where(and(eq(M.userId, ids.ud), eq(M.workspaceId, ids.wsB)));
    h.session = ada('member', ids.wsB);
    try {
      const r = await fetchNotifications();
      for (const debut of ['SECRET_TITRE_ZOE', 'SECRET_RELANCE_ZOE']) {
        const deA = (await brutes(ids.ud)).find((x) => `${x.title} ${x.body}`.includes(debut))!;
        expect(r.items.find((i) => i.id === deA.id), `${debut} · un ticket d’un AUTRE espace où elle administre encore est neutralisé`).toEqual((await brutes(ids.ud)).find((x) => x.id === deA.id));
      }
      // Le ticket de B · l'espace COURANT, où elle n'est plus que membre · plus accessible.
      const deB = await notifDe(ids.ud, 'ticket_new', 'AUTRE_ESPACE_TITRE');
      expect(r.items.find((i) => i.id === deB.id), 'le ticket de l’espace courant reste lisible après le rôle perdu').toMatchObject({ title: TICKET, body: RAISON, href: null });
      expect(JSON.stringify(r)).not.toMatch(/AUTRE_ESPACE_/);
    } finally {
      await db.update(M).set({ role: 'admin' }).where(and(eq(M.userId, ids.ud), eq(M.workspaceId, ids.wsB)));
    }
  });

  it('forgées · le ticket d’un autre membre, une notification d’un autre espace, un ticket introuvable, une adresse informe · neutres', async () => {
    h.session = max();
    const r = await fetchNotifications();
    expect(r.items.length).toBe(4);
    expect(JSON.stringify(r), 'une notification de ticket forgée est lue sur parole').not.toMatch(SECRETS);
    expect(r.items.every((i) => i.title === TICKET && i.body === RAISON && i.href === null)).toBe(true);
    expect(r.unread).toBe(4);
  });
});

/* ───────────────────────────── 4 · le coût ───────────────────────────── */

describe('le coût · UNE requête pour le lot de tickets, jamais une par notification', () => {
  const compter = async (s: SessionTest) => {
    h.session = s;
    h.requetes.length = 0;
    const r = await fetchNotifications();
    return { n: h.requetes.length, r };
  };
  let seul = 0;
  beforeAll(async () => {
    seul = (await compter(anne())).n; // 3 notifications sur 2 tickets
    // Le PIRE semis mêlé · 60 notifications pour Anne · 25 tickets de Max (VRAIES ouvertures, ticket_new), 20 relances (ticket_reply), et 15 mentions des Studios.
    h.marque = ids.brandA1;
    const lots: string[] = [];
    for (let i = 0; i < 25; i += 1) lots.push(idDe(await agir(max(), createTicketAction, { type: 'bug', title: `Lot ${i}`, body: `corps ${i}` })));
    for (const [i, id] of lots.slice(0, 20).entries()) await agir(max(), replyTicketAction, { ticketId: id, body: `relance ${i}` });
    h.session = qui(ids.ud, NOM_ADA, ids.wsA, 'admin');
    const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ud, titre: 'Sérum · tickets' });
    for (let i = 0; i < 15; i += 1) {
      const c = await commenterProjet({ projectId: p.projectId, cible: 'version', cibleId: p.versionId, texte: `@${NOM_ANNE} avis ${i}`, mentions: [ids.ua] });
      if (!c.ok) throw new Error(`commenter ${JSON.stringify(c)}`);
    }
    // Paul · que des notifications ordinaires (aucun ticket, aucun fil borné).
    await db.insert(schema.notifications).values(Array.from({ length: 30 }, (_, i) => ({ workspaceId: ids.wsA, userId: ids.up, type: 'radar', title: `Radar ${i}`, body: 'Rien de neuf', href: '/radar' })));
  }, 300_000);

  it('20 notifications de ticket sur 20 tickets distincts · autant de requêtes que 3 sur 2 tickets · toutes lues (Anne propriétaire)', async () => {
    h.session = anne();
    expect((await brutes(ids.ua)).length, 'préalable · le pire semis mêlé').toBeGreaterThanOrEqual(60);
    // La cloche d'Anne · ses 20 plus récentes · des mentions (bornées Studios) puis des tickets.
    const a = await compter(anne());
    const tickets = a.r.items.filter((i) => i.type.startsWith('ticket_'));
    expect(a.r.items).toHaveLength(20);
    expect(a.r.items.every((i) => i.title !== TICKET), 'un ticket lisible par la propriétaire est dit plus accessible').toBe(true);
    expect(a.r.items).toEqual(await brutes(ids.ua, a.r.items));
    // Que des tickets, sur 20 tickets distincts · le même nombre de requêtes que 3 notifications sur 2 tickets.
    await db.update(schema.notifications).set({ readAt: new Date(0) }).where(and(eq(schema.notifications.userId, ids.ua), eq(schema.notifications.type, 'studio_comment_mention')));
    const N = schema.notifications;
    const mentions = await db.select({ id: N.id, c: N.createdAt }).from(N).where(and(eq(N.userId, ids.ua), eq(N.type, 'studio_comment_mention')));
    await db.update(N).set({ createdAt: new Date(Date.UTC(2020, 0, 1)) }).where(and(eq(N.userId, ids.ua), eq(N.type, 'studio_comment_mention')));
    try {
      const t = await compter(anne());
      expect(t.r.items.every((i) => i.type.startsWith('ticket_')), 'préalable · que des tickets').toBe(true);
      expect(new Set(t.r.items.map((i) => i.href)).size, 'préalable · 20 tickets distincts').toBe(20);
      expect(t.n, `la relecture fait une requête par notification ou par ticket (${t.n} pour 20 tickets, ${seul} pour 2)`).toBe(seul);
    } finally {
      for (const m of mentions) await db.update(N).set({ createdAt: m.c, readAt: null }).where(eq(N.id, m.id));
    }
    expect(a.r.items.filter((i) => i.type === 'studio_comment_mention').length, 'préalable · la cloche mêle des mentions des Studios').toBe(15);
    expect(tickets.length, 'préalable · et des tickets').toBe(5);
  });

  it('une cloche sans ticket · deux lectures, comme avant (la liste et le compte)', async () => {
    const p = await compter(qui(ids.up, 'Paul Ordinaire', ids.wsA, 'member'));
    expect(p.r.unread).toBe(30);
    expect(p.n, `la cloche sans ticket paie la relecture des tickets (${p.n} requêtes)`).toBe(2);
  });

  it('une cloche de tickets · une seule lecture de plus que la liste et le compte', async () => {
    h.session = max();
    const m = await compter(max());
    expect(m.r.items.every((i) => i.type.startsWith('ticket_'))).toBe(true);
    expect(m.n, `la relecture des tickets coûte ${m.n - 2} lectures`).toBe(3);
  });
});
