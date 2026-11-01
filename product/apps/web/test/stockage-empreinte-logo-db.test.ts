import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';

/**
 * Stockage · l'EMPREINTE d'un logo importé · gardée à l'import, vérifiée avant
 * de servir l'aperçu ou de passer au devis · vraie base (pglite + migrations du
 * dépôt, 0066 comprise), FAUX S3 qui range de vrais octets et rend un ETag
 * (MD5 du corps, comme S3) et honore `If-Match` (412), les VRAIES actions
 * (`presignAssetUploadAction` puis `saveBrandDAAction`), la VRAIE route
 * `/api/brands/[id]/media` et `resoudreReferencesImage`.
 *
 * On lit ce qui SORT · la colonne en base, le statut et les octets de la
 * réponse, la résolution du devis :
 *  - import · l'ETag relu est écrit pour l'adresse du logo ;
 *  - objet conforme · l'aperçu sert les octets confirmés (GET + If-Match),
 *    jamais une redirection ; le devis le dit transmissible ;
 *  - objet REMPLACÉ après coup (même type, même longueur, le lien de dépôt
 *    vivait encore) · aperçu refusé (409 « Logo à réimporter », aucun octet),
 *    devis non transmissible et « à réimporter » ; stockage qui ignorerait
 *    `If-Match` · l'ETag relu suffit à refuser ;
 *  - logo ANCIEN sans empreinte · servi comme avant (302 signé), aucune
 *    vérification ; stockage sans ETag à l'import · rien gardé, rien bloqué ;
 *  - logo retiré de la charte · son empreinte part avec lui ; charte
 *    réenregistrée · l'empreinte reste.
 */
