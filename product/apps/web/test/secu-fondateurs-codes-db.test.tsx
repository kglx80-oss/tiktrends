// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { isValidElement, type ReactElement } from 'react';

/**
 * Suivi de #1106 · #1108 · #1115 · les quatre trous que l'admissibilité
 * laissait ouverts, tranchés par le propriétaire.
 *
 *  1. « Codé seul » · les pouvoirs FONDATEUR (Tour de contrôle et ses gestes,
 *     dépenses IA, barème des crédits, formules et dons de crédits, bêta,
 *     stockage, diagnostic Stripe, réglages maison de Jarvis, crédits
 *     illimités de fondateur) ne s'ouvrent qu'à la liste CODÉE. Une adresse
 *     de `FOUNDER_EMAILS` sans compte pouvait être créée par n'importe qui,
 *     qui obtenait tout.
 *  2. « Fermer aussi » · un rôle GRADÉ non admissible (compte créé après sa
 *     préinscription) perd la face équipe, comme l'accès total.
 *  3. `/admin/equipe` · un compte non admissible ne lit plus ni la liste de
 *     l'équipe (e-mails préinscrits, captables à leur tour) ni l'audit · il
 *     lit le message qui lui dit quoi faire.
 *  4. Trois `canAccess` construits sur la session BRUTE (sans
 *     `effectiveAccess`) rendaient la face équipe à un compte non admissible.
 *  5. Suivi de #1117 · le refus `?e=admissible` ne tombe jamais sur l'écran
 *     complet (sa légende était inatteignable, retirée), et l'audit ne trace
 *     « equipe: » que pour un compte admissible (une adresse de
 *     `FOUNDER_EMAILS` était tracée « equipe:adminplus »).
 *
 * VRAI `getSession` sur un jeton signé (seul le cookie est apporté), base
 * réelle (pglite), VRAIES portes, pages et actions · on lit ce qui SORT ·
 * valeur rendue, redirection, HTML, lignes en base. 0 $ · aucun modèle,
 * aucun réseau.
 */

const h = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'secret-de-test-fondateurs-codes-0123456789';
  process.env.FOUNDER_EMAILS = 'fondateur-env@equipe.test';
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return {
    jeton: null as string | null,
    ids: {
      ws: u(), brand: u(), audit: u(),
      code: u(), env: u(), capte: u(), legitime: u(), admin: u(), gradeNon: u(), gradeOk: u(), client: u(),
    },
  };
});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (n === 'tt_session' && h.jeton ? { name: n, value: h.jeton } : n === 'tt_brand' ? { name: n, value: h.ids.brand } : undefined),
    getAll: () => [], has: (n: string) => (n === 'tt_session' && !!h.jeton) || n === 'tt_brand', set: () => {}, delete: () => {},
  }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {}, unstable_cache: (f: unknown) => f }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect ${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }),
  usePathname: () => '/admin/equipe',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
// Les lectures d'exploitation du fondateur · aucune lecture réseau ni disque.
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: 'dépense', blocked: false }), depensesAReconcilier: async () => ({ lignes: [] }) }));
vi.mock('../lib/deployment', () => ({ currentDeployment: async () => ({ ok: true, summary: 'en ligne', renderVersion: 1, applied: 1, inBuild: 1, build: null }) }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { MESSAGE_NON_ADMISSIBLE, MESSAGE_FONDATEUR_HORS_CODE, MESSAGE_GRADE_NON_ADMISSIBLE, sortieTagging } from '@tiktrends/core';
import { getSession } from '../lib/auth';
import { effectiveAccess } from '../lib/access';
import { railNav } from '../lib/rbac';
import { unlimitedCredits } from '../lib/credits';
import { personnelPlateforme } from '../lib/personnel-plateforme';
import { porteDepenses } from '../lib/porte-depenses';
import { droitsSousNavAdmin } from '../lib/onglets-reglages';
import { chargerCoquille } from '../lib/spatial/coquille';
import { porteAdminGeste } from '../app/(spatial)/sp/admin/donnees';
import { gardeResultats } from '../app/(spatial)/sp/adsmap/donnees';
import { chargerMarque } from '../app/(spatial)/sp/brands/[id]/donnees';
import CreditsPage from '../app/(spatial)/sp/credits/page';
import SourcesPage from '../app/(spatial)/sp/jarvis/sources/page';
import SettingsPage from '../app/(spatial)/sp/settings/page';
import ProfilPage from '../app/(spatial)/sp/profile/page';
import TagsPage from '../app/(spatial)/sp/tags/page';
import EquipePage from '../app/(spatial)/sp/admin/equipe/page';
import { enregistrerStaffAction } from '../app/actions/equipe';
import { creerProjet } from '../app/actions/studios/projets';
import { grantCreditsAction, rechargeAllocationAction } from '../app/actions/credits';
import { changePlanAction } from '../app/actions/billing';
import { updatePlanConfigAction } from '../app/actions/platform';
import { grantTestPackAction, revokeTrialAction } from '../app/actions/beta';
import { configureBucketAction, testStorageAction } from '../app/actions/storage';
import { runStripeDiagnosticAction } from '../app/actions/stripe-diagnostic';
import { avecSpatial } from './spatial/fournisseur';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 300_000 });

