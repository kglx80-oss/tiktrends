import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 4b · médias lisibles sur Safari et l'iPhone (requêtes `Range`, `206`).
 *
 * Vraie base (pglite + migrations du dépôt), VRAIS handlers GET des routes qui
 * servent des octets lisibles dans une `<video>`, appelés avec une `Request`
 * portant `Range`. On lit ce qui SORT : statut, octets exacts, en-têtes. Et
 * l'accès hors portée reste refusé, `Range` ou pas · une plage ne doit jamais
 * devenir un passe-droit.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, drive: new Map<string, Buffer>() }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
// Drive : aucun appel réseau · le « fichier Drive » est une table en mémoire.
vi.mock('../lib/drive-token', () => ({ driveRefreshTokenFor: async () => 'jeton-de-test' }));
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  return {
    ...actual,
    googleAccessToken: async () => 'acces-de-test',
    driveDownload: async (_t: string, id: string) => {
      const b = etat.drive.get(id);
      if (!b) throw new Error('absent');
      return b;
    },
  };
});

import { db, schema } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import { GET as GET_MEDIA } from '../app/api/studios/media/[id]/route';
import { GET as GET_ASSET } from '../app/api/asset/[id]/route';
import { GET as GET_DRIVE } from '../app/api/drive-img/[id]/route';
import { injecterLecteurMedias } from '../lib/studios/rendu/medias';
import { png } from './l5a-outils';
import { mp4StructurePlausible } from '../../../packages/core/test/l3-fixtures-media';
import { NextRequest } from 'next/server';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ids = etat.ids;
const stockage = new Map<string, Uint8Array>();
let VIDEO: Buffer;
let IMAGE: Buffer;
const M = { video: '', image: '', b1: '', a2: '' };
const AS = { embarque: '', drive: '', b: '' };

const media = (id: string, h: Record<string, string> = {}) =>
  GET_MEDIA(new Request(`http://local/api/studios/media/${id}`, { headers: h }), { params: Promise.resolve({ id }) });
const asset = (id: string, h: Record<string, string> = {}) =>
  GET_ASSET(new Request(`http://local/api/asset/${id}`, { headers: h }), { params: Promise.resolve({ id }) });
const driveImg = (id: string, h: Record<string, string> = {}) =>
  GET_DRIVE(new NextRequest(`http://local/api/drive-img/${id}`, { headers: h }), { params: Promise.resolve({ id }) });

const octets = async (r: Response) => Buffer.from(await r.arrayBuffer());

async function poserMedia(ws: string, brand: string, cle: string, o: Uint8Array, mime: string): Promise<string> {
  stockage.set(cle, o);
  const [a] = await db.insert(schema.studioAssets).values({
    workspaceId: ws, brandId: brand, storageKey: cle, mime, bytes: o.length,
    sha256: createHash('sha256').update(o).digest('hex'), origin: 'upload', storageState: 'stored', width: 288, height: 512,
  }).returning();
  return a!.id;
}

beforeAll(async () => {
  // Un MP4 aux boîtes cohérentes (le filtre de type réel le sert) · fabriqué
  // en mémoire, sans ffmpeg, absent du runner de CI. Les plages ne lisent que
  // des octets : la lisibilité de la vidéo n'est pas l'objet de ce test.
  VIDEO = Buffer.from(mp4StructurePlausible({ largeur: 288, hauteur: 512, echantillons: [1500, 900, 700], donnees: 4096 }));
  IMAGE = await png(64, 32, (x) => [x * 4, 10, 200, 255]);

  await semer(db, schema, ids);
  M.video = await poserMedia(ids.wsA, ids.brandA1, 'studios/a/clip.mp4', VIDEO, 'video/mp4');
  M.image = await poserMedia(ids.wsA, ids.brandA1, 'studios/a/img.png', IMAGE, 'image/png');
  M.b1 = await poserMedia(ids.wsB, ids.brandB1, 'studios/b/clip-b.mp4', VIDEO, 'video/mp4');
  M.a2 = await poserMedia(ids.wsA, ids.brandA2, 'studios/a/clip-a2.mp4', VIDEO, 'video/mp4');
  injecterLecteurMedias({ lire: async (m) => stockage.get(m.storageKey) ?? null });

  etat.drive.set('drive-video-1', VIDEO);
  etat.drive.set('drive-video-b', VIDEO);
  const [e] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'img', kind: 'image', source: 'upload', mimeType: 'image/png', url: `data:image/png;base64,${IMAGE.toString('base64')}` }).returning();
  const [d] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'clip', kind: 'video', source: 'drive', mimeType: 'video/mp4', externalId: 'drive-video-1', url: 'https://drive.google.com/file/d/drive-video-1/view' }).returning();
  const [b] = await db.insert(schema.assets).values({ workspaceId: ids.wsB, brandId: ids.brandB1, name: 'clip b', kind: 'video', source: 'drive', mimeType: 'video/mp4', externalId: 'drive-video-b', url: 'https://drive.google.com/file/d/drive-video-b/view' }).returning();
  AS.embarque = e!.id; AS.drive = d!.id; AS.b = b!.id;
});

