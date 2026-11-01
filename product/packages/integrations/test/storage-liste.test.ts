import { afterEach, describe, expect, it, vi } from 'vitest';
import { VALIDITE_LIEN_DEPOT_S } from '@tiktrends/core';
import { LISTE_OBJETS_PAGES_MAX, listerObjets, lirePageListeObjets, presignPutUrl } from '../src/storage';

/**
 * Stockage · liste des objets (ListObjectsV2) · un FAUX S3 qui pagine comme le
 * vrai (`max-keys`, `continuation-token`, `IsTruncated`). On lit ce qui SORT ·
 * les objets rendus, `complete`, et les requêtes réellement envoyées (GET
 * signé seulement, jamais PUT ni DELETE).
 */
const cfg = { endpoint: 's3.exemple.test', bucket: 'media', region: 'gra', accessKeyId: 'id-test', secretAccessKey: 'secret-test' };
afterEach(() => { vi.unstubAllGlobals(); });

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function xml(objets: Array<{ cle: string; taille: number; le: string }>, tronquee: boolean, suite: string | null) {
  return `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>media</Name><Prefix>assets/</Prefix><KeyCount>${objets.length}</KeyCount><MaxKeys>2</MaxKeys><IsTruncated>${tronquee ? 'true' : 'false'}</IsTruncated>${suite ? `<NextContinuationToken>${echapper(suite)}</NextContinuationToken>` : ''}${objets.map((o) => `<Contents><Key>${echapper(o.cle)}</Key><LastModified>${o.le}</LastModified><ETag>&quot;x&quot;</ETag><Size>${o.taille}</Size><StorageClass>STANDARD</StorageClass></Contents>`).join('')}</ListBucketResult>`;
}

/** Faux S3 · `n` objets sous `assets/`, servis par pages de `max-keys`, jeton = index de départ. */
function fauxS3(n: number, o: { casserPage?: number; sansJeton?: boolean; jetonFixe?: boolean } = {}) {
  const tous = Array.from({ length: n }, (_, i) => ({ cle: `assets/ws/f-${i} & co.png`, taille: 10 + i, le: `2026-10-0${1 + (i % 9)}T00:00:00.000Z` }));
  const requetes: Array<{ methode: string; url: URL; auth: string | null }> = [];
  const f = vi.fn(async (entree: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entree));
    const h = new Headers(init?.headers);
    requetes.push({ methode: init?.method ?? 'GET', url, auth: h.get('authorization') });
    if (o.casserPage !== undefined && requetes.length === o.casserPage) return new Response('<Error><Code>InternalError</Code></Error>', { status: 500 });
    const parPage = Number(url.searchParams.get('max-keys'));
    const debut = Number(url.searchParams.get('continuation-token') ?? 0);
    const page = tous.filter((x) => x.cle.startsWith(url.searchParams.get('prefix') ?? '')).slice(debut, debut + parPage);
    const reste = debut + parPage < tous.length;
    const suite = !reste || o.sansJeton ? null : o.jetonFixe ? '2' : String(debut + parPage);
    return new Response(xml(page, reste, suite), { status: 200 });
  });
  vi.stubGlobal('fetch', f);
  return { tous, requetes };
}

describe('Stockage · listerObjets · lecture paginée, signée, bornée', () => {
  it('suit les pages jusqu’au bout · tous les objets, clés décodées, tailles et dates lues, complète', async () => {
    const s3 = fauxS3(5);
    const r = await listerObjets(cfg, { prefixe: 'assets/', parPage: 2 });
    expect(r.complete).toBe(true);
    expect(r.pages).toBe(3);
    expect(r.objets.map((x) => x.cle)).toEqual(s3.tous.map((x) => x.cle));
    expect(r.objets[0]).toEqual({ cle: 'assets/ws/f-0 & co.png', taille: 10, modifieLe: new Date('2026-10-01T00:00:00.000Z') });
    // Les requêtes · GET signé (SigV4) sur le bucket, préfixe et jeton de suite transmis.
    expect(s3.requetes.map((q) => q.methode)).toEqual(['GET', 'GET', 'GET']);
    expect(s3.requetes.every((q) => q.url.pathname === '/media' && q.url.searchParams.get('list-type') === '2' && q.url.searchParams.get('prefix') === 'assets/')).toBe(true);
    expect(s3.requetes.map((q) => q.url.searchParams.get('continuation-token'))).toEqual([null, '2', '4']);
    expect(s3.requetes.every((q) => /^AWS4-HMAC-SHA256 Credential=id-test\//.test(q.auth ?? ''))).toBe(true);
    expect(s3.requetes.some((q) => q.url.href.includes('secret-test'))).toBe(false);
  });

  it('une erreur au milieu · ce qui a été lu, `complete: false`, et la raison', async () => {
    fauxS3(5, { casserPage: 2 });
    const r = await listerObjets(cfg, { prefixe: 'assets/', parPage: 2 });
    expect(r).toMatchObject({ complete: false, pages: 2, erreur: 'HTTP 500' });
    expect(r.objets).toHaveLength(2);
  });

  it('tronquée sans jeton de suite, ou jeton répété · incomplète, jamais de boucle', async () => {
    fauxS3(5, { sansJeton: true });
    expect(await listerObjets(cfg, { prefixe: 'assets/', parPage: 2 })).toMatchObject({ complete: false, erreur: 'suite absente', pages: 1 });
    const s3 = fauxS3(9, { jetonFixe: true });
    expect(await listerObjets(cfg, { prefixe: 'assets/', parPage: 2 })).toMatchObject({ complete: false, erreur: 'suite absente' });
    expect(s3.requetes.length).toBe(2);
  });

  it('bornée · au plus `pagesMax` pages, puis incomplète', async () => {
    const s3 = fauxS3(50);
    const r = await listerObjets(cfg, { prefixe: 'assets/', parPage: 2, pagesMax: 3 });
    expect(r).toMatchObject({ complete: false, erreur: 'borne atteinte', pages: 3 });
    expect(r.objets).toHaveLength(6);
    expect(s3.requetes).toHaveLength(3);
    expect(LISTE_OBJETS_PAGES_MAX).toBe(100);
  });

  it('une réponse qui n’est pas une liste · illisible ; le réseau qui casse · incomplète', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>portail</html>', { status: 200 })));
    expect(await listerObjets(cfg, { prefixe: 'assets/' })).toMatchObject({ complete: false, erreur: 'réponse illisible', objets: [] });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
    expect(await listerObjets(cfg, { prefixe: 'assets/' })).toMatchObject({ complete: false, erreur: 'réseau', pages: 0 });
  });

  it('la page · taille illisible rendue -1, date illisible rendue null (le noyau les écarte)', () => {
    const p = lirePageListeObjets('<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>assets/a/b</Key><Size>x</Size><LastModified>hier</LastModified></Contents></ListBucketResult>');
    expect(p).toEqual({ objets: [{ cle: 'assets/a/b', taille: -1, modifieLe: null }], tronquee: false, suite: null });
  });

  it('la validité du lien d’envoi est celle que mesure le délai de grâce du noyau', () => {
    const { uploadUrl } = presignPutUrl(cfg, 'assets/ws/x.png', { contentType: 'image/png', contentLength: 1 });
    expect(Number(new URL(uploadUrl).searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(VALIDITE_LIEN_DEPOT_S);
    expect(Number(new URL(uploadUrl).searchParams.get('X-Amz-Expires'))).toBe(VALIDITE_LIEN_DEPOT_S);
  });
});
