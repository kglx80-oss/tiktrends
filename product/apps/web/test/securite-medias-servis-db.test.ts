import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Sécurité · médias servis sur l'origine de l'application.
 *
 * Vraie base (pglite + migrations du dépôt), VRAIES actions serveur et VRAIS
 * handlers GET. On lit ce qui SORT : statut, type servi, en-têtes, lignes en
 * base, requêtes réellement envoyées au bucket.
 *
 *  A1 · un SVG avec script ne s'importe plus (lien, téléversement), un SVG déjà
 *       en base n'est jamais servi avec un type exécutable, chaque réponse porte
 *       `nosniff` et la CSP fermée, un type déclaré par le navigateur (Drive)
 *       est ignoré au profit de Drive puis des octets.
 *  A2 · une URL d'un autre espace est refusée à l'enregistrement, et sa
 *       suppression n'envoie AUCUNE requête au bucket.
 */

const etat = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  brand: null as { id: string; name: string } | null,
  drive: new Map<string, Buffer>(),
  driveMeta: new Map<string, { id: string; name: string; mimeType: string; size?: number }>(),
  fetchDistant: null as { body: Buffer; contentType: string; url: string } | null,
  depots: [] as Array<{ key: string; contentType: string }>,
  telechargements: [] as string[],
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

const CFG = vi.hoisted(() => ({ endpoint: 's3.test', region: 'gra', bucket: 'bucket', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://cdn.exemple.test/bucket' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => etat.brand }));
vi.mock('../lib/secrets', () => ({ decryptSecret: (v: string | null | undefined) => (v ? 'jeton-rafraichi' : null) }));
vi.mock('../lib/drive-token', () => ({ driveRefreshTokenFor: async () => 'jeton-de-test' }));
vi.mock('@tiktrends/integrations/src/safe-fetch', () => ({ safeFetch: async () => etat.fetchDistant }));
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  return {
    ...actual,
    storageFromEnv: () => CFG,
    googleAccessToken: async () => 'acces-de-test',
    driveFileMeta: async (_t: string, id: string) => {
      const m = etat.driveMeta.get(id);
      if (!m) throw new Error('absent');
      return m;
    },
    driveDownload: async (_t: string, id: string) => {
      etat.telechargements.push(id);
      const b = etat.drive.get(id);
      if (!b) throw new Error('absent');
      return b;
    },
    putObject: async (_c: unknown, key: string, _b: Buffer, contentType: string) => {
      etat.depots.push({ key, contentType });
      return `${CFG.publicBaseUrl}/${key}`;
    },
    storeDriveThumb: async () => null,
  };
});

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { NextRequest } from 'next/server';
import { session, semer } from './studios-semis';
import { GET as GET_ASSET } from '../app/api/asset/[id]/route';
import { GET as GET_DRIVE } from '../app/api/drive-img/[id]/route';
import { importAssetAction, uploadImageAssetsAction, registerUploadedAssetAction, deleteAssetAction } from '../app/actions/assets';
import { syncDriveFilesAction } from '../app/actions/drive';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ids = etat.ids;
const BASE = CFG.publicBaseUrl;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/vol?c="+document.cookie)</script></svg>');
const HTML = Buffer.from('<!doctype html><html><body><script>fetch("/api/vol?c="+document.cookie)</script></body></html>');
const b64 = (b: Buffer) => b.toString('base64');

const asset = (id: string, h: Record<string, string> = {}) =>
  GET_ASSET(new Request(`http://local/api/asset/${id}`, { headers: h }), { params: Promise.resolve({ id }) });
const driveImg = (id: string, h: Record<string, string> = {}) =>
  GET_DRIVE(new NextRequest(`http://local/api/drive-img/${id}`, { headers: h }), { params: Promise.resolve({ id }) });
const octets = async (r: Response) => Buffer.from(await r.arrayBuffer());

/** Toute réponse, quelle qu'elle soit, est fermée à l'exécution. */
function fermee(r: Response, nom: string): void {
  expect(r.headers.get('x-content-type-options'), `${nom} · nosniff`).toBe('nosniff');
  expect(r.headers.get('content-security-policy'), `${nom} · CSP`).toBe("default-src 'none'; sandbox");
}
/** Un type que le navigateur exécuterait comme un document. */
const EXECUTABLE = /svg|html|xml|javascript|text\/(?!plain)/i;

async function poser(v: Partial<typeof schema.assets.$inferInsert> & { url: string }): Promise<string> {
  const [a] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'x', kind: 'image', source: 'upload', ...v }).returning();
  return a!.id;
}
async function lignes(ws: string) {
  return db.select().from(schema.assets).where(eq(schema.assets.workspaceId, ws));
}