describe('GET /api/studios/media/[id] · clips et vidéo finale lisibles sur Safari', () => {
  it('sans Range : 200, fichier entier, Accept-Ranges annoncé, en-têtes d’origine gardés', async () => {
    etat.session = session(ids, 'ua');
    const r = await media(M.video);
    expect(r.status).toBe(200);
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect(r.headers.get('content-range')).toBeNull();
    expect(r.headers.get('content-length')).toBe(String(VIDEO.length));
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.headers.get('cache-control')).toBe('private, max-age=300');
    expect(r.headers.get('content-disposition')).toBe(`inline; filename="${M.video}.mp4"`);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('vary')).toBe('Cookie');
    expect((await octets(r)).equals(VIDEO)).toBe(true);
  });

  it('bytes=0-1 (la sonde de Safari) : 206, deux octets exacts, Content-Range sur la taille réelle', async () => {
    etat.session = session(ids, 'ua');
    const r = await media(M.video, { range: 'bytes=0-1' });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes 0-1/${VIDEO.length}`);
    expect(r.headers.get('content-length')).toBe('2');
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.headers.get('etag')).toBe(`"${createHash('sha256').update(VIDEO).digest('hex')}"`);
    expect((await octets(r)).equals(VIDEO.subarray(0, 2))).toBe(true);
  });

  it('bytes=a-b au milieu, bytes=a- et bytes=-n : les octets exacts du fichier', async () => {
    etat.session = session(ids, 'ua');
    const n = VIDEO.length;
    const cas: Array<[string, number, number]> = [['bytes=100-1099', 100, 1099], [`bytes=${n - 10}-`, n - 10, n - 1], ['bytes=-500', n - 500, n - 1], ['bytes=0-', 0, n - 1]];
    for (const [range, debut, fin] of cas) {
      const r = await media(M.video, { range });
      expect(r.status, range).toBe(206);
      expect(r.headers.get('content-range'), range).toBe(`bytes ${debut}-${fin}/${n}`);
      expect(r.headers.get('content-length'), range).toBe(String(fin - debut + 1));
      expect((await octets(r)).equals(VIDEO.subarray(debut, fin + 1)), range).toBe(true);
    }
  });

  it('plage hors taille ou invalide : 416, Content-Range « bytes */taille », aucun octet', async () => {
    etat.session = session(ids, 'ua');
    for (const range of [`bytes=${VIDEO.length}-`, 'bytes=9-3', 'bytes=abc']) {
      const r = await media(M.video, { range });
      expect(r.status, range).toBe(416);
      expect(r.headers.get('content-range'), range).toBe(`bytes */${VIDEO.length}`);
      expect(r.headers.get('accept-ranges'), range).toBe('bytes');
      expect(r.headers.get('x-content-type-options'), range).toBe('nosniff');
      expect((await octets(r)).length, range).toBe(0);
    }
  });

  it('une image se sert aussi par plage (même route)', async () => {
    etat.session = session(ids, 'ua');
    const r = await media(M.image, { range: 'bytes=0-7' });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect((await octets(r)).equals(IMAGE.subarray(0, 8))).toBe(true);
  });

  it('If-Range : même ETag ⇒ 206, ETag d’une autre version ⇒ 200 entier', async () => {
    etat.session = session(ids, 'ua');
    const etag = (await media(M.video)).headers.get('etag')!;
    const meme = await media(M.video, { range: 'bytes=0-9', 'if-range': etag });
    expect(meme.status).toBe(206);
    const autre = await media(M.video, { range: 'bytes=0-9', 'if-range': '"une-autre-version"' });
    expect(autre.status).toBe(200);
    expect((await octets(autre)).equals(VIDEO)).toBe(true);
  });

  it('If-None-Match identique : 304 garde la priorité, même avec Range', async () => {
    etat.session = session(ids, 'ua');
    const etag = (await media(M.video)).headers.get('etag')!;
    const r = await media(M.video, { range: 'bytes=0-1', 'if-none-match': etag });
    expect(r.status).toBe(304);
    expect((await octets(r)).length).toBe(0);
  });

  it('hors portée AVEC Range : toujours refusé, aucun octet ni Content-Range', async () => {
    const cas: Array<[string, SessionTest | null, string, number]> = [
      ['autre espace (B lit A)', session(ids, 'ub'), M.video, 404],
      ['A lit B', session(ids, 'ua'), M.b1, 404],
      ['marque restreinte (ur → A2)', session(ids, 'ur'), M.a2, 404],
      ['lecteur client (rôle fermé)', session(ids, 'uv'), M.video, 403],
      ['sans session', null, M.video, 401],
    ];
    for (const [nom, s, id, attendu] of cas) {
      etat.session = s;
      const r = await media(id, { range: 'bytes=0-1' });
      expect(r.status, nom).toBe(attendu);
      expect(r.headers.get('content-range'), nom).toBeNull();
      expect(r.headers.get('content-type'), nom).toMatch(/application\/json/);
      expect((await r.text()), nom).not.toContain('ftyp');
    }
    // Garde-fou du test : ur lit bien A1 par plage (la portée est la même qu'avant, ni plus ni moins).
    etat.session = session(ids, 'ur');
    expect((await media(M.video, { range: 'bytes=0-1' })).status).toBe(206);
  });
});

describe('GET /api/asset/[id] · bibliothèque (embarqué et Drive)', () => {
  it('embarqué : 200 sans Range avec Accept-Ranges, 206 octets exacts avec Range, en-têtes gardés', async () => {
    etat.session = session(ids, 'ua');
    const plein = await asset(AS.embarque);
    expect(plein.status).toBe(200);
    expect(plein.headers.get('accept-ranges')).toBe('bytes');
    expect(plein.headers.get('cache-control')).toBe('private, max-age=2592000, immutable');
    expect((await octets(plein)).equals(IMAGE)).toBe(true);
    const r = await asset(AS.embarque, { range: 'bytes=4-11' });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes 4-11/${IMAGE.length}`);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect((await octets(r)).equals(IMAGE.subarray(4, 12))).toBe(true);
  });

  it('vidéo Drive : 206 sur bytes=0-1, 416 hors taille, 200 entier sans Range', async () => {
    etat.session = session(ids, 'ua');
    const r = await asset(AS.drive, { range: 'bytes=0-1' });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes 0-1/${VIDEO.length}`);
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect((await octets(r)).equals(VIDEO.subarray(0, 2))).toBe(true);
    const h = await asset(AS.drive, { range: `bytes=${VIDEO.length + 5}-` });
    expect(h.status).toBe(416);
    expect(h.headers.get('content-range')).toBe(`bytes */${VIDEO.length}`);
    const p = await asset(AS.drive);
    expect(p.status).toBe(200);
    expect(p.headers.get('accept-ranges')).toBe('bytes');
    expect((await octets(p)).equals(VIDEO)).toBe(true);
  });

  it('hors portée AVEC Range : 404 (autre espace), 401 sans session', async () => {
    etat.session = session(ids, 'ua');
    const r = await asset(AS.b, { range: 'bytes=0-1' });
    expect(r.status).toBe(404);
    expect(r.headers.get('content-range')).toBeNull();
    etat.session = session(ids, 'ub');
    expect((await asset(AS.drive, { range: 'bytes=0-1' })).status).toBe(404);
    etat.session = null;
    expect((await asset(AS.drive, { range: 'bytes=0-1' })).status).toBe(401);
  });
});

describe('GET /api/drive-img/[id] · ancien proxy Drive', () => {
  it('206 octets exacts, 416 invalide, 200 entier · hors portée refusé avec Range', async () => {
    etat.session = session(ids, 'ua');
    const r = await driveImg(AS.drive, { range: 'bytes=10-19' });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes 10-19/${VIDEO.length}`);
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect((await octets(r)).equals(VIDEO.subarray(10, 20))).toBe(true);
    expect((await driveImg(AS.drive, { range: 'bytes=x-' })).status).toBe(416);
    const p = await driveImg(AS.drive);
    expect(p.status).toBe(200);
    expect(p.headers.get('accept-ranges')).toBe('bytes');
    expect((await octets(p)).equals(VIDEO)).toBe(true);
    etat.session = session(ids, 'ub');
    expect((await driveImg(AS.drive, { range: 'bytes=0-1' })).status).toBe(404);
    etat.session = null;
    expect((await driveImg(AS.drive, { range: 'bytes=0-1' })).status).toBe(401);
  });
});