const ids = h.ids;
const jour = (j: number) => new Date(Date.UTC(2026, 9, j, 9));
const EMAIL = {
  code: 'kguilbaux@agence-glx.fr', env: 'fondateur-env@equipe.test',
  capte: 'recrue@equipe.test', legitime: 'ancienne@equipe.test', admin: 'admin-ancien@equipe.test',
  gradeNon: 'manager-recent@equipe.test', gradeOk: 'manager-ancien@equipe.test', client: 'client@espace.test',
};
/** Préinscrit dans l'équipe, sans compte · l'adresse qu'un capteur viserait ensuite. */
const PREINSCRIT = 'preinscrit-sans-compte@equipe.test';
/** L'acteur du registre d'audit · un nom qu'on ne peut pas confondre. */
const ACTEUR_AUDIT = 'Acteur Audit Témoin';
const SOLDE = 100;

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Espace', plan: 'core', creditsBalance: SOLDE, onboardedAt: jour(1) });
  await db!.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Neva' });
  await db!.insert(schema.users).values([
    // Fondateur de la liste CODÉE, sans ligne d'équipe.
    { id: ids.code, email: EMAIL.code, name: 'Fondateur codé', createdAt: jour(10) },
    // Adresse de `FOUNDER_EMAILS` · compte créé par quiconque l'a créé le premier.
    { id: ids.env, email: EMAIL.env, name: 'Capteur env', createdAt: jour(10) },
    // Accès total, compte créé APRÈS l'inscription (capté).
    { id: ids.capte, email: EMAIL.capte, createdAt: jour(10) },
    // Accès total admissible (Admin+, puis Admin).
    { id: ids.legitime, email: EMAIL.legitime, createdAt: jour(1) },
    { id: ids.admin, email: EMAIL.admin, createdAt: jour(1) },
    // Manager · compte postérieur (non admissible), compte antérieur (admissible).
    { id: ids.gradeNon, email: EMAIL.gradeNon, createdAt: jour(10) },
    { id: ids.gradeOk, email: EMAIL.gradeOk, createdAt: jour(1) },
    { id: ids.client, email: EMAIL.client, createdAt: jour(1) },
  ]);
  await db!.insert(schema.workspaceMembers).values(
    (['code', 'env', 'capte', 'legitime', 'admin', 'gradeNon', 'gradeOk', 'client'] as const).map((k) => ({ workspaceId: ids.ws, userId: ids[k], role: 'owner' as const })),
  );
  await db!.insert(schema.platformStaff).values([
    { email: EMAIL.capte, role: 'adminplus', createdAt: jour(5) },
    { email: EMAIL.legitime, role: 'adminplus', createdAt: jour(5) },
    { email: EMAIL.admin, role: 'admin', createdAt: jour(5) },
    { email: EMAIL.gradeNon, role: 'manager', createdAt: jour(5) },
    { email: EMAIL.gradeOk, role: 'manager', createdAt: jour(5) },
    { email: PREINSCRIT, role: 'admin', createdAt: jour(5) },
  ]);
  await db!.update(schema.users).set({ name: ACTEUR_AUDIT }).where(eq(schema.users.id, ids.legitime));
  await db!.insert(schema.studioAuditEvents).values({ id: ids.audit, workspaceId: null, actorId: ids.legitime, effectiveRole: 'equipe:adminplus', action: 'studios.prompt.release', targetType: 'prompt', targetId: 'p1', traceId: 't1', occurredAt: jour(6) });
});
afterAll(() => { delete process.env.FOUNDER_EMAILS; });