const A: Record<string, string> = {};

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.brands).set({ driveRefreshToken: 'chiffre' }).where(eq(schema.brands.id, ids.brandA1));
  // Lignes ANCIENNES, telles qu'un import d'avant le correctif a pu les laisser.
  A.svgAncien = await poser({ url: `data:image/svg+xml;base64,${b64(SVG)}`, mimeType: 'image/svg+xml' });
  A.svgDeguise = await poser({ url: `data:image/png;base64,${b64(SVG)}`, mimeType: 'image/png' });
  A.svgMajuscules = await poser({ url: `DATA:IMAGE/SVG+XML;base64,${b64(SVG)}`, mimeType: 'IMAGE/SVG+XML', source: 'url' });
  A.png = await poser({ url: `data:image/png;base64,${b64(PNG)}`, mimeType: 'image/png' });
  A.pngMalNomme = await poser({ url: `data:text/html;base64,${b64(PNG)}`, mimeType: 'text/html' });
  A.driveHtml = await poser({ source: 'drive', kind: 'other', mimeType: 'text/html', externalId: 'drive-html', url: 'https://drive.google.com/file/d/drive-html/view' });
  A.drivePngDitHtml = await poser({ source: 'drive', kind: 'image', mimeType: 'text/html', externalId: 'drive-png', url: 'https://drive.google.com/file/d/drive-png/view' });
  A.direct = await poser({ source: 'upload', url: `${BASE}/assets/${ids.wsA}/1-ab-photo.jpg` });
  A.javascript = await poser({ source: 'url', url: 'javascript:alert(document.cookie)' });
  etat.drive.set('drive-html', HTML);
  etat.drive.set('drive-png', PNG);
});

afterEach(() => {
  vi.unstubAllGlobals();
  etat.depots = [];
  etat.telechargements = [];
});

describe('A1 · un SVG déjà en base n’est jamais servi avec un type exécutable', () => {
  it('SVG ancien, SVG déguisé en PNG, préfixe en majuscules : 404 neutre, aucun octet du SVG', async () => {
    etat.session = session(ids, 'ua');
    for (const nom of ['svgAncien', 'svgDeguise', 'svgMajuscules'] as const) {
      for (const [route, r] of [['asset', await asset(A[nom]!)], ['drive-img', await driveImg(A[nom]!)]] as const) {
        expect(r.status, `${route} ${nom}`).toBe(404);
        expect(r.headers.get('content-type') ?? '', `${route} ${nom}`).not.toMatch(EXECUTABLE);
        expect((await r.text()), `${route} ${nom}`).not.toContain('<script');
        fermee(r, `${route} ${nom}`);
      }
    }
  });

  it('le même refus, Range ou pas · une plage n’est pas un passe-droit', async () => {
    etat.session = session(ids, 'ua');
    const r = await asset(A.svgAncien!, { range: 'bytes=0-40' });
    expect(r.status).toBe(404);
    expect(r.headers.get('content-range')).toBeNull();
    expect(await r.text()).toBe('not found');
  });

  it('un refus par type ne se distingue pas d’un asset inconnu', async () => {
    etat.session = session(ids, 'ua');
    const type = await asset(A.svgAncien!);
    const inconnu = await asset('00000000-0000-0000-0000-000000000000');
    expect([type.status, await type.text()]).toEqual([inconnu.status, await inconnu.text()]);
  });

  it('Drive : un fichier HTML (type stocké text/html) ⇒ 404 ; un PNG stocké « text/html » ⇒ servi image/png', async () => {
    etat.session = session(ids, 'ua');
    for (const get of [asset, driveImg]) {
      const html = await get(A.driveHtml!);
      expect(html.status).toBe(404);
      expect(await html.text()).not.toContain('<script');
      fermee(html, 'drive html');
      const png = await get(A.drivePngDitHtml!);
      expect(png.status).toBe(200);
      expect(png.headers.get('content-type')).toBe('image/png');
      fermee(png, 'drive png');
      expect((await octets(png)).equals(PNG)).toBe(true);
    }
  });

  it('embarqué : le type vient des octets, pas du préfixe ni de la colonne', async () => {
    etat.session = session(ids, 'ua');
    const r = await asset(A.pngMalNomme!);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
  });
});

