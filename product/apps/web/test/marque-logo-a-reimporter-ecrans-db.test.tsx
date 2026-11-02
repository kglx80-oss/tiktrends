import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Le logo par défaut à réimporter se DIT ailleurs que dans la fiche Identité ·
 * vraie base (pglite + migrations), FAUX S3 qui rend un ETag (MD5 du corps) et
 * honore `If-Match` (412), les VRAIES actions d'import, et ce que voient les
 * écrans qui montrent le logo par défaut :
 *  - la vue d'ensemble de la marque (`/brands/[id]`, page réelle rendue) ;
 *  - la coquille (données réelles `chargerCoquille` · adresse d'affichage, et
 *    l'action `etatLogoMarqueActive` qu'elle appelle quand l'image échoue) ;
 *  - l'accueil (`/onboarding`, page réelle rendue).
 *
 * On lit ce qui SORT · le HTML et les requêtes parties au stockage :
 *  - remplacé · initiale, « Logo à réimporter » avec sa raison, le lien vers
 *    l'Identité (admin) ; aucune image que la route refuserait ;
 *  - intact · l'image, aucun signal ; un seul HEAD (If-Match) ;
 *  - sans empreinte · AUCUNE requête au stockage, aucun signal.
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
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/brands',
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && etat.cookie ? { value: etat.cookie } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/dashboard' }),
}));
vi.mock('../app/actions/connections', () => ({ getConnectionState: async () => null }));
vi.mock('../app/actions/drive', () => ({ getDriveState: async () => ({ available: false, connected: false, folderName: null }) }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));

import { db, schema, eq } from '@tiktrends/db';
import { RAISONS_LOGO_CHARTE, AIDE_LOGO_SANS_GESTION, LOGO_DEPOSE, charteAvecLogoImporte } from '@tiktrends/core';
import { cleDuLienDepot } from './helpers/depot-jeton';
import { presignAssetUploadAction } from '../app/actions/assets';
import { saveBrandDAAction } from '../app/actions/brand-detail';
import { etatLogoMarqueActive } from '../app/actions/logo-marque';
import { chargerCoquille } from '../lib/spatial/coquille';
import MarqueSpatiale from '../app/(spatial)/sp/brands/[id]/page';
import ParcoursSpatial from '../app/(spatial)/sp/onboarding/page';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BASE = CFG.publicBaseUrl;
const ANCIEN = 'https://site.exemple.fr/logo.png';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');
const pngDe = (n: number, remplissage = 0) => Buffer.concat([PNG, Buffer.alloc(Math.max(0, n - PNG.length), remplissage)]);

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
  if (methode !== 'GET') return new Response(null, { status: 405 });
  const m = /^bytes=0-(\d+)$/.exec(new Headers(init?.headers).get('range') ?? '');
  if (!m) return new Response(new Uint8Array(o), { status: 200, headers: { 'content-length': String(o.length), etag } });
  const fin = Math.min(o.length, Number(m[1]) + 1);
  return new Response(new Uint8Array(o.subarray(0, fin)), { status: 206, headers: { 'content-range': `bytes 0-${fin - 1}/${o.length}`, etag } });
}
const cleDe = (url: string) => url.slice(BASE.length + 1);
const heads = () => requetes.filter((r) => r.methode === 'HEAD');

/* ───────────── Un espace, une marque active ───────────── */

const A = { ws: randomUUID(), b: randomUUID(), user: randomUUID() };
const IDENTITE = `/brands/${A.b}/identite`;
const lire = async () => (await db.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos }).from(schema.brands).where(eq(schema.brands.id, A.b)))[0]!;
/** Le geste « Importer » de la carte du logo · mêmes actions (dépôt signé puis charte). */
async function importer(octets = pngDe(2048)) {
  const pre = await presignAssetUploadAction({ filename: 'logo.png', contentType: 'image/png', sizeBytes: octets.length, usage: 'logo' });
  expect(pre.error).toBeUndefined();
  const cle = cleDuLienDepot(pre.uploadUrl!, CFG.bucket);
  bucket.set(cle, octets);
  const b = await lire();
  expect(await saveBrandDAAction({ brandId: A.b, ...charteAvecLogoImporte({ logos: b.logos ?? [], defaut: b.logoUrl }, LOGO_DEPOSE), colors: ['#112233'], fonts: ['Inter'], jetonDepot: pre.jetonDepot! })).toEqual({ ok: true });
  return `${BASE}/${cle}`;
}
const remplacerDansLeStockage = (url: string) => bucket.set(cleDe(url), pngDe(2048, 0x41));
const apercu = (url: string) => `/api/brands/${A.b}/media?url=${encodeURIComponent(url)}`;
const esc = (t: string) => renderToStaticMarkup(<>{t}</>);