const etat = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }));
const CFG = vi.hoisted(() => ({ endpoint: 's3.test', region: 'gra', bucket: 'bucket', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://cdn.exemple.test/bucket' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG }));

import { db, schema, eq } from '@tiktrends/db';
import { MESSAGES_LOGO_SERVI, charteAvecLogoImporte, idLogoMarque } from '@tiktrends/core';
import { presignAssetUploadAction } from '../app/actions/assets';
import { saveBrandDAAction } from '../app/actions/brand-detail';
import { GET as GET_BRAND_MEDIA } from '../app/api/brands/[id]/media/route';
import { resoudreReferencesImage } from '../lib/studios/image/references';
import { hacherImage } from '../lib/studios/produit/catalogue';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BASE = CFG.publicBaseUrl;
const ANCIEN = 'https://site.exemple.fr/logo.png';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');
/** Un PNG complété jusqu'à `n` octets par `remplissage` · même type, même longueur, autres octets. */
const pngDe = (n: number, remplissage = 0) => Buffer.concat([PNG, Buffer.alloc(Math.max(0, n - PNG.length), remplissage)]);

/* ───────────── Le faux bucket · ETag = MD5 du corps, If-Match honoré ───────────── */

const bucket = new Map<string, Buffer>();
const requetes: Array<{ methode: string; cle: string; ifMatch: string | null }> = [];
const options = { sansEtag: false, ignoreIfMatch: false };
const etagDe = (o: Buffer) => `"${createHash('md5').update(o).digest('hex')}"`;
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  const methode = init?.method ?? 'GET';
  const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  const ifMatch = new Headers(init?.headers).get('if-match');
  requetes.push({ methode, cle, ifMatch });
  const o = bucket.get(cle);
  if (methode === 'DELETE') { bucket.delete(cle); return new Response(null, { status: 204 }); }
  if (!o) return new Response(methode === 'HEAD' ? null : 'NoSuchKey', { status: 404 });
  const etag = etagDe(o);
  const tags: Record<string, string> = options.sansEtag ? {} : { etag };
  if (ifMatch !== null && ifMatch !== etag && !options.ignoreIfMatch) return new Response(null, { status: 412 });
  if (methode === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': String(o.length), ...tags } });
  if (methode !== 'GET') return new Response(null, { status: 405 });
  const m = /^bytes=0-(\d+)$/.exec(new Headers(init?.headers).get('range') ?? '');
  if (!m) return new Response(new Uint8Array(o), { status: 200, headers: { 'content-length': String(o.length), ...tags } });
  const fin = Math.min(o.length, Number(m[1]) + 1);
  return new Response(new Uint8Array(o.subarray(0, fin)), { status: 206, headers: { 'content-range': `bytes 0-${fin - 1}/${o.length}`, ...tags } });
}
const cleDe = (url: string) => url.slice(BASE.length + 1);

/* ───────────── Un espace, une marque ───────────── */

const A = { ws: randomUUID(), b: randomUUID(), user: randomUUID() };
const lire = async () => (await db.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos, logoEmpreintes: schema.brands.logoEmpreintes }).from(schema.brands).where(eq(schema.brands.id, A.b)))[0]!;
async function deposer(octets: Buffer) {
  const pre = await presignAssetUploadAction({ filename: 'logo.png', contentType: 'image/png', sizeBytes: octets.length });
  expect(pre.error).toBeUndefined();
  bucket.set(cleDe(pre.publicUrl!), octets);
  return { url: pre.publicUrl!, jeton: pre.jetonDepot! };
}
const importer = (d: { url: string; jeton: string }) =>
  saveBrandDAAction({ brandId: A.b, ...charteAvecLogoImporte({ logos: [ANCIEN], defaut: ANCIEN }, d.url), colors: ['#112233'], fonts: ['Inter'], jetonDepot: d.jeton });
const apercu = (url: string) => GET_BRAND_MEDIA(new Request(`http://local/api/brands/${A.b}/media?url=${encodeURIComponent(url)}`), { params: Promise.resolve({ id: A.b }) });
const devis = async (url: string) => (await resoudreReferencesImage(db as never, { workspaceId: A.ws, brandId: A.b }, [idLogoMarque(A.b, hacherImage(url).sha256)])).get(idLogoMarque(A.b, hacherImage(url).sha256));

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: A.ws, name: 'A', plan: 'core' });
  await db.insert(schema.users).values({ id: A.user, email: `${A.user.slice(0, 8)}@exemple.invalid` });
  await db.insert(schema.brands).values({ id: A.b, workspaceId: A.ws, name: 'A1', logoUrl: ANCIEN, logos: [ANCIEN], colors: ['#112233'], fonts: ['Inter'] });
});
beforeEach(async () => {
  requetes.length = 0;
  options.sansEtag = false; options.ignoreIfMatch = false;
  vi.stubGlobal('fetch', fauxBucket);
  await db.update(schema.brands).set({ logoUrl: ANCIEN, logos: [ANCIEN], logoEmpreintes: null });
  etat.session = { workspaceId: A.ws, workspaceName: 'Espace', role: 'admin', plan: 'core', user: { id: A.user, email: `${A.user.slice(0, 8)}@exemple.invalid`, name: null } };
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Empreinte d’un logo importé · écrite à l’import', () => {
  it('l’ETag fort relu (celui exigé par If-Match sur les octets jugés) est gardé pour l’adresse du logo', async () => {
    const octets = pngDe(2048);
    const d = await deposer(octets);
    expect(await importer(d)).toEqual({ ok: true });
    const b = await lire();
    expect(b.logoUrl).toBe(d.url);
    expect(b.logoEmpreintes).toEqual({ [d.url]: etagDe(octets).slice(1, -1) });
    // Les octets jugés à l'import sont ceux de cette empreinte.
    expect(requetes.find((r) => r.methode === 'GET')?.ifMatch).toBe(etagDe(octets));
  });

  it('charte réenregistrée sans nouvel import · l’empreinte reste ; logo retiré · son empreinte part avec lui', async () => {
    const d = await deposer(pngDe(2048));
    expect(await importer(d)).toEqual({ ok: true });
    const garde = (await lire()).logoEmpreintes;
    expect(await saveBrandDAAction({ brandId: A.b, logoUrl: d.url, logos: [ANCIEN, d.url], colors: ['#445566'], fonts: ['Inter'] })).toEqual({ ok: true });
    expect((await lire()).logoEmpreintes).toEqual(garde);
    expect(await saveBrandDAAction({ brandId: A.b, logoUrl: ANCIEN, logos: [ANCIEN], colors: ['#445566'], fonts: ['Inter'] })).toEqual({ ok: true });
    expect((await lire()).logoEmpreintes).toBeNull();
  });

  it('stockage sans ETag à l’import · rien n’est gardé, le logo est enregistré comme avant', async () => {
    options.sansEtag = true;
    const d = await deposer(pngDe(2048));
    expect(await importer(d)).toEqual({ ok: true });
    expect(await lire()).toEqual({ logoUrl: d.url, logos: [ANCIEN, d.url], logoEmpreintes: null });
  });
});

