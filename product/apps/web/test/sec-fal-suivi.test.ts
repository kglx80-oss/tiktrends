import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

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
 *  · `falGetVideo` avec un job officiel → la clé ne part qu'à l'hôte officiel.
 * (`pollVideoAction` est retirée avec le studio Vidéo le 10/10 · le suivi des
 * vidéos historiques en cours relit le job en base, côté cron.)
 */

const CLE = 'simule-local-sans-reseau';

import { falGetVideo, type FalConfig } from '@tiktrends/integrations';

const FORGE = 'falq|https://attaquant.example/fal-ai/kling-video/requests/x/status|https://attaquant.example/fal-ai/kling-video/requests/x';
const OFFICIEL = 'falq|https://queue.fal.run/fal-ai/kling-video/requests/r-a/status|https://queue.fal.run/fal-ai/kling-video/requests/r-a';
const cfg: FalConfig = { apiKey: CLE, baseUrl: 'https://fal.run', queueUrl: 'https://queue.fal.run', imageModel: 'm', imageModelI2I: 'm', imageModelText: 'm', imageModelEdit: 'm', videoModel: 'm', videoModelI2V: 'm' };

type Appel = { url: string; auth: string | null; redirect: string | undefined };
let appels: Appel[] = [];
let fetchEspion: MockInstance<typeof fetch>;

beforeEach(() => {
  appels = [];
  fetchEspion = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    appels.push({ url: String(input), auth: h.get('authorization'), redirect: init?.redirect });
    return new Response(JSON.stringify({ status: 'IN_PROGRESS' }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
});
afterEach(() => { fetchEspion.mockRestore(); });

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
