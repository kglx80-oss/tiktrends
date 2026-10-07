import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, type MockInstance } from 'vitest';

/**
 * SEC-07 / SEC-06 · la clé fal ne part jamais vers un hôte choisi par le client.
 *
 * ── Le défaut reproduit ──────────────────────────────────────────────────────
 * `pollVideoAction(jobId, …)` recevait le `jobId` du navigateur, et
 * `falGetVideo` découpait `falq|statusUrl|responseUrl` pour appeler ces URL
 * avec `authorization: Key <FAL_KEY>`. Un `jobId` forgé vers
 * `https://attaquant.example/...` y recevait la clé.
 *
 * ── Ce qu'on mesure ──────────────────────────────────────────────────────────
 * Un espion remplace `fetch` (aucun réseau réel, clé SIMULÉE) et note chaque
 * URL et chaque en-tête `authorization` envoyé.
 *  · `falGetVideo` avec un job forgé vers un autre hôte → aucune requête.
 *  · `pollVideoAction` avec un `jobId` forgé par le client → seul le job
 *    ENREGISTRÉ en base est suivi, sur l'hôte officiel.
 *  · `pollVideoAction` sur la génération d'un AUTRE espace → réponse neutre,
 *    aucune requête, aucune écriture.
 */

const CLE = 'simule-local-sans-reseau';
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), user: randomUUID(), brand: randomUUID(), gen: randomUUID(), wsB: randomUUID(), brandB: randomUUID(), genB: randomUUID() };
});
const espion = vi.hoisted(() => ({ actif: false, ecritures: [] as string[] }));
const ECRITURE = /\binsert\s+into\b|\bupdate\s+"?[a-z_]+"?\s+set\b|\bdelete\s+from\b/i;

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { PGlite } = await import('@electric-sql/pglite');
  const proto = PGlite.prototype as unknown as { query: (sql: string, ...rest: unknown[]) => Promise<unknown> };
  const query = proto.query;
  proto.query = function (this: unknown, sql: string, ...rest: unknown[]) {
    if (espion.actif && ECRITURE.test(sql)) espion.ecritures.push(sql.replace(/\s+/g, ' ').slice(0, 140));
    return query.call(this, sql, ...rest);
  };
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: { id: ids.user, email: 'membre@sec.test', name: null },
    workspaceId: ids.ws, workspaceName: 'A', role: 'member', plan: 'core',
  }),
}));

import { db, schema, eq } from '@tiktrends/db';
import { falGetVideo, type FalConfig } from '@tiktrends/integrations';
import { pollVideoAction } from '../app/actions/video';

const FORGE = 'falq|https://attaquant.example/fal-ai/kling-video/requests/x/status|https://attaquant.example/fal-ai/kling-video/requests/x';
const OFFICIEL = 'falq|https://queue.fal.run/fal-ai/kling-video/requests/r-a/status|https://queue.fal.run/fal-ai/kling-video/requests/r-a';
const cfg: FalConfig = { apiKey: CLE, baseUrl: 'https://fal.run', queueUrl: 'https://queue.fal.run', imageModel: 'm', imageModelI2I: 'm', imageModelText: 'm', imageModelEdit: 'm', videoModel: 'm', videoModelI2V: 'm' };

type Appel = { url: string; auth: string | null; redirect: string | undefined };
let appels: Appel[] = [];
let fetchEspion: MockInstance<typeof fetch>;

beforeAll(async () => {
  process.env.FAL_KEY = CLE;
  delete process.env.FAL_QUEUE_URL;
  await db!.insert(schema.workspaces).values([{ id: ids.ws, name: 'A', creditsBalance: 50 }, { id: ids.wsB, name: 'B', creditsBalance: 50 }]);
  await db!.insert(schema.users).values({ id: ids.user, email: 'membre@sec.test' });
  await db!.insert(schema.brands).values([{ id: ids.brand, workspaceId: ids.ws, name: 'A' }, { id: ids.brandB, workspaceId: ids.wsB, name: 'B' }]);
  await db!.insert(schema.generations).values([
    { id: ids.gen, brandId: ids.brand, kind: 'video', status: 'processing', jobId: OFFICIEL, creditsCost: 10 },
    // La génération de l'autre espace porte un job qui pointe AILLEURS · s'il
    // était suivi, la clé partirait vers cet hôte.
    { id: ids.genB, brandId: ids.brandB, kind: 'video', status: 'processing', jobId: FORGE, creditsCost: 10 },
  ]);
});

