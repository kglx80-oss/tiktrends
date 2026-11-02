import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Marque · Identité · un logo dont le fichier a été remplacé se DIT à l'écran
 * (« À réimporter », sa raison, « Importer » à sa place) · vraie base (pglite +
 * migrations, 0066 comprise), FAUX S3 qui rend un ETag (MD5 du corps) et
 * honore `If-Match` (412), les VRAIES actions d'import
 * (`presignAssetUploadAction` puis `saveBrandDAAction`), et la VRAIE page
 * `app/(spatial)/sp/brands/[id]/identite/page.tsx` rendue en HTML.
 *
 * On lit ce qui SORT · le HTML de la page et les requêtes parties au stockage :
 *  - logo intact · aucun badge, un seul HEAD (If-Match) pour le logo importé ;
 *  - remplacé · badge et raison sur sa ligne, « Importer » à sa place, signalé
 *    en tête de la carte du logo quand c'est le défaut ; une variante
 *    remplacée ne signale pas le défaut ;
 *  - réimporté à sa place (le geste, mêmes actions) · plus aucun badge ;
 *  - sans empreinte · aucune requête, aucun badge ;
 *  - stockage injoignable · « Indisponible », jamais « À réimporter ».
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
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/brands',
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));

import { db, schema, eq } from '@tiktrends/db';
import { RAISONS_LOGO_CHARTE, LOGO_DEPOSE, charteAvecLogoImporte, charteAvecLogoReimporte } from '@tiktrends/core';
import { cleDuLienDepot } from './helpers/depot-jeton';
import { presignAssetUploadAction } from '../app/actions/assets';
import { saveBrandDAAction } from '../app/actions/brand-detail';
import IdentiteSpatiale from '../app/(spatial)/sp/brands/[id]/identite/page';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BASE = CFG.publicBaseUrl;
const ANCIEN = 'https://site.exemple.fr/logo.png';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');
const pngDe = (n: number, remplissage = 0) => Buffer.concat([PNG, Buffer.alloc(Math.max(0, n - PNG.length), remplissage)]);

/* ───────────── Le faux bucket · ETag = MD5 du corps, If-Match honoré ───────────── */

const bucket = new Map<string, Buffer>();
const requetes: Array<{ methode: string; cle: string; ifMatch: string | null }> = [];
const options = { injoignable: false };
const etagDe = (o: Buffer) => `"${createHash('md5').update(o).digest('hex')}"`;
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  const methode = init?.method ?? 'GET';
  const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  const ifMatch = new Headers(init?.headers).get('if-match');
  requetes.push({ methode, cle, ifMatch });
  if (options.injoignable) throw new TypeError('fetch failed');
  const o = bucket.get(cle);
  if (methode === 'DELETE') { bucket.delete(cle); return new Response(null, { status: 204 }); }
  if (!o) return new Response(methode === 'HEAD' ? null : 'NoSuchKey', { status: 404 });
  const etag = etagDe(o);
  if (ifMatch !== null && ifMatch !== etag) return new Response(null, { status: 412 });
  if (methode === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': String(o.length), etag } });
  if (methode !== 'GET') return new Response(null, { status: 405 });
  const m = /^bytes=0-(\d+)$/.exec(new Headers(init?.headers).get('range') ?? '');
  if (!m) return new Response(new Uint8Array(o), { status: 200, headers: { 'content-length': String(o.length), etag } });
  const fin = Math.min(o.length, Number(m[1]) + 1);
  return new Response(new Uint8Array(o.subarray(0, fin)), { status: 206, headers: { 'content-range': `bytes 0-${fin - 1}/${o.length}`, etag } });
}
const cleDe = (url: string) => url.slice(BASE.length + 1);

/* ───────────── Un espace, une marque, la vraie page ───────────── */

const A = { ws: randomUUID(), b: randomUUID(), user: randomUUID() };
const lire = async () => (await db.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos, logoEmpreintes: schema.brands.logoEmpreintes }).from(schema.brands).where(eq(schema.brands.id, A.b)))[0]!;
async function deposer(octets: Buffer) {
  const pre = await presignAssetUploadAction({ filename: 'logo.png', contentType: 'image/png', sizeBytes: octets.length, usage: 'logo' });
  expect(pre.error).toBeUndefined();
  // Le navigateur dépose au lien de PUT · il ne reçoit aucune autre adresse.
  const cle = cleDuLienDepot(pre.uploadUrl!, CFG.bucket);
  bucket.set(cle, octets);
  return { url: `${BASE}/${cle}`, jeton: pre.jetonDepot! };
}
/** Le geste « Importer » de la carte du logo · le fichier devient le défaut, l'ancien reste en variante. */
async function importer(octets = pngDe(2048)) {
  const d = await deposer(octets);
  const b = await lire();
  expect(await saveBrandDAAction({ brandId: A.b, ...charteAvecLogoImporte({ logos: b.logos ?? [], defaut: b.logoUrl }, LOGO_DEPOSE), colors: ['#112233'], fonts: ['Inter'], jetonDepot: d.jeton })).toEqual({ ok: true });
  return d.url;
}
const remplacerDansLeStockage = (url: string) => bucket.set(cleDe(url), pngDe(2048, 0x41));

