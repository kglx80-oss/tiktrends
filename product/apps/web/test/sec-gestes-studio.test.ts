import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, type MockInstance } from 'vitest';

/**
 * SEC-03 · les actions studio historiques (Pubs IA, Image IA, Vidéo IA)
 * appliquent côté SERVEUR la règle des pages `/studio/*` : `canAccess(studio)`
 * (rôle + offre) et rôle d'espace « member » minimum pour tout geste qui
 * génère, débite ou écrit.
 *
 * ── Le défaut reproduit ──────────────────────────────────────────────────────
 * `ads.ts`, `image.ts`, `video.ts` ne vérifiaient que la session · un
 * `client_viewer`, ou un membre d'un espace Starter, appelait directement
 * `generateAdsAction` (et les autres) et dépensait dollars et crédits.
 *
 * ── Ce qu'on mesure (des RÉSULTATS) ──────────────────────────────────────────
 * Pour chaque action, appelée directement par un lecteur puis par un membre
 * Starter : la réponse porte le refus, ET
 *  · zéro appel au client IA (espion sur `messages.create`) ;
 *  · zéro appel fal / Higgsfield, zéro `fetch` sortant ;
 *  · zéro écriture en base (espion sur toutes les requêtes pglite) ;
 *  · solde de crédits et registre inchangés, aucune ligne `ai_spend`.
 * Un témoin positif (membre Core) prouve que les espions voient bien passer
 * un geste autorisé · sans lui, un refus universel passerait au vert.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), user: randomUUID(), brand: randomUUID(), produit: randomUUID(), pub: randomUUID(), video: randomUUID() };
});
const etat = vi.hoisted(() => ({ role: 'client_viewer' as string, plan: 'business' as string, equipe: null as null | { role: string; matrice: Record<string, string[]> } }));
const espions = vi.hoisted(() => ({ ia: [] as unknown[], fal: [] as string[], ecritures: [] as string[], actif: false }));
const ECRITURE = /\binsert\s+into\b|\bupdate\s+"?[a-z_]+"?\s+set\b|\bdelete\s+from\b/i;

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { PGlite } = await import('@electric-sql/pglite');
  const proto = PGlite.prototype as unknown as { query: (sql: string, ...rest: unknown[]) => Promise<unknown> };
  const query = proto.query;
  proto.query = function (this: unknown, sql: string, ...rest: unknown[]) {
    if (espions.actif && ECRITURE.test(sql)) espions.ecritures.push(sql.replace(/\s+/g, ' ').slice(0, 140));
    return query.call(this, sql, ...rest);
  };
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: { id: ids.user, email: 'lecteur@sec.test', name: null },
    workspaceId: ids.ws, workspaceName: 'SEC', role: etat.role, plan: etat.plan, equipe: etat.equipe,
  }),
}));
vi.mock('../lib/brands', () => ({
  getActiveBrand: async () => ({ id: ids.brand, name: 'Neva', workspaceId: ids.ws }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// Client IA SIMULÉ · aucun réseau. L'espion voit chaque appel payant.
vi.mock('@tiktrends/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/ai')>();
  return {
    ...actual,
    anthropicFromEnv: () => ({
      messages: {
        create: async (p: unknown) => {
          espions.ia.push(p);
          return { content: [{ type: 'text', text: 'Un lent travelling sur le flacon.' }], usage: { input_tokens: 100, output_tokens: 20 } };
        },
      },
    }),
  };
});

// Fournisseurs image / vidéo SIMULÉS.
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  const note = (n: string) => async () => { espions.fal.push(n); throw new Error('fournisseur simulé · ne doit pas être appelé'); };
  return {
    ...actual,
    falFromEnv: () => ({ apiKey: 'simule-local-sans-reseau', baseUrl: 'https://fal.run', queueUrl: 'https://queue.fal.run', imageModel: 'm', imageModelI2I: 'm', imageModelText: 'm', imageModelEdit: 'm', videoModel: 'm', videoModelI2V: 'm' }),
    falGenerateImage: note('falGenerateImage'),
    falSubmitVideo: note('falSubmitVideo'),
    falGetVideo: note('falGetVideo'),
    hfSubmitVideo: note('hfSubmitVideo'),
    hfSubmitImageVideo: note('hfSubmitImageVideo'),
    hfGetJob: note('hfGetJob'),
  };
});

import { db, schema, eq } from '@tiktrends/db';
import {
  generateAdsAction, suggestAnglesAction, cloneAdAction, archiveAdAction, updateAdTextAction, scoreCreativeAction, declineAdAction,
} from '../app/actions/ads';
import {
  generateImageAction, suggestImageBriefAction, setProductImageAction, setProductImagesAction, importAllProductImagesAction, scoreImageAction,
} from '../app/actions/image';
import {
  startVideoAction, startImageVideoAction, pollVideoAction, suggestVideoBriefAction, deleteVideoAction,
} from '../app/actions/video';
import { TEXTE_REFUS_STUDIO } from '@tiktrends/core';

const SOLDE = 500;
let fetchEspion: MockInstance<typeof fetch>;

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'simule-local-sans-reseau';
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'SEC', creditsBalance: SOLDE });
  await db!.insert(schema.users).values({ id: ids.user, email: 'lecteur@sec.test' });
  await db!.insert(schema.workspaceMembers).values({ workspaceId: ids.ws, userId: ids.user, role: 'client_viewer' });
  await db!.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Neva', url: 'https://neva.example' });
  await db!.insert(schema.products).values({ id: ids.produit, brandId: ids.brand, name: 'Sérum', url: 'https://neva.example/serum' });
  await db!.insert(schema.generations).values([
    { id: ids.pub, brandId: ids.brand, kind: 'ad', status: 'completed', input: { template: 'promo', headline: 'Avant', sceneUrl: 'https://cdn.example/s.png' }, creditsCost: 4 },
    { id: ids.video, brandId: ids.brand, kind: 'video', status: 'processing', jobId: 'falq|https://queue.fal.run/fal-ai/kling-video/requests/r1/status|https://queue.fal.run/fal-ai/kling-video/requests/r1', creditsCost: 10 },
  ]);
});

beforeEach(() => {
  espions.ia = []; espions.fal = []; espions.ecritures = [];
  fetchEspion = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('fetch sortant interdit dans ce test'); });
});
afterEach(() => { fetchEspion.mockRestore(); espions.actif = false; });

async function empreinte() {
  const [w] = await db!.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ids.ws));
  const ledger = await db!.select().from(schema.creditLedger);
  const spend = await db!.select().from(schema.aiSpend);
  const gens = await db!.select({ id: schema.generations.id, s: schema.generations.status, i: schema.generations.input }).from(schema.generations);
  const prods = await db!.select({ id: schema.products.id, u: schema.products.imageUrl }).from(schema.products);
  return JSON.stringify({ solde: w?.c, ledger: ledger.length, spend: spend.length, gens, prods });
}

/** Chaque geste générateur, débiteur ou écrivain des trois fichiers. */
const GESTES: Array<[string, () => Promise<unknown>]> = [
  ['ads · generateAdsAction', () => generateAdsAction({ count: 1, productId: ids.produit })],
  ['ads · suggestAnglesAction', () => suggestAnglesAction({ productId: ids.produit })],
  ['ads · cloneAdAction', () => cloneAdAction({ referenceDataUri: 'data:image/png;base64,AAAA', count: 1 })],
  ['ads · archiveAdAction', () => archiveAdAction({ id: ids.pub })],
  ['ads · updateAdTextAction', () => updateAdTextAction(ids.pub, { headline: 'Forgé' })],
  ['ads · scoreCreativeAction', () => scoreCreativeAction(ids.pub, { force: true })],
  ['ads · declineAdAction', () => declineAdAction({ id: ids.pub, variable: 'accroche' })],
  ['image · generateImageAction', () => generateImageAction({ prompt: 'Un flacon', enhance: true })],
  ['image · suggestImageBriefAction', () => suggestImageBriefAction({ productId: ids.produit })],
  ['image · setProductImageAction', () => setProductImageAction({ productId: ids.produit, dataUri: 'data:image/png;base64,AAAA' })],
  ['image · setProductImagesAction', () => setProductImagesAction({ productId: ids.produit, dataUris: ['data:image/png;base64,AAAA'] })],
  ['image · importAllProductImagesAction', () => importAllProductImagesAction()],
  ['image · scoreImageAction', () => scoreImageAction({ url: 'https://cdn.example/s.png' })],
  ['video · startVideoAction', () => startVideoAction({ prompt: 'Un flacon qui tourne' })],
  ['video · startImageVideoAction', () => startImageVideoAction({ prompt: 'Anime', imageUrl: 'https://cdn.example/s.png' })],
  ['video · pollVideoAction', () => pollVideoAction('ignoré', ids.video)],
  ['video · suggestVideoBriefAction', () => suggestVideoBriefAction({ productId: ids.produit })],
  ['video · deleteVideoAction', () => deleteVideoAction(ids.video)],
];