type Qui = keyof typeof ids & keyof typeof EMAIL;

async function connecter(qui: Qui): Promise<NonNullable<Awaited<ReturnType<typeof getSession>>>> {
  h.jeton = await new SignJWT({ uid: ids[qui], ep: 0 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('3600s')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  const s = await getSession();
  expect(s, 'la session doit exister').not.toBeNull();
  return s!;
}

/** Ce que lance l'appel · la redirection (`redirect /x`), ou `null` s'il rend. */
async function redirection(f: () => Promise<unknown>): Promise<string | null> {
  try { await f(); return null; } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith('redirect ')) return m.slice('redirect '.length);
    throw e;
  }
}

const props = (el: unknown) => {
  expect(isValidElement(el), 'la page doit rendre un élément').toBe(true);
  return (el as ReactElement<Record<string, unknown>>).props;
};

const solde = async () => (await db!.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ids.ws)))[0]!.c;
const formule = async () => (await db!.select({ p: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, ids.ws)))[0]!.p;

async function avecFormule<T>(plan: string, f: () => Promise<T>): Promise<T> {
  await db!.update(schema.workspaces).set({ plan }).where(eq(schema.workspaces.id, ids.ws));
  try { return await f(); } finally { await db!.update(schema.workspaces).set({ plan: 'core' }).where(eq(schema.workspaces.id, ids.ws)); }
}

function fd(champs: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) f.set(k, v);
  return f;
}

/* ────────────── 1 · les pouvoirs fondateur · liste codée seule ────────────── */

/** Les portes de lecture du fondateur, telles qu'elles répondent à la session. */
async function portesFondateur() {
  const s = (await getSession())!;
  return {
    creditsIllimites: unlimitedCredits(s.user.email),
    tour: (await porteAdminGeste()).ok,
    depenses: (await porteDepenses()).ok,
    sousNavTour: droitsSousNavAdmin(s).tour,
    railAdmin: (await chargerCoquille()).admin,
    baremeCredits: (await redirection(() => CreditsPage())) === null,
    jarvisExploitation: props(await SourcesPage()).fondateur !== null,
    stockageOperateur: (props(await SettingsPage()).gestion as { stockage: { operateur: boolean } }).stockage.operateur,
    lienTour: (props(await ProfilPage()).liens as Array<{ href: string }>).some((l) => l.href === '/admin'),
  };
}
const TOUT_OUVERT = { creditsIllimites: true, tour: true, depenses: true, sousNavTour: true, railAdmin: true, baremeCredits: true, jarvisExploitation: true, stockageOperateur: true, lienTour: true };
const TOUT_FERME = { creditsIllimites: false, tour: false, depenses: false, sousNavTour: false, railAdmin: false, baremeCredits: false, jarvisExploitation: false, stockageOperateur: false, lienTour: false };

