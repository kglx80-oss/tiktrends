import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@tiktrends/integrations', async (original) => ({
  ...await original<typeof import('@tiktrends/integrations')>(),
  storageFromEnv: () => ({ endpoint: 's3.test', bucket: 'media', region: 'gra', accessKeyId: 'test', secretAccessKey: 'secret' }),
}));
import { assetAiUrl } from '../lib/asset-ai-url';
import { lecteurStockage, OCTETS_MAX_MEDIA } from '../lib/studios/rendu/medias';
afterEach(() => vi.unstubAllGlobals());
describe('Lecture stockage privé', () => {
  it('transmet à la vision seulement les références privées de l’espace autorisé', () => {
    expect(assetAiUrl('https://s3.test/media/assets/a/photo.png', 'a')).toContain('X-Amz-Signature=');
    expect(assetAiUrl('https://s3.test/media/assets/b/photo.png', 'a')).toBeNull();
    expect(assetAiUrl('https://images.test/photo.png', 'a')).toBe('https://images.test/photo.png');
  });
  it('lit avec une signature temporaire serveur et ne suit pas les redirections', async () => {
    const lire = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', lire);
    expect(await lecteurStockage().lire({ storageKey: 'studios/espace/image.png', bytes: 3 })).toEqual(new Uint8Array([1, 2, 3]));
    const [adresse, options] = lire.mock.calls[0]!;
    const u = new URL(adresse);
    expect(u.pathname).toBe('/media/studios/espace/image.png');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(options.redirect).toBe('error');
  });
  it('ne lit pas une simulation ou un objet trop grand, traite le refus comme absent', async () => {
    const lire = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', lire);
    expect(await lecteurStockage().lire({ storageKey: 'simule/a', bytes: 3 })).toBeNull();
    expect(await lecteurStockage().lire({ storageKey: 'studios/a', bytes: OCTETS_MAX_MEDIA + 1 })).toBeNull();
    expect(lire).not.toHaveBeenCalled();
    expect(await lecteurStockage().lire({ storageKey: 'studios/a', bytes: 3 })).toBeNull();
  });
});
