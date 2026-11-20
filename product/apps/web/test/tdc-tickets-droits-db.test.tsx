// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Le Tour de contrôle et les tickets · AUDIT figé (V5, lot 14 · signalement de
 * l'agent de #1086 · « le Tour de contrôle lit tous les tickets de la
 * plateforme sans relire le rôle d'équipe au chargement des messages »).
 *
 * Conclusion de l'audit (`docs/ux-v5/audit-tour-controle-tickets.md`) · RIEN
 * ne se reproduit sur main 51507ba · chaque chemin du Tour qui lit un ticket
 * passe d'abord par `porteAdmin` / `porteAdminGeste` (admin de l'espace
 * courant ET fondateur), relue À CHAQUE requête par le VRAI `getSession`
 * (utilisateur, époque de session, appartenance et rôle lus en base, liste des
 * fondateurs relue avec l'environnement) · le rôle d'ÉQUIPE plateforme
 * (`platform_staff`, matrice des rubriques) n'ouvre PAS le Tour (aucune
 * rubrique ne le gouverne · `droitsSousNavAdmin().tour` est la règle de la
 * page), donc le retirer ne peut rien laisser lire · les gestes du poste SAV
 * sont les actions du support, qui relisent le ticket et le rôle à chaque
 * appel.
 *
 * Ce fichier FIGE ce comportement · base RÉELLE (pglite, migrations du dépôt),
 * VRAI `getSession` (jeton signé dans le cookie, rien n'est simulé de la
 * session), VRAIES pages (Vue d'ensemble, Tickets SAV, Churn, Inscriptions &
 * comptes, Console), VRAIES actions (`replyTicketAction`,
 * `setTicketStatusAction`, `exporterTourAction`) · on lit le DOM et la valeur
 * envoyée au client (les props du poste SAV, composant client).
 *
 *  · qui a le droit · tout s'affiche EXACTEMENT comme sur main (capture prise
 *    sur main 51507ba, champs stables) ;
 *  · le MÊME cookie, après un changement EN BASE (rôle d'espace retiré,
 *    retirée de l'espace, époque dépassée) · une adresse de `FOUNDER_EMAILS`
 *    n'ouvre plus le Tour, posée ou retirée (« Codé seul ») ·
 *    refusé à la requête suivante, avant toute lecture, sans citer aucune
 *    donnée (`SECRET_…` absent) ;
 *  · l'équipe plateforme · un Admin d'équipe non fondateur n'a jamais ouvert
 *    le Tour, retiré ou non · un fondateur retiré de `platform_staff` garde le
 *    Tour (la liste codée des fondateurs, inchangée) ;
 *  · les actions du support appelées directement depuis le Tour · un ticket
 *    d'un autre espace est introuvable, un fondateur repassé membre ne répond
 *    ni ne clôt le ticket d'un autre · rien n'est écrit ;
 *  · les exports ne portent aucun ticket ;
 *  · recensement · tout lecteur de tickets est dans l'audit avec sa garde.
 * 0 $ · aucun modèle, aucun appel réseau. Aucune date « à venir ».
 */

const h = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'secret-de-test-tdc-tickets-0123456789abcdef';
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return {
    jeton: null as string | null,
    ids: { wsE: u(), wsB: u(), wsS: u(), uF: u(), uM: u(), uA: u(), uS: u(), uV: u(), tE: u(), tB: u() },
  };
});

vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect:${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }),
  usePathname: () => '/admin/sav',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {}, unstable_cache: (f: unknown) => f }));
// Le cookie de session est le SEUL état apporté par le test · `getSession` est le vrai.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (n === 'tt_session' && h.jeton ? { name: n, value: h.jeton } : undefined),
    getAll: () => [], has: (n: string) => n === 'tt_session' && !!h.jeton, set: () => {}, delete: () => {},
  }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }), depensesAReconcilier: async () => ({ lignes: [] }) }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