const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Admin' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const rendre = (el: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{el}</FournisseurSpatial>);
async function vueEnsemble() {
  requetes.length = 0;
  return rendre(await MarqueSpatiale({ params: Promise.resolve({ id: A.b }), searchParams: Promise.resolve({}) }));
}
async function accueil() {
  requetes.length = 0;
  return rendre(await ParcoursSpatial({ searchParams: Promise.resolve({ redo: '1' }) }));
}
/** La carte du logo de la vue d'ensemble (`favc`). */
const carteLogo = (html: string) => html.slice(html.indexOf('class="tile favc"'), html.indexOf('</section>', html.indexOf('class="tile favc"')));
/** La tuile « Ce que je sais de ta marque » de l'accueil. */
const tuileMarque = (html: string) => html.slice(html.indexOf('Ce que je sais de ta marque'), html.indexOf('</section>', html.indexOf('Ce que je sais de ta marque')));

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: A.ws, name: 'A', plan: 'core', onboardedAt: new Date() });
  await db.insert(schema.users).values({ id: A.user, email: `${A.user.slice(0, 8)}@exemple.invalid` });
  await db.insert(schema.brands).values({ id: A.b, workspaceId: A.ws, name: 'Maison', logoUrl: ANCIEN, logos: [ANCIEN], colors: ['#112233'], fonts: ['Inter'] });
});
beforeEach(async () => {
  requetes.length = 0;
  vi.stubGlobal('fetch', fauxBucket);
  etat.cookie = A.b;
  await db.update(schema.brands).set({ logoUrl: ANCIEN, logos: [ANCIEN], logoEmpreintes: null });
  etat.session = { workspaceId: A.ws, workspaceName: 'Espace', role: 'admin', plan: 'core', user: { id: A.user, email: `${A.user.slice(0, 8)}@exemple.invalid`, name: null } };
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Vue d’ensemble de la marque · la carte du logo', () => {
  it('logo REMPLACÉ · initiale, badge « À réimporter » qui mène à l’Identité, sa raison, « Importer » à sa place ; aucun aperçu refusé', async () => {
    const url = await importer();
    remplacerDansLeStockage(url);
    const html = await vueEnsemble();
    const c = carteLogo(html);
    expect(c).toContain('data-logo-etat="a_reimporter"');
    expect(c).toMatch(new RegExp(`<a data-lien="identite-marque"[^>]* href="${IDENTITE}"><span class="pill r" data-logo-etat="a_reimporter"`));
    expect(c).toContain('Logo par défaut à réimporter');
    expect(c).toContain(esc(RAISONS_LOGO_CHARTE.remplace));
    expect(c).toContain('data-geste="reimporter-logo"');
    expect(c, 'plus d’image cassée').not.toContain('<img');
    expect(c).toContain('<span class="blogo">M</span>');
    expect(html).not.toContain(esc(apercu(url)));
    expect(heads().map((r) => [r.cle, r.ifMatch !== null])).toEqual([[cleDe(url), true]]);
  });

  it('logo intact · l’aperçu, aucun signal ; un seul HEAD (If-Match), rien d’autre au stockage', async () => {
    const octets = pngDe(2048);
    const url = await importer(octets);
    const html = await vueEnsemble();
    expect(carteLogo(html)).toContain(`<img src="${esc(apercu(url))}"`);
    expect(html).not.toContain('data-logo-etat');
    expect(html).not.toContain('identite-marque');
    expect(heads()).toEqual([{ methode: 'HEAD', cle: cleDe(url), ifMatch: etagDe(octets) }]);
    expect(requetes.filter((r) => r.methode !== 'HEAD')).toEqual([]);
  });

  it('logo SANS empreinte (ancien du bucket) · aucune requête au stockage, aucun signal', async () => {
    const url = `${BASE}/assets/${A.ws}/1-abcd1234-ancien.png`;
    bucket.set(cleDe(url), pngDe(2048));
    await db.update(schema.brands).set({ logoUrl: url, logos: [url] }).where(eq(schema.brands.id, A.b));
    const html = await vueEnsemble();
    expect(requetes).toEqual([]);
    expect(html).not.toContain('data-logo-etat');
    expect(carteLogo(html)).toContain(`<img src="${esc(apercu(url))}"`);
  });
});

