import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { cloneElement, type ReactElement } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Éditeur d'image des Studios · un calque qui pose un logo de la charte
 * REMPLACÉ dans le stockage depuis son import montrait un repli muet « Logo ·
 * aperçu indisponible » (#1011) · une `<img>` ne lit pas la cause du refus.
 * L'éditeur le dit désormais au rendu serveur, comme l'export (#1009),
 * l'atelier Identités et l'écran vidéo.
 *
 * Vraie base (pglite + migrations), FAUX S3 à ETag MD5 qui honore `If-Match`
 * et compte chaque requête, la VRAIE page de l'éditeur
 * (`/studio/projets/[id]/image`) rendue en HTML. 0 $ · aucun fournisseur.
 *
 * On lit ce qui SORT · le HTML de chaque calque, le rappel près de l'export,
 * et les requêtes parties au stockage :
 *  - remplacé ⇒ « Logo à réimporter » sur les calques qui posent CE logo
 *    seulement, le rappel d'export les nomme ; un HEAD par logo DISTINCT ;
 *  - admin ⇒ le lien vers l'Identité de la marque ;
 *  - intact ⇒ rien, les images ; sans empreinte ⇒ 0 requête ; aucun calque
 *    logo ⇒ 0 requête ;
 *  - stockage en panne ⇒ « Logo non vérifiable », jamais « à réimporter ».
 */
const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, chemin: '/studio/projets', panne: false }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
const CFG = vi.hoisted(() => ({ endpoint: 's3.editeur.test', region: 'gra', bucket: 'bucket', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://cdn.editeur.test/bucket' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => h.chemin, useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': h.chemin }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));

import { db, schema, eq } from '@tiktrends/db';
import { RAISONS_LOGO_CHARTE, contenuVide, empreinteContenu, idLogoMarque, SCHEMA_VERSION_CONTENU, type ContenuVersion, type DocumentStudio } from '@tiktrends/core';
import { hacherImage } from '../lib/studios/produit/catalogue';
import PageEditeur from '../app/(spatial)/sp/studio/projets/[id]/image/page';
import { semer, session } from './studios-semis';
import { png } from './l5a-outils';
import { avecSpatial } from './spatial/fournisseur';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const ids = h.ids;
const IDENTITE = `/brands/${ids.brandA1}/identite`;
const qui = (role: 'member' | 'admin' = 'member') => { h.session = session(ids, 'ua', { role }); };
const esc = (t: string) => renderToStaticMarkup(<>{t}</>);

/* ───────────── Le faux bucket · ETag = MD5 du corps, If-Match honoré, panne simulable ───────────── */

const bucket = new Map<string, Buffer>();
const requetes: Array<{ methode: string; cle: string; ifMatch: string | null }> = [];
const md5 = (o: Buffer) => createHash('md5').update(o).digest('hex');
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('réseau coupé', { status: 599 });
  const methode = init?.method ?? 'GET';
  const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  const ifMatch = new Headers(init?.headers).get('if-match');
  requetes.push({ methode, cle, ifMatch });
  if (h.panne) return new Response(null, { status: 503 });
  const o = bucket.get(cle);
  if (!o) return new Response(null, { status: 404 });
  if (ifMatch !== null && ifMatch !== `"${md5(o)}"`) return new Response(null, { status: 412 });
  const entetes = { 'content-length': String(o.length), 'content-type': 'image/png', etag: `"${md5(o)}"` };
  return methode === 'HEAD' ? new Response(null, { status: 200, headers: entetes }) : new Response(new Uint8Array(o), { status: 200, headers: entetes });
}

/** Deux logos de la charte A1 · le principal (remplacé dans les cas « remplacé ») et une variante, toujours intacte. */
const LOGO = `${CFG.publicBaseUrl}/assets/${ids.wsA}/1-abcd1234-logo.png`;
const VAR = `${CFG.publicBaseUrl}/assets/${ids.wsA}/2-ef567890-logo.png`;
const cle = (url: string) => url.slice(CFG.publicBaseUrl.length + 1);
const ID_LOGO = idLogoMarque(ids.brandA1, hacherImage(LOGO).sha256);
const ID_VAR = idLogoMarque(ids.brandA1, hacherImage(VAR).sha256);
let ORIGINAL: Buffer;
let VARIANTE: Buffer;
let REMPLACANT: Buffer;
async function charte(o: { empreinte: boolean }) {
  bucket.clear();
  bucket.set(cle(LOGO), ORIGINAL);
  bucket.set(cle(VAR), VARIANTE);
  await db.update(schema.brands).set({ logoUrl: LOGO, logos: [LOGO, VAR], logoEmpreintes: o.empreinte ? { [LOGO]: md5(ORIGINAL), [VAR]: md5(VARIANTE) } : null }).where(eq(schema.brands.id, ids.brandA1));
}
const remplacer = () => bucket.set(cle(LOGO), REMPLACANT);

/* ───────────── Un document · deux calques posent le logo principal, un la variante ───────────── */

const calqueLogo = (id: string, name: string, assetId: string, z: number, y: number) =>
  ({ id, kind: 'logo', name, visible: true, locked: false, x: 100, y, width: 200, height: 80, rotationDeg: 0, opacity: 1, z, assetId });
const DOC: DocumentStudio = {
  width: 400, height: 400, colorSpace: 'sRGB', fonts: {},
  layers: { logo: calqueLogo('logo', 'Logo', ID_LOGO, 1, 20), 'logo-bis': calqueLogo('logo-bis', 'Logo bis', ID_LOGO, 2, 150), variante: calqueLogo('variante', 'Variante', ID_VAR, 3, 280) },
} as DocumentStudio;
const VIDE: DocumentStudio = { width: 400, height: 400, colorSpace: 'sRGB', fonts: {}, layers: {} } as DocumentStudio;

async function projet(document: DocumentStudio): Promise<string> {
  const contenu: ContenuVersion = { ...contenuVide(), document };
  const [p] = await db.insert(schema.studioProjects).values({ workspaceId: ids.wsA, brandId: ids.brandA1, kind: 'image', title: 'Logos dans l’éditeur', ownerId: ids.ua }).returning();
  const [v] = await db.insert(schema.studioProjectVersions).values({
    projectId: p!.id, workspaceId: ids.wsA, brandId: ids.brandA1, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: ids.ua, reason: 'test',
  }).returning();
  await db.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  return p!.id;
}

/** La vraie page de l'éditeur, rendue en HTML · les requêtes comptées sont celles de CE rendu. */
async function editeur(projectId: string, selection?: string): Promise<string> {
  h.chemin = `/studio/projets/${projectId}/image`;
  requetes.length = 0;
  const el = await PageEditeur({ params: Promise.resolve({ id: projectId }) }) as ReactElement;
  // Le calque choisi au premier rendu (recette de l'éditeur) · mêmes props que la page, jugées par le serveur.
  return renderToStaticMarkup(avecSpatial(selection ? cloneElement(el as ReactElement<{ selectionInitiale?: string }>, { selectionInitiale: selection }) : el));
}
/** Le bloc HTML d'un calque de la surface. */
const blocCalque = (html: string, id: string) => {
  const i = html.indexOf(`data-calque="${id}"`);
  if (i < 0) throw new Error(`calque ${id} absent de la surface`);
  const j = html.indexOf('data-calque="', i + 12);
  return html.slice(i, j < 0 ? html.indexOf('</aside>', i) : j);
};
const heads = () => requetes.map((r) => `${r.methode} ${r.cle} ${r.ifMatch ? 'If-Match' : 'simple'}`).sort();
const HEAD_DEUX = [`HEAD ${cle(LOGO)} If-Match`, `HEAD ${cle(VAR)} If-Match`].sort();

beforeAll(async () => {
  await semer(db, schema, ids);
  ORIGINAL = await png(240, 120, () => [10, 60, 220, 255]);
  VARIANTE = await png(240, 120, () => [20, 160, 60, 255]);
  REMPLACANT = await png(240, 120, () => [230, 20, 20, 255]);
});
beforeEach(() => { qui(); h.panne = false; requetes.length = 0; vi.stubGlobal('fetch', fauxBucket); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Éditeur d’image · un calque qui pose un logo de la charte', () => {
  it('REMPLACÉ · « Logo à réimporter » sur les calques qui posent CE logo seulement, le rappel près de l’export, un HEAD par logo distinct', async () => {
    await charte({ empreinte: true });
    const p = await projet(DOC);
    remplacer();
    const html = await editeur(p);
    for (const id of ['logo', 'logo-bis']) {
      const b = blocCalque(html, id);
      expect(b, `le calque ${id} dit pourquoi son logo n’est pas affiché`).toContain('data-logo-calque="a-reimporter"');
      expect(b).toContain('<strong>Logo à réimporter</strong>');
      expect(b).toContain(esc(RAISONS_LOGO_CHARTE.remplace));
      expect(b, 'aucune image que la route refuserait').not.toContain('<img');
      expect(b, 'plus de repli muet').not.toContain('aperçu indisponible');
    }
    const v = blocCalque(html, 'variante');
    expect(v, 'la variante intacte · rien à dire').not.toContain('data-logo-calque');
    expect(v, 'la variante intacte · son image').toContain('<img');
    expect(html.match(/data-logo-calque=/g)?.length, 'deux calques posent le logo remplacé, et eux seuls').toBe(2);
    expect(html, 'sans gestion · aucun lien vers une fiche qui le renverrait').not.toContain('identite-marque');
    expect(html).toContain('data-rappel-export="a-reimporter" data-calques="logo logo-bis"');
    expect(html, 'sans gestion · le rappel dit qui peut réimporter').toContain(esc('Logos à réimporter · l’export refusera les calques « Logo », « Logo bis » tant que leurs logos ne sont pas réimportés. Un administrateur de l’espace peut les réimporter dans l’Identité de la marque.'));
    expect(heads(), 'un HEAD signé If-Match par logo DISTINCT (3 calques, 2 logos), aucun octet lu').toEqual(HEAD_DEUX);
  });

  it('REMPLACÉ, admin de l’espace · le lien vers l’Identité de la marque près de l’export, cible de 44 px', async () => {
    await charte({ empreinte: true });
    const p = await projet(DOC);
    remplacer();
    qui('admin');
    const html = await editeur(p);
    const i = html.indexOf('data-rappel-export="a-reimporter"');
    const rappel = html.slice(i, html.indexOf('</div>', i));
    expect(rappel, 'le lien est dans le rappel d’export, à 44 px').toMatch(new RegExp(`<a data-lien="identite-marque" class="btn sm" style="[^"]*min-height:44px[^"]*" href="${IDENTITE}">Ouvrir l’Identité de la marque</a>$`));
    expect(rappel).toContain(esc('Logos à réimporter · l’export refusera les calques « Logo », « Logo bis » tant que leurs logos ne sont pas réimportés.'));
    expect(html, 'l’admin a le lien, pas la phrase « un administrateur peut »').not.toContain(esc('Un administrateur de l’espace peut les réimporter'));
  });

  it('REMPLACÉ, admin, calque choisi · l’inspecteur dit le libellé, la raison, le geste et mène à l’Identité ; la variante ne dit rien', async () => {
    await charte({ empreinte: true });
    const p = await projet(DOC);
    remplacer();
    qui('admin');
    const html = await editeur(p, 'logo');
    const i = html.indexOf('data-calque-signal="logo"');
    expect(i, 'le signal du calque choisi est dans l’inspecteur').toBeGreaterThan(0);
    const insp = html.slice(i, html.indexOf('</div>', i));
    expect(insp).toContain('Logo à réimporter</span>');
    expect(insp).toContain(esc(RAISONS_LOGO_CHARTE.remplace));
    expect(insp).toContain(esc('Réimporte-le dans l’Identité de la marque.'));
    expect(insp).toMatch(new RegExp(`<a data-lien="identite-marque" class="btn sm" style="[^"]*min-height:44px[^"]*" href="${IDENTITE}">Ouvrir l’Identité de la marque</a>$`));
    expect(await editeur(p, 'variante'), 'la variante intacte · aucun signal dans l’inspecteur').not.toContain('data-calque-signal');
  });

  it('intact · aucune annonce, les images ; un HEAD par logo distinct', async () => {
    await charte({ empreinte: true });
    const p = await projet(DOC);
    const html = await editeur(p);
    expect(html).not.toContain('data-logo-calque');
    expect(html).not.toContain('data-rappel-export');
    for (const id of ['logo', 'logo-bis', 'variante']) expect(blocCalque(html, id)).toContain('<img');
    expect(heads()).toEqual(HEAD_DEUX);
  });

  it('logos SANS empreinte (même redéposés) · comme avant, aucune requête au stockage, aucune annonce', async () => {
    await charte({ empreinte: false });
    const p = await projet(DOC);
    remplacer();
    const html = await editeur(p);
    expect(requetes, 'sans empreinte · aucune requête au stockage').toEqual([]);
    expect(html).not.toContain('data-logo-calque');
    expect(blocCalque(html, 'logo')).toContain('<img');
  });

  it('aucun calque ne pose de logo (charte remplacée) · aucune requête', async () => {
    await charte({ empreinte: true });
    const p = await projet(VIDE);
    remplacer();
    const html = await editeur(p);
    expect(requetes, 'aucun calque logo · aucune requête au stockage').toEqual([]);
    expect(html).not.toContain('data-logo-calque');
  });

  it('STOCKAGE EN PANNE · « Logo non vérifiable » sur chaque calque logo, JAMAIS « à réimporter », aucun lien même pour un admin', async () => {
    await charte({ empreinte: true });
    const p = await projet(DOC);
    remplacer();
    qui('admin');
    h.panne = true;
    const html = await editeur(p);
    for (const id of ['logo', 'logo-bis', 'variante']) {
      const b = blocCalque(html, id);
      expect(b).toContain('data-logo-calque="non-verifiable"');
      expect(b).toContain('<strong>Logo non vérifiable</strong>');
      expect(b).toContain(esc(RAISONS_LOGO_CHARTE.illisible));
    }
    expect(html).toContain('data-rappel-export="non-verifiable" data-calques="logo logo-bis variante"');
    expect(html, 'on ne fait pas refaire un import qu’on n’a pas pu juger').not.toContain('réimport');
    expect(html).not.toContain('identite-marque');
    expect(heads(), 'toujours un HEAD par logo distinct').toEqual(HEAD_DEUX);
  });
});
