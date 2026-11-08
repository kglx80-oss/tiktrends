import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 5 V5 · la VRAIE route `/api/jarvis/chat` reçoit un contexte joint ·
 * base réelle (pglite, migrations), barrière de dépense réelle, SDK réel · seul
 * le fournisseur est faux (serveur HTTP local), et il enregistre la consigne
 * RÉELLEMENT reçue. En Node (le SDK refuse jsdom) · l'écran qui envoie ce corps
 * est éprouvé par `lot5-jarvis-contexte-db.test.tsx`.
 *
 *  · `{ type, id }` d'un lot, d'une hypothèse, d'une page · la consigne reçue
 *    porte le bloc relu par le serveur, et rien d'une autre marque ;
 *  · un projet · le message rejoint le fil LIÉ au projet, avec son bloc concept
 *    (le chemin existant du panneau du projet) ;
 *  · sans contexte · la consigne d'avant, sans bloc ;
 *  · refusé (autre marque) · 404 AVANT tout appel, aucune écriture.
 * 0 $ réel · fournisseur simulé.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, marque: null as string | null }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/jarvis', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/jarvis', host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));

import { db, schema, eq } from '@tiktrends/db';
import {
  REFUS_CONTEXTE_JARVIS, TITRE_BLOC_CONTEXTE_JARVIS, TITRE_BLOC_CONCEPT_JARVIS,
  contenuVide, empreinteContenu, SCHEMA_VERSION_CONTENU, type ContenuVersion,
} from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { briefCanonique } from './l4c-harnais';
import { demarrerMockFournisseur } from './lot19b-mock-fournisseur';
import { POST } from '../app/api/jarvis/chat/route';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const ids = h.ids;
const S = { L1: '', L2: '', L3: '', V1: '', V2: '', H1: '', H2: '', P1: '', P2: '' };
const proprietaire = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });
let mock: Awaited<ReturnType<typeof demarrerMockFournisseur>>;
const HYPO_A1 = 'Si on ouvre sur la preuve clinique, alors le coût par achat baisse, parce que la peur de l’irritation tombe.';

async function chaine(ws: string, brandId: string, titre: string) {
  const [pe] = await db.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
async function lot(ws: string, brandId: string, number: number, goal: string) {
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId, number, goal, status: 'testing', launchedAt: new Date(Date.now() - 30 * 86_400_000) }).returning({ id: schema.batches.id });
  return b!.id;
}
async function ad(ws: string, conceptId: string, batchId: string | null, code: string, hypothesis: string, verdict: 'winner' | 'loser' | null) {
  const [a] = await db.insert(schema.ads).values({ workspaceId: ws, conceptId, batchId, variantCode: code, status: batchId ? 'done' : 'draft', hypothesis, testedVariable: 'hook' }).returning({ id: schema.ads.id });
  if (verdict) await db.insert(schema.verdicts).values({ adId: a!.id, workspaceId: ws, computed: verdict, validated: verdict, status: 'validated', comparable: true, metricsAgg: { spend: 120, impressions: 18000, purchases: verdict === 'winner' ? 12 : 3, cpa: verdict === 'winner' ? 10 : 40, reason: verdict === 'winner' ? 'CPA sous la cible.' : 'CPA au-dessus de la cible.' } });
  return a!.id;
}
async function projet(brandId: string, titre: string) {
  const contenu: ContenuVersion = { ...contenuVide(), brief: briefCanonique({ objective: 'Faire acheter la crème' }) as ContenuVersion['brief'] };
  const [p] = await db.insert(schema.studioProjects).values({ workspaceId: ids.wsA, brandId, kind: 'image', title: titre, ownerId: ids.ua }).returning();
  const [v] = await db.insert(schema.studioProjectVersions).values({
    projectId: p!.id, workspaceId: ids.wsA, brandId, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: ids.ua, reason: 'test',
  }).returning();
  await db.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  return p!.id;
}

beforeAll(async () => {
  mock = await demarrerMockFournisseur(() => 'Réponse simulée du faux fournisseur.');
  process.env.ANTHROPIC_API_KEY = 'cle-factice-locale';
  process.env.ANTHROPIC_BASE_URL = mock.url;
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  const c1 = await chaine(ids.wsA, ids.brandA1, 'Sérum');
  S.L1 = await lot(ids.wsA, ids.brandA1, 3, 'Affirmation ou question ?');
  S.V1 = await ad(ids.wsA, c1, S.L1, 'V1', HYPO_A1, 'winner');
  S.V2 = await ad(ids.wsA, c1, S.L1, 'V2', 'Si on pose une question, alors on retient, parce que la curiosité accroche.', 'loser');
  S.H1 = await ad(ids.wsA, c1, null, 'V3', 'Si on montre la texture, alors on rassure, parce que le toucher se voit.', null);
  const c2 = await chaine(ids.wsA, ids.brandA2, 'Concept secret A2');
  S.L2 = await lot(ids.wsA, ids.brandA2, 7, 'SECRET_LOT_A2');
  S.H2 = await ad(ids.wsA, c2, S.L2, 'V1', 'HYPOTHESE_SECRETE_A2', 'winner');
  const c3 = await chaine(ids.wsB, ids.brandB1, 'Concept secret B1');
  S.L3 = await lot(ids.wsB, ids.brandB1, 1, 'SECRET_LOT_B1');
  await ad(ids.wsB, c3, S.L3, 'V1', 'HYPOTHESE_SECRETE_B1', 'loser');
  S.P1 = await projet(ids.brandA1, 'Crème hiver');
  S.P2 = await projet(ids.brandA2, 'PROJET_SECRET_A2');
}, 240_000);
afterAll(async () => { await mock.fermer(); });


