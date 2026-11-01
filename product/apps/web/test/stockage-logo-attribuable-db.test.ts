import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Stockage · le dépôt d'un logo importé est ATTRIBUABLE · vraie base (pglite
 * + migrations du dépôt), FAUX S3 (PUT, DELETE), les VRAIES actions :
 * `presignAssetUploadAction` (jeton de dépôt signé) puis `saveBrandDAAction`.
 *
 * On lit ce qui SORT · la réponse de l'action, la charte relue en base, le
 * contenu du bucket et les DELETE reçus :
 *  - logo importé avec son jeton · enregistré, aucun DELETE ;
 *  - jeton d'un autre espace, expiré, d'une autre clé, falsifié, absent ·
 *    refusé, la charte intacte ;
 *  - charte refusée, ou écriture refusée par Postgres · l'objet déposé est
 *    retiré, sauf s'il est cité par une autre marque ;
 *  - adresse déjà en base, adresse externe `https:` · acceptées sans jeton.
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

import { db, schema, eq, sql } from '@tiktrends/db';
import { MESSAGES_REFUS_LOGO, REFUS_LOGO_NON_ATTESTE, TEXTES_REFUS_JETON_DEPOT, charteAvecLogoImporte } from '@tiktrends/core';
import { presignAssetUploadAction } from '../app/actions/assets';
import { saveBrandDAAction } from '../app/actions/brand-detail';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BASE = CFG.publicBaseUrl;
const ANCIEN = 'https://site.exemple.fr/logo.png';

/* ───────────── Le faux bucket · PUT, DELETE ───────────── */

const bucket = new Map<string, Buffer>();
const supprimes: string[] = [];
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  if (init?.method === 'DELETE') { supprimes.push(cle); bucket.delete(cle); return new Response(null, { status: 204 }); }
  return new Response(null, { status: 405 });
}
const cleDe = (url: string) => url.slice(BASE.length + 1);

/* ───────────── Deux espaces, deux marques dans le premier ───────────── */

const A = { ws: randomUUID(), b1: randomUUID(), b2: randomUUID(), user: randomUUID() };
const B = { ws: randomUUID(), b1: randomUUID(), user: randomUUID() };
const ouvrir = (e: { ws: string; user: string }) => {
  etat.session = { workspaceId: e.ws, workspaceName: 'Espace', role: 'admin', plan: 'core', user: { id: e.user, email: `${e.user.slice(0, 8)}@exemple.invalid`, name: null } };
};
const lire = async (id: string) => (await db.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos }).from(schema.brands).where(eq(schema.brands.id, id)))[0]!;