describe('1 · une adresse de `FOUNDER_EMAILS` (non codée) n’ouvre aucun pouvoir fondateur', () => {
  it('portes de lecture · toutes fermées', async () => {
    await connecter('env');
    expect(await portesFondateur()).toEqual(TOUT_FERME);
  });

  it('gestes · refusés, rien d’écrit (solde, formule)', async () => {
    await connecter('env');
    expect(await redirection(() => grantCreditsAction(fd({ amount: '5000' }))), 'accorder des crédits').toBe('/credits?e=forbidden');
    expect(await redirection(() => rechargeAllocationAction(fd({}))), 'recharger l’allocation').toBe('/credits?e=forbidden');
    expect(await redirection(() => changePlanAction(fd({ plan: 'business' }))), 'changer de formule').toBe('/billing?e=forbidden');
    expect(await redirection(() => updatePlanConfigAction(fd({ price_core: '1' }))), 'barème des formules').toBe('/console?e=forbidden');
    expect(await redirection(() => grantTestPackAction(fd({ workspaceId: ids.ws, credits: '5000' }))), 'crédits de test').toBe('/console?e=forbidden');
    expect(await redirection(() => revokeTrialAction(fd({ workspaceId: ids.ws }))), 'fin d’essai').toBe('/console?e=forbidden');
    expect((await configureBucketAction()).error, 'stockage · CORS').toMatch(/admin/i);
    expect((await testStorageAction()).error, 'stockage · test').toMatch(/admin/i);
    expect((await runStripeDiagnosticAction()).error, 'diagnostic Stripe').toBe('Réservé au fondateur.');
    expect(await solde(), 'le solde a bougé').toBe(SOLDE);
    expect(await formule(), 'la formule a bougé').toBe('core');
  });

  it('le message qu’il lit dit exactement ce qui est fermé, et comment rejoindre l’équipe', async () => {
    const s = await connecter('env');
    expect(s.equipe).toMatchObject({ role: 'adminplus', plateformeAdmissible: false, inscritEquipe: false });
    const html = renderToStaticMarkup(avecSpatial(await EquipePage({ searchParams: Promise.resolve({}) })));
    expect(html).toContain(MESSAGE_FONDATEUR_HORS_CODE);
    expect(MESSAGE_FONDATEUR_HORS_CODE).toContain('Tour de contrôle');
    expect(MESSAGE_FONDATEUR_HORS_CODE).toContain('réservés aux fondateurs inscrits dans le code');
  });
});

describe('1 · le fondateur codé · ne perd RIEN', () => {
  it('portes de lecture · toutes ouvertes', async () => {
    await connecter('code');
    expect(await portesFondateur()).toEqual(TOUT_OUVERT);
  });

  it('gestes · ouverts (crédits accordés puis repris, stockage jusqu’aux clés)', async () => {
    await connecter('code');
    expect(await redirection(() => grantCreditsAction(fd({ amount: '7' })))).toBe('/credits?ok=grant');
    expect(await solde()).toBe(SOLDE + 7);
    expect(await redirection(() => grantCreditsAction(fd({ amount: '-7' })))).toBe('/credits?ok=grant');
    expect(await solde()).toBe(SOLDE);
    expect((await configureBucketAction()).error, 'la porte doit laisser passer jusqu’aux clés').toBe('Clés S3 absentes du serveur (.env.deploy).');
  });
});

describe('1 · l’équipe à accès total admissible et le client · inchangés', () => {
  it('Admin+ admissible · crédits illimités, pas de Tour (jamais eu)', async () => {
    await connecter('legitime');
    const p = await portesFondateur();
    expect(p.creditsIllimites).toBe(true);
    expect({ ...p, creditsIllimites: false }).toEqual(TOUT_FERME);
  });

  it('client · rien', async () => {
    await connecter('client');
    expect(await portesFondateur()).toEqual(TOUT_FERME);
    const s = (await getSession())!;
    expect(effectiveAccess(s)).toEqual({ role: 'owner', plan: 'core' });
  });

  for (const qui of ['legitime', 'admin'] as const) {
    it(`${qui} · accès total admissible · Business, face équipe sans verrou, dépense, Connaissances, équipe`, async () => {
      const s = await connecter(qui);
      const a = effectiveAccess(s);
      expect(a.plan).toBe('business');
      expect(a.equipe?.role).toBe(qui === 'admin' ? 'admin' : 'adminplus');
      expect(railNav(a).flatMap((g) => g.items).filter((i) => i.locked), 'aucune entrée verrouillée').toEqual([]);
      expect(personnelPlateforme(s)).toBe(true);
      expect(unlimitedCredits(s.user.email)).toBe(true);
      expect(droitsSousNavAdmin(s)).toMatchObject({ connaissances: true, equipe: true, promptRead: true, providerConfigure: true });
    });
  }

  it('fondateur codé · Business, face équipe, dépense, Connaissances, équipe', async () => {
    const s = await connecter('code');
    expect(effectiveAccess(s).plan).toBe('business');
    expect(effectiveAccess(s).equipe?.role).toBe('adminplus');
    expect(personnelPlateforme(s)).toBe(true);
    expect(droitsSousNavAdmin(s)).toEqual({ tour: true, connaissances: true, equipe: true, promptRead: true, providerConfigure: true });
  });
});

