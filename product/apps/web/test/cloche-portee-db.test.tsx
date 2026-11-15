// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * La cloche (centre de notifications de la coquille) et « Quoi de neuf » de
 * l'Accueil ne laissent plus fuir un texte sorti de la portée · base RÉELLE
 * (pglite, migrations du dépôt), VRAIES actions (commenter, noter un nœud de la
 * lignée, avec mention · gardes relues), VRAIE action de la cloche
 * (`fetchNotifications`) et VRAI panneau rendu puis monté (`VueNotifications`,
 * `useNotifications`, `BandeauNotification`) · on lit le DOM et la valeur
 * renvoyée au client.
 *
 *  · dans la portée · une mention, un commentaire et une notification
 *    ordinaire s'affichent EXACTEMENT comme avant (même HTML que la ligne brute
 *    de la table, la lecture de main) ;
 *  · la marque retirée de la portée, puis les droits Studios retirés · la
 *    notification reste (le compte non lu est inchangé), son titre devient
 *    « Mention · fil hors de ta portée » (« Commentaire · … »), sans extrait,
 *    sans projet, sans auteur, sans lien · `SECRET_…` n'apparaît ni dans le
 *    HTML, ni dans la valeur renvoyée ;
 *  · une mention d'un AUTRE espace, ou dont aucun fil relu ne redonne le texte
 *    (forgée) · neutre · une personne d'un autre espace ne voit rien ;
 *  · le coût · lectures BORNÉES · autant de requêtes pour 60 mentions sur
 *    25 projets que pour 2 sur un seul · aucune requête de plus pour une cloche
 *    sans notification bornée · rien n'est écrit.
 * 0 $ · aucun appel réseau, aucune dépense. Aucune date « à venir ».
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios & Record<'um' | 'ux' | 'ul' | 'up', string>,
  session: null as SessionTest | null, marque: null as string | null, requetes: [] as string[],
}));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u(), um: u(), ux: u(), ul: u(), up: u() };
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
import { semer, session } from './studios-semis';
import { projetAvecBrief } from './l4c-harnais';
import { avecSpatial } from './spatial/fournisseur';
import { commenterProjet } from '../app/actions/studios/activite';
import { noterNoeudLignee } from '../app/actions/studios/notes-lignee';
import { fetchNotifications, type NotifItem } from '../app/actions/notifications';
import { BandeauNotification, VueNotifications, useNotifications } from '../spatial/coquille/Notifications';
import { chargerAccueilSpatial } from '../app/(spatial)/sp/dashboard/chargement';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 300_000 });

const ids = h.ids;
const NOM_ZOE = 'Zoé Martin';
const NOM_MAX = 'Max Durand';
const NOM_LEA = 'Léa Petit';
const MENTION = 'Mention · fil hors de ta portée';
const COMMENTAIRE = 'Commentaire · fil hors de ta portée';
const RAISON = 'Tu ne vois plus ce projet (espace, marque ou droits Studios) · son texte n’est pas montré.';
const SECRETS = /SECRET_/;
const S = { P1: '', v1: '', P3: '', v3: '', P4: '', v4: '', ticket: '' };
const T = {
  dans: () => `@${NOM_ZOE} le visuel du sérum est à refaire, merci.`,
  a2: () => `@${NOM_ZOE} SECRET_COMMENTAIRE_A2 le prix barré est faux`,
  noteA2: () => `@${NOM_ZOE} SECRET_NOTE_A2 l’hypothèse est trop large`,
  proprio: 'SECRET_COMMENTAIRE_PROPRIO le packaging change en mars',
};
const proprietaire = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });
const membre = (id: string, nom: string): SessionTest => ({ user: { id, email: `${id}@cloche.test`, name: nom }, workspaceId: ids.wsA, workspaceName: 'Espace A', role: 'member', plan: 'plus', equipe: null });
const zoe = () => membre(ids.um, NOM_ZOE);

