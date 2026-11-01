import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · télécharger un DOSSIER entier (`POST /api/bibliotheque/archive`,
 * champ `dossiers`) et relire les tailles inconnues avant de décider.
 *
 * Vraie base (pglite + migrations du dépôt), VRAI handler, VRAIES lectures
 * (`lecture-flux.ts`) · le stockage est un faux bucket et un faux Drive qui
 * servent de VRAIS octets, répondent au `HEAD` (taille de l'objet, ou une
 * taille imposée) et à la métadonnée Drive `fields=size`. On lit ce qui SORT ·
 * l'archive décompressée par un lecteur indépendant (`lire-zip.ts`), ses
 * chemins et ses octets, et CHAQUE requête envoyée au stockage (méthode, clé).
 */

const etat = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  bucket: new Map<string, Uint8Array>(),
  /** Une taille imposée au `HEAD` (objet plus gros que ce qu'on sert ici). */
  tetes: new Map<string, string>(),
  drive: new Map<string, Uint8Array>(),
  /** La métadonnée `size` de Drive · absente pour un document natif. */
  driveTaille: new Map<string, string>(),
  requetes: [] as string[],
  /** La marque active (cookie) · null = « Toutes les marques ». */
  marque: null as { id: string; name: string } | null,
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
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => etat.marque }));
vi.mock('../lib/drive-token', () => ({ driveRefreshTokenFor: async (ws: string) => (ws === etat.ids.wsA ? 'jeton-rafraichi' : null) }));
vi.mock('@tiktrends/integrations/src/safe-fetch', () => ({ safeFetch: async () => null }));
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  return { ...actual, storageFromEnv: () => CFG, googleAccessToken: async () => 'acces-de-test' };
});

import { randomBytes } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  PLAFOND_ARCHIVE_FICHIERS, PLAFOND_ARCHIVE_OCTETS, RAISONS_ARCHIVE, refusArchiveNombreFichiers, refusArchiveTailleInconnue, refusArchiveVolume,
} from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { lireZip } from '../../../packages/core/test/helpers/lire-zip';
import { POST } from '../app/api/bibliotheque/archive/route';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const ids = etat.ids;
const BASE = CFG.publicBaseUrl;

/** Le faux stockage · bucket (`GET`, `HEAD`) et Drive (`alt=media`, `fields=size`), en morceaux. */
function stockage(u: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof u === 'string' ? u : u instanceof URL ? u.href : u.url);
  const methode = (init?.method ?? 'GET').toUpperCase();
  const champs = url.searchParams.get('fields');
  etat.requetes.push(`${methode} ${url.origin}${url.pathname}${champs ? `?fields=${champs}` : ''}`);
  if (url.host === 's3.test' && url.pathname.startsWith('/bucket/')) {
    const cle = decodeURIComponent(url.pathname.slice('/bucket/'.length));
    const o = etat.bucket.get(cle);
    if (!o) return Promise.resolve(new Response(null, { status: 404 }));
    if (methode === 'HEAD') return Promise.resolve(new Response(null, { status: 200, headers: { 'content-length': etat.tetes.get(cle) ?? String(o.length) } }));
    return Promise.resolve(servir(o));
  }
  if (url.host === 'www.googleapis.com' && url.pathname.startsWith('/drive/v3/files/')) {
    const id = decodeURIComponent(url.pathname.slice('/drive/v3/files/'.length));
    if (champs === 'size') {
      if (!etat.drive.has(id)) return Promise.resolve(new Response('{"error":{}}', { status: 404 }));
      const t = etat.driveTaille.get(id);
      return Promise.resolve(new Response(JSON.stringify(t === undefined ? {} : { size: t }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    const o = url.searchParams.get('alt') === 'media' ? etat.drive.get(id) : undefined;
    return Promise.resolve(o ? servir(o) : new Response('absent', { status: 404 }));
  }
  return Promise.resolve(new Response('absent', { status: 404 }));
}
function servir(o: Uint8Array): Response {
  const corps = new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < o.length; i += 16_384) c.enqueue(o.slice(i, i + 16_384)); c.close(); } });
  return new Response(corps, { status: 200, headers: { 'content-length': String(o.length) } });
}