/** Le VRAI présigné, puis le PUT du navigateur (simulé dans le bucket). */
async function deposer(nom = 'logo.png') {
  const pre = await presignAssetUploadAction({ filename: nom, contentType: 'image/png', sizeBytes: 2048 });
  expect(pre.error).toBeUndefined();
  bucket.set(cleDe(pre.publicUrl!), Buffer.alloc(2048, 1));
  return { url: pre.publicUrl!, jeton: pre.jetonDepot! };
}
const importer = (brandId: string, url: string, jetonDepot?: string, avant: { logos: string[]; defaut: string | null } = { logos: [ANCIEN], defaut: ANCIEN }) =>
  saveBrandDAAction({ brandId, ...charteAvecLogoImporte(avant, url), colors: ['#112233'], fonts: ['Inter'], jetonDepot });

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: A.ws, name: 'A', plan: 'core' }, { id: B.ws, name: 'B', plan: 'core' }]);
  await db.insert(schema.users).values([{ id: A.user, email: `${A.user.slice(0, 8)}@exemple.invalid` }, { id: B.user, email: `${B.user.slice(0, 8)}@exemple.invalid` }]);
  await db.insert(schema.brands).values([
    { id: A.b1, workspaceId: A.ws, name: 'A1', logoUrl: ANCIEN, logos: [ANCIEN], colors: ['#112233'], fonts: ['Inter'] },
    { id: A.b2, workspaceId: A.ws, name: 'A2', logoUrl: ANCIEN, logos: [ANCIEN], colors: ['#112233'], fonts: ['Inter'] },
    { id: B.b1, workspaceId: B.ws, name: 'B1', logoUrl: ANCIEN, logos: [ANCIEN], colors: ['#112233'], fonts: ['Inter'] },
  ]);
  // Un vrai refus de Postgres sur `brands` tant que `test.refus` vaut `on`.
  await db.execute(sql.raw(`
    create or replace function refus_charte_test() returns trigger language plpgsql as $$
    begin
      if current_setting('test.refus', true) = 'on' then raise exception 'écriture refusée (test)'; end if;
      return new;
    end $$`));
  await db.execute(sql.raw('create trigger refus_charte_test before update on brands for each row execute function refus_charte_test()'));
});
beforeEach(async () => {
  supprimes.length = 0;
  vi.stubGlobal('fetch', fauxBucket);
  await db.execute(sql.raw(`set test.refus = 'off'`));
  await db.update(schema.brands).set({ logoUrl: ANCIEN, logos: [ANCIEN] });
  ouvrir(A);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Logo importé · attesté par son jeton de dépôt', () => {
  it('avec son jeton · enregistré par défaut, l’ancien gardé, l’objet reste, aucun DELETE', async () => {
    const d = await deposer();
    expect(await importer(A.b1, d.url, d.jeton)).toEqual({ ok: true });
    expect(await lire(A.b1)).toEqual({ logoUrl: d.url, logos: [ANCIEN, d.url] });
    expect(bucket.has(cleDe(d.url))).toBe(true);
    expect(supprimes).toEqual([]);
  });

  it('adresse du bucket nouvelle SANS jeton · refusée, la charte intacte, rien n’est retiré (rien n’est prouvé)', async () => {
    const d = await deposer();
    expect(await importer(A.b1, d.url)).toEqual({ error: REFUS_LOGO_NON_ATTESTE });
    expect(await lire(A.b1)).toEqual({ logoUrl: ANCIEN, logos: [ANCIEN] });
    expect(supprimes).toEqual([]);
  });

  it('jeton d’un AUTRE espace · refusé, la charte intacte, aucun objet retiré', async () => {
    ouvrir(B);
    const chezB = await deposer();
    ouvrir(A);
    const chezA = await deposer();
    expect(await importer(A.b1, chezA.url, chezB.jeton)).toEqual({ error: TEXTES_REFUS_JETON_DEPOT.autre_espace });
    expect(await lire(A.b1)).toEqual({ logoUrl: ANCIEN, logos: [ANCIEN] });
    expect(supprimes).toEqual([]);
    expect(bucket.has(cleDe(chezB.url)) && bucket.has(cleDe(chezA.url))).toBe(true);
  });

  it('jeton EXPIRÉ · refusé, la charte intacte, son dépôt (sans ligne) est retiré', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
    const d = await deposer();
    vi.setSystemTime(new Date('2026-11-01T10:05:00Z')); // 300 s · au-delà des 160 s d'un fichier de 2 Ko
    expect(await importer(A.b1, d.url, d.jeton)).toEqual({ error: TEXTES_REFUS_JETON_DEPOT.expire });
    expect(await lire(A.b1)).toEqual({ logoUrl: ANCIEN, logos: [ANCIEN] });
    expect(supprimes).toEqual([cleDe(d.url)]);
    expect(bucket.has(cleDe(d.url))).toBe(false);
  });

  it('jeton d’une AUTRE clé · refusé ; le dépôt du jeton est retiré, l’adresse présentée jamais', async () => {
    const atteste = await deposer('un.png');
    const presentee = await deposer('deux.png');
    expect(await importer(A.b1, presentee.url, atteste.jeton)).toEqual({ error: TEXTES_REFUS_JETON_DEPOT.autre_cle });
    expect(await lire(A.b1)).toEqual({ logoUrl: ANCIEN, logos: [ANCIEN] });
    expect(supprimes).toEqual([cleDe(atteste.url)]);
    expect(bucket.has(cleDe(presentee.url))).toBe(true);
  });

  it('jeton FALSIFIÉ (signature réécrite) · refusé, rien retiré', async () => {
    const d = await deposer();
    const [corps] = d.jeton.split('.');
    expect(await importer(A.b1, d.url, `${corps}.${'A'.repeat(43)}`)).toEqual({ error: TEXTES_REFUS_JETON_DEPOT.illisible });
    expect(await lire(A.b1)).toEqual({ logoUrl: ANCIEN, logos: [ANCIEN] });
    expect(supprimes).toEqual([]);
  });
});