async function commenter(projectId: string, versionId: string, texte: string, mentions: string[]) {
  const r = await commenterProjet({ projectId, cible: 'version', cibleId: versionId, texte, mentions });
  if (!r.ok) throw new Error(`commenter ${JSON.stringify(r)}`);
}
async function noter(projectId: string, versionId: string, texte: string, mentions: string[]) {
  const n = await noterNoeudLignee({ projectId, noeud: `brief:${versionId}`, texte, mentions });
  if (!n.ok) throw new Error(`noter ${JSON.stringify(n)}`);
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  for (const [id, nom] of [[ids.um, NOM_ZOE], [ids.ux, NOM_MAX], [ids.ul, NOM_LEA], [ids.up, 'Paul Ordinaire']] as const) {
    await db.insert(schema.users).values({ id, email: `${id}@cloche.test`, name: nom });
    await db.insert(schema.workspaceMembers).values({ workspaceId: ids.wsA, userId: id, role: 'member' });
  }
  await db.update(schema.users).set({ name: 'Anne Propriétaire' }).where(eq(schema.users.id, ids.ua));
  h.session = proprietaire(); h.marque = ids.brandA1;

  const p1 = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · cloche' });
  S.P1 = p1.projectId; S.v1 = p1.versionId;
  const p3 = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.ua, titre: 'SECRET_PROJET_A2' });
  S.P3 = p3.projectId; S.v3 = p3.versionId;
  // Un projet de Zoé sur A2 · Anne y commente sans la mentionner · Zoé, propriétaire, est prévenue (`studio_comment`).
  const p4 = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.um, titre: 'SECRET_PROJET_ZOE' });
  S.P4 = p4.projectId; S.v4 = p4.versionId;

  // Par les VRAIES actions · l'autrice est Anne.
  await commenter(S.P1, S.v1, T.dans(), [ids.um]);
  h.marque = ids.brandA2;
  await commenter(S.P3, S.v3, T.a2(), [ids.um]);
  await noter(S.P3, S.v3, T.noteA2(), [ids.um]);
  await commenter(S.P4, S.v4, T.proprio, []);
  h.marque = ids.brandA1;

  // Une notification de support (son propre ticket · relue contre l'accès, toujours lisible par son autrice), une mention d'un AUTRE espace, une mention FORGÉE (aucun fil ne la redonne).
  const [tk] = await db.insert(schema.tickets).values({ workspaceId: ids.wsA, userId: ids.um, authorName: NOM_ZOE, type: 'question', title: 'Export CSV', body: 'Où ?' }).returning();
  S.ticket = tk!.id;
  await db.insert(schema.notifications).values([
    { workspaceId: ids.wsA, userId: ids.um, type: 'ticket_reply', title: 'Réponse à : Export CSV', body: 'C’est dans Réglages · Exports.', href: `/support/${S.ticket}` },
    // L'autre espace · même projet et même extrait qu'un vrai fil de A · seul l'espace la distingue.
    { workspaceId: ids.wsB, userId: ids.um, type: 'studio_comment_mention', title: 'SECRET_AUTRE_ESPACE titre', body: T.dans(), href: `/studio/projets/${S.P1}#activite` },
    { workspaceId: ids.wsA, userId: ids.um, type: 'studio_comment_mention', title: 'SECRET_FORGEE titre', body: 'SECRET_FORGEE corps', href: `/studio/projets/${S.P1}#activite` },
  ]);
}, 300_000);

/* ───────────────────────────── outils ───────────────────────────── */

