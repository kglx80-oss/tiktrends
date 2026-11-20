// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Suivi de #1106 / #1108 (relecture, I1) · le privilège voisin des crédits
 * illimités.
 *
 * Un compte qui a capté un e-mail staff préinscrit (créé APRÈS son entrée
 * `platform_staff`, donc non admissible) n'avait plus les crédits illimités ni
 * les Connaissances, mais gardait sur main 1173851d :
 *  · la formule forcée à Business (`effectiveAccess` · `accesTotal(rôle)`) ;
 *  · la face « équipe » qui lève tout verrou de formule (`rbac.verrouille`) ;
 *  · la lecture de la dépense IA de toute la plateforme
 *    (`voitDepensePlateforme` via `personnelPlateforme` · le rôle seul).
 *
 * Ce fichier éprouve le VRAI `getSession` sur un jeton signé (seul le cookie
 * est apporté), la vraie lecture de l'équipe (`platform_staff`, dates), base
 * réelle (pglite). On lit des RÉSULTATS · la formule de l'accès effectif, le
 * verrou de l'entrée « Résultats » au rail, ce que rend la garde de la
 * rubrique, et la réponse du Radar (ce qui part vers le navigateur). 0 $ ·
 * aucun modèle, aucun réseau.
 */

const h = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'secret-de-test-business-admissible-0123456789';
  process.env.FOUNDER_EMAILS = 'fondateur-env@equipe.test';
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return {
    jeton: null as string | null,
    ids: { ws: u(), brand: u(), capte: u(), legitime: u(), fondateur: u(), env: u(), grade: u(), client: u() },
  };
});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (n === 'tt_session' && h.jeton ? { name: n, value: h.jeton } : n === 'tt_brand' ? { name: n, value: h.ids.brand } : undefined),
    getAll: () => [], has: (n: string) => (n === 'tt_session' && !!h.jeton) || n === 'tt_brand', set: () => {}, delete: () => {},
  }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('notFound'); } }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../lib/auth';
import { effectiveAccess } from '../lib/access';
import { railNav } from '../lib/rbac';
import { personnelPlateforme } from '../lib/personnel-plateforme';
import { gardeResultats } from '../app/(spatial)/sp/adsmap/donnees';
import { radarViewAction } from '../app/actions/adsmap-radar';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 300_000 });

const ids = h.ids;
const jour = (j: number) => new Date(Date.UTC(2026, 9, j, 9));
const EMAIL = {
  capte: 'recrue@equipe.test', legitime: 'ancienne@equipe.test', fondateur: 'kguilbaux@agence-glx.fr',
  env: 'fondateur-env@equipe.test', grade: 'manager@equipe.test', client: 'client@espace.test',
};
/** Le plafond posé pour l'épreuve · un montant qu'on ne peut pas confondre. */
const PLAFOND = '7.77';

beforeAll(async () => {
  process.env.AI_SPEND_CAP_USD = PLAFOND;
  // L'espace est en Core · « Résultats » (Adsmap) est vendu à partir de Plus.
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Espace', plan: 'core', creditsBalance: 100 });
  await db!.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Neva' });
  await db!.insert(schema.users).values([
    // Le compte captant · créé APRÈS l'inscription de son e-mail dans l'équipe (non admissible).
    { id: ids.capte, email: EMAIL.capte, createdAt: jour(10) },
    // Le compte légitime · existait AVANT son inscription dans l'équipe (admissible).
    { id: ids.legitime, email: EMAIL.legitime, createdAt: jour(1) },
    // Fondateur de la liste CODÉE, sans ligne d'équipe · admissible d'office.
    { id: ids.fondateur, email: EMAIL.fondateur, createdAt: jour(10) },
    // Fondateur de l'ENVIRONNEMENT (`FOUNDER_EMAILS`), sans ligne d'équipe · non admissible depuis #1106.
    { id: ids.env, email: EMAIL.env, createdAt: jour(10) },
    // Rôle GRADÉ, compte postérieur · l'admissibilité ne lui a jamais rien ouvert.
    { id: ids.grade, email: EMAIL.grade, createdAt: jour(10) },
    { id: ids.client, email: EMAIL.client, createdAt: jour(1) },
  ]);
  await db!.insert(schema.workspaceMembers).values(
    (['capte', 'legitime', 'fondateur', 'env', 'grade', 'client'] as const).map((k) => ({ workspaceId: ids.ws, userId: ids[k], role: 'owner' as const })),
  );
  await db!.insert(schema.platformStaff).values([
    { email: EMAIL.capte, role: 'adminplus', createdAt: jour(5) },
    { email: EMAIL.legitime, role: 'adminplus', createdAt: jour(5) },
    { email: EMAIL.grade, role: 'manager', createdAt: jour(5) },
  ]);
});
afterAll(() => { delete process.env.FOUNDER_EMAILS; });