beforeEach(() => {
  appels = [];
  fetchEspion = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    appels.push({ url: String(input), auth: h.get('authorization'), redirect: init?.redirect });
    return new Response(JSON.stringify({ status: 'IN_PROGRESS' }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
});
afterEach(() => { fetchEspion.mockRestore(); espion.actif = false; espion.ecritures = []; });

describe('SEC-07 · falGetVideo', () => {
  it.each([
    ['un autre hôte', FORGE],
    ['un hôte qui imite fal', 'falq|https://queue.fal.run.attaquant.example/a/b/requests/x/status|https://queue.fal.run.attaquant.example/a/b/requests/x'],
    ['une IP privée (métadonnées cloud)', 'falq|https://169.254.169.254/a/b/requests/x/status|https://169.254.169.254/a/b/requests/x'],
    ['http en clair', 'falq|http://queue.fal.run/a/b/requests/x/status|http://queue.fal.run/a/b/requests/x'],
  ])('job forgé vers %s · refus SANS requête sortante', async (_nom, job) => {
    const r = await falGetVideo(cfg, job);
    expect(appels, 'une requête est partie avec la clé').toEqual([]);
    expect(r.status).toBe('failed');
  });

  it('job officiel · la clé ne part qu’à queue.fal.run, sans suivre de redirection', async () => {
    await falGetVideo(cfg, OFFICIEL);
    expect(appels).toEqual([{ url: 'https://queue.fal.run/fal-ai/kling-video/requests/r-a/status', auth: `Key ${CLE}`, redirect: 'error' }]);
  });
});

describe('SEC-07 · pollVideoAction relit le job en base, dans la portée de l’espace', () => {
  it('un jobId forgé par le client est ignoré · seul le job enregistré est suivi', async () => {
    await pollVideoAction(FORGE, ids.gen);
    expect(appels.map((a) => a.url), 'le suivi doit porter sur le job ENREGISTRÉ, à l’hôte officiel').toEqual(['https://queue.fal.run/fal-ai/kling-video/requests/r-a/status']);
    expect(appels.every((a) => a.redirect === 'error')).toBe(true);
  });

  it('un jobId client « officiel » mais différent est ignoré aussi · aucune lecture du job d’un tiers', async () => {
    await pollVideoAction('falq|https://queue.fal.run/fal-ai/kling-video/requests/r-tiers/status|https://queue.fal.run/fal-ai/kling-video/requests/r-tiers', ids.gen);
    expect(appels.map((a) => a.url), 'le suivi doit porter sur le job ENREGISTRÉ').toEqual(['https://queue.fal.run/fal-ai/kling-video/requests/r-a/status']);
  });

  it('la génération d’un AUTRE espace · réponse neutre, aucune requête, aucune écriture', async () => {
    espion.actif = true;
    const r = await pollVideoAction(OFFICIEL, ids.genB);
    espion.actif = false;
    expect(r).toEqual({ status: 'unknown', error: 'Suivi indisponible pour cette vidéo.' });
    expect(appels, 'une requête est partie pour le job d’un autre espace').toEqual([]);
    expect(espion.ecritures).toEqual([]);
    const [g] = await db!.select({ s: schema.generations.status }).from(schema.generations).where(eq(schema.generations.id, ids.genB));
    expect(g?.s).toBe('processing');
  });

  it('sans generationId, ou avec un identifiant illisible · réponse neutre, aucune requête', async () => {
    expect(await pollVideoAction(FORGE)).toEqual({ status: 'unknown', error: 'Suivi indisponible pour cette vidéo.' });
    expect(await pollVideoAction(FORGE, "x' or 1=1 --")).toEqual({ status: 'unknown', error: 'Suivi indisponible pour cette vidéo.' });
    expect(appels).toEqual([]);
  });
});
