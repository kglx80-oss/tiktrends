// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * L'espace courant de la session · signalement de l'audit #1088
 * (`docs/ux-v5/audit-tour-controle-tickets.md`) · « `getSession` prend la
 * PREMIÈRE appartenance du compte (`limit(1)`, sans ordre) comme espace
 * courant ».
 *
 * Sur main 04d6270b, un compte membre de deux espaces recevait l'appartenance
 * que Postgres rendait en premier · l'ordre PHYSIQUE des lignes de
 * `workspace_members`. Une simple réécriture de la ligne (`role = role`, ce
 * que fait tout changement de rôle) la déplace en fin de table, et l'espace
 * courant · donc le rôle, le plan, les marques, les droits · basculait sans
 * que rien n'ait changé pour la personne. Reproduit ici (ROUGE sur main).
 *
 * Aucun mécanisme de choix d'espace n'existe (ni cookie, ni sélecteur, ni
 * colonne « dernier espace ») · l'espace courant est désormais décidé par une
 * règle pure du noyau (`espaceCourant`, `packages/core/src/espace-courant.ts`)
 * · l'espace le plus ancien, puis le plus petit identifiant.
 *
 * Ce fichier éprouve le VRAI `getSession` sur un jeton signé (seul le cookie
 * est apporté par le test), base réelle (pglite, migrations du dépôt) :
 *  · compte à une appartenance · strictement le résultat de main (la requête
 *    de main est recopiée ici comme référence) ;
 *  · compte à deux appartenances · le même espace quel que soit l'ordre
 *    d'insertion ou l'ordre physique des lignes ;
 *  · le rôle, le plan, les marques et les permissions studio suivent l'espace
 *    retenu · une promotion ailleurs ne déplace rien ;
 *  · l'appartenance retenue disparue · repli sur la suivante, relue à la
 *    requête suivante · plus aucune · pas de session ;
 *  · époque de session inchangée ;
 *  · rien n'est écrit à la lecture ;
 *  · recensement · `getSession` est le SEUL lecteur des appartenances d'un
 *    compte tous espaces confondus · un second choix d'espace fait échouer.
 * 0 $ · aucun modèle, aucun appel réseau. Dates fixes, aucune date « à venir ».
 */

const h = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'secret-de-test-espace-courant-0123456789abcdef';
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return {
    jeton: null as string | null,
    ids: {
      wsVieux: u(), wsNeuf: u(), wsSeul: u(),
      // Deux espaces créés au même instant · l'identifiant départage (fixé pour être sûr de l'ordre).
      wsEgalPetit: '00000000-0000-4000-8000-00000000e001', wsEgalGrand: 'ffffffff-ffff-4fff-bfff-00000000e002',
      uDeux: u(), uDeuxInverse: u(), uMembreDeux: u(), uEgal: u(), uSeulOwner: u(), uSeulMembre: u(), uSeulLecteur: u(), uSans: u(),
      wsT1: u(), wsT2: u(), wsT3: u(), uTrois: u(),
      bVieux: u(), bNeuf: u(),
    },
  };
});

vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect:${u}`); },
  notFound: () => { throw new Error('notFound'); },
}));
// Le cookie de session est le SEUL état apporté par le test · `getSession` est le vrai.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (n === 'tt_session' && h.jeton ? { name: n, value: h.jeton } : undefined),
    getAll: () => [], has: (n: string) => n === 'tt_session' && !!h.jeton, set: () => {}, delete: () => {},
  }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

import { SignJWT } from 'jose';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../lib/auth';
import { gardeStudio } from '../lib/studios/garde';
import { effectiveAccess } from '../lib/access';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 300_000 });

const ids = h.ids;
const M = schema.workspaceMembers;
const jour = (j: number, heure = 9) => new Date(Date.UTC(2026, 9, j, heure));

/** Un VRAI jeton de session, signé comme `createSession` le signe · l'époque figée à l'émission. */
async function connecter(uid: string): Promise<void> {
  const [u] = await db!.select({ e: schema.users.sessionEpoch }).from(schema.users).where(eq(schema.users.id, uid));
  h.jeton = await new SignJWT({ uid, ep: u?.e ?? 0 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('3600s')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
}

/** Réécrit la ligne d'appartenance SANS rien changer (`role = role`) · Postgres la déplace en fin de table. */
async function reecrire(workspaceId: string, userId: string): Promise<void> {
  await db!.update(M).set({ role: sql`${M.role}` }).where(and(eq(M.workspaceId, workspaceId), eq(M.userId, userId)));
}

/** Réécrit la ligne d'un espace SANS rien changer · elle part en fin de table. */
async function reecrireEspace(workspaceId: string): Promise<void> {
  await db!.update(schema.workspaces).set({ name: sql`${schema.workspaces.name}` }).where(eq(schema.workspaces.id, workspaceId));
}

/** L'ordre PHYSIQUE d'une liste d'espaces dans la table `workspaces`. */
async function ordrePhysiqueEspaces(dans: readonly string[]): Promise<string[]> {
  const r = await db!.execute(sql`select id from workspaces order by ctid`);
  return (r as unknown as { rows: Array<{ id: string }> }).rows.map((l) => l.id).filter((id) => dans.includes(id));
}

function permutations<T>(l: readonly T[]): T[][] {
  if (l.length <= 1) return [[...l]];
  return l.flatMap((x, i) => permutations([...l.slice(0, i), ...l.slice(i + 1)]).map((p) => [x, ...p]));
}

/** L'ordre PHYSIQUE des appartenances d'un compte, tel qu'un parcours de table le rend. */
async function ordrePhysique(userId: string): Promise<string[]> {
  const r = await db!.execute(sql`select workspace_id from workspace_members where user_id = ${userId} order by ctid`);
  return (r as unknown as { rows: Array<{ workspace_id: string }> }).rows.map((l) => l.workspace_id);
}

/**
 * La session telle que MAIN 04d6270b la construisait (`getSession`, lignes de
 * l'appartenance et de l'espace recopiées) · référence des comptes à une seule
 * appartenance. L'équipe plateforme n'est pas recopiée · elle ne dépend pas de
 * l'espace et le vrai `getSession` la calcule toujours de la même façon.
 */
async function sessionDeMain(uid: string) {
  const [u] = await db!.select().from(schema.users).where(eq(schema.users.id, uid)).limit(1);
  if (!u) return null;
  const [m] = await db!.select().from(M).where(eq(M.userId, uid)).limit(1);
  if (!m) return null;
  const [w] = await db!.select().from(schema.workspaces).where(eq(schema.workspaces.id, m.workspaceId)).limit(1);
  if (!w) return null;
  return { user: { id: u.id, email: u.email, name: u.name }, workspaceId: w.id, workspaceName: w.name, role: m.role, plan: w.plan || 'starter' };
}

/** Tout ce qu'une lecture de session pourrait écrire · comptes, espaces, appartenances, équipe, journal. */
async function instantane(): Promise<string> {
  const [users, workspaces, membres, equipe, audit, notifs] = await Promise.all([
    db!.select().from(schema.users), db!.select().from(schema.workspaces), db!.select().from(M),
    db!.select().from(schema.platformStaff), db!.select().from(schema.studioAuditEvents), db!.select().from(schema.notifications),
  ]);
  const trie = <T>(l: T[]) => l.map((x) => JSON.stringify(x)).sort();
  return JSON.stringify({ users: trie(users), workspaces: trie(workspaces), membres: trie(membres), equipe: trie(equipe), audit: trie(audit), notifs: trie(notifs) });
}

beforeAll(async () => {
  await db!.insert(schema.workspaces).values([
    // Le plus RÉCENT est inséré le premier · l'ordre physique ne suit pas l'âge.
    { id: ids.wsNeuf, name: 'Atelier Neuf', plan: 'business', createdAt: jour(5) },
    { id: ids.wsVieux, name: 'Maison Ancienne', plan: 'core', createdAt: jour(1) },
    { id: ids.wsSeul, name: 'Studio Seul', plan: 'plus', createdAt: jour(3) },
    { id: ids.wsEgalGrand, name: 'Égal Grand', plan: 'plus', createdAt: jour(2) },
    { id: ids.wsEgalPetit, name: 'Égal Petit', plan: 'core', createdAt: jour(2) },
    // Trois espaces · le plus ancien (T1) inséré au MILIEU.
    { id: ids.wsT2, name: 'Trois · deux', plan: 'plus', createdAt: jour(7) },
    { id: ids.wsT1, name: 'Trois · un', plan: 'core', createdAt: jour(6) },
    { id: ids.wsT3, name: 'Trois · trois', plan: 'business', createdAt: jour(8) },
  ]);
  await db!.insert(schema.users).values([
    { id: ids.uDeux, email: 'deux@espace.test', name: 'Dana Deux', createdAt: jour(1, 8) },
    { id: ids.uDeuxInverse, email: 'inverse@espace.test', name: 'Ines Inverse', createdAt: jour(1, 8) },
    { id: ids.uMembreDeux, email: 'membre-deux@espace.test', name: 'Mila Membre', createdAt: jour(1, 8) },
    { id: ids.uEgal, email: 'egal@espace.test', name: 'Eli Égal', createdAt: jour(1, 8) },
    { id: ids.uSeulOwner, email: 'owner@seul.test', name: 'Olga Seule', createdAt: jour(3, 8) },
    { id: ids.uSeulMembre, email: 'membre@seul.test', name: null, createdAt: jour(3, 8) },
    { id: ids.uSeulLecteur, email: 'lecteur@seul.test', name: 'Léo Lecteur', createdAt: jour(3, 8) },
    { id: ids.uTrois, email: 'trois@espace.test', name: 'Théo Trois', createdAt: jour(1, 8) },
    { id: ids.uSans, email: 'sans@espace.test', name: 'Sans Espace', createdAt: jour(3, 8) },
  ]);
  await db!.insert(M).values([
    // Dana · propriétaire de l'espace NEUF (inséré d'abord), simple lectrice de l'ANCIEN.
    { workspaceId: ids.wsNeuf, userId: ids.uDeux, role: 'owner' },
    { workspaceId: ids.wsVieux, userId: ids.uDeux, role: 'client_viewer' },
    // Ines · mêmes deux espaces, insérés dans l'ordre inverse.
    { workspaceId: ids.wsVieux, userId: ids.uDeuxInverse, role: 'client_viewer' },
    { workspaceId: ids.wsNeuf, userId: ids.uDeuxInverse, role: 'owner' },
    // Mila · propriétaire de l'espace neuf (inséré d'abord), membre de l'ancien.
    { workspaceId: ids.wsNeuf, userId: ids.uMembreDeux, role: 'owner' },
    { workspaceId: ids.wsVieux, userId: ids.uMembreDeux, role: 'member' },
    // Eli · deux espaces du même instant, le grand identifiant inséré d'abord.
    { workspaceId: ids.wsEgalGrand, userId: ids.uEgal, role: 'owner' },
    { workspaceId: ids.wsEgalPetit, userId: ids.uEgal, role: 'member' },
    // Théo · trois espaces, le plus ancien au milieu.
    { workspaceId: ids.wsT2, userId: ids.uTrois, role: 'owner' },
    { workspaceId: ids.wsT1, userId: ids.uTrois, role: 'member' },
    { workspaceId: ids.wsT3, userId: ids.uTrois, role: 'admin' },
    // Une seule appartenance · la très grande majorité des comptes.
    { workspaceId: ids.wsSeul, userId: ids.uSeulOwner, role: 'owner' },
    { workspaceId: ids.wsSeul, userId: ids.uSeulMembre, role: 'member' },
    { workspaceId: ids.wsSeul, userId: ids.uSeulLecteur, role: 'client_viewer' },
  ]);
  await db!.insert(schema.brands).values([
    { id: ids.bVieux, workspaceId: ids.wsVieux, name: 'Marque de la maison ancienne' },
    { id: ids.bNeuf, workspaceId: ids.wsNeuf, name: 'Marque de l’atelier neuf' },
  ]);
});

beforeEach(() => { h.jeton = null; });

// En PREMIER · avant tout autre cas, une écriture faite à la lecture (même idempotente) se voit encore.
describe('rien n’est écrit à la lecture', () => {
  it('lire la session de chaque compte ne change aucune ligne', async () => {
    const avant = await instantane();
    for (const uid of [ids.uDeux, ids.uDeuxInverse, ids.uMembreDeux, ids.uTrois, ids.uEgal, ids.uSeulOwner, ids.uSeulMembre, ids.uSeulLecteur, ids.uSans]) {
      await connecter(uid);
      await getSession();
      await getSession();
    }
    expect(await instantane(), 'lire la session a écrit en base').toBe(avant);
  });
});

describe('compte à UNE appartenance · strictement le résultat de main', () => {
  for (const [qui, uid, role] of [
    ['propriétaire', ids.uSeulOwner, 'owner'],
    ['membre (nom absent)', ids.uSeulMembre, 'member'],
    ['lecteur client', ids.uSeulLecteur, 'client_viewer'],
  ] as const) {
    it(`${qui} · la session est celle de main, champ pour champ`, async () => {
      await connecter(uid);
      const s = await getSession();
      const ref = await sessionDeMain(uid);
      expect(ref, 'la référence de main ne trouve pas le compte · le semis regarde ailleurs').not.toBeNull();
      expect(s, 'compte à une appartenance sans session · la sélection d’espace a rompu le cas courant').not.toBeNull();
      const { equipe, ...sansEquipe } = s!;
      expect(sansEquipe, 'compte à une appartenance · la session n’est plus celle de main').toEqual(ref);
      expect(equipe ?? null).toBeNull();
      expect(s!.workspaceId).toBe(ids.wsSeul);
      expect(s!.role).toBe(role);
      expect(s!.plan).toBe('plus');
    });
  }

  it('l’ordre physique de sa ligne ne change rien', async () => {
    await connecter(ids.uSeulMembre);
    const avant = await getSession();
    await reecrire(ids.wsSeul, ids.uSeulMembre);
    expect(await getSession()).toEqual(avant);
  });

  it('sans aucune appartenance · pas de session, comme sur main', async () => {
    await connecter(ids.uSans);
    expect(await sessionDeMain(ids.uSans)).toBeNull();
    expect(await getSession(), 'un compte sans espace reçoit une session').toBeNull();
  });
});

describe('compte à DEUX appartenances · le même espace quel que soit l’ordre des lignes', () => {
  it('l’ordre d’insertion ne compte pas · les deux comptes retiennent l’espace le plus ancien', async () => {
    await connecter(ids.uDeux);
    const deux = await getSession();
    await connecter(ids.uDeuxInverse);
    const inverse = await getSession();
    expect(deux!.workspaceId, 'l’espace courant dépend de l’ordre d’insertion des appartenances').toBe(inverse!.workspaceId);
    expect(deux!.workspaceId, 'l’espace courant n’est pas l’espace le plus ancien').toBe(ids.wsVieux);
    expect(deux!.workspaceName).toBe('Maison Ancienne');
  });

  it('reproduction · réécrire une ligne sans rien changer ne déplace plus l’espace courant', async () => {
    await connecter(ids.uDeux);
    const avant = await getSession();
    expect(await ordrePhysique(ids.uDeux)).toEqual([ids.wsNeuf, ids.wsVieux]);
    // Le geste que fait tout changement de rôle · la ligne de l'espace neuf part en fin de table.
    await reecrire(ids.wsNeuf, ids.uDeux);
    expect(await ordrePhysique(ids.uDeux), 'la réécriture n’a pas changé l’ordre physique · la reproduction ne prouve rien').toEqual([ids.wsVieux, ids.wsNeuf]);
    const apres = await getSession();
    expect(apres!.workspaceId, 'l’espace courant dépend de l’ordre physique des lignes de workspace_members').toBe(avant!.workspaceId);
    // Et retour à l'ordre de départ.
    await reecrire(ids.wsVieux, ids.uDeux);
    expect(await ordrePhysique(ids.uDeux)).toEqual([ids.wsNeuf, ids.wsVieux]);
    expect((await getSession())!.workspaceId, 'l’espace courant dépend de l’ordre physique des lignes de workspace_members').toBe(avant!.workspaceId);
  });

  it('trois espaces · chaque ordre physique des appartenances ET des espaces · toujours le plus ancien', async () => {
    await connecter(ids.uTrois);
    const trois: string[] = [ids.wsT1, ids.wsT2, ids.wsT3];
    // Postgres ne garantit pas où va une ligne réécrite (un emplacement libéré peut être repris) ·
    // on lit l'ordre OBTENU, et on exige d'avoir vu le plus ancien en tête, au milieu ET en fin de table.
    const vus = { appartenances: new Set<string>(), espaces: new Set<string>(), rangsT1: new Set<number>() };
    const code = (l: string[]) => l.map((x) => trois.indexOf(x) + 1).join('');
    for (const p of permutations(trois)) {
      for (const ws of p) await reecrire(ws, ids.uTrois);
      const pObs = await ordrePhysique(ids.uTrois);
      for (const q of permutations(trois)) {
        for (const ws of q) await reecrireEspace(ws);
        const qObs = await ordrePhysiqueEspaces(trois);
        vus.appartenances.add(code(pObs)); vus.espaces.add(code(qObs)); vus.rangsT1.add(pObs.indexOf(ids.wsT1));
        const s = (await getSession())!;
        expect(s.workspaceId, `l’espace courant dépend de l’ordre physique (appartenances ${code(pObs)}, espaces ${code(qObs)})`).toBe(ids.wsT1);
        expect(s.role).toBe('member');
        expect(s.plan).toBe('core');
      }
    }
    expect([...vus.rangsT1].sort(), 'le plus ancien n’a pas occupé chaque rang physique · le cas ne prouve rien').toEqual([0, 1, 2]);
    expect(vus.appartenances.size, 'trop peu d’ordres physiques d’appartenances obtenus').toBeGreaterThanOrEqual(3);
    expect(vus.espaces.size, 'trop peu d’ordres physiques d’espaces obtenus').toBeGreaterThanOrEqual(2);
  });

  it('même instant de création · le plus petit identifiant, quel que soit l’ordre', async () => {
    await connecter(ids.uEgal);
    expect((await getSession())!.workspaceId, 'à date égale, l’identifiant ne départage pas').toBe(ids.wsEgalPetit);
    await reecrire(ids.wsEgalPetit, ids.uEgal);
    expect(await ordrePhysique(ids.uEgal)).toEqual([ids.wsEgalGrand, ids.wsEgalPetit]);
    expect((await getSession())!.workspaceId, 'à date égale, l’identifiant ne départage pas').toBe(ids.wsEgalPetit);
    await reecrire(ids.wsEgalGrand, ids.uEgal);
    expect((await getSession())!.workspaceId, 'à date égale, l’identifiant ne départage pas').toBe(ids.wsEgalPetit);
  });
});

describe('le rôle et les droits suivent l’espace retenu', () => {
  it('rôle et plan de l’espace retenu · lectrice ici, la propriété ailleurs ne déteint pas', async () => {
    await connecter(ids.uDeux);
    const s = (await getSession())!;
    expect(s.workspaceId).toBe(ids.wsVieux);
    expect(s.role, 'le rôle n’est pas celui de l’espace retenu').toBe('client_viewer');
    expect(s.plan, 'le plan n’est pas celui de l’espace retenu').toBe('core');
    expect(effectiveAccess(s)).toEqual({ role: 'client_viewer', plan: 'core' });
    // Lectrice client · le studio lui est fermé dans l'espace retenu, même propriétaire de l'autre.
    const g = await gardeStudio('studio.read');
    expect(g.ok, 'un droit de l’autre espace a déteint sur l’espace courant').toBe(false);
    expect(!g.ok && g.code).toBe('FORBIDDEN');
  });

  it('marques et permissions studio de l’espace retenu · jamais celles de l’autre', async () => {
    await connecter(ids.uMembreDeux);
    const s = (await getSession())!;
    expect(s.workspaceId).toBe(ids.wsVieux);
    expect(s.role).toBe('member');
    const g = await gardeStudio('studio.read');
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.ctx.workspaceId).toBe(ids.wsVieux);
    expect(g.ctx.roleEspace, 'le rôle studio n’est pas celui de l’espace retenu').toBe('member');
    expect(g.ctx.marques, 'les marques ne sont pas celles de l’espace retenu').toEqual([ids.bVieux]);
  });

  it('une promotion dans l’autre espace ne déplace pas l’espace courant', async () => {
    await connecter(ids.uDeuxInverse);
    await db!.update(M).set({ role: 'admin' }).where(and(eq(M.workspaceId, ids.wsVieux), eq(M.userId, ids.uDeuxInverse)));
    try {
      const s = (await getSession())!;
      expect(s.workspaceId, 'un changement de rôle a déplacé l’espace courant').toBe(ids.wsVieux);
      expect(s.role, 'le rôle relu n’est pas le rôle actuel en base').toBe('admin');
    } finally {
      await db!.update(M).set({ role: 'client_viewer' }).where(and(eq(M.workspaceId, ids.wsVieux), eq(M.userId, ids.uDeuxInverse)));
    }
    expect((await getSession())!.role).toBe('client_viewer');
  });

  it('l’appartenance retenue disparaît · repli sur l’autre à la requête suivante, avec SES droits', async () => {
    await connecter(ids.uDeuxInverse);
    expect((await getSession())!.workspaceId).toBe(ids.wsVieux);
    try {
      await db!.delete(M).where(and(eq(M.workspaceId, ids.wsVieux), eq(M.userId, ids.uDeuxInverse)));
      const s = (await getSession())!;
      expect(s.workspaceId, 'l’appartenance retirée sert encore d’espace courant').toBe(ids.wsNeuf);
      expect(s.role).toBe('owner');
      expect(s.plan).toBe('business');
      const g = await gardeStudio('studio.read');
      expect(g.ok && g.ctx.marques).toEqual([ids.bNeuf]);
      await db!.delete(M).where(and(eq(M.workspaceId, ids.wsNeuf), eq(M.userId, ids.uDeuxInverse)));
      expect(await getSession(), 'plus aucune appartenance · une session est encore rendue').toBeNull();
    } finally {
      // Restaurer le semis pour les autres cas.
      await db!.insert(M).values([
        { workspaceId: ids.wsVieux, userId: ids.uDeuxInverse, role: 'client_viewer' },
        { workspaceId: ids.wsNeuf, userId: ids.uDeuxInverse, role: 'owner' },
      ]).onConflictDoNothing();
    }
  });

  it('l’époque de session reste la porte · un jeton révolu est refusé, quel que soit l’espace', async () => {
    await connecter(ids.uDeux);
    expect(await getSession()).not.toBeNull();
    await db!.update(schema.users).set({ sessionEpoch: sql`${schema.users.sessionEpoch} + 1` }).where(eq(schema.users.id, ids.uDeux));
    try {
      expect(await getSession(), 'un jeton d’époque révolue ouvre une session').toBeNull();
    } finally {
      await db!.update(schema.users).set({ sessionEpoch: sql`${schema.users.sessionEpoch} - 1` }).where(eq(schema.users.id, ids.uDeux));
    }
  });
});

/* ───────────────────────── recensement ───────────────────────── */

/**
 * Lire les appartenances d'un COMPTE, tous espaces confondus, c'est choisir un
 * espace · seul `getSession` le fait, par la règle du noyau. Un second lecteur
 * (un sélecteur d'espace, un autre `limit(1)`) doit passer par `espaceCourant`
 * et entrer ici avec un test qui le fait tomber.
 */
const CHOIX_D_ESPACE = ['lib/auth.ts'];
const LIT_LES_ESPACES_D_UN_COMPTE = /\.from\(schema\.workspaceMembers\)[\s\S]{0,240}?\.where\(eq\(schema\.workspaceMembers\.userId,/;

describe('recensement · qui choisit l’espace d’un compte', () => {
  it('getSession seul lit les appartenances d’un compte tous espaces confondus, par la règle du noyau', () => {
    const racine = process.cwd();
    const fichiers: string[] = [];
    const parcourir = (d: string) => { for (const n of readdirSync(d)) { if (['node_modules', '.next', 'test'].includes(n)) continue; const p = join(d, n); statSync(p).isDirectory() ? parcourir(p) : /\.tsx?$/.test(n) && fichiers.push(p); } };
    for (const d of ['app', 'lib', 'spatial']) parcourir(join(racine, d));
    const lecteurs = fichiers.filter((f) => LIT_LES_ESPACES_D_UN_COMPTE.test(readFileSync(f, 'utf8'))).map((f) => relative(racine, f)).sort();
    expect(lecteurs, 'un fichier choisit l’espace d’un compte hors de getSession · il doit passer par espaceCourant et être recensé').toEqual(CHOIX_D_ESPACE);
    expect(readFileSync(join(racine, 'lib/auth.ts'), 'utf8'), 'getSession ne passe plus par la règle du noyau').toMatch(/espaceCourant\(/);
  });
});