const requete = (corps: { ids?: string[]; dossiers?: string[] }, o: { verifier?: boolean; forme?: 'json' | 'formulaire' } = {}) => {
  const forme = o.forme ?? 'json';
  const body = forme === 'json' ? JSON.stringify(corps)
    : new URLSearchParams([...(corps.ids ?? []).map((id) => ['ids', id] as [string, string]), ...(corps.dossiers ?? []).map((id) => ['dossiers', id] as [string, string])]).toString();
  return POST(new Request(`http://local/api/bibliotheque/archive${o.verifier ? '?verifier=1' : ''}`, {
    method: 'POST', body, headers: { 'content-type': forme === 'json' ? 'application/json' : 'application/x-www-form-urlencoded' },
  }));
};
const octets = async (r: Response) => Buffer.from(await r.arrayBuffer());
const contenuDe = (requetes: string[]) => requetes.filter((x) => x.startsWith('GET ') && !x.includes('?fields='));

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');
const PHOTO = randomBytes(200_000);
const SANS = randomBytes(70_001);
const VIDEO = randomBytes(90_003);
const F = {} as Record<'campagne' | 'ete' | 'vide' | 'jete' | 'intrus' | 'secretB' | 'muet' | 'enorme' | 'gros' | 'commun' | 'sousA2', string>;
const A = {} as Record<'logo' | 'photo' | 'sans' | 'jete' | 'video' | 'perdu', string>;

async function dossier(nom: string, o: { parentId?: string; deletedAt?: Date; workspaceId?: string; brandId?: string } = {}): Promise<string> {
  const [d] = await db.insert(schema.libraryFolders).values({ workspaceId: ids.wsA, name: nom, ...o }).returning();
  return d!.id;
}
async function poser(v: Partial<typeof schema.assets.$inferInsert> & { url: string }): Promise<string> {
  const [a] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'x', kind: 'image', source: 'upload', ...v }).returning();
  return a!.id;
}
const cleA = (n: string) => `assets/${ids.wsA}/${n}`;