/* ────────────── 2 · rôle gradé non admissible · face client ────────────── */

function resultatsAuRail(s: Parameters<typeof effectiveAccess>[0]): boolean | null {
  const item = railNav(effectiveAccess(s)).flatMap((g) => g.items).find((i) => i.key === 'adsmap');
  return item ? item.locked : null;
}

describe('2 · Manager dont le compte est postérieur à sa préinscription · face client', () => {
  it('ni face équipe, ni levée du verrou de « Résultats »', async () => {
    const s = await connecter('gradeNon');
    expect(s.equipe).toMatchObject({ role: 'manager', plateformeAdmissible: false });
    expect(effectiveAccess(s).equipe, 'un rôle gradé non admissible garde la face équipe').toBeUndefined();
    expect(effectiveAccess(s).plan).toBe('core');
    expect(resultatsAuRail(s), 'verrou de formule levé pour un gradé non admissible').toBe(true);
    expect(await gardeResultats()).toEqual({ ok: false, raison: 'plan' });
  });

  it('Manager admissible · inchangé (face équipe, sa matrice ouvre « Résultats »)', async () => {
    const s = await connecter('gradeOk');
    expect(s.equipe).toMatchObject({ role: 'manager', plateformeAdmissible: true });
    expect(effectiveAccess(s).equipe?.role).toBe('manager');
    expect(effectiveAccess(s).plan).toBe('core');
    expect(resultatsAuRail(s)).toBe(false);
    expect((await gardeResultats()).ok).toBe(true);
  });
});

/* ────────────── 3 · /admin/equipe · rien pour un non admissible ────────────── */

async function pageEquipe(qui: Qui): Promise<string> {
  await connecter(qui);
  return renderToStaticMarkup(avecSpatial(await EquipePage({ searchParams: Promise.resolve({}) })));
}

describe('3 · /admin/equipe · un compte non admissible ne lit que son message', () => {
  for (const [qui, message] of [['capte', MESSAGE_NON_ADMISSIBLE], ['gradeNon', MESSAGE_GRADE_NON_ADMISSIBLE]] as const) {
    it(`${qui} · le message, ni la liste (e-mails préinscrits), ni l’audit`, async () => {
      const html = await pageEquipe(qui);
      expect(html, 'message dédié absent').toContain('data-non-admissible');
      expect(html).toContain(message);
      expect(html, 'un e-mail préinscrit sans compte est lisible').not.toContain(PREINSCRIT);
      expect(html, 'un autre membre de l’équipe est lisible').not.toContain(EMAIL.legitime);
      expect(html, 'le registre d’audit est lisible').not.toContain(ACTEUR_AUDIT);
      expect(html).not.toContain('data-membre');
      expect(html).not.toContain('—');
      if (qui === 'gradeNon') expect(html, 'un gradé n’a jamais la liste de l’équipe · son message ne peut pas la dire fermée').not.toContain('liste de l’équipe');
    });
  }

  it('sous-navigation · l’entrée « Rôles & droits » n’est pas proposée à un non admissible', async () => {
    expect(droitsSousNavAdmin(await connecter('capte')).equipe).toBe(false);
    expect(droitsSousNavAdmin(await connecter('legitime')).equipe).toBe(true);
  });

  for (const qui of ['code', 'legitime', 'admin'] as const) {
    it(`${qui} · admissible · inchangé (liste, préinscrit, audit, aucun message)`, async () => {
      const html = await pageEquipe(qui);
      expect(html).toContain(PREINSCRIT);
      expect(html).toContain(EMAIL.capte);
      expect(html).toContain(ACTEUR_AUDIT);
      expect(html).not.toContain('data-non-admissible');
    });
  }

  for (const qui of ['client', 'gradeOk'] as const) {
    it(`${qui} · renvoyé à l’accueil, comme avant`, async () => {
      await connecter(qui);
      expect(await redirection(() => EquipePage({ searchParams: Promise.resolve({}) }))).toBe('/dashboard');
    });
  }
});

