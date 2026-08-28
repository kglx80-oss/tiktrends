import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ttGetTranscript, ttTranscriptSupported, ttResetTranscriptProbe } from '../src/trendtrack';

/**
 * Le comportement qui compte n'est pas « ça récupère une transcription », c'est
 * « ça ne casse jamais rien ». Une transcription est un enrichissement · faire
 * échouer tout un lot parce qu'elle manque serait échanger une dégradation
 * contre une panne.
 */

const cfg = { apiKey: 'k' };
const rep = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => { ttResetTranscriptProbe(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('ttGetTranscript', () => {
  it('rend la transcription quand l’API la fournit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => rep(200, { transcript: 'Tu perds tes cheveux et personne ne te le dit.' })));
    expect(await ttGetTranscript(cfg, 'a1')).toContain('Tu perds tes cheveux');
  });

  it('accepte les formes de réponse plausibles', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => rep(200, { data: { text: 'Une transcription rangée ailleurs dans la réponse.' } })));
    expect(await ttGetTranscript(cfg, 'a1')).toContain('rangée ailleurs');
  });

  it('recolle des segments quand la réponse est découpée', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => rep(200, { segments: [{ text: 'Premier segment' }, { text: 'deuxième segment' }] })));
    expect(await ttGetTranscript(cfg, 'a1')).toBe('Premier segment deuxième segment');
  });

  it('essaie les chemins suivants sur un 404', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(rep(404))
      .mockResolvedValueOnce(rep(200, { transcription: 'Trouvée au deuxième chemin essayé.' }));
    vi.stubGlobal('fetch', f);
    expect(await ttGetTranscript(cfg, 'a1')).toContain('deuxième chemin');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('ne lève jamais sur une panne réseau · elle renvoie null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fetch failed'); }));
    await expect(ttGetTranscript(cfg, 'a1')).resolves.toBeNull();
  });

  it('ne lève jamais sur un JSON invalide', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('pas du json', { status: 200 })));
    await expect(ttGetTranscript(cfg, 'a1')).resolves.toBeNull();
  });

  it('abandonne définitivement sur un refus d’accès', async () => {
    // Insister créerait du bruit et consommerait du quota pour rien.
    const f = vi.fn(async () => rep(403));
    vi.stubGlobal('fetch', f);
    expect(await ttGetTranscript(cfg, 'a1')).toBeNull();
    expect(ttTranscriptSupported()).toBe(false);
    expect(await ttGetTranscript(cfg, 'a2')).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('cesse d’essayer quand aucun chemin ne répond', async () => {
    const f = vi.fn(async () => rep(404));
    vi.stubGlobal('fetch', f);
    await ttGetTranscript(cfg, 'a1');
    expect(ttTranscriptSupported()).toBe(false);
    const apres = f.mock.calls.length;
    await ttGetTranscript(cfg, 'a2');
    expect(f).toHaveBeenCalledTimes(apres);
  });

  it('retient le chemin qui a marché · pas de redécouverte à chaque créa', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(rep(404))
      .mockResolvedValue(rep(200, { transcript: 'Une transcription bien assez longue.' }));
    vi.stubGlobal('fetch', f);
    await ttGetTranscript(cfg, 'a1');   // 2 appels : un 404, un succès
    await ttGetTranscript(cfg, 'a2');   // 1 seul appel
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('rend null sans identifiant', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(await ttGetTranscript(cfg, '')).toBeNull();
  });
});
