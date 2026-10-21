import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Sécurité · médias · suivi de relecture de #798. Vraie base (pglite +
 * migrations), VRAIES actions serveur et VRAIS handlers GET ; on lit ce qui
 * SORT (statut, en-têtes, lignes, objets déposés, requêtes au bucket).
 *
 *  A3 · brancher ou synchroniser Drive suit la règle d'ÉCRITURE de la
 *       Bibliothèque (rôle ET offre) avant le contrôle admin.
 *  A4 · les routes de médias suivent la règle de LECTURE (404 neutre) ; la
 *       redirection `direct` ne vise que le bucket ou Drive, le reste est
 *       servi par le proxy.
 *  M1 · migration vers le bucket : 25 SVG déguisés en tête ne bloquent plus le
 *       lot, et le décompte applique le même filtre.
 *  M2 · sélecteur Drive : un fichier qui échoue est compté ignoré, le lot continue.
 *  M4 · l'objet physique n'est supprimé que si plus aucune ligne ne le
 *       référence ; une clé `drive-…` ne s'enregistre pas comme téléversement.
 */

const etat = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  brand: null as { id: string; name: string } | null,
  drive: new Map<string, Buffer>(),
  driveMeta: new Map<string, { id: string; name: string; mimeType: string; size?: number }>(),
  distant: new Map<string, { body: Buffer; contentType: string; url: string }>(),
  appelsDistants: [] as string[],
  depots: [] as Array<{ key: string; contentType: string }>,
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
vi.mock('@tiktrends/integrations/src/safe-fetch', () => ({
  safeFetch: async (u: string) => { etat.appelsDistants.push(u); return etat.distant.get(u) ?? null; },
}));
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  return {
    ...actual,
    storageFromEnv: () => CFG,
    googleAccessToken: async () => 'acces-de-test',
    driveFileMeta: async (_t: string, id: string) => {
      const m = etat.driveMeta.get(id);
      if (!m) throw new Error('Drive : fichier introuvable');
      return m;
    },
    driveDownload: async (_t: string, id: string) => {
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

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { NextRequest } from 'next/server';
import { session, semer } from './studios-semis';
import { GET as GET_ASSET } from '../app/api/asset/[id]/route';
import { GET as GET_DRIVE } from '../app/api/drive-img/[id]/route';
import { registerUploadedAssetAction, deleteAssetAction } from '../app/actions/assets';
import { setDriveFolderAction, syncDriveFilesAction } from '../app/actions/drive';
import { migrateEmbeddedImagesAction, embeddedImagesStatusAction } from '../app/actions/storage';
import { TEXTE_REFUS_BIBLIOTHEQUE } from '../lib/bibliotheque-acces';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ids = etat.ids;
const BASE = CFG.publicBaseUrl;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/vol?c="+document.cookie)</script></svg>');
const b64 = (b: Buffer) => b.toString('base64');

const asset = (id: string, h: Record<string, string> = {}) =>
  GET_ASSET(new Request(`http://local/api/asset/${id}`, { headers: h }), { params: Promise.resolve({ id }) });
const driveImg = (id: string) =>
  GET_DRIVE(new NextRequest(`http://local/api/drive-img/${id}`), { params: Promise.resolve({ id }) });

function fermee(r: Response, nom: string): void {
  expect(r.headers.get('x-content-type-options'), `${nom} · nosniff`).toBe('nosniff');
  expect(r.headers.get('content-security-policy'), `${nom} · CSP`).toBe("default-src 'none'; sandbox");
}
async function poser(v: Partial<typeof schema.assets.$inferInsert> & { url: string }, ws = ids.wsA): Promise<string> {
  const [a] = await db.insert(schema.assets).values({ workspaceId: ws, name: 'x', kind: 'image', source: 'upload', ...v }).returning();
  return a!.id;
}

const A: Record<string, string> = {};

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.brands).set({ driveRefreshToken: 'chiffre' }).where(eq(schema.brands.id, ids.brandA1));
  A.png = await poser({ url: `data:image/png;base64,${b64(PNG)}`, brandId: ids.brandA1 });
  A.bucket = await poser({ url: `${BASE}/assets/${ids.wsA}/1-ab-photo.jpg` });
  A.drive = await poser({ source: 'url', url: 'https://drive.google.com/uc?export=view&id=sans-id' });
  A.ailleurs = await poser({ source: 'url', kind: 'video', url: 'https://evil.test/clip' });
  A.deguise = await poser({ source: 'url', url: 'https://cdn.exemple.test/bucket-voisin/x.png' });
  A.ailleursSvg = await poser({ source: 'url', name: 'logo.svg', url: 'https://evil.test/logo' });
  etat.distant.set('https://evil.test/clip', { body: PNG, contentType: 'text/html', url: 'https://evil.test/clip' });
  etat.distant.set('https://cdn.exemple.test/bucket-voisin/x.png', { body: PNG, contentType: 'image/png', url: '' });
  etat.distant.set('https://evil.test/logo', { body: SVG, contentType: 'image/svg+xml', url: '' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  etat.depots = [];
  etat.appelsDistants = [];
});

describe('A3 · Drive suit la règle d’écriture de la Bibliothèque, avant le contrôle admin', () => {
  it('admin d’un espace Starter : refusé, motif de l’offre, rien écrit', async () => {
    etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    etat.session = session(ids, 'ua', { role: 'admin', plan: 'starter' });
    expect(await setDriveFolderAction({ folderId: 'dossier-starter', folderName: 'S' })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE.plan });
    expect(await syncDriveFilesAction([{ id: 'x', name: 'x', mimeType: 'image/png' }])).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE.plan });
    const [b] = await db.select({ f: schema.brands.driveFolderId }).from(schema.brands).where(eq(schema.brands.id, ids.brandA1));
    expect(b!.f).not.toBe('dossier-starter');
  });
  it('lecteur client : refusé, motif du rôle', async () => {
    etat.session = session(ids, 'uv');
    expect(await setDriveFolderAction({ folderId: 'f', folderName: 'f' })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE.role });
  });
  it('témoin · admin Core : passe', async () => {
    etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    etat.session = session(ids, 'ua', { role: 'admin', plan: 'core' });
    expect(await setDriveFolderAction({ folderId: 'dossier-core', folderName: 'C' })).toEqual({ ok: true });
  });
});