describe('Enregistrement refusé ou en échec · le dépôt attesté est retiré, sauf s’il est cité', () => {
  it('charte refusée (variante externe invalide) · l’objet déposé est retiré, la charte intacte', async () => {
    const d = await deposer();
    const r = await saveBrandDAAction({ brandId: A.b1, logoUrl: d.url, logos: [ANCIEN, d.url, 'javascript:alert(1)'], colors: [], fonts: [], jetonDepot: d.jeton });
    expect(r).toEqual({ error: MESSAGES_REFUS_LOGO.schema });
    expect(await lire(A.b1)).toEqual({ logoUrl: ANCIEN, logos: [ANCIEN] });
    expect(supprimes).toEqual([cleDe(d.url)]);
    expect(bucket.has(cleDe(d.url))).toBe(false);
  });

  it('écriture refusée par Postgres · l’erreur remonte, l’objet déposé est retiré', async () => {
    const d = await deposer();
    await db.execute(sql.raw(`set test.refus = 'on'`));
    await expect(importer(A.b1, d.url, d.jeton)).rejects.toThrow(/écriture refusée/);
    await db.execute(sql.raw(`set test.refus = 'off'`));
    expect(await lire(A.b1)).toEqual({ logoUrl: ANCIEN, logos: [ANCIEN] });
    expect(supprimes).toEqual([cleDe(d.url)]);
    expect(bucket.has(cleDe(d.url))).toBe(false);
  });

  it('objet CITÉ par une autre marque · la charte refusée ne le retire pas', async () => {
    const d = await deposer();
    expect(await importer(A.b2, d.url, d.jeton)).toEqual({ ok: true });
    // Le même jeton rejoué sur A1, avec une charte invalide · l'objet est celui de A2.
    const r = await saveBrandDAAction({ brandId: A.b1, logoUrl: d.url, logos: [d.url, 'http://x.fr/l.png'], colors: [], fonts: [], jetonDepot: d.jeton });
    expect(r).toEqual({ error: MESSAGES_REFUS_LOGO.schema });
    expect(supprimes).toEqual([]);
    expect(bucket.has(cleDe(d.url))).toBe(true);
    expect((await lire(A.b2)).logoUrl).toBe(d.url);
  });

  it('charte valide qui ne retient pas le dépôt attesté · écrite, l’objet sans ligne est retiré', async () => {
    const d = await deposer();
    expect(await saveBrandDAAction({ brandId: A.b1, logoUrl: ANCIEN, logos: [ANCIEN], colors: [], fonts: [], jetonDepot: d.jeton })).toEqual({ ok: true });
    expect(supprimes).toEqual([cleDe(d.url)]);
  });
});

describe('Compatibilité · sans jeton', () => {
  it('adresse du bucket DÉJÀ en base · acceptée sans jeton (logo par défaut changé), aucun DELETE', async () => {
    const d = await deposer();
    expect(await importer(A.b1, d.url, d.jeton)).toEqual({ ok: true });
    supprimes.length = 0;
    expect(await saveBrandDAAction({ brandId: A.b1, logoUrl: ANCIEN, logos: [ANCIEN, d.url], colors: [], fonts: [] })).toEqual({ ok: true });
    expect(await saveBrandDAAction({ brandId: A.b1, logoUrl: d.url, logos: [ANCIEN, d.url], colors: [], fonts: [] })).toEqual({ ok: true });
    expect(await lire(A.b1)).toEqual({ logoUrl: d.url, logos: [ANCIEN, d.url] });
    expect(supprimes).toEqual([]);
  });

  it('adresse externe https · « Ajouter » par adresse inchangé, sans jeton', async () => {
    const EXT = 'https://cdn.exemple.fr/logo.png';
    expect(await saveBrandDAAction({ brandId: A.b1, logoUrl: ANCIEN, logos: [ANCIEN, EXT], colors: [], fonts: [] })).toEqual({ ok: true });
    expect(await lire(A.b1)).toEqual({ logoUrl: ANCIEN, logos: [ANCIEN, EXT] });
    expect(supprimes).toEqual([]);
  });
});