function erreurDe(r: unknown): string | undefined {
  return (r as { error?: string } | undefined)?.error;
}

// Le troisième cas est celui où SEULE la marche « member » arrête le geste ·
// avec une session d'équipe, `canAccess` ne lit que la matrice (qui ouvre ici
// le studio), comme pour `refusJarvis`.
const EQUIPE_STUDIO = { role: 'membre', matrice: { membre: ['studio'] } };
describe.each([
  ['un client_viewer (offre Business)', 'client_viewer', 'business', null, TEXTE_REFUS_STUDIO.role],
  ['un membre d’un espace Starter', 'member', 'starter', null, TEXTE_REFUS_STUDIO.plan],
  ['un client_viewer membre de l’équipe dont la matrice ouvre le studio', 'client_viewer', 'core', EQUIPE_STUDIO, TEXTE_REFUS_STUDIO.role],
])('SEC-03 · %s appelle directement chaque action', (_qui, role, plan, equipe, phrase) => {
  beforeEach(() => { etat.role = role; etat.plan = plan; etat.equipe = equipe; });

  it.each(GESTES)('%s · refus AVANT tout appel IA, toute réservation et toute écriture', async (_nom, geste) => {
    const avant = await empreinte();
    espions.actif = true;
    const r = await geste();
    espions.actif = false;
    expect(erreurDe(r), 'la réponse doit porter le refus du studio').toBe(phrase);
    expect(espions.ia, 'le client IA a été appelé').toEqual([]);
    expect(espions.fal, 'un fournisseur image/vidéo a été appelé').toEqual([]);
    expect(fetchEspion, 'une requête sortante est partie').not.toHaveBeenCalled();
    expect(espions.ecritures, `écriture en base malgré le refus :\n${espions.ecritures.join('\n')}`).toEqual([]);
    expect(await empreinte(), 'l’empreinte de la base a changé').toBe(avant);
  });
});

describe('SEC-03 · témoin · un membre Core passe la garde', () => {
  beforeEach(() => { etat.role = 'member'; etat.plan = 'core'; etat.equipe = null; });

  it('suggestVideoBriefAction appelle le client IA, débite et impute la dépense à l’espace', async () => {
    const r = await suggestVideoBriefAction({ productId: ids.produit });
    expect(erreurDe(r)).toBeUndefined();
    expect(espions.ia.length, 'le témoin doit atteindre le client IA').toBe(1);
    const spend = await db!.select().from(schema.aiSpend).where(eq(schema.aiSpend.action, 'video'));
    expect(spend.map((l) => l.workspaceId)).toEqual([ids.ws]);
  });

  it('archiveAdAction écrit pour un membre (aucun droit retiré)', async () => {
    const r = await archiveAdAction({ id: ids.pub });
    expect(r).toEqual({ ok: true });
    const [g] = await db!.select({ s: schema.generations.status }).from(schema.generations).where(eq(schema.generations.id, ids.pub));
    expect(g?.s).toBe('archived');
  });
});
