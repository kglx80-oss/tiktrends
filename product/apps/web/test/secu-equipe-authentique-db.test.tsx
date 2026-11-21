import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * Suite de #1124 · « une équipe non authentifiée vaut absente » pour TOUS les
 * lecteurs de `Session.equipe`, pas seulement `effectiveAccess`.
 *
 * #1124 a fermé l'entrée de `effectiveAccess` · seule la session d'équipe que
 * `equipeDeSession` produit (gelée, inscrite au registre) y compte. Mais
 * d'autres lecteurs croyaient encore `s.equipe` brut, et son
 * `plateformeAdmissible` fourni par l'appelant · la garde du studio
 * (`prompt.publish`, `provider.configure`), l'écriture de l'équipe, la
 * dépense de la plateforme, les Connaissances, l'écran « Rôles & droits » et
 * les onglets d'administration. Une session reconstruite à la main obtenait
 * tout cela.
 *
 * On exécute le VRAI code · base pglite, VRAI `getSession` sur un jeton signé
 * pour la session légitime, vraies gardes, vraies actions, vraies pages. Le
 * cas « reconstruite » rejoue une session bâtie à la main (celle d'un client
 * réel, à laquelle on pose une équipe « admissible »), exactement ce que
 * ferait un futur code qui recompose une session.
 *
 * On lit le RÉSULTAT · la garde accepte ou refuse, la ligne est écrite ou non
 * en base, la page redirige ou montre la liste de l'équipe.
 */
const h = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'secret-de-test-equipe-authentique-0123456789abcdef';
  delete process.env.FOUNDER_EMAILS;
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return { jeton: null as string | null, reconstruite: null as unknown, ids: { ws: u(), admin: u(), client: u() } };
});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (n === 'tt_session' && h.jeton ? { name: n, value: h.jeton } : undefined),
    getAll: () => [], has: (n: string) => n === 'tt_session' && !!h.jeton, set: () => {}, delete: () => {},
  }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error('redirect ' + u); }, notFound: () => { throw new Error('404'); }, usePathname: () => '/admin/equipe', useRouter: () => ({ refresh: () => {}, push: () => {} }), useSearchParams: () => new URLSearchParams() }));
// Tout le code lit le VRAI getSession · sauf pour le cas « reconstruite », où l'on rejoue une session bâtie à la main.
vi.mock('../lib/auth', async (orig) => {
  const vrai = await orig<typeof import('../lib/auth')>();
  return { ...vrai, getSession: async () => (h.reconstruite ?? vrai.getSession()) };
});

import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { cleInterrupteursEspace } from '@tiktrends/core';
import { getSession, type Session } from '../lib/auth';
import { equipeAuthentique } from '../lib/registre-equipe-session';
import { jetonForgeTest } from './helpers/face-equipe';
import { gardePlateforme } from '../lib/studios/prompts/garde-prompts';
import { enregistrerInterrupteursEspaceAction } from '../app/actions/studios/interrupteurs';
import { creerProjet } from '../app/actions/studios/projets';
import { enregistrerStaffAction } from '../app/actions/equipe';
import { chargerConnaissancesAction } from '../app/actions/connaissances';
import { personnelPlateforme } from '../lib/personnel-plateforme';
import { droitsSousNavAdmin } from '../lib/onglets-reglages';
import { unlimitedCredits } from '../lib/credits';
import { avecSpatial } from './spatial/fournisseur';
import DroitsSpatial from '../app/(spatial)/sp/admin/equipe/page';
import ConnaissancesSpatial from '../app/(spatial)/sp/admin/connaissances/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 300_000 });

const jour = (j: number) => new Date(Date.UTC(2026, 9, j, 9));
const EMAIL = { admin: 'admin-ancien@equipe.test', client: 'client@espace.test' };
/** L'équipe « admissible » que l'on pose à la main · accès total, comme `equipeDeSession` la rendrait pour un admin légitime. */
const ADMISSIBLE_A_LA_MAIN = { role: 'admin' as const, matrice: {}, plateformeAdmissible: true, inscritEquipe: true };