describe('Coquille · le logo de la marque active', () => {
  it('rendue sur chaque page · AUCUNE requête au stockage ; le logo passe par la route média (jamais l’adresse privée) ; `logoAVerifier` pour un logo importé', async () => {
    const url = await importer();
    remplacerDansLeStockage(url);
    requetes.length = 0;
    const d = await chargerCoquille();
    expect(requetes, 'la coquille ne vérifie rien à chaque page').toEqual([]);
    expect(d.marque).toMatchObject({ id: A.b, logoUrl: apercu(url), imageUrl: apercu(url), logoAVerifier: true });
    expect(d.etatLogo).toBe(etatLogoMarqueActive);
  });

  it('logo sans empreinte · `logoAVerifier` faux (le client ne demandera rien)', async () => {
    const d = await chargerCoquille();
    expect(requetes).toEqual([]);
    expect(d.marque).toMatchObject({ logoUrl: ANCIEN, logoAVerifier: false });
  });

  it('image en échec, logo REMPLACÉ · l’action dit « Logo à réimporter », sa raison et le lien vers l’Identité (admin) · un seul HEAD', async () => {
    const url = await importer();
    remplacerDansLeStockage(url);
    requetes.length = 0;
    expect(await etatLogoMarqueActive({ brandId: A.b })).toEqual({
      image: false, signal: { libelle: 'Logo à réimporter', raison: RAISONS_LOGO_CHARTE.remplace, lien: IDENTITE, aide: 'Réimporte-le dans l’Identité de la marque.' },
    });
    expect(heads().map((r) => r.cle)).toEqual([cleDe(url)]);
  });

  it('membre sans gestion de la marque · le signal sans lien (la fiche le renverrait), avec qui peut le faire', async () => {
    const url = await importer();
    remplacerDansLeStockage(url);
    etat.session = { ...etat.session!, role: 'member' };
    expect((await etatLogoMarqueActive({ brandId: A.b }))?.signal).toEqual({ libelle: 'Logo à réimporter', raison: RAISONS_LOGO_CHARTE.remplace, lien: null, aide: AIDE_LOGO_SANS_GESTION });
  });

  it('logo intact · l’image, aucun signal ; sans empreinte · aucune requête ; autre marque que l’active · rien', async () => {
    await importer();
    requetes.length = 0;
    expect(await etatLogoMarqueActive({ brandId: A.b })).toEqual({ image: true, signal: null });
    expect(heads()).toHaveLength(1);
    await db.update(schema.brands).set({ logoUrl: ANCIEN, logos: [ANCIEN], logoEmpreintes: null });
    requetes.length = 0;
    expect(await etatLogoMarqueActive({ brandId: A.b })).toEqual({ image: true, signal: null });
    expect(requetes).toEqual([]);
    expect(await etatLogoMarqueActive({ brandId: randomUUID() })).toBeNull();
    expect(requetes).toEqual([]);
  });
});

describe('Accueil (`/onboarding`) · « Ce que je sais de ta marque »', () => {
  it('logo REMPLACÉ · initiale et « Logo à réimporter » cliquable vers l’Identité, sa raison ; aucune image', async () => {
    const url = await importer();
    remplacerDansLeStockage(url);
    const t = tuileMarque(await accueil());
    expect(t).toContain('<span class="blogo" style="flex:none">M</span>');
    expect(t).toMatch(new RegExp(`<a class="pill r" data-lien="identite-marque" href="${IDENTITE}">.*Logo à réimporter</a>`));
    expect(t).toContain(esc(RAISONS_LOGO_CHARTE.remplace));
    expect(t).not.toContain('<img');
    expect(heads().map((r) => r.cle)).toEqual([cleDe(url)]);
  });

  it('logo intact · l’image par la route média, aucun signal ; sans empreinte · aucune requête', async () => {
    const url = await importer();
    const t = tuileMarque(await accueil());
    expect(t).toContain(`<img src="${esc(apercu(url))}"`);
    expect(t).not.toContain('data-logo-etat');
    expect(heads()).toHaveLength(1);
    await db.update(schema.brands).set({ logoUrl: ANCIEN, logos: [ANCIEN], logoEmpreintes: null });
    const t2 = tuileMarque(await accueil());
    expect(requetes).toEqual([]);
    expect(t2).toContain(`<img src="${esc(ANCIEN)}"`);
    expect(t2).not.toContain('data-logo-etat');
  });
});