beforeAll(async () => {
  await semer(db, schema, ids);
  /*
   *  Campagne
   *  ├── photo.jpg            (bucket, taille connue)
   *  ├── sans-taille.jpg      (bucket, size_bytes NUL · relue par HEAD)
   *  ├── jete.jpg             (corbeille)
   *  ├── Été
   *  │   ├── vidéo.mp4        (Drive, size_bytes NUL · relue par la métadonnée)
   *  │   └── Vide
   *  ├── Jeté                 (corbeille)
   *  │   └── perdu.jpg
   *  └── [espace B] Intrus    (parent_id pointé ici par erreur)
   *      └── [espace B] secret.jpg
   */
  F.campagne = await dossier('Campagne');
  F.ete = await dossier('Été', { parentId: F.campagne });
  F.vide = await dossier('Vide', { parentId: F.ete });
  F.jete = await dossier('Jeté', { parentId: F.campagne, deletedAt: new Date() });
  F.intrus = await dossier('Intrus', { parentId: F.campagne, workspaceId: ids.wsB });
  F.secretB = await dossier('Secret B', { workspaceId: ids.wsB });
  F.muet = await dossier('Muet');
  F.enorme = await dossier('Énorme');
  F.gros = await dossier('Gros');

  A.logo = await poser({ name: 'logo', url: `data:image/png;base64,${PNG.toString('base64')}`, mimeType: 'image/png', sizeBytes: PNG.length });
  A.photo = await poser({ name: 'photo.jpg', url: `${BASE}/${cleA('1-photo.jpg')}`, mimeType: 'image/jpeg', sizeBytes: PHOTO.length, folderId: F.campagne });
  A.sans = await poser({ name: 'sans-taille.jpg', url: `${BASE}/${cleA('2-sans.jpg')}`, mimeType: 'image/jpeg', sizeBytes: null, folderId: F.campagne });
  A.jete = await poser({ name: 'jete.jpg', url: `${BASE}/${cleA('3-jete.jpg')}`, sizeBytes: 10, folderId: F.campagne, deletedAt: new Date() });
  A.video = await poser({ name: 'vidéo.mp4', kind: 'video', source: 'drive', externalId: 'drive-video', url: 'https://drive.google.com/file/d/drive-video/view', mimeType: 'video/mp4', sizeBytes: null, folderId: F.ete });
  A.perdu = await poser({ name: 'perdu.jpg', url: `${BASE}/${cleA('4-perdu.jpg')}`, sizeBytes: 10, folderId: F.jete });
  // Espace B · un fichier rangé dans l'intrus, un autre qui pointe directement vers « Campagne ».
  for (const [nom, dossierId] of [['secret.jpg', F.intrus], ['vol.jpg', F.campagne]] as const) {
    await db.insert(schema.assets).values({ workspaceId: ids.wsB, brandId: ids.brandB1, name: nom, kind: 'image', source: 'upload', url: `${BASE}/assets/${ids.wsB}/${nom}`, sizeBytes: 10, folderId: dossierId });
  }
  // « Muet » · un objet du bucket absent (HEAD 404) et un document Drive sans `size`.
  await poser({ name: 'absent.jpg', url: `${BASE}/${cleA('5-absent.jpg')}`, sizeBytes: null, folderId: F.muet });
  await poser({ name: 'doc-natif', kind: 'image', source: 'drive', externalId: 'drive-natif', url: 'https://drive.google.com/file/d/drive-natif/view', sizeBytes: null, folderId: F.muet });
  // « Énorme » · size_bytes nul, le HEAD dit plus que le plafond.
  await poser({ name: 'enorme.mp4', url: `${BASE}/${cleA('6-enorme.mp4')}`, sizeBytes: null, folderId: F.enorme });
  // « Commun » (sans marque) · un fichier par marque, un commun, un sous-dossier de la marque A2.
  F.commun = await dossier('Commun');
  F.sousA2 = await dossier('Sous A2', { parentId: F.commun, brandId: ids.brandA2 });
  const png = `data:image/png;base64,${PNG.toString('base64')}`;
  await poser({ name: 'c-a1.png', url: png, mimeType: 'image/png', sizeBytes: PNG.length, folderId: F.commun, brandId: ids.brandA1 });
  await poser({ name: 'c-a2.png', url: png, mimeType: 'image/png', sizeBytes: PNG.length, folderId: F.commun, brandId: ids.brandA2 });
  await poser({ name: 'c-commun.png', url: png, mimeType: 'image/png', sizeBytes: PNG.length, folderId: F.commun, brandId: null });
  await poser({ name: 's-a2.png', url: png, mimeType: 'image/png', sizeBytes: PNG.length, folderId: F.sousA2, brandId: ids.brandA2 });
  // « Gros » · un fichier de plus que le plafond de nombre.
  await db.insert(schema.assets).values(Array.from({ length: PLAFOND_ARCHIVE_FICHIERS + 1 }, (_, i) => ({
    workspaceId: ids.wsA, brandId: ids.brandA1, name: `g${i}.jpg`, kind: 'image' as const, source: 'upload' as const, url: `${BASE}/${cleA(`g${i}.jpg`)}`, sizeBytes: 1, folderId: F.gros,
  })));

  etat.bucket.set(cleA('1-photo.jpg'), PHOTO);
  etat.bucket.set(cleA('2-sans.jpg'), SANS);
  etat.bucket.set(cleA('6-enorme.mp4'), randomBytes(10));
  etat.tetes.set(cleA('6-enorme.mp4'), String(PLAFOND_ARCHIVE_OCTETS + 1));
  etat.bucket.set(`assets/${ids.wsB}/secret.jpg`, Buffer.from('SECRET DE B'));
  etat.bucket.set(`assets/${ids.wsB}/vol.jpg`, Buffer.from('VOL DE B'));
  etat.drive.set('drive-video', VIDEO);
  etat.driveTaille.set('drive-video', String(VIDEO.length));
  etat.drive.set('drive-natif', Buffer.from('natif'));
});