beforeAll(async () => {
  const ids = h.ids;
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Espace Starter', plan: 'starter', creditsBalance: 0 });
  await db!.insert(schema.users).values([
    // Le compte existait AVANT son inscription dans l'équipe · admissible (antériorité).
    { id: ids.admin, email: EMAIL.admin, createdAt: jour(1) },
    { id: ids.client, email: EMAIL.client, createdAt: jour(1) },
  ]);
  await db!.insert(schema.workspaceMembers).values([
    { workspaceId: ids.ws, userId: ids.admin, role: 'member' },
    { workspaceId: ids.ws, userId: ids.client, role: 'member' },
  ]);
  await db!.insert(schema.platformStaff).values({ email: EMAIL.admin, role: 'admin', createdAt: jour(5) });
});

async function connecter(uid: string): Promise<void> {
  h.jeton = await new SignJWT({ uid, ep: 0 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('3600s')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
}

/** Le message d'une redirection (`redirect` lève), ou « aucune ». */
async function redirection(f: () => Promise<unknown>): Promise<string> {
  try { await f(); return 'aucune'; } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith('redirect ')) return m.slice('redirect '.length);
    throw e;
  }
}

let n = 0;
/**
 * Tout ce que la session obtient, mesuré sur le vrai code · `reconstruite`
 * null → le vrai getSession (jeton signé), sinon la session rejouée.
 */
async function pouvoirs(reconstruite: Session | null) {
  h.reconstruite = reconstruite;
  try {
    const s = (await getSession())!;
    const ids = h.ids;
    n += 1;
    // Studio · portée plateforme · la garde, puis une vraie écriture `provider.configure`.
    const publication = await gardePlateforme('prompt.publish');
    await db!.delete(schema.appSettings).where(eq(schema.appSettings.key, cleInterrupteursEspace(ids.ws)));
    const interrupteurs = await enregistrerInterrupteursEspaceAction({ workspaceId: ids.ws, actives: ['video'], coupees: [], motif: `essai ${n}`, confirme: true });
    const reglageEcrit = (await db!.select().from(schema.appSettings).where(eq(schema.appSettings.key, cleInterrupteursEspace(ids.ws)))).length === 1;
    const auditEcrit = (await db!.select().from(schema.studioAuditEvents)
      .where(and(eq(schema.studioAuditEvents.action, 'studios.interrupteurs'), eq(schema.studioAuditEvents.reason, `essai ${n}`)))).map((a) => a.effectiveRole);
    // Écriture de l'équipe · inscrire un second compte à accès total.
    const capte = `capte-${n}@ailleurs.test`;
    const fd = new FormData(); fd.set('email', capte); fd.set('role', 'admin');
    const staff = await redirection(() => enregistrerStaffAction(fd));
    const staffEcrit = (await db!.select().from(schema.platformStaff).where(eq(schema.platformStaff.email, capte))).length === 1;
    // Connaissances · l'action, puis la page.
    const connaissances = await chargerConnaissancesAction();
    const pageConnaissances = await redirection(() => ConnaissancesSpatial());
    // « Rôles & droits » · la page, et ce qu'elle montre.
    let htmlEquipe = '';
    const pageEquipe = await redirection(async () => {
      htmlEquipe = renderToStaticMarkup(avecSpatial((await DroitsSpatial({ searchParams: Promise.resolve({}) })) as ReactElement));
    });
    const onglets = droitsSousNavAdmin(s);
    return {
      'garde prompt.publish': publication.ok,
      'provider.configure · action acceptée': interrupteurs.ok,
      'provider.configure · réglage écrit en base': reglageEcrit,
      'provider.configure · audit tracé « equipe: »': auditEcrit.some((r) => r.startsWith('equipe:')),
      'écriture de l’équipe · redirection': staff,
      'écriture de l’équipe · ligne platform_staff écrite': staffEcrit,
      'dépense de la plateforme visible': personnelPlateforme(s),
      'Connaissances · action servie': !connaissances.error,
      'Connaissances · page': pageConnaissances,
      'Rôles & droits · page': pageEquipe,
      'Rôles & droits · liste de l’équipe montrée': htmlEquipe.includes(EMAIL.admin),
      'onglets · prompt.read': onglets.promptRead,
      'onglets · provider.configure': onglets.providerConfigure,
      'onglets · Connaissances': onglets.connaissances,
      'onglets · Équipe': onglets.equipe,
      'crédits illimités': unlimitedCredits(s.user.email),
    };
  } finally { h.reconstruite = null; }
}