const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Admin' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
/** L'ordre des lignes de « Logos de la charte » (défaut d'abord), relu au rendu. */
let ordre: string[] = [];
async function page() {
  requetes.length = 0;
  const el = await IdentiteSpatiale({ params: Promise.resolve({ id: A.b }) });
  const b = await lire();
  ordre = [...new Set([b.logoUrl, ...(b.logos ?? [])].filter((u): u is string => !!u))];
  return renderToStaticMarkup(<FournisseurSpatial value={CTX}>{el}</FournisseurSpatial>);
}
const esc = (t: string) => renderToStaticMarkup(<>{t}</>);
/** La carte du logo (`favCard`) · du début de `.favc` à la fin de sa section. */
const carteLogo = (html: string) => html.slice(html.indexOf('class="tile favc"'), html.indexOf('</section>', html.indexOf('class="tile favc"')));
/**
 * La ligne d'un logo dans « Logos de la charte » (`.npr`) · par son RANG (la
 * page ne montre plus l'adresse d'un logo importé, garde `adresses-brutes-pages-db`) ;
 * son nom montré est vérifié · « Logo importé · … » pour un objet du stockage,
 * l'adresse sans schéma pour un logo externe.
 */
const ligne = (html: string, url: string) => {
  const i = ordre.indexOf(url);
  expect(i, `ligne absente pour ${url}`).toBeGreaterThanOrEqual(0);
  const section = html.slice(html.indexOf('data-geste="logos"'));
  const l = section.split('<div class="npr"').slice(1)[i] ?? '';
  const nom = url.startsWith(BASE) ? 'Logo importé · ' : url.replace(/^https?:\/\//, '');
  expect(l, `ligne ${i} · nom montré`).toContain(`<strong style="overflow-wrap:anywhere">${nom}`);
  if (url.startsWith(BASE)) expect(l, `ligne ${i} · jamais l’adresse privée`).not.toContain(url.replace(/^https?:\/\//, ''));
  return `<div class="npr"${l}`;
};
const heads = () => requetes.filter((r) => r.methode === 'HEAD');

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: A.ws, name: 'A', plan: 'core' });
  await db.insert(schema.users).values({ id: A.user, email: `${A.user.slice(0, 8)}@exemple.invalid` });
  await db.insert(schema.brands).values({ id: A.b, workspaceId: A.ws, name: 'Maison', logoUrl: ANCIEN, logos: [ANCIEN], colors: ['#112233'], fonts: ['Inter'] });
});
beforeEach(async () => {
  requetes.length = 0;
  options.injoignable = false;
  vi.stubGlobal('fetch', fauxBucket);
  await db.update(schema.brands).set({ logoUrl: ANCIEN, logos: [ANCIEN], logoEmpreintes: null });
  etat.session = { workspaceId: A.ws, workspaceName: 'Espace', role: 'admin', plan: 'core', user: { id: A.user, email: `${A.user.slice(0, 8)}@exemple.invalid`, name: null } };
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Identité · logo importé intact', () => {
  it('aucun badge, l’aperçu est affiché ; un seul HEAD (If-Match) pour le logo importé, aucun pour l’ancien sans empreinte', async () => {
    const octets = pngDe(2048);
    const url = await importer(octets);
    const html = await page();
    expect(html).not.toContain('data-logo-etat');
    expect(html).not.toContain('À réimporter');
    expect(html).not.toContain('data-geste="reimporter-logo"');
    expect(ligne(html, url)).toContain(`<img src="${esc(`/api/brands/${A.b}/media?url=${encodeURIComponent(url)}`)}"`);
    expect(heads()).toEqual([{ methode: 'HEAD', cle: cleDe(url), ifMatch: etagDe(octets) }]);
    expect(requetes.filter((r) => r.methode !== 'HEAD')).toEqual([]);
  });
});

