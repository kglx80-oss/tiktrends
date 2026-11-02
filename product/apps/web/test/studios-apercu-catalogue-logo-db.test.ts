import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Studios · la route d'aperçu du catalogue
 * (`/studio/projets/[id]/produit/fichier/[assetId]`, vignettes de l'éditeur et
 * de l'atelier Produit) juge un logo de la charte par son EMPREINTE, comme
 * l'export (#1009) et la route média de la marque (#996).
 *
 * Avant · un logo à empreinte remplacé dans le stockage depuis son import
 * était REDIRIGÉ vers ses nouveaux octets, sans aucune vérification.
 *
 * Vraie base (pglite + migrations), FAUX S3 à ETag MD5 qui honore `If-Match`
 * (HEAD et GET), la VRAIE route. On lit ce qui SORT · statut, `Location`,
 * corps, `x-logo-etat` · et les requêtes parties au stockage :
 *  - logo à empreinte REMPLACÉ ⇒ 409 « Logo à réimporter », aucun `Location`,
 *    un seul HEAD If-Match, aucun octet lu ;
 *  - logo à empreinte INTACT ⇒ la redirection signée d'avant (AWS4, ≤ 300 s,
 *    objet de l'espace), un seul HEAD If-Match ;
 *  - logo SANS empreinte (même remplacé) et photo produit ⇒ strictement comme
 *    avant · redirection signée, AUCUNE requête au stockage ;
 *  - disparu ⇒ 404 « à réimporter » ; stockage injoignable ⇒ 502 « non
 *    vérifiable », jamais une redirection.
 * 0 $ · aucun fournisseur, aucun réseau réel.
 */
const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
const CFG = vi.hoisted(() => ({ endpoint: 's3.apercu.test', region: 'gra', bucket: 'bucket', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://cdn.apercu.test/bucket' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));

import { db, schema, eq } from '@tiktrends/db';
import {
  MESSAGES_LOGO_SERVI, contenuVide, empreinteAdresse, empreinteContenu, idLogoMarque, idPhotoProduit, SCHEMA_VERSION_CONTENU, type ContenuVersion,
} from '@tiktrends/core';
import { GET as apercu } from '../app/studio/projets/[id]/produit/fichier/[assetId]/route';
import { semer, session } from './studios-semis';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const ids = h.ids;

/* ───────────── Le faux bucket · ETag = MD5 du corps, If-Match honoré (HEAD et GET) ───────────── */

const bucket = new Map<string, Buffer>();
const requetes: Array<{ methode: string; cle: string; ifMatch: string | null }> = [];
let enPanne = false;
const md5 = (o: Buffer) => createHash('md5').update(o).digest('hex');
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('réseau coupé', { status: 599 });
  const methode = init?.method ?? 'GET';
  const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  const ifMatch = new Headers(init?.headers).get('if-match');
  requetes.push({ methode, cle, ifMatch });
  if (enPanne) return new Response(null, { status: 503 });
  const o = bucket.get(cle);
  if (!o) return new Response(null, { status: 404 });
  if (ifMatch !== null && ifMatch !== `"${md5(o)}"`) return new Response(null, { status: 412 });
  const entetes = { 'content-length': String(o.length), 'content-type': 'image/png', etag: `"${md5(o)}"` };
  return methode === 'HEAD' ? new Response(null, { status: 200, headers: entetes }) : new Response(new Uint8Array(o), { status: 200, headers: entetes });
}

const objet = (nom: string) => `${CFG.publicBaseUrl}/assets/${ids.wsA}/${nom}`;
const cleDe = (u: string) => u.slice(CFG.publicBaseUrl.length + 1);
const LOGO = objet('1700000000000-abcd1234-logo.png');
const PHOTO = objet('1700000000001-ef567890-serum.png');
const ID_LOGO = idLogoMarque(ids.brandA1, empreinteAdresse(LOGO).sha256);
const ORIGINAL = Buffer.from('\x89PNG logo importé · bleu');
const REMPLACANT = Buffer.from('\x89PNG logo redéposé · rouge');
let projet = '';
let idPhoto = '';

async function charte(o: { empreinte: boolean }) {
  bucket.clear();
  bucket.set(cleDe(LOGO), ORIGINAL);
  bucket.set(cleDe(PHOTO), Buffer.from('\x89PNG photo produit'));
  await db.update(schema.brands).set({ logoUrl: LOGO, logos: [LOGO], logoEmpreintes: o.empreinte ? { [LOGO]: md5(ORIGINAL) } : null }).where(eq(schema.brands.id, ids.brandA1));
}
const remplacer = () => bucket.set(cleDe(LOGO), REMPLACANT);

/** Ce qui SORT de la vraie route · statut, Location, corps, état du logo · et les requêtes parties au stockage. */
async function voir(assetId: string) {
  requetes.length = 0;
  const r = await apercu(new Request(`http://local/studio/projets/${projet}/produit/fichier/${assetId}`), { params: Promise.resolve({ id: projet, assetId }) });
  return {
    statut: r.status, location: r.headers.get('location'), etat: r.headers.get('x-logo-etat'), corps: await r.text(),
    requetes: requetes.map((q) => `${q.methode} ${q.ifMatch ? 'If-Match' : 'simple'} ${q.cle}`),
  };
}
/** La redirection SIGNÉE de la règle des 302 (#1010) · AWS4, ≤ 300 s, objet de l'espace. */
function signeeVers(location: string | null, u: string) {
  expect(location, 'une redirection').not.toBeNull();
  const l = new URL(location!);
  expect(`${l.host}${l.pathname}`, 'vers l’objet de l’espace, par l’hôte du stockage').toBe(`${CFG.endpoint}/${CFG.bucket}/${cleDe(u)}`);
  expect(l.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
  expect(Number(l.searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(300);
  expect(l.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
}

beforeAll(async () => {
  await semer(db, schema, ids);
  const contenu: ContenuVersion = contenuVide();
  const [p] = await db.insert(schema.studioProjects).values({ workspaceId: ids.wsA, brandId: ids.brandA1, kind: 'image', title: 'Aperçu du logo', ownerId: ids.ua }).returning();
  const [v] = await db.insert(schema.studioProjectVersions).values({
    projectId: p!.id, workspaceId: ids.wsA, brandId: ids.brandA1, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: ids.ua, reason: 'test',
  }).returning();
  await db.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  projet = p!.id;
  const [pr] = await db.insert(schema.products).values({ brandId: ids.brandA1, name: 'Sérum', imageUrl: PHOTO, imageUrls: [PHOTO] }).returning({ id: schema.products.id });
  idPhoto = idPhotoProduit(pr!.id, empreinteAdresse(PHOTO).sha256);
});
beforeEach(() => { h.session = session(ids, 'ua'); enPanne = false; requetes.length = 0; vi.stubGlobal('fetch', fauxBucket); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Aperçu du catalogue · un logo de la charte à empreinte', () => {
  it('REMPLACÉ depuis l’import · 409 « Logo à réimporter », aucune redirection vers les nouveaux octets, un seul HEAD If-Match', async () => {
    await charte({ empreinte: true });
    remplacer();
    const r = await voir(ID_LOGO);
    expect(r.statut, 'un logo remplacé n’est plus redirigé').toBe(409);
    expect(r.location, 'aucune adresse vers les nouveaux octets').toBeNull();
    expect(r.etat).toBe('a-reimporter');
    expect(r.corps).toBe(MESSAGES_LOGO_SERVI.remplace);
    expect(r.corps, 'ni adresse ni clé dans le corps').not.toMatch(/assets\/|https?:\/\//);
    expect(r.requetes, 'un seul HEAD If-Match, aucun octet lu').toEqual([`HEAD If-Match ${cleDe(LOGO)}`]);
  });

  it('INTACT · la redirection signée d’avant, au prix d’un seul HEAD If-Match', async () => {
    await charte({ empreinte: true });
    const r = await voir(ID_LOGO);
    expect(r.statut, 'un logo intact reste redirigé').toBe(302);
    signeeVers(r.location, LOGO);
    expect(r.etat).toBeNull();
    expect(r.requetes, 'requêtes ajoutées par affichage · 1 HEAD If-Match').toEqual([`HEAD If-Match ${cleDe(LOGO)}`]);
  });

  it('DISPARU · 404 « à réimporter » ; stockage injoignable · 502 « non vérifiable », jamais une redirection', async () => {
    await charte({ empreinte: true });
    bucket.delete(cleDe(LOGO));
    const absent = await voir(ID_LOGO);
    expect([absent.statut, absent.location, absent.etat, absent.corps]).toEqual([404, null, 'a-reimporter', MESSAGES_LOGO_SERVI.absent]);
    await charte({ empreinte: true });
    enPanne = true;
    const panne = await voir(ID_LOGO);
    expect([panne.statut, panne.location, panne.etat, panne.corps]).toEqual([502, null, 'non-verifiable', MESSAGES_LOGO_SERVI.illisible]);
    expect(panne.requetes).toEqual([`HEAD If-Match ${cleDe(LOGO)}`]);
  });
});

describe('Aperçu du catalogue · strictement comme avant hors logo à empreinte', () => {
  it('logo SANS empreinte (ancien) · redirection signée, AUCUNE requête au stockage, même s’il a été remplacé', async () => {
    await charte({ empreinte: false });
    remplacer();
    const r = await voir(ID_LOGO);
    expect(r.statut).toBe(302);
    signeeVers(r.location, LOGO);
    expect(r.etat).toBeNull();
    expect(r.requetes, 'aucune requête de plus pour un logo sans empreinte').toEqual([]);
  });

  it('photo produit (pas un logo) · redirection signée, AUCUNE requête au stockage, même quand le logo est remplacé', async () => {
    await charte({ empreinte: true });
    remplacer();
    const r = await voir(idPhoto);
    expect(r.statut).toBe(302);
    signeeVers(r.location, PHOTO);
    expect(r.requetes, 'aucune requête de plus pour une photo').toEqual([]);
  });
});