const TOUT = {
  'garde prompt.publish': true,
  'provider.configure · action acceptée': true,
  'provider.configure · réglage écrit en base': true,
  'provider.configure · audit tracé « equipe: »': true,
  'écriture de l’équipe · redirection': '/admin/equipe?ok=staff',
  'écriture de l’équipe · ligne platform_staff écrite': true,
  'dépense de la plateforme visible': true,
  'Connaissances · action servie': true,
  'Connaissances · page': 'aucune',
  'Rôles & droits · page': 'aucune',
  'Rôles & droits · liste de l’équipe montrée': true,
  'onglets · prompt.read': true,
  'onglets · provider.configure': true,
  'onglets · Connaissances': true,
  'onglets · Équipe': true,
  'crédits illimités': true,
};
const RIEN = {
  'garde prompt.publish': false,
  'provider.configure · action acceptée': false,
  'provider.configure · réglage écrit en base': false,
  'provider.configure · audit tracé « equipe: »': false,
  'écriture de l’équipe · redirection': '/dashboard',
  'écriture de l’équipe · ligne platform_staff écrite': false,
  'dépense de la plateforme visible': false,
  'Connaissances · action servie': false,
  'Connaissances · page': '/dashboard',
  'Rôles & droits · page': '/dashboard',
  'Rôles & droits · liste de l’équipe montrée': false,
  'onglets · prompt.read': false,
  'onglets · provider.configure': false,
  'onglets · Connaissances': false,
  'onglets · Équipe': false,
  'crédits illimités': false,
};