describe('A1 · chaque réponse porte nosniff et la CSP fermée', () => {
  it('200, 206, 416, 404, 401, 302 · les deux routes', async () => {
    etat.session = session(ids, 'ua');
    const plein = await asset(A.png!);
    expect(plein.status).toBe(200);
    expect(plein.headers.get('content-type')).toBe('image/png');
    expect(plein.headers.get('content-disposition')).toBe(`inline; filename="${A.png}.png"`);
    expect((await octets(plein)).equals(PNG)).toBe(true);
    fermee(plein, '200');

    const partiel = await asset(A.png!, { range: 'bytes=0-7' });
    expect(partiel.status).toBe(206);
    expect((await octets(partiel)).equals(PNG.subarray(0, 8))).toBe(true);
    fermee(partiel, '206');

    const horsTaille = await asset(A.png!, { range: `bytes=${PNG.length + 5}-` });
    expect(horsTaille.status).toBe(416);
    fermee(horsTaille, '416');

    const redirige = await asset(A.direct!);
    expect(redirige.status).toBe(302);
    expect(redirige.headers.get('location')).toBe(`${BASE}/assets/${ids.wsA}/1-ab-photo.jpg`);
    fermee(redirige, '302');

    const js = await asset(A.javascript!);
    expect(js.status).toBe(404);
    expect(js.headers.get('location')).toBeNull();
    fermee(js, 'javascript:');

    etat.session = session(ids, 'ub');
    fermee(await asset(A.png!), '404 autre espace');
    fermee(await driveImg(A.png!), '404 autre espace (drive-img)');
    etat.session = null;
    const sans = await asset(A.png!);
    expect(sans.status).toBe(401);
    fermee(sans, '401');
    fermee(await driveImg(A.png!), '401 (drive-img)');
  });
});