describe('Empreinte d’un logo importé · vérifiée avant de servir l’aperçu et avant le devis', () => {
  it('objet conforme · l’aperçu sert les octets confirmés (GET + If-Match, aucune redirection), le devis le dit transmissible', async () => {
    const octets = pngDe(2048);
    const d = await deposer(octets);
    expect(await importer(d)).toEqual({ ok: true });
    requetes.length = 0;
    const r = await apercu(d.url);
    expect(r.status).toBe(200);
    expect(r.headers.get('location')).toBeNull();
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await r.arrayBuffer()).equals(octets)).toBe(true);
    expect(requetes).toEqual([{ methode: 'GET', cle: cleDe(d.url), ifMatch: etagDe(octets) }]);
    expect(await devis(d.url)).toMatchObject({ etat: 'present', transmissible: true });
    expect(await devis(d.url)).not.toHaveProperty('aReimporter');
  });

  it('objet REMPLACÉ après coup (même type, même longueur) · aperçu refusé « à réimporter », aucun octet ; devis non transmissible', async () => {
    const d = await deposer(pngDe(2048));
    expect(await importer(d)).toEqual({ ok: true });
    // Le lien de dépôt vit encore · même en-tête de type, même longueur, autres octets.
    const autres = pngDe(2048, 0x41);
    bucket.set(cleDe(d.url), autres);
    const r = await apercu(d.url);
    expect(r.status).toBe(409);
    expect(r.headers.get('location')).toBeNull();
    expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(r.headers.get('x-logo-etat')).toBe('a-reimporter');
    const corps = await r.text();
    expect(corps).toBe(MESSAGES_LOGO_SERVI.remplace);
    expect(corps).toMatch(/^Logo à réimporter/);
    expect(await devis(d.url)).toEqual(expect.objectContaining({ etat: 'present', transmissible: false, aReimporter: true }));
    // La charte n'est pas réécrite · le logo reste à sa place, à réimporter.
    expect((await lire()).logoUrl).toBe(d.url);
  });

  it('stockage qui ignorerait If-Match · l’ETag relu, différent de l’empreinte, suffit à refuser', async () => {
    const d = await deposer(pngDe(2048));
    expect(await importer(d)).toEqual({ ok: true });
    bucket.set(cleDe(d.url), pngDe(2048, 0x42));
    options.ignoreIfMatch = true;
    const r = await apercu(d.url);
    expect(r.status).toBe(409);
    expect(await r.text()).toBe(MESSAGES_LOGO_SERVI.remplace);
    expect(await devis(d.url)).toEqual(expect.objectContaining({ transmissible: false, aReimporter: true }));
  });

  it('objet disparu du stockage · aperçu 404 « à réimporter », devis absent', async () => {
    const d = await deposer(pngDe(2048));
    expect(await importer(d)).toEqual({ ok: true });
    bucket.delete(cleDe(d.url));
    const r = await apercu(d.url);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe(MESSAGES_LOGO_SERVI.absent);
    expect(await devis(d.url)).toEqual({ etat: 'absent' });
  });

  it('logo ANCIEN du bucket sans empreinte · servi comme avant (302 signé), devis transmissible, aucune vérification', async () => {
    const url = `${BASE}/assets/${A.ws}/1-abcd1234-ancien.png`;
    bucket.set(cleDe(url), pngDe(2048));
    await db.update(schema.brands).set({ logoUrl: url, logos: [url] }).where(eq(schema.brands.id, A.b));
    const r = await apercu(url);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toContain('X-Amz-Signature=');
    expect(await devis(url)).toMatchObject({ etat: 'present', transmissible: true });
    expect(requetes).toEqual([]);
  });
});