describe('Session d’équipe · seule celle de getSession ouvre un pouvoir de plateforme (vrai code, pglite)', () => {
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });

  it('le scénario · getSession pose une équipe à accès total admissible pour l’admin, aucune pour le client', async () => {
    await connecter(h.ids.admin);
    expect((await getSession())?.equipe).toMatchObject({ role: 'admin', plateformeAdmissible: true });
    await connecter(h.ids.client);
    expect((await getSession())?.equipe, 'le témoin client a une équipe · le cas ne prouve rien').toBeNull();
  });

  it('l’admin légitime (vrai getSession) · garde tout · studio, écriture de l’équipe, dépense, Connaissances, écrans, crédits illimités', async () => {
    await connecter(h.ids.admin);
    expect(await pouvoirs(null), 'la session légitime perd un pouvoir · getSession ne produit plus une session d’équipe authentifiée').toEqual(TOUT);
  });

  it('un client, une équipe « admissible » posée à la main sur SA session · n’obtient RIEN', async () => {
    await connecter(h.ids.client);
    const s = (await getSession())!;
    expect(await pouvoirs({ ...s, equipe: jetonForgeTest({ ...ADMISSIBLE_A_LA_MAIN }) }),
      'une session reconstruite à la main obtient un pouvoir de plateforme · un lecteur croit le plateformeAdmissible de l’appelant').toEqual(RIEN);
  });

  it('la session de l’admin, son équipe recopiée champ par champ · n’obtient RIEN (seul l’objet produit par getSession compte)', async () => {
    await connecter(h.ids.admin);
    const s = (await getSession())!;
    const e = equipeAuthentique(s)!;
    const copie = { ...s, equipe: jetonForgeTest({ ...e, matrice: { ...e.matrice } }) };
    // Les crédits illimités suivent l'adresse, notée par le VRAI getSession de ce compte · hors de ce cas.
    const { 'crédits illimités': _credits, ...obtenu } = await pouvoirs(copie);
    const { 'crédits illimités': _rien, ...attendu } = RIEN;
    expect(obtenu, 'une copie de la session d’équipe obtient un pouvoir de plateforme · un lecteur croit l’equipe de l’appelant').toEqual(attendu);
  });

  /**
   * Suite de #1125 · les cas ci-dessus éprouvent des gestes REFUSÉS · l'audit
   * n'y est jamais écrit, et « audit tracé equipe: » y vaut `false` sans rien
   * prouver. Ici un geste d'ESPACE que la session forgée a le droit de faire
   * (créer un projet · `studio.propose`, membre d'un espace Core) · il est
   * servi, la ligne d'audit est écrite, et son `effective_role` doit être
   * celui de l'espace seul. Le registre d'audit ne prête pas à la session
   * forgée une équipe qu'elle n'a pas.
   */
  it('un geste d’espace AUTORISÉ (créer un projet) · la session forgée est servie, et l’audit la trace « espace: », jamais « equipe: »', async () => {
    const ids = h.ids;
    const marque = randomUUID();
    // L'espace passe en Core (le studio y est ouvert à un membre) et reçoit une marque · rendu en fin de cas.
    await db!.update(schema.workspaces).set({ plan: 'core' }).where(eq(schema.workspaces.id, ids.ws));
    await db!.insert(schema.brands).values({ id: marque, workspaceId: ids.ws, name: 'Marque du geste autorisé' });
    const roleAudite = async (reconstruite: Session | null, titre: string) => {
      h.reconstruite = reconstruite;
      try {
        const r = await creerProjet({ brandId: marque, kind: 'ads', title: titre });
        if (!r.ok) return { servi: false, roles: [] as string[] };
        const roles = (await db!.select({ r: schema.studioAuditEvents.effectiveRole }).from(schema.studioAuditEvents)
          .where(and(eq(schema.studioAuditEvents.action, 'project.create'), eq(schema.studioAuditEvents.targetId, r.projet.id)))).map((a) => a.r);
        return { servi: true, roles };
      } finally { h.reconstruite = null; }
    };
    try {
      // Le témoin · l'admin légitime (vrai getSession) est tracé « equipe: » · sinon le cas ne prouverait rien.
      await connecter(ids.admin);
      expect(await roleAudite(null, 'Projet de l’admin'), 'le témoin n’est pas tracé « equipe: » · le cas ne prouve rien').toEqual({ servi: true, roles: ['equipe:admin/espace:member'] });
      // La session forgée · un client, une équipe « admissible » posée à la main.
      await connecter(ids.client);
      const s = (await getSession())!;
      const forgee = await roleAudite({ ...s, equipe: jetonForgeTest({ ...ADMISSIBLE_A_LA_MAIN }) }, 'Projet de la session forgée');
      expect(forgee.servi, 'le geste d’espace est refusé · le cas ne lit pas l’audit d’un geste autorisé').toBe(true);
      expect(forgee.roles, 'une ligne d’audit et une seule pour le geste').toHaveLength(1);
      expect(forgee.roles.filter((r) => r.startsWith('equipe:')), 'l’audit trace « equipe: » pour une session forgée · le rôle effectif croit l’equipe de l’appelant').toEqual([]);
      expect(forgee.roles).toEqual(['espace:member']);
    } finally {
      await db!.update(schema.workspaces).set({ plan: 'starter' }).where(eq(schema.workspaces.id, ids.ws));
    }
  });
});
