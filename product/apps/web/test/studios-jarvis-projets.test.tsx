import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Une seule application · Jarvis connaît les projets Studios de la marque et y
 * renvoie.
 *
 * Constat avant correction : la consigne de la VRAIE route `/api/jarvis/chat`
 * ne contenait ni projet, ni étape, ni proposition · Jarvis ne pouvait parler
 * que de « Studio IA », et l'en-tête de Jarvis ne menait pas aux Projets.
 *
 * On vérifie des RÉSULTATS, sur base réelle (pglite + migrations), garde de
 * dépense et SDK réels, seul le fournisseur est faux (il enregistre la consigne
 * RÉELLEMENT reçue) :
 *  - le texte ENVOYÉ au modèle contient le projet de la marque A (nom, étape,
 *    proposition en attente, lien) et jamais celui de l'espace B ni d'une autre
 *    marque de l'espace ; les règles maison restent en dernier ;
 *  - sous restriction de marque, ou capacité « projets » coupée, rien ne part ;
 *  - la page Jarvis rendue contient le lien « Projets » vers `/studio/projets`
 *    pour qui y a droit, et ne le contient pas sinon.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return {
    wsA: randomUUID(), wsB: randomUUID(), brandA: randomUUID(), brandA2: randomUUID(), brandB: randomUUID(),
    user: randomUUID(), userB: randomUUID(), projetA: randomUUID(), projetA2: randomUUID(), projetB: randomUUID(), versionA: randomUUID(),
  };
});
const h = vi.hoisted(() => ({ session: null as unknown }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: ids.brandA, name: 'Neva', logoUrl: null, url: null, category: null }) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import { db, schema, eq } from '@tiktrends/db';
import { POST } from '../app/api/jarvis/chat/route';
import JarvisPage from '../app/(app)/jarvis/page';
import { demarrerMockFournisseur } from './lot19b-mock-fournisseur';

let mock: Awaited<ReturnType<typeof demarrerMockFournisseur>>;
const membre = () => ({ user: { id: ids.user, email: 'membre@client.test', name: null }, workspaceId: ids.wsA, workspaceName: 'Démo', role: 'member', plan: 'core', equipe: null });

async function consigneEnvoyee(): Promise<string> {
  const avant = mock.recues.length;
  const res = await POST(new Request('http://local/api/jarvis/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Où en sont mes projets ?' }) }));
  expect(res.status).toBe(200);
  await res.text();
  expect(mock.recues.length).toBe(avant + 1);
  return mock.recues.at(-1)!.system;
}
const pageJarvis = async () => renderToStaticMarkup(await JarvisPage());

beforeAll(async () => {
  mock = await demarrerMockFournisseur(() => 'Réponse simulée.');
  process.env.ANTHROPIC_API_KEY = 'cle-factice-locale';
  process.env.ANTHROPIC_BASE_URL = mock.url;
  delete process.env.AI_SPEND_CAP_USD;
  delete process.env.STUDIOS_CAPACITES_COUPEES;
  await db.insert(schema.workspaces).values([
    { id: ids.wsA, name: 'Espace A', plan: 'core', creditsBalance: 100 },
    { id: ids.wsB, name: 'Espace B', plan: 'core', creditsBalance: 100 },
  ]);
  await db.insert(schema.users).values([{ id: ids.user, email: 'membre@client.test' }, { id: ids.userB, email: 'autre@client.test' }]);
  await db.insert(schema.workspaceMembers).values([{ workspaceId: ids.wsA, userId: ids.user, role: 'member' }, { workspaceId: ids.wsB, userId: ids.userB, role: 'member' }]);
  await db.insert(schema.brands).values([
    { id: ids.brandA, workspaceId: ids.wsA, name: 'Neva', creativeRules: 'REGLE_MAISON_NEVA' },
    { id: ids.brandA2, workspaceId: ids.wsA, name: 'Autre marque A' },
    { id: ids.brandB, workspaceId: ids.wsB, name: 'Marque B' },
  ]);
  await db.insert(schema.studioProjects).values([
    { id: ids.projetA, workspaceId: ids.wsA, brandId: ids.brandA, kind: 'image', title: 'PROJET_A_NEVA sérum été', ownerId: ids.user },
    { id: ids.projetA2, workspaceId: ids.wsA, brandId: ids.brandA2, kind: 'video', title: 'PROJET_AUTRE_MARQUE', ownerId: ids.user },
    { id: ids.projetB, workspaceId: ids.wsB, brandId: ids.brandB, kind: 'image', title: 'PROJET_ESPACE_B', ownerId: ids.userB },
  ]);
  // Une proposition de Jarvis en attente sur le projet A (base : version 1).
  await db.insert(schema.studioProjectVersions).values({ id: ids.versionA, projectId: ids.projetA, workspaceId: ids.wsA, brandId: ids.brandA, n: 1, schemaVersion: 1, content: {}, contentHash: 'a'.repeat(64), authorId: ids.user });
  await db.insert(schema.studioProposals).values({
    workspaceId: ids.wsA, brandId: ids.brandA, projectId: ids.projetA, target: 'brief', baseVersionId: ids.versionA,
    allowedPaths: [], changes: [], state: 'proposed', origin: 'jarvis', expiresAt: new Date(Date.now() + 86_400_000),
  });
});
afterAll(async () => { await mock.fermer(); });
beforeEach(() => { h.session = membre(); });
afterEach(async () => {
  delete process.env.STUDIOS_CAPACITES_COUPEES;
  await db.delete(schema.studioMemberBrandScopes).where(eq(schema.studioMemberBrandScopes.userId, ids.user));
});