let root: Root | null = null;
const MAINTENANT = new Date();
const rien = () => {};
beforeEach(() => { h.session = zoe(); h.marque = ids.brandA1; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const panneau = (items: NotifItem[], nonLues: number) => renderToStaticMarkup(avecSpatial(
  <section className="notif glass" id="notif" aria-label="Notifications">
    <VueNotifications items={items} nonLues={nonLues} filtre="tout" maintenant={MAINTENANT} onFiltre={rien} onToutLire={rien} onOuvrir={rien} onMarquer={rien} />
  </section>,
));
/** La lecture de main · la ligne BRUTE de la table, telle que la cloche la renvoyait. */
async function brutes(userId = ids.um): Promise<NotifItem[]> {
  const N = schema.notifications;
  const l = await db.select().from(N).where(eq(N.userId, userId));
  return l.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, href: r.href, read: r.readAt != null, createdAt: (r.createdAt as Date).toISOString() }));
}
async function notifDe(type: string, debut: string, ws = ids.wsA) {
  const N = schema.notifications;
  const l = await db.select().from(N).where(and(eq(N.userId, ids.um), eq(N.type, type), eq(N.workspaceId, ws)));
  const x = l.filter((n) => `${n.title} ${n.body ?? ''}`.includes(debut));
  expect(x, `une seule notification « ${type} » pour « ${debut} »`).toHaveLength(1);
  return x[0]!;
}
async function traces() {
  const N = schema.notifications;
  return {
    notifs: (await db.select({ id: N.id, lue: N.readAt, t: N.title, b: N.body, hr: N.href }).from(N)).map((n) => `${n.id}:${n.lue ? 'lue' : 'non'}:${n.t}:${n.b}:${n.hr}`).sort(),
    depense: (await db.select().from(schema.aiSpend)).length,
  };
}
const nonLuesEnBase = async (userId = ids.um) => (await brutes(userId)).filter((n) => !n.read).length;
const article = (d: ParentNode, id: string) => d.querySelector(`article[data-nid="${id}"]`);
async function retirerA2<T>(f: () => Promise<T>): Promise<T> {
  await db.insert(schema.studioMemberBrandScopes).values({ workspaceId: ids.wsA, userId: ids.um, brandId: ids.brandA1 });
  try { return await f(); } finally {
    await db.delete(schema.studioMemberBrandScopes).where(and(eq(schema.studioMemberBrandScopes.userId, ids.um), eq(schema.studioMemberBrandScopes.workspaceId, ids.wsA)));
  }
}
async function sansDroitsStudios<T>(f: () => Promise<T>): Promise<T> {
  await db.update(schema.workspaceMembers).set({ role: 'client_viewer' }).where(eq(schema.workspaceMembers.userId, ids.um));
  h.session = { ...zoe(), role: 'client_viewer' };
  try { return await f(); } finally {
    await db.update(schema.workspaceMembers).set({ role: 'member' }).where(eq(schema.workspaceMembers.userId, ids.um));
  }
}

/* ───────────────────────────── 1 · dans la portée, rien ne change ───────────────────────────── */

describe('dans la portée · la cloche s’affiche exactement comme avant', () => {
  it('la notification ordinaire, la mention et le commentaire relus · mêmes titre, texte, lien que la ligne brute · même HTML du panneau', async () => {
    const avant = await traces();
    const r = await fetchNotifications();
    const b = await brutes();
    const lues = new Map(r.items.map((n) => [n.id, n]));
    const ordinaire = await notifDe('ticket_reply', 'Export CSV');
    const mention = await notifDe('studio_comment_mention', 'visuel du sérum');
    const a2 = await notifDe('studio_comment_mention', 'SECRET_COMMENTAIRE_A2');
    const note = await notifDe('studio_note_mention', 'SECRET_NOTE_A2');
    const proprio = await notifDe('studio_comment', 'SECRET_COMMENTAIRE_PROPRIO');
    for (const n of [ordinaire, mention, a2, note, proprio]) {
      expect(lues.get(n.id), `la notification « ${n.title} » dans la portée a changé`).toEqual(b.find((x) => x.id === n.id));
    }
    expect(lues.get(mention.id)!.href, 'le lien de la mention dans la portée').toBe(`/studio/projets/${S.P1}#activite`);
    // Le panneau · le HTML rendu depuis la cloche est celui de la ligne brute (la lecture de main), à l'octet près.
    // (dans l'ordre de la cloche · des notifications posées au même instant n'ont pas d'ordre garanti en base)
    const garde = r.items.filter((n) => [ordinaire.id, mention.id].includes(n.id));
    const brut = new Map(b.map((n) => [n.id, n]));
    expect(panneau(garde, 2), 'le rendu d’une notification ordinaire ou relue a changé').toBe(panneau(garde.map((n) => brut.get(n.id)!), 2));
    expect(texte(article(dom(panneau(r.items, r.unread)), ordinaire.id))).toContain('C’est dans Réglages · Exports.');
    expect(await traces(), 'lire la cloche a écrit').toEqual(avant);
  });
});

