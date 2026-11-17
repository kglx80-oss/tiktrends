import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { falFromEnv, falSubmitVideo } from '../src/fal';

/**
 * L'ancien « Vidéo IA » (`FAL_VIDEO_MODEL_I2V`, `falSubmitVideo`) ne bouge
 * pas quand les Studios changent de modèle (`FAL_VIDEO_MODEL_STUDIO`).
 *
 * Faux fournisseur HTTP local (`connection: close` sur chaque réponse) · la
 * file fal est remplacée par `FAL_QUEUE_URL`, aucun appel ne sort, 0 $.
 */

let serveur: Server;
let url = '';
const recus: Array<{ chemin: string; corps: unknown }> = [];

beforeAll(async () => {
  serveur = createServer((req, res) => {
    let brut = '';
    req.on('data', (c) => { brut += String(c); });
    req.on('end', () => {
      recus.push({ chemin: req.url ?? '', corps: brut ? JSON.parse(brut) : null });
      res.writeHead(200, { 'content-type': 'application/json', connection: 'close' });
      res.end(JSON.stringify({ request_id: 'r1', status_url: 'https://queue.fal.run/x/requests/r1/status', response_url: 'https://queue.fal.run/x/requests/r1' }));
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', () => ok()));
  url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((ok) => serveur.close(() => ok())); });
afterEach(() => { vi.unstubAllEnvs(); recus.length = 0; });

describe('ancien chemin vidéo · FAL_VIDEO_MODEL_I2V inchangé par le catalogue des Studios', () => {
  it('FAL_VIDEO_MODEL_STUDIO posé (Veo) ⇒ l’ancien chemin garde Kling 2.5 turbo pro, son corps de 5 s', async () => {
    vi.stubEnv('FAL_KEY', 'cle-de-test');
    vi.stubEnv('FAL_QUEUE_URL', url);
    vi.stubEnv('FAL_VIDEO_MODEL_I2V', '');
    vi.stubEnv('FAL_VIDEO_MODEL_STUDIO', 'fal-ai/veo3.1/fast/image-to-video');
    const cfg = falFromEnv()!;
    expect(cfg.videoModelI2V).toBe('fal-ai/kling-video/v2.5-turbo/pro/image-to-video');
    await falSubmitVideo(cfg, { prompt: 'Léa sourit', imageUrl: 'https://cdn.tiktrends.test/kf.png' });
    expect(recus).toEqual([{ chemin: '/fal-ai/kling-video/v2.5-turbo/pro/image-to-video', corps: { prompt: 'Léa sourit', duration: '5', image_url: 'https://cdn.tiktrends.test/kf.png' } }]);
  });

  it('FAL_VIDEO_MODEL_I2V posé ⇒ l’ancien chemin le suit, quel que soit le modèle des Studios', async () => {
    vi.stubEnv('FAL_KEY', 'cle-de-test');
    vi.stubEnv('FAL_QUEUE_URL', url);
    vi.stubEnv('FAL_VIDEO_MODEL_I2V', 'fal-ai/kling-video/v2/master/image-to-video');
    vi.stubEnv('FAL_VIDEO_MODEL_STUDIO', 'fal-ai/veo3.1/lite/image-to-video');
    await falSubmitVideo(falFromEnv()!, { prompt: 'p', imageUrl: 'https://cdn.tiktrends.test/kf.png', durationS: 10 });
    expect(recus).toEqual([{ chemin: '/fal-ai/kling-video/v2/master/image-to-video', corps: { prompt: 'p', duration: '10', image_url: 'https://cdn.tiktrends.test/kf.png' } }]);
  });
});
