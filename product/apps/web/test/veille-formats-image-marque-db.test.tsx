import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Veille · Formats · l'image des miniatures (photo produit de la marque
 * active, sinon son logo par défaut) passe par la ROUTE MÉDIA, jamais par
 * l'adresse enregistrée (le stockage est privé · l'image était cassée), et un
 * logo remplacé depuis son import n'est plus montré · vraie base (pglite +
 * migrations), FAUX S3 qui rend un ETag (MD5 du corps) et honore `If-Match`
 * (412), les VRAIES pages rendues (« Tous les formats », page d'un style) et
 * la VRAIE route média appelée avec l'adresse rendue.
 *
 * On lit ce qui SORT · le HTML et les requêtes parties au stockage :
 *  - photo produit · l'adresse de la route, servie par la route ; le logo n'est
 *    pas vérifié (aucune requête) ;
 *  - logo intact · l'adresse de la route, un seul HEAD (If-Match) ;
 *  - logo REMPLACÉ · aucune image du logo (repli de la miniature), un HEAD ;
 *  - logo sans empreinte · l'adresse de la route, AUCUNE requête.
 */
const etat = vi.hoisted(() => ({ session: null as null | Record<string, unknown>, cookie: null as string | null }));
const CFG = vi.hoisted(() => ({ endpoint: 's3.test', region: 'gra', bucket: 'bucket', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://cdn.exemple.test/bucket' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/veille/formats',
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && etat.cookie ? { value: etat.cookie } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));

import { db, schema, eq } from '@tiktrends/db';
import FormatsSpatial from '../app/(spatial)/sp/veille/formats/page';
import FormatSpatial from '../app/(spatial)/sp/veille/formats/[format]/page';
import { GET as routeMedia } from '../app/api/brands/[id]/media/route';
import { IMAGE_VIDE } from '../spatial/vues/formats/Composition';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/* ───────────── Le faux bucket · ETag = MD5 du corps, If-Match honoré ───────────── */

const bucket = new Map<string, Buffer>();
const requetes: Array<{ methode: string; cle: string; ifMatch: string | null }> = [];
const etagDe = (o: Buffer) => `"${createHash('md5').update(o).digest('hex')}"`;
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  const methode = init?.method ?? 'GET';
  const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  const ifMatch = new Headers(init?.headers).get('if-match');
  requetes.push({ methode, cle, ifMatch });
  const o = bucket.get(cle);
  if (!o) return new Response(methode === 'HEAD' ? null : 'NoSuchKey', { status: 404 });
  const etag = etagDe(o);
  if (ifMatch !== null && ifMatch !== etag) return new Response(null, { status: 412 });
  if (methode === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': String(o.length), etag } });
  return new Response(new Uint8Array(o), { status: 200, headers: { 'content-length': String(o.length), 'content-type': 'image/png', etag } });
}
const heads = () => requetes.filter((r) => r.methode === 'HEAD');

/* ───────────── Un espace, une marque active ───────────── */

const A = { ws: randomUUID(), b: randomUUID(), user: randomUUID() };
const BASE = CFG.publicBaseUrl;
const LOGO = `${BASE}/assets/${A.ws}/1-abcd1234-logo.png`;
const PHOTO = `${BASE}/assets/${A.ws}/2-ef567890-produit.png`;
const cleDe = (url: string) => url.slice(BASE.length + 1);
const ORIGINAL = Buffer.from('\x89PNG octets du logo importé');
const apercu = (url: string) => `/api/brands/${A.b}/media?url=${encodeURIComponent(url)}`;
const esc = (t: string) => renderToStaticMarkup(<>{t}</>);

async function charte(o: { empreinte: boolean }) {
  bucket.set(cleDe(LOGO), ORIGINAL);
  await db.update(schema.brands).set({ logoUrl: LOGO, logos: [LOGO], logoEmpreintes: o.empreinte ? { [LOGO]: createHash('md5').update(ORIGINAL).digest('hex') } : null }).where(eq(schema.brands.id, A.b));
}
const remplacer = () => bucket.set(cleDe(LOGO), Buffer.from('\x89PNG autres octets, même type'));
async function photoProduit() {
  bucket.set(cleDe(PHOTO), Buffer.from('\x89PNG photo du produit'));
  await db.insert(schema.products).values({ brandId: A.b, name: 'Sérum', imageUrl: PHOTO });
}

const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const rendre = (el: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{el}</FournisseurSpatial>);
async function tousLesFormats() {
  requetes.length = 0;
  return rendre(await FormatsSpatial({ searchParams: Promise.resolve({}) }));
}
async function pageStyle(cle = 'avap') {
  requetes.length = 0;
  return rendre(await FormatSpatial({ params: Promise.resolve({ format: cle }) }));
}
/** Les `src` des images des miniatures (et leurs `<link rel="preload">` hissés par React). */
const sources = (html: string) => [...html.matchAll(/<img src="([^"]*)"/g)].map((m) => m[1]!);
const prechargees = (html: string) => [...html.matchAll(/<link rel="preload"[^>]* href="([^"]*)"/g)].map((m) => m[1]!);
const servir = (url: string) => routeMedia(new Request(`http://localhost${url.replace(/&amp;/g, '&')}`), { params: Promise.resolve({ id: A.b }) });

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: A.ws, name: 'A', plan: 'core', onboardedAt: new Date() });
  await db.insert(schema.users).values({ id: A.user, email: `${A.user.slice(0, 8)}@exemple.invalid` });
  await db.insert(schema.brands).values({ id: A.b, workspaceId: A.ws, name: 'Maison', logoUrl: LOGO, logos: [LOGO] });
});
beforeEach(async () => {
  requetes.length = 0;
  bucket.clear();
  vi.stubGlobal('fetch', fauxBucket);
  etat.cookie = A.b;
  await db.delete(schema.products).where(eq(schema.products.brandId, A.b));
  etat.session = { workspaceId: A.ws, workspaceName: 'Espace', role: 'member', plan: 'core', user: { id: A.user, email: `${A.user.slice(0, 8)}@exemple.invalid`, name: null } };
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Veille · Tous les formats · l’image des miniatures', () => {
  it('photo produit · l’adresse de la ROUTE MÉDIA, jamais l’adresse privée ; la route la sert ; le logo (même remplacé) n’est pas vérifié', async () => {
    await charte({ empreinte: true });
    remplacer();
    await photoProduit();
    const html = await tousLesFormats();
    const src = sources(html);
    expect(src.length, 'les miniatures sont rendues').toBeGreaterThan(20);
    expect(new Set(src)).toEqual(new Set([esc(apercu(PHOTO))]));
    expect(html, 'jamais l’adresse enregistrée').not.toContain(PHOTO);
    expect(html).not.toContain(esc(LOGO));
    expect(prechargees(html).every((h) => h === esc(apercu(PHOTO)))).toBe(true);
    expect(requetes, 'une photo produit passe d’abord · aucune vérification du logo').toEqual([]);
    const r = await servir(src[0]!);
    expect(r.status, 'la route média accepte l’adresse rendue').toBe(302);
    expect(r.headers.get('location')).toContain(`${CFG.endpoint}/${CFG.bucket}/${cleDe(PHOTO)}`);
  });

  it('logo intact (empreinte) · l’adresse de la route, un seul HEAD (If-Match) ; la route le sert', async () => {
    await charte({ empreinte: true });
    const html = await tousLesFormats();
    expect(new Set(sources(html))).toEqual(new Set([esc(apercu(LOGO))]));
    expect(html).not.toContain(LOGO);
    expect(heads()).toEqual([{ methode: 'HEAD', cle: cleDe(LOGO), ifMatch: etagDe(ORIGINAL) }]);
    expect(requetes.filter((x) => x.methode !== 'HEAD')).toEqual([]);
    expect((await servir(sources(html)[0]!)).status).toBe(200);
  });

  it('logo REMPLACÉ · aucune image du logo (le repli de la miniature), ni adresse privée ni route qui refuserait ; un HEAD', async () => {
    await charte({ empreinte: true });
    remplacer();
    const html = await tousLesFormats();
    expect(new Set(sources(html))).toEqual(new Set([IMAGE_VIDE]));
    expect(html).not.toContain(esc(apercu(LOGO)));
    expect(html).not.toContain(LOGO);
    expect(heads().map((x) => x.cle)).toEqual([cleDe(LOGO)]);
    expect((await servir(apercu(LOGO))).status, 'la route l’aurait refusé').toBe(409);
  });

  it('logo SANS empreinte (ancien du bucket) · l’adresse de la route, AUCUNE requête au stockage', async () => {
    await charte({ empreinte: false });
    const html = await tousLesFormats();
    expect(new Set(sources(html))).toEqual(new Set([esc(apercu(LOGO))]));
    expect(html).not.toContain(LOGO);
    expect(requetes).toEqual([]);
  });
});

describe('Veille · la page d’un style · même image', () => {
  it('logo REMPLACÉ · le repli, aucune image du logo ; photo produit · la route média', async () => {
    await charte({ empreinte: true });
    remplacer();
    const html = await pageStyle();
    expect(sources(html).length).toBeGreaterThan(0);
    expect(new Set(sources(html))).toEqual(new Set([IMAGE_VIDE]));
    expect(html).not.toContain(LOGO);
    expect(heads().map((x) => x.cle)).toEqual([cleDe(LOGO)]);
    await photoProduit();
    const html2 = await pageStyle();
    expect(new Set(sources(html2))).toEqual(new Set([esc(apercu(PHOTO))]));
    expect(html2).not.toContain(PHOTO);
    expect(requetes).toEqual([]);
  });
});