describe('A4 · lecture des médias · règle de la Bibliothèque, 404 neutre', () => {
  it('lecteur client : 404 neutre sur les deux routes, en-têtes fermés', async () => {
    etat.session = session(ids, 'uv');
    for (const r of [await asset(A.png!), await driveImg(A.png!)]) {
      expect([r.status, await r.text()]).toEqual([404, 'not found']);
      fermee(r, 'lecteur client');
    }
  });
  it('membre d’un espace Starter : garde la LECTURE de ses médias', async () => {
    etat.session = session(ids, 'ua', { plan: 'starter' });
    const r = await asset(A.png!);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
  });
});

describe('A4 · redirection seulement vers le bucket ou Drive, sinon proxy', () => {
  it('bucket et Drive : 302, sans appel distant', async () => {
    etat.session = session(ids, 'ua');
    const b = await asset(A.bucket!);
    expect(b.status).toBe(302);
    const lecture = new URL(b.headers.get('location')!);
    expect(lecture.origin).toBe('https://s3.test');
    expect(lecture.pathname).toBe(`/bucket/assets/${ids.wsA}/1-ab-photo.jpg`);
    expect(lecture.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(lecture.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    fermee(b, '302 bucket');
    const d = await asset(A.drive!);
    expect([d.status, d.headers.get('location')]).toEqual([302, 'https://drive.google.com/uc?export=view&id=sans-id']);
    expect(etat.appelsDistants).toEqual([]);
  });
  it('autre hôte, bucket voisin : jamais de redirection, octets servis par le proxy avec le type RELU', async () => {
    etat.session = session(ids, 'ua');
    const cas: Array<[string, string]> = [[A.ailleurs!, 'https://evil.test/clip'], [A.deguise!, 'https://cdn.exemple.test/bucket-voisin/x.png']];
    for (const [id, url] of cas) {
      const r = await asset(id);
      expect(r.status, url).toBe(200);
      expect(r.headers.get('location'), url).toBeNull();
      expect(r.headers.get('content-type'), url).toBe('image/png');
      fermee(r, url);
    }
    expect(etat.appelsDistants).toEqual(['https://evil.test/clip', 'https://cdn.exemple.test/bucket-voisin/x.png']);
  });
  it('SVG distant : servi en pièce jointe octet-stream, jamais exécutable', async () => {
    etat.session = session(ids, 'ua');
    const r = await asset(A.ailleursSvg!);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/octet-stream');
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="logo.svg"');
    fermee(r, 'svg distant');
  });
  it('drive-img : même règle', async () => {
    etat.session = session(ids, 'ua');
    const r = await driveImg(A.ailleurs!);
    expect(r.status).toBe(200);
    expect(r.headers.get('location')).toBeNull();
    expect((await driveImg(A.bucket!)).status).toBe(302);
  });
});

describe('M2 · sélecteur Drive · un fichier qui échoue n’arrête pas le lot', () => {
  it('métadonnées introuvables pour un fichier : compté ignoré, l’autre est importé', async () => {
    etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    etat.session = session(ids, 'ua', { role: 'admin' });
    etat.driveMeta.set('ok-1', { id: 'ok-1', name: 'ok.png', mimeType: 'image/png', size: PNG.length });
    etat.drive.set('ok-1', PNG);
    const r = await syncDriveFilesAction([
      { id: 'casse-1', name: 'casse.png', mimeType: 'image/png' },
      { id: 'ok-1', name: 'ok.png', mimeType: 'image/png' },
    ]);
    expect(r).toEqual({ ok: true, added: 1, skipped: 1 });
    expect(await db.select().from(schema.assets).where(eq(schema.assets.externalId, 'ok-1'))).toHaveLength(1);
  });
});

describe('M4 · objet partagé, clé Drive', () => {
  it('deux lignes, même objet : la première suppression ne touche pas le bucket, la dernière oui', async () => {
    const appels: Array<{ url: string; method: string }> = [];
    vi.stubGlobal('fetch', async (u: string | URL, init?: RequestInit) => {
      appels.push({ url: String(u), method: init?.method ?? 'GET' });
      return new Response('', { status: 204 });
    });
    etat.session = session(ids, 'ub');
    const url = `${BASE}/assets/${ids.wsB}/3-ef-partage.png`;
    const un = await poser({ url }, ids.wsB);
    const deux = await poser({ url }, ids.wsB);
    expect(await deleteAssetAction({ id: un })).toEqual({ ok: true });
    expect(appels, 'objet supprimé alors qu’une autre ligne le référence').toEqual([]);
    expect(await deleteAssetAction({ id: deux })).toEqual({ ok: true });
    expect(appels).toEqual([{ url: `https://s3.test/bucket/assets/${ids.wsB}/3-ef-partage.png`, method: 'DELETE' }]);
  });

  it('une clé `drive-…` de l’espace ne s’enregistre pas comme téléversement', async () => {
    etat.session = session(ids, 'ub');
    etat.brand = null;
    const r = await registerUploadedAssetAction({ name: 'vol', url: `${BASE}/assets/${ids.wsB}/drive-abc.png`, mimeType: 'image/png', sizeBytes: 1 });
    expect(r.error ?? 'CLÉ DRIVE ENREGISTRÉE').toBe('Ce fichier n’a pas été téléversé depuis cet espace.');
    expect(await registerUploadedAssetAction({ name: 'mien', url: `${BASE}/assets/${ids.wsB}/4-gh-mien.png`, mimeType: 'image/png', sizeBytes: 1 })).toEqual({ ok: true });
  });
});

describe('M1 · migration vers le bucket · 25 SVG déguisés en tête ne bloquent plus rien', () => {
  it('décompte et migration appliquent le même filtre ; les SVG restent en base, intacts', async () => {
    // Espace B : 25 SVG déguisés en PNG aux plus PETITS identifiants (en tête
    // de toute lecture triée), puis 3 vraies images.
    const svg = Array.from({ length: 25 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const png = Array.from({ length: 3 }, (_, i) => `ffffffff-0000-4000-8000-${String(i).padStart(12, '0')}`);
    for (const id of svg) await db.insert(schema.assets).values({ id, workspaceId: ids.wsB, name: `faux-${id.slice(-2)}.png`, kind: 'image', source: 'upload', url: `data:image/png;base64,${b64(SVG)}` });
    for (const id of png) await db.insert(schema.assets).values({ id, workspaceId: ids.wsB, name: `vrai-${id.slice(-2)}.png`, kind: 'image', source: 'upload', url: `data:image/png;base64,${b64(PNG)}` });
    etat.session = session(ids, 'ub', { role: 'admin' });

    const avant = await embeddedImagesStatusAction();
    expect(avant.etat?.restantes, 'les SVG ne sont pas « à migrer »').toBe(3);

    const r = await migrateEmbeddedImagesAction();
    expect(r).toEqual({ migrees: 3, restantes: 0 });
    expect(etat.depots.map((d) => d.contentType)).toEqual(['image/png', 'image/png', 'image/png']);
    for (const id of png) {
      const [l] = await db.select().from(schema.assets).where(eq(schema.assets.id, id));
      expect(l!.url.startsWith(`${BASE}/assets/${ids.wsB}/`)).toBe(true);
    }
    for (const id of svg) {
      const [l] = await db.select().from(schema.assets).where(eq(schema.assets.id, id));
      expect(l!.url).toBe(`data:image/png;base64,${b64(SVG)}`);
    }
  });
});
