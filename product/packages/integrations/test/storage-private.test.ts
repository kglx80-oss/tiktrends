import { afterEach, describe, expect, it, vi } from 'vitest';
import { objectKeyFromUrl, privateObjectUrl, presignHeadUrl, presignGetUrl, presignPutUrl, storagePrivateSelfTest } from '../src/storage';
const cfg = { endpoint: 's3.example.test', bucket: 'media', region: 'gra', accessKeyId: 'test-id', secretAccessKey: 'test-secret' };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('accès privé S3', () => {
  it('signe séparément lecture et écriture sans persister la signature', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    const key = 'assets/espace/photo été.png';
    const put = presignPutUrl(cfg, key, 300);
    const get = new URL(presignGetUrl(cfg, key, 300));
    expect(get.searchParams.get('X-Amz-Signature')).not.toBe(new URL(put.uploadUrl).searchParams.get('X-Amz-Signature'));
    expect(get.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(new URL(presignHeadUrl(cfg, key, 300)).searchParams.get('X-Amz-Signature')).not.toBe(get.searchParams.get('X-Amz-Signature')); 
    expect(get.pathname).toBe('/media/assets/espace/photo%20%C3%A9t%C3%A9.png');
    expect(new URL(put.publicUrl).search).toBe('');
    expect(get.href).not.toContain(cfg.secretAccessKey);
  });
  it('refuse les durées et clés dangereuses', () => {
    for (const expiry of [0, -1, 901, 1.5]) expect(() => presignGetUrl(cfg, 'assets/a/x', expiry)).toThrow();
    for (const key of ['/x', 'assets/../x', 'assets//x', 'assets/./x']) expect(() => presignGetUrl(cfg, key)).toThrow();
  });
  it('ne signe que le bucket et espace attendus', () => {
    expect(privateObjectUrl(cfg, 'https://s3.example.test/media/assets/a/x.png', 'a')).toContain('X-Amz-Signature=');
    expect(objectKeyFromUrl(cfg, 'https://media.s3.example.test/assets/a/x.png')).toBe('assets/a/x.png');
    for (const url of ['https://s3.example.test/media/assets/b/x.png', 'https://evil.test/media/assets/a/x.png', 'https://s3.example.test/other/assets/a/x.png', 'https://s3.example.test/media/assets/a/x.png?token=abc', 'https://s3.example.test/media/assets/a/%2F..%2Fx']) expect(privateObjectUrl(cfg, url, 'a')).toBeNull();
  });
  it('vérifie lecture signée, refus anonyme et nettoyage', async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response('', {status: 200})).mockResolvedValueOnce(new Response('tiktrends-ok')).mockResolvedValueOnce(new Response('', {status: 403})).mockResolvedValueOnce(new Response(null, {status: 204}));
    vi.stubGlobal('fetch', mock);
    expect(await storagePrivateSelfTest(cfg)).toMatchObject({put:true, privateRead:true, anonymousDenied:true, deleted:true});
    expect(String(mock.mock.calls[1]?.[0])).toContain('X-Amz-Signature=');
    expect(String(mock.mock.calls[2]?.[0])).not.toContain('X-Amz-Signature=');
    expect(mock.mock.calls[3]?.[1]).toMatchObject({method:'DELETE'});
  });
  it('ne valide jamais un bucket public et nettoie après une erreur', async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('tiktrends-ok')).mockResolvedValueOnce(new Response('tiktrends-ok')).mockResolvedValueOnce(new Response(null, {status:204}));
    vi.stubGlobal('fetch', mock);
    expect((await storagePrivateSelfTest(cfg)).anonymousDenied).toBe(false);
    mock.mockReset().mockResolvedValueOnce(new Response('')).mockRejectedValueOnce(new Error('secret')).mockResolvedValueOnce(new Response(null, {status:204}));
    const result = await storagePrivateSelfTest(cfg);
    expect(result.deleted).toBe(true); expect(result.privateRead).toBe(false); expect(result.error).not.toContain('secret');
  });
  it('un CDN privé ne masque pas un bucket natif public', async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('tiktrends-ok')).mockResolvedValueOnce(new Response('tiktrends-ok')).mockResolvedValueOnce(new Response('', {status:403})).mockResolvedValueOnce(new Response(null, {status:204}));
    vi.stubGlobal('fetch', mock);
    const result = await storagePrivateSelfTest({...cfg, publicBaseUrl:'https://cdn.example.test'});
    expect(result.anonymousDenied).toBe(false);
    expect(result.deleted).toBe(true);
    expect(String(mock.mock.calls[2]?.[0])).toMatch(/^https:\/\/s3.example.test\/media\//);
    expect(String(mock.mock.calls[3]?.[0])).toMatch(/^https:\/\/cdn.example.test\//);
  });

  it.each([
    [200, 'accessible'], [400, 'http_inattendu'], [404, 'introuvable'], [302, 'redirection'], [500, 'http_inattendu'],
  ])('distingue le statut anonyme %s sans prouver la confidentialité', async (status, resultat) => {
    const mock = vi.fn().mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('tiktrends-ok')).mockResolvedValueOnce(new Response('secret-provider-body', {status: Number(status), headers: {location: 'https://secret-host.test/?secret=token'}})).mockResolvedValueOnce(new Response(null, {status:204}));
    vi.stubGlobal('fetch', mock);
    const result = await storagePrivateSelfTest(cfg);
    expect(result.anonymousDenied).toBe(false);
    expect(result.diagnostics).toContainEqual({cible:'bucket_anonyme', statut:status, resultat});
    expect(mock.mock.calls[2]?.[1]).toMatchObject({redirect:'manual'});
    expect(result.deleted).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/secret|X-Amz|example\.test|https:/);
  });
  it('continue le diagnostic CDN après erreur réseau du bucket sans fuite des détails', async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('tiktrends-ok')).mockRejectedValueOnce(new Error('secret-host token')).mockResolvedValueOnce(new Response('', {status:403})).mockResolvedValueOnce(new Response(null, {status:204}));
    vi.stubGlobal('fetch', mock);
    const result = await storagePrivateSelfTest({...cfg, publicBaseUrl:'https://cdn.example.test'});
    expect(result.anonymousDenied).toBe(false);
    expect(result.diagnostics).toContainEqual({cible:'bucket_anonyme', statut:null, resultat:'reseau'});
    expect(result.diagnostics).toContainEqual({cible:'lecture_configuree_anonyme', statut:403, resultat:'refus'});
    expect(result.deleted).toBe(true); expect(JSON.stringify(result)).not.toContain('secret');
  });

  it.each([403, 200, 400])('OVH : sonde le même témoin en virtual-host, statut %s', async (status) => {
    const mock = vi.fn().mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('tiktrends-ok')).mockResolvedValueOnce(new Response('', {status})).mockResolvedValueOnce(new Response(null, {status:204}));
    vi.stubGlobal('fetch', mock);
    const result = await storagePrivateSelfTest({...cfg, endpoint:'s3.gra.io.cloud.ovh.net'});
    const signee = new URL(String(mock.mock.calls[1]?.[0]));
    const anonyme = new URL(String(mock.mock.calls[2]?.[0]));
    expect(signee.hostname).toBe('s3.gra.io.cloud.ovh.net');
    expect(anonyme.hostname).toBe('media.s3.gra.io.cloud.ovh.net');
    expect(signee.pathname).toBe(`/media${anonyme.pathname}`);
    expect(anonyme.pathname).toMatch(/^\/assets\/_healthcheck\/.+\.txt$/);
    expect(anonyme.search).toBe('');
    expect(result.anonymousDenied).toBe(status === 403); expect(result.deleted).toBe(true);
    expect(mock).toHaveBeenCalledTimes(4); // aucun re-test path-style invalide
  });
  it('OVH : un bucket privé ne masque pas un CDN explicitement public', async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('tiktrends-ok')).mockResolvedValueOnce(new Response('', {status:403})).mockResolvedValueOnce(new Response('tiktrends-ok')).mockResolvedValueOnce(new Response(null, {status:204}));
    vi.stubGlobal('fetch', mock);
    const result = await storagePrivateSelfTest({...cfg, endpoint:'s3.gra.io.cloud.ovh.net', publicBaseUrl:'https://cdn.example.test'});
    expect(result.anonymousDenied).toBe(false);
    expect(result.diagnostics).toContainEqual({cible:'lecture_configuree_anonyme', statut:200, resultat:'accessible'});
    const native = new URL(String(mock.mock.calls[2]?.[0]));
    const cdn = new URL(String(mock.mock.calls[3]?.[0]));
    expect(native.hostname).toBe('media.s3.gra.io.cloud.ovh.net');
    expect(cdn.hostname).toBe('cdn.example.test'); expect(cdn.pathname).toBe(native.pathname);
    expect(result.deleted).toBe(true);
  });

});
