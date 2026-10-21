import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const m = vi.hoisted(() => ({ garde: vi.fn(), sources: vi.fn(), fetch: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../lib/studios/sources/acces', () => ({ gardeSources: m.garde }));
vi.mock('../lib/studios/sources/sources', () => ({ chargerSources: m.sources }));
vi.mock('@tiktrends/integrations/src/safe-fetch', () => ({ safeFetch: m.fetch }));
vi.mock('@tiktrends/db', () => ({ db: {}, schema: {} }));
import { preparerVeilleVisuelle } from '../lib/jarvis/veille-visuelle';
const portee = { workspaceId: 'w', brandId: 'b' };
const params = (extra = {}) => ({ action: 'cloner', annonce: JSON.stringify({ id: 'ad', platform: 'meta', mediaType: 'image', mediaUrl: 'https://public.example/image.jpg', ...extra }) });
beforeEach(() => {
  vi.clearAllMocks();
  m.garde.mockResolvedValue({ ok: true, ctx: { workspaceId: 'w', marques: ['b'] }, veilleOuverte: true });
  m.sources.mockResolvedValue({ ok: true, sources: [{ cle: 'meta:ad', annonceur: 'Concurrent', extraitAutorise: 'Texte concurrent' }] });
});
describe('Clone visuel Jarvis', () => {
  it('joint de vrais pixels natifs, pas seulement le texte de la publicité', async () => {
    const body = await sharp({ create: { width: 32, height: 48, channels: 3, background: '#aa2288' } }).png().toBuffer();
    m.fetch.mockResolvedValue({ body, contentType: 'image/png' });
    const r = await preparerVeilleVisuelle(params(), portee);
    expect(r.image?.source.media_type).toBe('image/jpeg');
    const image = await sharp(Buffer.from(r.image!.source.data, 'base64')).metadata();
    expect(image.width).toBe(32); expect(image.height).toBe(48);
    expect(r.consigne).toContain('image statique');
    expect(r.consigne).toContain('Je garde / Je remplace');
  });
  it('refuse une source hors portée avant tout téléchargement', async () => {
    m.garde.mockResolvedValue({ ok: true, ctx: { workspaceId: 'autre', marques: ['b'] } });
    await expect(preparerVeilleVisuelle(params(), portee)).rejects.toThrow('accessible');
    expect(m.sources).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
  });
  it('refuse une source révoquée et ne tente pas le média client', async () => {
    m.sources.mockResolvedValue({ ok: false });
    await expect(preparerVeilleVisuelle(params(), portee)).rejects.toThrow('accessible');
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it('ne remplace pas une image absente par une analyse du texte', async () => {
    await expect(preparerVeilleVisuelle(params({ mediaUrl: '' }), portee)).rejects.toThrow('indisponible');
    m.fetch.mockResolvedValue(null);
    await expect(preparerVeilleVisuelle(params(), portee)).rejects.toThrow('Aucun appel IA');
    m.fetch.mockResolvedValue({ body: Buffer.from('not an image'), contentType: 'image/jpeg' });
    await expect(preparerVeilleVisuelle(params(), portee)).rejects.toThrow('illisible');
  });
  it('ne télécharge jamais la vidéo pour la faire passer pour une image', async () => {
    await expect(preparerVeilleVisuelle(params({ mediaType: 'video', mediaUrl: 'https://example.com/movie.mp4' }), portee)).rejects.toThrow('indisponible');
    expect(m.fetch).not.toHaveBeenCalled();
  });
});