describe('route Jarvis · la consigne envoyée connaît les projets Studios de la marque active', () => {
  it('le projet de la marque A part vers le modèle, avec son étape, sa proposition en attente et son lien', async () => {
    const system = await consigneEnvoyee();
    expect(system).toContain('PROJETS STUDIOS DE LA MARQUE');
    expect(system).toContain('« PROJET_A_NEVA sérum été » · Image · étape : ');
    expect(system).toContain('1 proposition en attente');
    expect(system).toContain(`/studio/projets/${ids.projetA}`);
    // Les règles maison restent EN DERNIER (contrat de l'assemblage).
    expect(system.trimEnd().endsWith('REGLE_MAISON_NEVA')).toBe(true);
  });

  it('jamais le projet de l’espace B, ni celui d’une autre marque du même espace', async () => {
    const system = await consigneEnvoyee();
    expect(system).not.toContain('PROJET_ESPACE_B');
    expect(system).not.toContain(ids.projetB);
    expect(system).not.toContain(ids.brandB);
    expect(system).not.toContain(ids.wsB);
    expect(system).not.toContain('PROJET_AUTRE_MARQUE');
    expect(system).not.toContain(ids.projetA2);
  });

  it('restreint à une autre marque · le projet de A ne part pas', async () => {
    await db.insert(schema.studioMemberBrandScopes).values({ workspaceId: ids.wsA, userId: ids.user, brandId: ids.brandA2 });
    const system = await consigneEnvoyee();
    expect(system).not.toContain('PROJET_A_NEVA');
    expect(system).not.toContain('PROJETS STUDIOS DE LA MARQUE');
  });

  it('capacité « projets » coupée · aucun bloc projets, Jarvis répond comme avant', async () => {
    process.env.STUDIOS_CAPACITES_COUPEES = 'projets';
    const system = await consigneEnvoyee();
    expect(system).not.toContain('PROJET_A_NEVA');
    expect(system.trimEnd().endsWith('REGLE_MAISON_NEVA')).toBe(true);
  });
});

describe('page Jarvis · lien « Projets » dans l’en-tête', () => {
  it('avec le droit · lien visible vers /studio/projets', async () => {
    const html = await pageJarvis();
    expect(html).toMatch(/<a[^>]*href="\/studio\/projets"[^>]*>.*?Projets<\/a>/);
  });

  it('capacité « projets » coupée pour l’espace · aucun lien vers un écran fermé', async () => {
    process.env.STUDIOS_CAPACITES_COUPEES = 'projets';
    const html = await pageJarvis();
    expect(html).toContain('Sources de Jarvis');
    expect(html).not.toContain('href="/studio/projets"');
  });
});