async function connecter(uid: string): Promise<NonNullable<Awaited<ReturnType<typeof getSession>>>> {
  h.jeton = await new SignJWT({ uid, ep: 0 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('3600s')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  const s = await getSession();
  expect(s, 'la session doit exister').not.toBeNull();
  return s!;
}

/** L'entrée « Résultats » du rail · verrouillée par la formule ou non (absente · `null`). */
function resultatsAuRail(s: Parameters<typeof effectiveAccess>[0]): boolean | null {
  const item = railNav(effectiveAccess(s)).flatMap((g) => g.items).find((i) => i.key === 'adsmap');
  return item ? item.locked : null;
}

async function avecFormule<T>(plan: string, f: () => Promise<T>): Promise<T> {
  await db!.update(schema.workspaces).set({ plan }).where(eq(schema.workspaces.id, ids.ws));
  try { return await f(); } finally { await db!.update(schema.workspaces).set({ plan: 'core' }).where(eq(schema.workspaces.id, ids.ws)); }
}

describe('Compte qui a capté un e-mail Admin+ préinscrit (non admissible)', () => {
  it('le scénario · la session porte le rôle d’accès total, non admissible', async () => {
    const s = await connecter(ids.capte);
    expect(s.equipe).toMatchObject({ role: 'adminplus', plateformeAdmissible: false });
    expect(s.plan).toBe('core');
  });

  it('formule effective = celle de l’espace (Core), pas Business', async () => {
    const s = await connecter(ids.capte);
    expect(effectiveAccess(s).plan, 'un compte non admissible ne doit pas recevoir la formule Business').toBe('core');
  });

  it('« Résultats » (Plus) reste verrouillé · au rail ET à la garde de la rubrique', async () => {
    const s = await connecter(ids.capte);
    expect(resultatsAuRail(s), 'un compte non admissible ne doit pas voir les verrous de formule levés').toBe(true);
    expect(await gardeResultats(), 'la garde de Résultats doit refuser par la formule').toEqual({ ok: false, raison: 'plan' });
  });

  it('dépense de la plateforme non visible · même dans un espace Plus où le Radar s’ouvre', async () => {
    await avecFormule('plus', async () => {
      const s = await connecter(ids.capte);
      expect(personnelPlateforme(s), 'un compte non admissible ne doit pas lire la dépense de la plateforme').toBe(false);
      const r = await radarViewAction();
      expect(r.error).toBeUndefined();
      expect(r.view?.spend, 'la dépense de la plateforme est partie vers le navigateur').toBeUndefined();
      expect(JSON.stringify(r), 'montant du plafond dans la réponse').not.toContain(PLAFOND);
    });
  });
});

describe('Admin+ admissible · inchangé', () => {
  it('Business, rien de verrouillé, dépense visible', async () => {
    const s = await connecter(ids.legitime);
    expect(s.equipe).toMatchObject({ role: 'adminplus', plateformeAdmissible: true });
    expect(effectiveAccess(s).plan).toBe('business');
    expect(resultatsAuRail(s)).toBe(false);
    expect(railNav(effectiveAccess(s)).flatMap((g) => g.items).filter((i) => i.locked).map((i) => i.key), 'aucune entrée verrouillée').toEqual([]);
    expect((await gardeResultats()).ok).toBe(true);
    expect(personnelPlateforme(s)).toBe(true);
    const r = await radarViewAction();
    expect(r.view?.spend?.capUsd).toBe(7.77);
  });
});

describe('Fondateur codé · inchangé', () => {
  it('Business, rien de verrouillé, dépense visible', async () => {
    const s = await connecter(ids.fondateur);
    expect(s.equipe).toMatchObject({ role: 'adminplus', plateformeAdmissible: true });
    expect(effectiveAccess(s).plan).toBe('business');
    expect(resultatsAuRail(s)).toBe(false);
    expect((await gardeResultats()).ok).toBe(true);
    expect(personnelPlateforme(s)).toBe(true);
    expect((await radarViewAction()).view?.spend?.capUsd).toBe(7.77);
  });
});

describe('Fondateur de l’environnement sans inscription (non admissible depuis #1106) · même sort que le compte captant', () => {
  it('formule de l’espace, « Résultats » verrouillé, dépense non visible', async () => {
    const s = await connecter(ids.env);
    expect(s.equipe).toMatchObject({ role: 'adminplus', plateformeAdmissible: false, inscritEquipe: false });
    expect(effectiveAccess(s).plan).toBe('core');
    expect(resultatsAuRail(s)).toBe(true);
    expect(personnelPlateforme(s)).toBe(false);
  });
});

describe('Rôle gradé (Manager), compte postérieur · inchangé', () => {
  it('formule de l’espace, la face équipe lève le verrou de « Résultats » (sa matrice l’ouvre), dépense non visible', async () => {
    const s = await connecter(ids.grade);
    expect(s.equipe).toMatchObject({ role: 'manager', plateformeAdmissible: false });
    expect(effectiveAccess(s).plan).toBe('core');
    expect(effectiveAccess(s).equipe?.role).toBe('manager');
    expect(resultatsAuRail(s)).toBe(false);
    expect((await gardeResultats()).ok).toBe(true);
    expect(personnelPlateforme(s)).toBe(false);
  });
});

describe('Client (sans équipe) · inchangé', () => {
  it('formule de l’espace, « Résultats » verrouillé, dépense non visible', async () => {
    const s = await connecter(ids.client);
    expect(s.equipe ?? null).toBeNull();
    expect(effectiveAccess(s)).toEqual({ role: 'owner', plan: 'core' });
    expect(resultatsAuRail(s)).toBe(true);
    expect(await gardeResultats()).toEqual({ ok: false, raison: 'plan' });
    expect(personnelPlateforme(s)).toBe(false);
  });
});