const corps = (o: Record<string, unknown>) => new Request('http://local/api/jarvis/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: null, brandId: ids.brandA1, sources: ['fiche'], ...o }) });
async function poser(o: Record<string, unknown>) { const res = await POST(corps(o)); return { status: res.status, texte: await res.text() }; }
const derniere = () => mock.recues[mock.recues.length - 1]!;

beforeEach(() => { h.session = proprietaire(); h.marque = ids.brandA1; });

describe('lot 5 · la route reçoit { type, id } et relit le contexte', () => {
  it('lot · la consigne reçue porte le lot relu, rien d’une autre marque', async () => {
    const avant = mock.recues.length;
    const r = await poser({ message: 'Que retenir du lot ?', contexte: { type: 'lot', id: S.L1 } });
    expect(r.status).toBe(200);
    expect(r.texte).toContain('Réponse simulée du faux fournisseur.');
    expect(mock.recues.length).toBe(avant + 1);
    const sys = derniere().system;
    expect(sys).toContain(TITRE_BLOC_CONTEXTE_JARVIS);
    expect(sys).toContain('Lot #3 · Affirmation ou question ? · ');
    expect(sys).toContain('Variante V1 · Accroche · « Si on ouvre sur la preuve clinique');
    expect(sys).not.toMatch(/SECRET|HYPOTHESE_SECRETE|Concept secret/);
  });

  it('hypothèse et page Résultats · leur bloc, relu par le serveur', async () => {
    await poser({ message: 'Cette hypothèse ?', contexte: { type: 'hypothese', id: S.H1 } });
    expect(derniere().system).toContain('Hypothèse · « Si on montre la texture');
    await poser({ message: 'Quelle variante tester ensuite ?', contexte: { type: 'resultats', id: 'hypotheses' } });
    expect(derniere().system).toContain('Page Résultats · Hypothèses · 1 lot');
    expect(derniere().system).not.toMatch(/SECRET/);
  });

  it('sans contexte · la consigne d’avant, sans bloc', async () => {
    await poser({ message: 'Bonjour' });
    expect(derniere().system).not.toContain(TITRE_BLOC_CONTEXTE_JARVIS);
  });

  it('projet · le message rejoint le fil LIÉ au projet, avec son bloc concept', async () => {
    const r = await poser({ message: 'Que manque-t-il ?', contexte: { type: 'projet', id: S.P1 } });
    expect(r.status).toBe(200);
    expect(derniere().system).toContain(TITRE_BLOC_CONCEPT_JARVIS);
    expect(derniere().system).toContain('Crème hiver');
    expect(derniere().system).not.toContain(TITRE_BLOC_CONTEXTE_JARVIS);
    const liees = await db.select().from(schema.jarvisConversations).where(eq(schema.jarvisConversations.projectId, S.P1));
    expect(liees.length, 'une conversation liée au projet').toBe(1);
    await poser({ message: 'Et ensuite ?', contexte: { type: 'projet', id: S.P1 } });
    expect((await db.select().from(schema.jarvisConversations).where(eq(schema.jarvisConversations.projectId, S.P1))).length, 'le même fil, pas un second').toBe(1);
  });

  it('autre marque · 404 avant tout appel, aucune écriture', async () => {
    const avant = { modele: mock.recues.length, messages: (await db.select({ id: schema.jarvisMessages.id }).from(schema.jarvisMessages)).length };
    for (const [nom, contexte, brandId] of [
      ['lot A2', { type: 'lot', id: S.L2 }, ids.brandA1], ['hypothèse A2', { type: 'hypothese', id: S.H2 }, ids.brandA1],
      ['projet A2', { type: 'projet', id: S.P2 }, ids.brandA1], ['lot B1', { type: 'lot', id: S.L3 }, ids.brandA1],
      ['hypothèse A2, le corps se dit A2', { type: 'hypothese', id: S.H2 }, ids.brandA2],
    ] as const) {
      const r = await poser({ message: 'Analyse', contexte, brandId });
      expect(r.status, nom).toBe(404);
      expect(JSON.parse(r.texte).error, nom).toBe(REFUS_CONTEXTE_JARVIS);
    }
    expect({ modele: mock.recues.length, messages: (await db.select({ id: schema.jarvisMessages.id }).from(schema.jarvisMessages)).length }).toEqual(avant);
  });
});