/* ───────────────────────────── 2 · hors de la portée, rien ne fuit ───────────────────────────── */

describe('hors de la portée · la notification reste, sans texte, ni projet, ni auteur, ni lien', () => {
  it('la marque A2 retirée de sa portée · « Mention · fil hors de ta portée » · aucun SECRET dans la valeur renvoyée ni dans le panneau · compte inchangé', async () => {
    const avantCompte = (await fetchNotifications()).unread;
    const { r, html } = await retirerA2(async () => { const r = await fetchNotifications(); return { r, html: panneau(r.items, r.unread) }; });
    expect(JSON.stringify(r), 'la valeur renvoyée au client laisse fuir le texte, le titre ou le projet').not.toMatch(SECRETS);
    expect(html, 'le panneau laisse fuir le texte, le titre ou le projet').not.toMatch(SECRETS);
    expect(r.unread, 'le compte de la cloche a changé').toBe(avantCompte);
    expect(r.unread).toBe(await nonLuesEnBase());
    expect(r.items.map((n) => n.id).sort(), 'une notification a disparu').toEqual((await brutes()).map((n) => n.id).sort());
    const d = dom(html);
    for (const [type, debut, titre] of [
      ['studio_comment_mention', 'SECRET_COMMENTAIRE_A2', MENTION], ['studio_note_mention', 'SECRET_NOTE_A2', MENTION], ['studio_comment', 'SECRET_COMMENTAIRE_PROPRIO', COMMENTAIRE],
    ] as const) {
      const n = await notifDe(type, debut);
      const x = r.items.find((i) => i.id === n.id)!;
      expect([x.title, x.body, x.href], `« ${type} » hors portée`).toEqual([titre, RAISON, null]);
      const a = article(d, n.id)!;
      expect(texte(a.querySelector('strong'))).toBe(titre);
      expect(a.querySelector('[data-nread]'), 'un lien « Ouvrir » reste sur un fil hors portée').toBeNull();
      expect(texte(a), 'auteur ou projet visibles').not.toMatch(/Anne|SECRET_PROJET/);
    }
    // Le fil de sa portée reste lu, à l'identique.
    const dans = await notifDe('studio_comment_mention', 'visuel du sérum');
    expect(r.items.find((i) => i.id === dans.id)).toEqual((await brutes()).find((x) => x.id === dans.id));
  });

  it('les droits Studios retirés (lectrice client) · toutes les notifications bornées neutres, l’ordinaire intacte, le compte inchangé', async () => {
    const avantCompte = (await fetchNotifications()).unread;
    const r = await sansDroitsStudios(() => fetchNotifications());
    expect(JSON.stringify(r)).not.toMatch(SECRETS);
    expect(JSON.stringify(r), 'le texte d’un fil relu hors droits').not.toMatch(/visuel du sérum|Sérum · cloche/);
    expect(r.unread).toBe(avantCompte);
    const ordinaire = await notifDe('ticket_reply', 'Export CSV');
    expect(r.items.find((i) => i.id === ordinaire.id)).toEqual((await brutes()).find((x) => x.id === ordinaire.id));
    const bornees = r.items.filter((i) => i.type.startsWith('studio_'));
    expect(bornees.length).toBe(6);
    expect(bornees.every((i) => i.href === null && i.body === RAISON && (i.title === MENTION || i.title === COMMENTAIRE))).toBe(true);
  });

  it('autre espace · une mention d’un autre espace est neutre · une mention forgée (aucun fil relu ne la redonne) aussi · une personne de l’autre espace ne voit rien', async () => {
    const r = await fetchNotifications();
    for (const [debut, ws] of [['SECRET_AUTRE_ESPACE', ids.wsB], ['SECRET_FORGEE', ids.wsA]] as const) {
      const n = await notifDe('studio_comment_mention', debut, ws);
      expect(r.items.find((i) => i.id === n.id), `${debut} · mention montrée hors de son espace ou sur parole`).toMatchObject({ title: MENTION, body: RAISON, href: null });
    }
    expect(JSON.stringify(r), 'une mention d’un autre espace ou forgée a fui').not.toMatch(/SECRET_AUTRE_ESPACE|SECRET_FORGEE/);
    h.session = session(ids, 'ub', { plan: 'plus' });
    const b = await fetchNotifications();
    expect(b).toEqual({ items: [], unread: 0 });
  });

  it('le VRAI panneau monté (relecture de la cloche) puis le bandeau · rien de SECRET dans le DOM, « Ouvrir » absent des fils hors portée', async () => {
    await retirerA2(async () => {
      function Cloche() {
        const n = useNotifications(0);
        return <section id="notif"><VueNotifications items={n.items} nonLues={n.nonLues} filtre="tout" maintenant={MAINTENANT} onFiltre={rien} onToutLire={n.toutLire} onOuvrir={n.marquer} onMarquer={n.marquer} /></section>;
      }
      document.body.innerHTML = '<div id="app"></div>';
      root = createRoot(document.getElementById('app')!);
      await act(async () => { root!.render(avecSpatial(<Cloche />)); });
      await vi.waitFor(() => expect(document.querySelectorAll('article[data-nid]').length, 'la cloche montée ne liste pas les notifications').toBe(7));
      expect(document.body.innerHTML).not.toMatch(SECRETS);
      expect(texte(document.querySelector('.pill')), 'la pastille des non lues').toBe(`${await nonLuesEnBase()} non lues`);
      const n = await notifDe('studio_comment_mention', 'SECRET_COMMENTAIRE_A2');
      expect(texte(article(document, n.id)!.querySelector('strong'))).toBe(MENTION);
      expect(article(document, n.id)!.querySelector('[data-nread]')).toBeNull();
      expect(texte(article(document, n.id)!.querySelector('p'))).toBe(RAISON);
      // Le bandeau d'arrivée lit la même valeur.
      const item = (await fetchNotifications()).items.find((i) => i.id === n.id)!;
      const bandeau = renderToStaticMarkup(avecSpatial(<BandeauNotification n={item} maintenant={MAINTENANT} onOuvrir={rien} onTout={rien} onFermer={rien} />));
      expect(bandeau).not.toMatch(SECRETS);
      expect(dom(bandeau).querySelector('[data-nread]')).toBeNull();
    });
  });

  it('« Quoi de neuf » de l’Accueil · la même relecture · la marque retirée, aucun SECRET dans les nouveautés', async () => {
    const { nouveautes } = await retirerA2(() => chargerAccueilSpatial(zoe() as never, {}));
    expect(nouveautes, 'préalable · l’Accueil lit les notifications').not.toBeNull();
    expect(JSON.stringify(nouveautes), '« Quoi de neuf » laisse fuir le texte d’un fil hors portée').not.toMatch(SECRETS);
    expect(nouveautes!.some((x) => x.texte.startsWith(MENTION) && x.action === null), 'la mention hors portée est neutre, sans lien').toBe(true);
    // Dans la portée · « Quoi de neuf » inchangé (le texte brut).
    const dans = await chargerAccueilSpatial(zoe() as never, {});
    expect(JSON.stringify(dans.nouveautes)).toMatch(/SECRET_/);
  });
});