import { SignJWT } from 'jose';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../lib/auth';
import { fondateursCodes } from '../lib/founder';
import { avecSpatial } from './spatial/fournisseur';
import { replyTicketAction, setTicketStatusAction } from '../app/actions/support';
import { exporterTourAction } from '../app/actions/tour-controle';
import { navAdmin } from '../app/(spatial)/sp/admin/donnees';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 300_000 });

const ids = h.ids;
/** Le premier fondateur de la liste CODÉE (lu, jamais recopié ici). */
const FONDATEUR = fondateursCodes()[0]!;
const EQUIPE = 'equipe-admin@tdc.test';
const VIA_ENV = 'fondatrice-env@tdc.test';
const SECRETS = /SECRET_/;
const REFUS_EXPORT = 'Réservé au fondateur (plateforme) · rien n’a été lu ni modifié.';
const ECRANS = ['comptes', 'rentabilite', 'incidents', 'taches', 'audit'] as const;

/** Un VRAI jeton de session, signé comme `createSession` le signe · l'époque figée à l'émission. */
async function connecter(uid: string): Promise<void> {
  const [u] = await db!.select({ e: schema.users.sessionEpoch }).from(schema.users).where(eq(schema.users.id, uid));
  h.jeton = await new SignJWT({ uid, ep: u?.e ?? 0 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('3600s')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
}

const jour = (j: number, heure = 9) => new Date(Date.UTC(2026, 9, j, heure));
const membreF = () => and(eq(schema.workspaceMembers.workspaceId, ids.wsE), eq(schema.workspaceMembers.userId, ids.uF));

beforeAll(async () => {
  expect(FONDATEUR, 'aucun fondateur codé · le semis regarde ailleurs').toBeTruthy();
  await db!.insert(schema.workspaces).values([
    { id: ids.wsE, name: 'Maison Éclat', plan: 'core', createdAt: jour(1), stripeCustomerId: 'cus_SECRET_E', stripeSubscriptionId: 'sub_SECRET_E', subscriptionStatus: 'active', creditsBalance: 500 },
    { id: ids.wsB, name: 'Atelier Brume', plan: 'plus', createdAt: jour(2), stripeCustomerId: 'cus_SECRET_B', stripeSubscriptionId: 'sub_SECRET_B', subscriptionStatus: 'active', driveRefreshToken: 'drive-SECRET_B', creditsBalance: 80 },
    { id: ids.wsS, name: 'Studio Équipe', plan: 'business', createdAt: jour(3), creditsBalance: 10 },
  ]);
  await db!.insert(schema.users).values([
    { id: ids.uF, email: FONDATEUR, name: 'Fondateur', createdAt: jour(1, 8) },
    { id: ids.uM, email: 'zoe@eclat.test', name: 'Zoé Membre', createdAt: jour(1, 8) },
    { id: ids.uA, email: 'ana@brume.test', name: 'Ana Brume', createdAt: jour(2, 8) },
    { id: ids.uS, email: EQUIPE, name: 'Sam Équipe', createdAt: jour(3, 8) },
    { id: ids.uV, email: VIA_ENV, name: 'Vera Env', createdAt: jour(1, 8) },
  ]);
  await db!.insert(schema.workspaceMembers).values([
    { workspaceId: ids.wsE, userId: ids.uF, role: 'owner' },
    { workspaceId: ids.wsE, userId: ids.uM, role: 'member' },
    { workspaceId: ids.wsB, userId: ids.uA, role: 'admin' },
    { workspaceId: ids.wsS, userId: ids.uS, role: 'owner' },
    { workspaceId: ids.wsE, userId: ids.uV, role: 'admin' },
  ]);
  // Inscrit APRÈS la création du compte · admissible, accès total d'équipe · mais pas fondateur.
  await db!.insert(schema.platformStaff).values({ email: EQUIPE, role: 'admin', createdAt: jour(4) });
  await db!.insert(schema.tickets).values([
    { id: ids.tE, workspaceId: ids.wsE, userId: ids.uM, authorName: 'Zoé Membre', type: 'bug', title: 'Export bloqué SECRET_TE', body: 'Le CSV ne part pas SECRET_CE', status: 'open', createdAt: jour(10), updatedAt: jour(10) },
    { id: ids.tB, workspaceId: ids.wsB, userId: ids.uA, authorName: 'Ana Brume', type: 'question', title: 'Facture d’octobre SECRET_TB', body: 'Où est la facture SECRET_CB', status: 'in_progress', createdAt: jour(11), updatedAt: jour(12) },
  ]);
  await db!.insert(schema.ticketMessages).values([
    { ticketId: ids.tE, userId: ids.uM, authorName: 'Zoé Membre', body: 'Le CSV ne part pas SECRET_CE', isStaff: false, createdAt: jour(10) },
    { ticketId: ids.tB, userId: ids.uA, authorName: 'Ana Brume', body: 'Où est la facture SECRET_CB', isStaff: false, createdAt: jour(11) },
    { ticketId: ids.tB, userId: ids.uA, authorName: 'Équipe Brume', body: 'Transmise au service compta SECRET_RB', isStaff: true, createdAt: jour(12) },
  ]);
});
beforeEach(() => { h.jeton = null; });
afterEach(async () => {
  vi.unstubAllEnvs();
  // Chaque test repart de l'état semé · le rôle du fondateur restauré.
  await db!.update(schema.workspaceMembers).set({ role: 'owner' }).where(membreF());
});

/* ───────────────────────── pages et actions réelles ───────────────────────── */

/** Environnement node (jose exige ses propres tableaux d'octets) · le HTML est lu par jsdom (sans types publiés). */
const { JSDOM } = require('jsdom') as { JSDOM: new (html: string) => { window: Window } };
const dom = (html: string) => { const d = new JSDOM('<!doctype html><div id="r"></div>').window.document.getElementById('r')!; d.innerHTML = html; return d; };
type Rendu = React.ReactElement<Record<string, unknown>>;
const PAGES = {
  ensemble: () => import('../app/(spatial)/sp/admin/page'),
  sav: () => import('../app/(spatial)/sp/admin/sav/page'),
  churn: () => import('../app/(spatial)/sp/admin/churn/page'),
  comptes: () => import('../app/(spatial)/sp/admin/signups/page'),
  console: () => import('../app/(spatial)/sp/console/page'),
} as const;
type NomPage = keyof typeof PAGES;
const PARAMS: Record<NomPage, Record<string, string>> = { ensemble: {}, sav: {}, churn: {}, comptes: { q: 'brume', segment: 'risque' }, console: {} };

/** L'élément rendu par la page (ses props = la valeur envoyée aux composants) · ou l'adresse de redirection. */
async function element(nom: NomPage): Promise<Rendu> {
  const m = await PAGES[nom]() as { default: (p: { searchParams?: Promise<Record<string, string>> }) => Promise<Rendu> };
  return m.default({ searchParams: Promise.resolve(PARAMS[nom]) });
}
const html = async (nom: NomPage) => renderToStaticMarkup(avecSpatial(await element(nom)));
const redirection = async (nom: NomPage): Promise<string> => {
  try { await element(nom); } catch (e) { return (e as Error).message; }
  return `${nom} rendue`;
};

/** Une VRAIE action du support · elle redirige (`redirect` jette) · on rend l'adresse. */
async function agir(f: (fd: FormData) => Promise<void>, champs: Record<string, string>): Promise<string> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  try { await f(fd); } catch (e) { const m = /^redirect:(.*)$/.exec((e as Error).message); if (m) return m[1]!; throw e; }
  throw new Error('l’action n’a pas redirigé');
}

/** Les tickets tels que le poste SAV (composant CLIENT) les reçoit · champs stables (sans « il y a … »). */
type TicketRecu = { id: string; titre: string; ligne: string; espace: string; numero: string; ouvertPar: string; onglet: string; bloque: string | null; messages: Array<{ equipe: boolean; auteur: string; corps: string }> };
async function ticketsRecus(): Promise<TicketRecu[]> {
  const sav = await element('sav');
  const recus = (sav.props.tickets ?? []) as Array<TicketRecu & { messages: Array<{ equipe: boolean; auteur: string; corps: string; quand: string }> }>;
  return recus.map((t) => ({
    id: t.id, titre: t.titre, ligne: t.ligne, espace: t.espace, numero: t.numero, ouvertPar: t.ouvertPar, onglet: t.onglet, bloque: t.bloque,
    messages: t.messages.map((m) => ({ equipe: m.equipe, auteur: m.auteur, corps: m.corps })),
  }));
}

/**
 * La capture prise sur main 51507ba, avant toute modification · ce que reçoit
 * le poste SAV d'un fondateur administrateur de Maison Éclat · les deux
 * tickets de la plateforme, leurs fils complets, la réponse fermée hors de
 * son espace avec sa raison.
 */
const CAPTURE_MAIN = (): TicketRecu[] => [
  {
    id: ids.tE, titre: 'Export bloqué SECRET_TE', ligne: 'Maison Éclat · Sans réponse', espace: 'Maison Éclat', numero: `#${ids.tE.slice(0, 6)}`, ouvertPar: 'Zoé Membre', onglet: 'open', bloque: null,
    messages: [{ equipe: false, auteur: 'Zoé Membre', corps: 'Le CSV ne part pas SECRET_CE' }],
  },
  {
    id: ids.tB, titre: 'Facture d’octobre SECRET_TB', ligne: 'Atelier Brume · Répondu', espace: 'Atelier Brume', numero: `#${ids.tB.slice(0, 6)}`, ouvertPar: 'Ana Brume', onglet: 'in_progress',
    bloque: 'Réponse réservée à l’espace Atelier Brume · le support se traite depuis l’espace du client.',
    messages: [{ equipe: false, auteur: 'Ana Brume', corps: 'Où est la facture SECRET_CB' }, { equipe: true, auteur: 'Équipe Brume · équipe', corps: 'Transmise au service compta SECRET_RB' }],
  },
];

/** Toutes les lectures du Tour qui touchent un ticket, refusées d'un bloc · même adresse partout, aucune donnée citée. */
async function toutRefuse(attendu: 'redirect:/dashboard' | 'redirect:/login') {
  for (const nom of Object.keys(PAGES) as NomPage[]) {
    const r = await redirection(nom);
    expect(r, `page ${nom} ouverte hors porte`).toBe(attendu);
    expect(r).not.toMatch(SECRETS);
  }
  for (const ecran of ECRANS) expect(await exporterTourAction({ ecran }), `export ${ecran} accepté hors porte`).toEqual({ ok: false, message: REFUS_EXPORT });
  expect(await navAdmin(), 'la sous-navigation ouvre encore « Tickets SAV »').not.toContain('/admin/sav');
}

const messagesEnBase = async () => (await db!.select().from(schema.ticketMessages)).length;
const ticketEnBase = async (id: string) => (await db!.select().from(schema.tickets).where(eq(schema.tickets.id, id)))[0]!;

/* ───────────────────────── qui a le droit ───────────────────────── */

describe('Tour de contrôle · tickets · qui a le droit voit exactement ce qu’il voyait sur main', () => {
  it('fondateur administrateur de son espace · session RELUE par le vrai getSession · le poste SAV reçoit la capture de main', async () => {
    await connecter(ids.uF);
    const s = await getSession();
    expect(s && { ws: s.workspaceId, role: s.role, equipe: s.equipe?.role }).toEqual({ ws: ids.wsE, role: 'owner', equipe: 'adminplus' });
    expect(await ticketsRecus(), 'le poste SAV ne reçoit plus la capture de main').toEqual(CAPTURE_MAIN());
    const d = dom(await html('sav'));
    // Le fil du premier ticket de l'onglet est montré, la réponse ouverte (son espace).
    expect(d.querySelector('.savd h2')!.textContent).toBe('Export bloqué SECRET_TE');
    expect(d.querySelector('.savconv')!.textContent).toContain('Le CSV ne part pas SECRET_CE');
    expect(d.querySelector('#areply')!.hasAttribute('disabled')).toBe(false);
    expect([...d.querySelectorAll('[data-atk]')].map((b) => b.getAttribute('data-atk'))).toEqual([ids.tE]);
    // Aucun secret d'espace (Stripe, Drive) dans la page.
    for (const x of ['cus_SECRET', 'sub_SECRET', 'drive-SECRET']) expect(d.innerHTML).not.toContain(x);
    expect(await navAdmin()).toContain('/admin/sav');
  });

  it('les autres pages qui comptent les tickets s’ouvrent · Vue d’ensemble, Churn, Comptes, Console · aucun secret d’espace', async () => {
    await connecter(ids.uF);
    const ensemble = dom(await html('ensemble'));
    expect(ensemble.textContent).toContain('Tickets ouverts');
    for (const nom of ['churn', 'comptes', 'console'] as const) {
      const d = await html(nom);
      for (const x of ['cus_SECRET', 'sub_SECRET', 'drive-SECRET']) expect(d, `${nom} cite ${x}`).not.toContain(x);
    }
  });

  it('les exports ne portent aucun ticket · ni titre, ni texte, ni fil (`SECRET_…` absent des cinq fichiers)', async () => {
    await connecter(ids.uF);
    for (const ecran of ECRANS) {
      const r = await exporterTourAction({ ecran });
      expect(r.ok, `export ${ecran} refusé au fondateur`).toBe(true);
      if (r.ok) expect(r.csv, `export ${ecran} porte un ticket ou un secret`).not.toMatch(SECRETS);
    }
  });

  it('fondateur par l’environnement (`FOUNDER_EMAILS`) administrateur de son espace · refusé, sans rien citer (« Codé seul »)', async () => {
    vi.stubEnv('FOUNDER_EMAILS', VIA_ENV);
    await connecter(ids.uV);
    await toutRefuse('redirect:/dashboard');
  });
});

/* ───────────── le MÊME cookie, un droit retiré EN BASE · refusé à la requête suivante ───────────── */

describe('Tour de contrôle · tickets · un droit retiré est relu à la requête suivante, jamais cru d’un état antérieur', () => {
  it('rôle d’espace retiré (propriétaire → membre) · pages, exports et sous-navigation refusés, sans rien citer', async () => {
    await connecter(ids.uF);
    expect((await ticketsRecus()).length, 'semis · le fondateur doit d’abord lire').toBe(2);
    await db!.update(schema.workspaceMembers).set({ role: 'member' }).where(membreF());
    await toutRefuse('redirect:/dashboard');
  });

  it('époque de session dépassée (mot de passe changé) · le jeton déjà émis ne lit plus rien', async () => {
    await connecter(ids.uF);
    expect((await ticketsRecus()).length).toBe(2);
    await db!.update(schema.users).set({ sessionEpoch: 1 }).where(eq(schema.users.id, ids.uF));
    try { await toutRefuse('redirect:/login'); } finally { await db!.update(schema.users).set({ sessionEpoch: 0 }).where(eq(schema.users.id, ids.uF)); }
  });

  it('`FOUNDER_EMAILS` posé ou retiré · le même cookie est refusé dans les deux cas (la variable n’ouvre rien)', async () => {
    vi.stubEnv('FOUNDER_EMAILS', VIA_ENV);
    await connecter(ids.uV);
    await toutRefuse('redirect:/dashboard');
    vi.stubEnv('FOUNDER_EMAILS', '');
    await toutRefuse('redirect:/dashboard');
  });

  it('retirée de l’espace (appartenance supprimée, plus aucun espace) · plus de session, connexion demandée', async () => {
    await connecter(ids.uF);
    expect((await ticketsRecus()).length).toBe(2);
    await db!.delete(schema.workspaceMembers).where(membreF());
    try { await toutRefuse('redirect:/login'); } finally { await db!.insert(schema.workspaceMembers).values({ workspaceId: ids.wsE, userId: ids.uF, role: 'owner' }); }
  });
});

/* ───────────────────────── l'équipe plateforme ───────────────────────── */

describe('Tour de contrôle · tickets · le rôle d’équipe plateforme n’ouvre pas le Tour (la matrice ne le gouverne pas)', () => {
  it('Admin d’équipe (accès total) NON fondateur, propriétaire de son espace · jamais admis, puis retiré de l’équipe · toujours refusé', async () => {
    await connecter(ids.uS);
    const s = await getSession();
    expect(s?.equipe?.role, 'semis · le compte doit être de l’équipe').toBe('admin');
    await toutRefuse('redirect:/dashboard');
    await db!.delete(schema.platformStaff).where(eq(schema.platformStaff.email, EQUIPE));
    try {
      expect((await getSession())?.equipe ?? null).toBeNull();
      await toutRefuse('redirect:/dashboard');
    } finally { await db!.insert(schema.platformStaff).values({ email: EQUIPE, role: 'admin', createdAt: jour(4) }); }
  });

  it('fondateur retiré de `platform_staff` · garde le Tour (liste codée des fondateurs) · réception identique à la capture', async () => {
    const [ligne] = await db!.select().from(schema.platformStaff).where(eq(schema.platformStaff.email, FONDATEUR));
    await db!.delete(schema.platformStaff).where(eq(schema.platformStaff.email, FONDATEUR));
    try {
      await connecter(ids.uF);
      expect(await ticketsRecus()).toEqual(CAPTURE_MAIN());
    } finally { if (ligne) await db!.insert(schema.platformStaff).values(ligne); }
  });
});

/* ───────────── les gestes du poste SAV · les actions du support appelées directement ───────────── */

describe('Tour de contrôle · tickets · les gestes du poste SAV relisent le ticket et le rôle à chaque appel', () => {
  it('un ticket d’un autre espace · la réponse et le statut sont introuvables, rien n’est écrit (la prop « bloque » n’est pas la garde)', async () => {
    await connecter(ids.uF);
    const avant = { n: await messagesEnBase(), t: await ticketEnBase(ids.tB) };
    expect(await agir(replyTicketAction, { ticketId: ids.tB, body: 'intrus' })).toBe('/support?e=notfound');
    expect(await agir(setTicketStatusAction, { ticketId: ids.tB, status: 'resolved' })).toBe('/support?e=notfound');
    expect(await messagesEnBase(), 'une réponse hors espace a été écrite').toBe(avant.n);
    expect(await ticketEnBase(ids.tB)).toEqual(avant.t);
  });

  it('page chargée en propriétaire, puis repassé membre EN BASE · ni réponse ni clôture sur le ticket d’un autre membre', async () => {
    await connecter(ids.uF);
    const recu = (await ticketsRecus()).find((t) => t.id === ids.tE)!;
    expect(recu.bloque, 'semis · la réponse doit être ouverte au chargement').toBeNull();
    await db!.update(schema.workspaceMembers).set({ role: 'member' }).where(membreF());
    const avant = { n: await messagesEnBase(), t: await ticketEnBase(ids.tE) };
    expect(await agir(replyTicketAction, { ticketId: ids.tE, body: 'réponse périmée' })).toBe('/support?e=forbidden');
    expect(await agir(setTicketStatusAction, { ticketId: ids.tE, status: 'resolved' })).toBe('/support?e=forbidden');
    expect(await messagesEnBase(), 'une réponse périmée a été écrite').toBe(avant.n);
    expect(await ticketEnBase(ids.tE)).toEqual(avant.t);
  });

  it('témoin · le fondateur administrateur répond au ticket de son espace · la réponse est écrite comme réponse d’équipe', async () => {
    await connecter(ids.uF);
    const n = await messagesEnBase();
    expect(await agir(replyTicketAction, { ticketId: ids.tE, body: 'On regarde · le fondateur' })).toBe(`/support/${ids.tE}?ok=reply`);
    expect(await messagesEnBase()).toBe(n + 1);
    const [m] = await db!.select().from(schema.ticketMessages).where(and(eq(schema.ticketMessages.ticketId, ids.tE), eq(schema.ticketMessages.body, 'On regarde · le fondateur')));
    expect(m).toMatchObject({ userId: ids.uF, isStaff: true });
    // Rendu au semis · base de test en mémoire (aucune donnée réelle touchée).
    await db!.delete(schema.ticketMessages).where(eq(schema.ticketMessages.id, m!.id));
    await db!.update(schema.tickets).set({ status: 'open', updatedAt: jour(10) }).where(eq(schema.tickets.id, ids.tE));
  });
});

/* ───────────────────────── recensement des lecteurs de tickets ───────────────────────── */

/**
 * Chaque fichier qui lit les tables de tickets (ou `chargerTickets`), et la
 * garde qu'il applique AU MOMENT de la lecture · le tableau de l'audit
 * (`docs/ux-v5/audit-tour-controle-tickets.md`). Un lecteur nouveau doit y
 * entrer, avec sa garde et un test qui la fait tomber.
 */
const LECTEURS_TICKETS: Record<string, string> = {
  'app/(spatial)/sp/admin/donnees.ts': 'définit chargerTickets · appelé seulement après porteAdmin (pages ci-dessous)',
  'app/(spatial)/sp/admin/page.tsx': 'porteAdmin (admin de l’espace ET fondateur, getSession relu)',
  'app/(spatial)/sp/admin/sav/page.tsx': 'porteAdmin (admin de l’espace ET fondateur, getSession relu)',
  'app/(spatial)/sp/console/page.tsx': 'porteAdmin · tickets de SON espace et compteurs plateforme',
  'lib/platform-metrics.ts': 'compteurs seuls · appelé par la Console après porteAdmin',
  'app/(spatial)/sp/support/page.tsx': 'getSession · son espace, un membre ses tickets (règle du support)',
  'app/(spatial)/sp/support/[id]/page.tsx': 'getSession · son espace, peutLireTicket',
  'app/actions/support.ts': 'getSession · ticket relu, son espace, admin ou auteur',
  'lib/studios/mes-mentions.ts': 'cloche · ticketRelu contre peutLireTicket au rôle actuel (#1086)',
};

describe('Tour de contrôle · tickets · recensement', () => {
  it('tout lecteur des tables de tickets est recensé avec sa garde · un lecteur nouveau ou disparu fait échouer', () => {
    const WEB = join(__dirname, '..');
    const fichiers: string[] = [];
    const parcourir = (d: string) => { for (const n of readdirSync(d)) { if (['node_modules', '.next', 'test'].includes(n)) continue; const p = join(d, n); statSync(p).isDirectory() ? parcourir(p) : /\.tsx?$/.test(n) && fichiers.push(p); } };
    parcourir(WEB);
    const MOTIF = /schema\.tickets\b|schema\.ticketMessages\b|\bchargerTickets\(/;
    const lecteurs = fichiers.map((f) => relative(WEB, f).split('\\').join('/')).filter((f) => MOTIF.test(readFileSync(join(WEB, f), 'utf8'))).sort();
    expect(lecteurs.length, 'le balayage ne voit aucun lecteur · il regarde ailleurs').toBeGreaterThanOrEqual(5);
    expect(lecteurs, 'un lecteur de tickets n’est pas dans l’audit (ou l’audit cite un fichier qui ne lit plus) · recense-le avec sa garde').toEqual(Object.keys(LECTEURS_TICKETS).sort());
  });
});