describe('A1 · un SVG avec script importé est refusé', () => {
  it('par lien : SVG annoncé image/svg+xml, SVG annoncé IMAGE/PNG ⇒ refusés, rien en base', async () => {
    etat.session = session(ids, 'ub');
    etat.brand = null;
    const avant = (await lignes(ids.wsB)).length;
    for (const contentType of ['image/svg+xml', 'IMAGE/PNG', 'image/png; charset=binary']) {
      etat.fetchDistant = { body: SVG, contentType, url: 'https://evil.test/a.svg' };
      const r = await importAssetAction({ name: 'logo', url: 'https://evil.test/a.svg', kind: 'image' });
      expect(r.error ?? `SVG IMPORTÉ (annoncé ${contentType})`, contentType).toMatch(/ne pointe pas vers une image/);
    }
    expect((await lignes(ids.wsB)).length).toBe(avant);
  });

  it('par lien : un vrai PNG annoncé text/html ⇒ importé en image/png, servi en image/png', async () => {
    etat.session = session(ids, 'ub');
    etat.fetchDistant = { body: PNG, contentType: 'text/html', url: 'https://cdn.test/p' };
    expect(await importAssetAction({ name: 'vrai png', url: 'https://cdn.test/p', kind: 'image' })).toEqual({ ok: true });
    const [l] = (await lignes(ids.wsB)).filter((x) => x.name === 'vrai png');
    expect(l!.mimeType).toBe('image/png');
    expect(l!.url.startsWith('data:image/png;base64,')).toBe(true);
    const r = await asset(l!.id);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
  });

  it('par téléversement sans bucket : data URI « image/png » contenant un SVG ⇒ refusé', async () => {
    etat.session = session(ids, 'ub');
    const avant = (await lignes(ids.wsB)).length;
    const r = await uploadImageAssetsAction({ items: [{ name: 'faux.png', dataUri: `data:image/png;base64,${b64(SVG)}` }] });
    expect(r.error ?? 'SVG TÉLÉVERSÉ sous un préfixe image/png').toMatch(/Formats acceptés/);
    expect((await lignes(ids.wsB)).length).toBe(avant);
    const ok = await uploadImageAssetsAction({ items: [{ name: 'png-dit-jpeg', dataUri: `data:image/jpeg;base64,${b64(PNG)}` }] });
    expect(ok.ok).toBe(true);
    const [l] = (await lignes(ids.wsB)).filter((x) => x.name === 'png-dit-jpeg');
    expect(l!.mimeType).toBe('image/png');
    expect(l!.url.startsWith('data:image/png;base64,')).toBe(true);
  });
});

describe('A1 · synchro Drive : le type déclaré par le navigateur est ignoré', () => {
  it('client « text/html » sur un vrai PNG Drive ⇒ importé, déposé et gardé en image/png', async () => {
    etat.session = session(ids, 'ua', { role: 'admin' });
    etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    etat.driveMeta.set('pick-png', { id: 'pick-png', name: 'photo.html', mimeType: 'image/png', size: PNG.length });
    etat.drive.set('pick-png', PNG);
    const r = await syncDriveFilesAction([{ id: 'pick-png', name: 'photo.html', mimeType: 'text/html' }]);
    expect(r).toEqual({ ok: true, added: 1, skipped: 0 });
    expect(etat.depots).toEqual([{ key: `assets/${ids.wsA}/drive-pick-png.png`, contentType: 'image/png' }]);
    const [l] = await db.select().from(schema.assets).where(and(eq(schema.assets.workspaceId, ids.wsA), eq(schema.assets.externalId, 'pick-png')));
    expect(l!.mimeType).toBe('image/png');
    expect(l!.kind).toBe('image');
  });

  it('client « image/png » sur un fichier que Drive dit text/html ⇒ ignoré, rien téléchargé ni déposé', async () => {
    etat.session = session(ids, 'ua', { role: 'admin' });
    etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    etat.driveMeta.set('pick-html', { id: 'pick-html', name: 'page.png', mimeType: 'text/html' });
    etat.drive.set('pick-html', HTML);
    const r = await syncDriveFilesAction([{ id: 'pick-html', name: 'page.png', mimeType: 'image/png' }]);
    expect(r).toEqual({ ok: true, added: 0, skipped: 1 });
    expect(etat.telechargements).toEqual([]);
    expect(etat.depots).toEqual([]);
    expect(await db.select().from(schema.assets).where(eq(schema.assets.externalId, 'pick-html'))).toEqual([]);
  });

  it('Drive dit image/png mais les octets sont un SVG ⇒ ignoré, rien déposé', async () => {
    etat.session = session(ids, 'ua', { role: 'admin' });
    etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    etat.driveMeta.set('pick-svg', { id: 'pick-svg', name: 'logo.png', mimeType: 'image/png', size: SVG.length });
    etat.drive.set('pick-svg', SVG);
    const r = await syncDriveFilesAction([{ id: 'pick-svg', name: 'logo.png', mimeType: 'image/png' }]);
    expect(r).toEqual({ ok: true, added: 0, skipped: 1 });
    expect(etat.depots).toEqual([]);
  });

  it('un identifiant de fichier qui réécrirait le chemin de l’API ⇒ ignoré', async () => {
    etat.session = session(ids, 'ua', { role: 'admin' });
    etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    const r = await syncDriveFilesAction([{ id: '../files/x?alt=media', name: 'x', mimeType: 'image/png' }]);
    expect(r).toEqual({ ok: true, added: 0, skipped: 1 });
    expect(etat.telechargements).toEqual([]);
  });
});