/* ───────────────────────────── 3 · le coût ───────────────────────────── */

describe('le coût · lectures bornées, une requête par lot, jamais une par notification', () => {
  let paul = 0;
  beforeAll(async () => {
    // Le PIRE semis · 60 mentions de Max (50 commentaires sur 25 projets, 10 notes) · 2 mentions de Léa sur un seul projet · Paul n'a que des notifications ordinaires.
    h.session = proprietaire(); h.marque = ids.brandA1;
    // Les 20 plus récentes (la cloche) · 10 notes sur 10 projets et 10 commentaires sur 10 AUTRES · 20 projets distincts, les deux genres.
    const projets: Array<{ projectId: string; versionId: string }> = [];
    for (let i = 0; i < 25; i += 1) {
      const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: `Lot ${i}` });
      projets.push(p);
      await commenter(p.projectId, p.versionId, `@${NOM_MAX} premier avis ${i}`, [ids.ux]);
    }
    for (const [i, p] of projets.entries()) await commenter(p.projectId, p.versionId, `@${NOM_MAX} second avis ${i}`, [ids.ux]);
    for (const [i, p] of projets.slice(0, 10).entries()) await noter(p.projectId, p.versionId, `@${NOM_MAX} note ${i}`, [ids.ux]);
    await commenter(S.P1, S.v1, `@${NOM_LEA} un avis`, [ids.ul]);
    await noter(S.P1, S.v1, `@${NOM_LEA} une note`, [ids.ul]);
    // (le suivi des concurrents · un ticket est désormais relu contre son accès, `W/test/cloche-tickets-db.test.tsx`, le récap et le radar contre leur source, `W/test/cloche-recap-radar-db.test.tsx`)
    await db.insert(schema.notifications).values(Array.from({ length: 30 }, (_, i) => ({ workspaceId: ids.wsA, userId: ids.up, type: 'tracker', title: `${i} nouvelles pubs`, body: 'Tes concurrents ont publié', href: '/saved' })));
    paul = 30;
  }, 300_000);

  const compter = async (s: SessionTest) => {
    h.session = s;
    h.requetes.length = 0;
    const r = await fetchNotifications();
    return { n: h.requetes.length, r };
  };

  it('60 mentions sur 25 projets · autant de requêtes que 2 mentions sur un projet · toutes relues dans la portée', async () => {
    const max = await compter(membre(ids.ux, NOM_MAX));
    expect((await brutes(ids.ux)).length, 'préalable · le pire semis').toBe(60);
    expect(max.r.items).toHaveLength(20);
    expect(new Set(max.r.items.map((i) => i.href?.split(/[?#]/)[0])).size, 'préalable · 20 projets distincts dans la cloche').toBe(20);
    expect(new Set(max.r.items.map((i) => i.type)), 'préalable · les deux genres').toEqual(new Set(['studio_comment_mention', 'studio_note_mention']));
    expect(max.r.items.every((i) => i.title !== MENTION), 'une mention dans la portée est dite hors portée').toBe(true);
    const lea = await compter(membre(ids.ul, NOM_LEA));
    expect(lea.r.items).toHaveLength(2);
    expect(max.n, `la relecture fait une requête par notification ou par projet (${max.n} pour 60 mentions, ${lea.n} pour 2)`).toBe(lea.n);
    // Le compte mesuré sur main b839efe (le tableau du module) · une cloche sans ticket ne paie pas la relecture des tickets.
    expect(lea.n, `une cloche de mentions sans ticket a changé de coût (${lea.n} requêtes, 9 mesurées)`).toBe(9);
  });

  it('une cloche sans notification bornée · deux lectures, comme avant (la liste et le compte)', async () => {
    const p = await compter(membre(ids.up, 'Paul Ordinaire'));
    expect(p.r.unread).toBe(paul);
    expect(p.n, `la cloche ordinaire paie la relecture (${p.n} requêtes)`).toBe(2);
  });
});
