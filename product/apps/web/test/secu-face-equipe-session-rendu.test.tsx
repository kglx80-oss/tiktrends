import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * Suite de #1122 · l'entrée de `effectiveAccess` est authentifiée, et un écran
 * d'équipe LÉGITIME reste ouvert. Rendu réel · la VRAIE page « Tous les
 * formats » (Veille, ouverte dès Core) d'un espace Starter, le VRAI
 * `getSession` sur un jeton signé (seul le cookie est apporté), la vraie
 * lecture de l'équipe (`platform_staff`, matrice, antériorité), base pglite.
 *
 *  · un membre d'équipe ADMISSIBLE (compte antérieur à son inscription, matrice
 *    qui ouvre la Veille) voit l'écran, sans verrou de formule ;
 *  · la MÊME session, reconstruite à la main (son `equipe` recopiée champ par
 *    champ, ou un littéral « admissible »), retombe sur la face client · le
 *    verrou de formule. Sur main 8b18efd3, elle ouvrait l'écran · l'appelant
 *    décidait seul de `plateformeAdmissible`.
 */
const h = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'secret-de-test-face-session-0123456789abcdef';
  delete process.env.FOUNDER_EMAILS;
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return { jeton: null as string | null, reconstruite: null as unknown, ids: { ws: u(), membre: u(), client: u() } };
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
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error('redirect ' + u); }, notFound: () => { throw new Error('404'); }, usePathname: () => '/veille/formats', useRouter: () => ({ refresh: () => {}, push: () => {} }), useSearchParams: () => new URLSearchParams() }));
// La page lit le VRAI getSession · sauf pour le cas « reconstruite », où l'on rejoue une session bâtie à la main.
vi.mock('../lib/auth', async (orig) => {
  const vrai = await orig<typeof import('../lib/auth')>();
  return { ...vrai, getSession: async () => (h.reconstruite ?? vrai.getSession()) };
});
vi.mock('../lib/brands', async (orig) => ({ ...(await orig<typeof import('../lib/brands')>()), getActiveBrand: async () => null }));

import { SignJWT } from 'jose';
import { sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession, type Session } from '../lib/auth';
import { equipeAuthentique } from '../lib/registre-equipe-session';
import { jetonForgeTest } from './helpers/face-equipe';
import { avecSpatial } from './spatial/fournisseur';
import FormatsPage from '../app/(spatial)/sp/veille/formats/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 300_000 });

const VERROU = 'Inclus dès la formule Core';
const ECRAN = 'Tous les formats';
const jour = (j: number) => new Date(Date.UTC(2026, 9, j, 9));
const EMAIL = { membre: 'membre-ancien@equipe.test', client: 'client@espace.test' };

beforeAll(async () => {
  const ids = h.ids;
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Espace Starter', plan: 'starter', creditsBalance: 0 });
  await db!.insert(schema.users).values([
    // Le compte existait AVANT son inscription dans l'équipe · admissible (antériorité).
    { id: ids.membre, email: EMAIL.membre, createdAt: jour(1) },
    { id: ids.client, email: EMAIL.client, createdAt: jour(1) },
  ]);
  await db!.insert(schema.workspaceMembers).values([
    { workspaceId: ids.ws, userId: ids.membre, role: 'member' },
    { workspaceId: ids.ws, userId: ids.client, role: 'member' },
  ]);
  await db!.insert(schema.platformStaff).values({ email: EMAIL.membre, role: 'membre', createdAt: jour(5) });
  await db!.insert(schema.platformRoleRights).values({ role: 'membre', rubriques: ['veille'] })
    .onConflictDoUpdate({ target: schema.platformRoleRights.role, set: { rubriques: sql`excluded.rubriques_json` } });
});

async function connecter(uid: string): Promise<void> {
  h.jeton = await new SignJWT({ uid, ep: 0 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('3600s')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
}
async function rendre(reconstruite: Session | null = null): Promise<string> {
  h.reconstruite = reconstruite;
  try {
    return renderToStaticMarkup(avecSpatial((await FormatsPage({ searchParams: Promise.resolve({}) })) as ReactElement));
  } finally { h.reconstruite = null; }
}

describe('Face équipe · seule la session de getSession ouvre un écran d’équipe (rendu réel, pglite)', () => {
  it('le scénario · getSession pose une équipe gradée, admissible, matrice Veille', async () => {
    await connecter(h.ids.membre);
    expect((await getSession())?.equipe).toMatchObject({ role: 'membre', matrice: { membre: ['veille'] }, plateformeAdmissible: true });
  });

  it('membre d’équipe ADMISSIBLE, espace Starter · l’écran Tous les formats, sans verrou de formule', async () => {
    await connecter(h.ids.membre);
    const html = await rendre();
    expect(html, 'la face équipe légitime est refusée · getSession ne produit plus une session d’équipe authentifiée').not.toContain(VERROU);
    expect(html).toContain(ECRAN);
  });

  it('la même session, son equipe recopiée champ par champ · face client, le verrou de formule', async () => {
    await connecter(h.ids.membre);
    const s = (await getSession())!;
    const e = equipeAuthentique(s);
    expect(e, 'le témoin n’a pas d’équipe authentique · le cas ne prouve rien').not.toBeNull();
    const html = await rendre({ ...s, equipe: jetonForgeTest({ ...e!, matrice: { ...e!.matrice } }) });
    expect(html, 'une session reconstruite à la main ouvre l’écran d’équipe · effectiveAccess croit l’equipe de l’appelant').toContain(VERROU);
  });

  it('un client, et un littéral « admissible » posé sur sa session · face client, le verrou de formule', async () => {
    await connecter(h.ids.client);
    const s = (await getSession())!;
    expect(s.equipe, 'le témoin a une équipe · le cas ne prouve rien').toBeNull();
    expect(await rendre()).toContain(VERROU);
    expect(await rendre({ ...s, equipe: jetonForgeTest({ role: 'membre', matrice: { membre: ['veille'] }, plateformeAdmissible: true }) })).toContain(VERROU);
  });
});