describe('Identité · logo REMPLACÉ dans le stockage depuis l’import', () => {
  it('logo par défaut · badge « À réimporter » et sa raison sur sa ligne, « Importer » à la place, signalé en tête de la carte du logo', async () => {
    const url = await importer();
    remplacerDansLeStockage(url);
    const html = await page();
    const l = ligne(html, url);
    expect(l).toContain('data-logo-etat="a_reimporter"');
    expect(l).toMatch(/<span class="pill r" data-logo-etat="a_reimporter"[^>]*>.*À réimporter<\/span>/);
    expect(l).toContain(esc(RAISONS_LOGO_CHARTE.remplace));
    expect(l).toContain('data-geste="reimporter-logo"');
    expect(l, 'le geste est ouvert à l’admin Core').not.toContain('aria-disabled');
    expect(l, 'plus d’aperçu cassé · la route refuserait').not.toContain('<img');
    expect(l, '« Par défaut » cède la place à « Importer »').not.toContain('Par défaut</span>');
    // En tête de la carte du logo · le badge, la raison, aucune image.
    const c = carteLogo(html);
    expect(c).toContain('data-logo-etat="a_reimporter"');
    expect(c).toContain('Logo par défaut à réimporter');
    expect(c).toContain(esc(RAISONS_LOGO_CHARTE.remplace));
    expect(c).not.toContain('<img');
    expect(c).toContain('data-geste="reimporter-logo"');
    // La ligne « Logo » de la tuile Identité ne montre plus l'aperçu refusé.
    expect(html).not.toContain(esc(`url("/api/brands/${A.b}/media?url=${encodeURIComponent(url)}")`));
    // L'ancien logo, sans empreinte, reste normal.
    expect(ligne(html, ANCIEN)).not.toContain('data-logo-etat');
    expect(heads().map((r) => r.cle)).toEqual([cleDe(url)]);
  });

  it('variante remplacée · badge sur SA ligne, la carte du logo par défaut n’est pas signalée', async () => {
    const url = await importer();
    // Le défaut redevient l'ancien logo · l'importé reste en variante, avec son empreinte.
    expect(await saveBrandDAAction({ brandId: A.b, logoUrl: ANCIEN, logos: [ANCIEN, url], colors: ['#112233'], fonts: ['Inter'] })).toEqual({ ok: true });
    remplacerDansLeStockage(url);
    const html = await page();
    expect(ligne(html, url)).toContain('data-logo-etat="a_reimporter"');
    expect(ligne(html, url)).toContain('data-geste="reimporter-logo"');
    expect(carteLogo(html)).not.toContain('data-logo-etat');
    expect(carteLogo(html)).not.toContain('data-geste="reimporter-logo"');
  });

  it('réimporté à sa place (le geste, mêmes actions) · le fichier neuf prend sa place et son rôle, plus aucun badge', async () => {
    const url = await importer();
    remplacerDansLeStockage(url);
    const neuf = await deposer(pngDe(3000));
    const b = await lire();
    expect(await saveBrandDAAction({ brandId: A.b, ...charteAvecLogoReimporte({ logos: b.logos ?? [], defaut: b.logoUrl }, url, LOGO_DEPOSE), colors: ['#112233'], fonts: ['Inter'], jetonDepot: neuf.jeton })).toEqual({ ok: true });
    const apres = await lire();
    expect(apres.logoUrl).toBe(neuf.url);
    expect(apres.logos).toEqual([ANCIEN, neuf.url]);
    expect(Object.keys(apres.logoEmpreintes as object)).toEqual([neuf.url]);
    const html = await page();
    expect(html).not.toContain('data-logo-etat');
    expect(html).not.toContain('À réimporter');
  });
});

describe('Identité · logo sans empreinte, stockage injoignable', () => {
  it('logo du bucket SANS empreinte (ancien) · aucune requête au stockage, aucun badge', async () => {
    const url = `${BASE}/assets/${A.ws}/1-abcd1234-ancien.png`;
    bucket.set(cleDe(url), pngDe(2048));
    await db.update(schema.brands).set({ logoUrl: url, logos: [url, ANCIEN] }).where(eq(schema.brands.id, A.b));
    const html = await page();
    expect(requetes).toEqual([]);
    expect(html).not.toContain('data-logo-etat');
    expect(html).toContain('Logo enregistré dans la charte');
  });

  it('stockage injoignable · « Indisponible » avec sa raison, JAMAIS « À réimporter » ni « Importer » à sa place', async () => {
    const url = await importer();
    options.injoignable = true;
    const html = await page();
    expect(heads().map((r) => r.cle)).toEqual([cleDe(url)]);
    const l = ligne(html, url);
    expect(l).toContain('data-logo-etat="indisponible"');
    expect(l).toMatch(/<span class="pill w" data-logo-etat="indisponible"[^>]*>.*Indisponible<\/span>/);
    expect(l).toContain(esc(RAISONS_LOGO_CHARTE.illisible));
    expect(html).not.toContain('À réimporter');
    expect(html).not.toContain('a_reimporter');
    expect(html).not.toContain('data-geste="reimporter-logo"');
    expect(carteLogo(html)).toContain('Logo par défaut non vérifiable pour l’instant');
    expect(carteLogo(html)).toContain('data-logo-etat="indisponible"');
  });
});