describe('A2 · un objet d’un autre espace ne s’enregistre pas et ne se supprime pas', () => {
  const autre = () => `${BASE}/assets/${ids.wsA}/drive-pick-png.png`;
  const variantes = () => [
    autre(),
    `${BASE}/assets/${ids.wsB}/../${ids.wsA}/drive-pick-png.png`,
    `${BASE}/assets/${ids.wsB}/%2e%2e/${ids.wsA}/drive-pick-png.png`,
    `${BASE}/assets/${ids.wsB}/%252e%252e/${ids.wsA}/drive-pick-png.png`,
    `${BASE}@evil.test/assets/${ids.wsB}/x.png`,
    `https://cdn.exemple.test/bucket-voisin/assets/${ids.wsB}/x.png`,
    `https://evil.test/x.png`,
  ];

  it('enregistrement : chaque variante est refusée, aucune ligne créée', async () => {
    etat.session = session(ids, 'ub');
    etat.brand = null;
    const avant = (await lignes(ids.wsB)).length;
    for (const url of variantes()) {
      const r = await registerUploadedAssetAction({ name: 'vol', url, mimeType: 'image/png', sizeBytes: 10 });
      expect(r.error, url).toBe('Ce fichier n’a pas été téléversé depuis cet espace.');
    }
    expect((await lignes(ids.wsB)).length).toBe(avant);
    // Témoin : un objet de l'espace s'enregistre toujours.
    const ok = await registerUploadedAssetAction({ name: 'mien', url: `${BASE}/assets/${ids.wsB}/1-ab-mien.png`, mimeType: 'image/png', sizeBytes: 10 });
    expect(ok).toEqual({ ok: true });
  });

  it('suppression d’une ligne ancienne qui pointe chez un autre espace : ligne retirée, AUCUNE requête au bucket', async () => {
    const appels: Array<{ url: string; method: string }> = [];
    vi.stubGlobal('fetch', async (u: string | URL, init?: RequestInit) => {
      appels.push({ url: String(u), method: init?.method ?? 'GET' });
      return new Response('', { status: 204 });
    });
    etat.session = session(ids, 'ub');
    for (const url of variantes()) {
      const [l] = await db.insert(schema.assets).values({ workspaceId: ids.wsB, name: 'ancien', kind: 'image', source: 'upload', url }).returning();
      expect(await deleteAssetAction({ id: l!.id }), url).toEqual({ ok: true });
      expect(await db.select().from(schema.assets).where(eq(schema.assets.id, l!.id)), url).toEqual([]);
    }
    expect(appels, 'requête envoyée au bucket pour un objet d’un autre espace').toEqual([]);

    // Témoin : l'objet de l'espace, lui, est bien supprimé du bucket · une seule requête, sur SA clé.
    const [mien] = await db.insert(schema.assets).values({ workspaceId: ids.wsB, name: 'mien', kind: 'image', source: 'upload', url: `${BASE}/assets/${ids.wsB}/2-cd-mien.png` }).returning();
    expect(await deleteAssetAction({ id: mien!.id })).toEqual({ ok: true });
    expect(appels).toEqual([{ url: `https://s3.test/bucket/assets/${ids.wsB}/2-cd-mien.png`, method: 'DELETE' }]);
  });
});