/* ────────────── 4 · aucun canAccess sur la session brute ────────────── */

describe('4 · formule Starter · un accès total non admissible n’a pas la face équipe sur ces trois écrans', () => {
  it('fiche marque · « Créer une pub » fermé (Studios exige Core)', async () => {
    await avecFormule('starter', async () => {
      await connecter('capte');
      expect((await chargerMarque(ids.brand)).creerPub).toBeNull();
      await connecter('legitime');
      expect((await chargerMarque(ids.brand)).creerPub, 'Admin+ admissible · la face équipe ouvre les Studios').not.toBeNull();
    });
  });

  it('réglages · « Nouvelle vidéo » fermé', async () => {
    await avecFormule('starter', async () => {
      await connecter('capte');
      expect(props(await SettingsPage()).video).toBeNull();
      await connecter('legitime');
      expect(props(await SettingsPage()).video).not.toBeNull();
    });
  });

  it('tagging · la sortie vers « Résultats » est celle d’un client sans Résultats', async () => {
    await avecFormule('starter', async () => {
      await connecter('capte');
      expect(props(await TagsPage()).sortie).toEqual(sortieTagging({ resultats: false }));
      await connecter('legitime');
      expect(props(await TagsPage()).sortie).toEqual(sortieTagging({ resultats: true }));
    });
  });
});

/* ────────────── 5 · suivi de #1117 · ce que disent et tracent les non admissibles ────────────── */

describe('5 · le refus « ?e=admissible » des actions de l’équipe ne tombe jamais sur la légende', () => {
  // Seul émetteur · `exigerAccesTotal` (actions/equipe.ts) · accès total NON admissible. La page, elle,
  // ne lit `?e=` que sur l'écran complet · le non admissible n'y lit que son message.
  for (const [qui, message] of [['capte', MESSAGE_NON_ADMISSIBLE], ['env', MESSAGE_FONDATEUR_HORS_CODE]] as const) {
    it(`${qui} · l’action refuse, la page de retour rend son message seul`, async () => {
      await connecter(qui);
      const retour = await redirection(() => enregistrerStaffAction(fd({ email: 'nouvelle@equipe.test', role: 'admin' })));
      expect(retour).toBe('/admin/equipe?e=admissible');
      const html = renderToStaticMarkup(avecSpatial(await EquipePage({ searchParams: Promise.resolve({ e: 'admissible' }) })));
      expect(html, 'le non admissible lit l’écran complet (liste, légende) au lieu de son message').toContain('data-non-admissible');
      expect(html).toContain(message);
      expect(html).not.toContain('il ne peut pas modifier l’équipe');
      expect(html).not.toContain('data-membre');
    });
  }
});

describe('5 · l’audit ne trace « equipe: » que pour un compte admissible (ligne réellement écrite)', () => {
  const tracePar = async (qui: Qui) => {
    await connecter(qui);
    const c = await creerProjet({ brandId: ids.brand, kind: 'ads', title: `Projet ${qui}` });
    expect(c.ok, `${qui} · création refusée`).toBe(true);
    const lignes = await db!.select({ role: schema.studioAuditEvents.effectiveRole }).from(schema.studioAuditEvents)
      .where(eq(schema.studioAuditEvents.targetId, (c as { projet: { id: string } }).projet.id));
    expect(lignes.length, `${qui} · aucune ligne d’audit`).toBe(1);
    return lignes[0]!.role;
  };

  it('adresse de FOUNDER_EMAILS · tracée par son rôle d’espace, jamais « equipe:adminplus »', async () => {
    expect(await tracePar('env')).toBe('espace:owner');
  });
  it('accès total et gradé non admissibles · rôle d’espace seul', async () => {
    expect(await tracePar('capte')).toBe('espace:owner');
    expect(await tracePar('gradeNon')).toBe('espace:owner');
  });
  it('admissibles (Admin+, fondateur codé) · rôle d’équipe puis rôle d’espace, inchangé', async () => {
    expect(await tracePar('legitime')).toBe('equipe:adminplus/espace:owner');
    expect(await tracePar('code')).toBe('equipe:adminplus/espace:owner');
  });
});