beforeEach(() => {
  etat.session = session(ids, 'ua');
  etat.marque = null;
  etat.requetes = [];
  vi.stubGlobal('fetch', vi.fn(stockage));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('un dossier entier · l’archive reprend son ARBORESCENCE vivante', () => {
  it('chemins relus dans l’archive décompressée, octets identiques, corbeille et espace B absents', async () => {
    const r = await requete({ dossiers: [F.campagne] }, { forme: 'formulaire' });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/zip');
    const lu = lireZip(await octets(r));
    expect(lu.map((e) => e.nom)).toEqual([
      'Campagne/', 'Campagne/Été/', 'Campagne/Été/Vide/',
      'Campagne/photo.jpg', 'Campagne/sans-taille.jpg', 'Campagne/Été/vidéo.mp4',
    ]);
    expect(lu.slice(0, 3).every((e) => e.octets.length === 0), 'un dossier ne porte aucun octet').toBe(true);
    expect(lu[3]!.octets.equals(PHOTO)).toBe(true);
    expect(lu[4]!.octets.equals(SANS)).toBe(true);
    expect(lu[5]!.octets.equals(VIDEO)).toBe(true);
    expect(lu.some((e) => /Jeté|jete|perdu|Intrus|secret|vol/.test(e.nom))).toBe(false);
    // Seules des clés de l'espace A ont été demandées · jamais celles de B (ni dossier intrus, ni fichier pointant ici).
    expect(etat.requetes.every((x) => !x.includes(ids.wsB))).toBe(true);
  });

  it('les tailles inconnues sont RELUES avant de décider (HEAD signé, métadonnée Drive) et entrent dans le volume · rien n’est écrit en base', async () => {
    const r = await requete({ dossiers: [F.campagne] }, { verifier: true });
    expect([r.status, await r.json()]).toEqual([200, { ok: true, fichiers: 3, dossiers: 3, octets: PHOTO.length + SANS.length + VIDEO.length, nom: expect.stringMatching(/^bibliotheque-\d{4}-\d{2}-\d{2}\.zip$/) }]);
    expect(etat.requetes.sort()).toEqual([
      `GET https://www.googleapis.com/drive/v3/files/drive-video?fields=size`,
      `HEAD https://s3.test/bucket/${cleA('2-sans.jpg')}`,
    ]);
    expect(contenuDe(etat.requetes), 'la vérification ne lit aucun contenu').toEqual([]);
    const enBase = await db.select({ id: schema.assets.id, t: schema.assets.sizeBytes }).from(schema.assets).where(inArray(schema.assets.id, [A.sans!, A.video!]));
    expect(enBase.map((x) => x.t)).toEqual([null, null]);
  });

  it('mixte · un fichier seul à la racine, puis le dossier', async () => {
    const r = await requete({ ids: [A.logo!], dossiers: [F.campagne] });
    const lu = lireZip(await octets(r));
    expect(lu.map((e) => e.nom)).toEqual(['Campagne/', 'Campagne/Été/', 'Campagne/Été/Vide/', 'logo.png', 'Campagne/photo.jpg', 'Campagne/sans-taille.jpg', 'Campagne/Été/vidéo.mp4']);
    expect(lu[3]!.octets.equals(PNG)).toBe(true);
  });

  it('un sous-dossier demandé · son chemin part de lui', async () => {
    const lu = lireZip(await octets(await requete({ dossiers: [F.ete] })));
    expect(lu.map((e) => e.nom)).toEqual(['Été/', 'Été/Vide/', 'Été/vidéo.mp4']);
  });
});

describe('même portée que l’écran · la marque active et les éléments communs', () => {
  it('marque A1 active · ni le fichier ni le sous-dossier de la marque A2 n’entrent dans l’archive', async () => {
    etat.marque = { id: ids.brandA1, name: 'A1' };
    const lu = lireZip(await octets(await requete({ dossiers: [F.commun!] })));
    expect(lu.map((e) => e.nom)).toEqual(['Commun/', 'Commun/c-a1.png', 'Commun/c-commun.png']);
    const r = await requete({ dossiers: [F.sousA2!] });
    expect([r.status, await r.text()]).toEqual([409, RAISONS_ARCHIVE.dossierIntrouvable]);
  });
  it('« Toutes les marques » · tout l’espace', async () => {
    const lu = lireZip(await octets(await requete({ dossiers: [F.commun!] })));
    expect(lu.map((e) => e.nom)).toEqual(['Commun/', 'Commun/Sous A2/', 'Commun/c-a1.png', 'Commun/c-a2.png', 'Commun/c-commun.png', 'Commun/Sous A2/s-a2.png']);
  });
});

describe('refus TOTAL · aucune archive, aucun contenu lu', () => {
  const refuse = async (corps: { ids?: string[]; dossiers?: string[] }, statut: number, raison: string) => {
    const r = await requete(corps);
    expect([r.status, await r.text()]).toEqual([statut, raison]);
    expect(contenuDe(etat.requetes), 'aucun contenu demandé au stockage').toEqual([]);
  };
  it('un dossier d’un AUTRE espace', async () => {
    await refuse({ dossiers: [F.secretB!] }, 409, RAISONS_ARCHIVE.dossierIntrouvable);
    await refuse({ dossiers: [F.intrus!] }, 409, RAISONS_ARCHIVE.dossierIntrouvable);
    expect(etat.requetes).toEqual([]);
  });
  it('la session de l’espace B ne lit pas le dossier de A', async () => {
    etat.session = session(ids, 'ub');
    await refuse({ dossiers: [F.campagne!] }, 409, RAISONS_ARCHIVE.dossierIntrouvable);
    expect(etat.requetes).toEqual([]);
  });
  it('un dossier à la corbeille', () => refuse({ dossiers: [F.campagne!, F.jete!] }, 409, RAISONS_ARCHIVE.dossierIntrouvable));
  it(`au-delà de ${PLAFOND_ARCHIVE_FICHIERS} fichiers dans l’arborescence · le compte exact, aucune requête au stockage`, async () => {
    await refuse({ dossiers: [F.gros!] }, 409, refusArchiveNombreFichiers(PLAFOND_ARCHIVE_FICHIERS + 1));
    expect(etat.requetes).toEqual([]);
  });
  it('une taille inconnue qui reste ILLISIBLE (objet absent au HEAD, document Drive sans `size`)', async () => {
    await refuse({ dossiers: [F.muet!] }, 409, refusArchiveTailleInconnue(2));
    expect(etat.requetes.sort()).toEqual([`GET https://www.googleapis.com/drive/v3/files/drive-natif?fields=size`, `HEAD https://s3.test/bucket/${cleA('5-absent.jpg')}`]);
  });
  it('une taille RELUE au-delà du plafond · refus de volume avec la taille relue', () => refuse({ dossiers: [F.enorme!] }, 409, refusArchiveVolume(PLAFOND_ARCHIVE_OCTETS + 1)));
  it('un identifiant de dossier en forme de chemin · illisible', () => refuse({ dossiers: ['../../etc'] }, 400, RAISONS_ARCHIVE.illisible));
  it('un lecteur client (`client_viewer`) · la garde des proxys, avant tout', async () => {
    etat.session = session(ids, 'uv');
    const r = await requete({ dossiers: [F.campagne!] });
    expect(r.status).toBe(404);
    expect(etat.requetes).toEqual([]);
  });
});

describe('la taille relue ne remplace pas le plafond réel', () => {
  it('un HEAD qui sous-estime · l’archive porte les VRAIS octets, le flux reste borné au plafond réel', async () => {
    etat.tetes.set(cleA('2-sans.jpg'), '3');
    try {
      const r = await requete({ ids: [A.sans!] }, { verifier: true });
      expect(await r.json()).toMatchObject({ ok: true, octets: 3 });
      const lu = lireZip(await octets(await requete({ ids: [A.sans!] })));
      expect(lu[0]!.octets.equals(SANS)).toBe(true);
    } finally {
      etat.tetes.delete(cleA('2-sans.jpg'));
    }
    const [l] = await db.select({ t: schema.assets.sizeBytes }).from(schema.assets).where(eq(schema.assets.id, A.sans!));
    expect(l!.t).toBeNull();
  });
});
