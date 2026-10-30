import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Sécurité · enregistrement d'un téléversement · le type ENREGISTRÉ est relu
 * dans l'objet du bucket, jamais celui que déclare le navigateur.
 *
 * Le défaut · `registerUploadedAssetAction` enregistrait le `mimeType` fourni
 * par le client. Un appel direct déclarait `image/png` pour un objet HTML.
 *
 * Vraie base (pglite + migrations du dépôt), VRAIE action, VRAI lecteur
 * (`lireDebutObjetEspace`, liens signés) face à un faux bucket qui sert de
 * vrais octets (PNG, JPEG, MP4, HTML, SVG) et répond comme S3 · `HEAD`,
 * `GET` avec `Range` (206), `DELETE`. On lit ce qui SORT : la ligne écrite
 * (type, taille, famille), l'objet encore présent ou non dans le bucket, et
 * les requêtes réellement envoyées.
 */

const etat = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
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
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiktrends/integrations')>()),
  storageFromEnv: () => CFG,
}));

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { lireDebutObjetEspace } from '@tiktrends/integrations';
import { MESSAGES_REFUS_RELU, MESSAGES_REFUS_DEPOT, OCTETS_RELUS_DEPOT } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { registerUploadedAssetAction } from '../app/actions/assets';
import { mp4StructurePlausible } from '../../../packages/core/test/l3-fixtures-media';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ids = etat.ids;
const BASE = CFG.publicBaseUrl;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');
const JPEG = Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAYDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAFWX/9k=', 'base64');
const MP4 = Buffer.from(mp4StructurePlausible({ largeur: 288, hauteur: 512, echantillons: [100], donnees: 256 }));
const HTML = Buffer.from('<!doctype html><html><body><script>fetch("/api/vol?c="+document.cookie)</script></body></html>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>');

/* ───────────── Le faux bucket · répond comme S3 sur l'hôte configuré ───────────── */

const bucket = new Map<string, Buffer>();
const requetes: Array<{ methode: string; hote: string; cle: string; range: string | null }> = [];
let ignorerRange = false;
let redirigerHead = false;
/** Contenu servi au GET à la place de celui vu au HEAD (objet remplacé entre les deux). */
let remplacant: Buffer | null = null;
let octetsTires = 0;

function servir(corps: Buffer, debut: number, fin: number): ReadableStream<Uint8Array> {
  // Flux PARESSEUX par blocs de 64 Kio · compte ce que le lecteur tire vraiment.
  let i = debut;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i >= fin) { c.close(); return; }
      const bloc = corps.subarray(i, Math.min(fin, i + 65_536));
      i += bloc.length; octetsTires += bloc.length;
      c.enqueue(new Uint8Array(bloc));
    },
  });
}

async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  const methode = init?.method ?? 'GET';
  const range = new Headers(init?.headers).get('range');
  const prefixe = `/${CFG.bucket}/`;
  const cle = u.pathname.startsWith(prefixe) ? decodeURIComponent(u.pathname.slice(prefixe.length)) : '';
  requetes.push({ methode, hote: u.host, cle, range });
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  const corps = bucket.get(cle);
  if (methode === 'DELETE') { bucket.delete(cle); return new Response(null, { status: 204 }); }
  if (methode === 'HEAD') {
    if (redirigerHead) {
      const vers = 'http://169.254.169.254/latest/meta-data/';
      // Comme `fetch` : sans `redirect: 'manual'`, la redirection est SUIVIE.
      if (init?.redirect !== 'manual') return fauxBucket(vers, { method: 'HEAD' });
      return new Response(null, { status: 302, headers: { location: vers } });
    }
    return corps ? new Response(null, { status: 200, headers: { 'content-length': String(corps.length) } }) : new Response(null, { status: 404 });
  }
  if (!corps) return new Response('NoSuchKey', { status: 404 });
  if (remplacant) bucket.set(cle, remplacant);
  return servirGet(bucket.get(cle)!, range);
}

function servirGet(corps: Buffer, range: string | null): Response {
  const m = /^bytes=0-(\d+)$/.exec(range ?? '');
  if (!m || ignorerRange) return new Response(servir(corps, 0, corps.length), { status: 200, headers: { 'content-length': String(corps.length) } });
  const fin = Math.min(corps.length, Number(m[1]) + 1);
  return new Response(servir(corps, 0, fin), { status: 206, headers: { 'content-range': `bytes 0-${fin - 1}/${corps.length}` } });
}

/* ──────────────────────────────── Outils ──────────────────────────────── */

let n = 0;
/** Dépose des octets chez l'espace `ws` · rend l'adresse publique, comme `presignAssetUploadAction`. */
function deposer(ws: string, nom: string, octets: Buffer): { url: string; cle: string } {
  const cle = `assets/${ws}/${1_700_000_000_000 + ++n}-ab${n}-${nom}`;
  bucket.set(cle, octets);
  return { url: `${BASE}/${cle}`, cle };
}
const ligne = async (url: string) => db.select().from(schema.assets).where(eq(schema.assets.url, url));

beforeAll(async () => { await semer(db, schema, ids); });
beforeEach(() => {
  requetes.length = 0; ignorerRange = false; redirigerHead = false; octetsTires = 0; remplacant = null;
  vi.stubGlobal('fetch', fauxBucket);
  etat.session = session(ids, 'ub');
});
afterEach(() => { vi.unstubAllGlobals(); });

/* ──────────────────────────────── Gardes ──────────────────────────────── */

describe('registerUploadedAssetAction · le type enregistré est le type RELU', () => {
  it('un PNG déclaré PNG ⇒ enregistré image/png, taille RELUE (pas celle annoncée), début lu par Range signé', async () => {
    const { url, cle } = deposer(ids.wsB, 'photo.png', PNG);
    expect(await registerUploadedAssetAction({ name: 'photo.png', url, mimeType: 'image/png', sizeBytes: 999_999 })).toEqual({ ok: true });
    const [l] = await ligne(url);
    expect({ type: l?.mimeType, kind: l?.kind, taille: l?.sizeBytes, espace: l?.workspaceId }).toEqual({ type: 'image/png', kind: 'image', taille: PNG.length, espace: ids.wsB });
    expect(requetes.map((r) => [r.methode, r.hote, r.cle, r.range])).toEqual([
      ['HEAD', CFG.endpoint, cle, null],
      ['GET', CFG.endpoint, cle, `bytes=0-${OCTETS_RELUS_DEPOT - 1}`],
    ]);
    expect(bucket.has(cle)).toBe(true);
  });

  it('un JPEG déclaré PNG ⇒ enregistré image/jpeg, jamais le type déclaré', async () => {
    const { url } = deposer(ids.wsB, 'photo.png', JPEG);
    expect(await registerUploadedAssetAction({ name: 'photo.png', url, mimeType: 'image/png', sizeBytes: 10 })).toEqual({ ok: true });
    expect((await ligne(url)).map((l) => l.mimeType)).toEqual(['image/jpeg']);
  });

  it('un MP4 déclaré video/mp4 ⇒ enregistré video/mp4, famille vidéo', async () => {
    const { url } = deposer(ids.wsB, 'clip.mp4', MP4);
    expect(await registerUploadedAssetAction({ name: 'clip.mp4', url, mimeType: 'video/mp4', sizeBytes: 10 })).toEqual({ ok: true });
    expect((await ligne(url)).map((l) => [l.mimeType, l.kind])).toEqual([['video/mp4', 'video']]);
  });

  it('Range ignoré par le serveur (200, fichier de 8 Mio) ⇒ lecture bornée, le flux est coupé', async () => {
    ignorerRange = true;
    const gros = Buffer.concat([PNG, Buffer.alloc(8 * 1024 * 1024)]);
    const { url } = deposer(ids.wsB, 'gros.png', gros);
    expect(await registerUploadedAssetAction({ name: 'gros.png', url, mimeType: 'image/png', sizeBytes: 10 })).toEqual({ ok: true });
    expect((await ligne(url)).map((l) => [l.mimeType, l.sizeBytes])).toEqual([['image/png', gros.length]]);
    expect(octetsTires, 'le fichier entier a été tiré alors que Range était ignoré').toBeLessThanOrEqual(2 * 65_536);
  });
});

describe('registerUploadedAssetAction · refus, et l’objet déposé est retiré', () => {
  const CAS: Array<[string, string, Buffer, string, string]> = [
    ['du HTML déclaré PNG', 'page.png', HTML, 'image/png', MESSAGES_REFUS_RELU.balisage],
    ['un SVG à script déclaré PNG', 'logo.png', SVG, 'image/png', MESSAGES_REFUS_RELU.balisage],
    ['un MP4 déclaré PNG', 'clip.png', MP4, 'image/png', MESSAGES_REFUS_RELU.incoherent],
    ['un objet vide', 'vide.png', Buffer.alloc(0), 'image/png', MESSAGES_REFUS_DEPOT.vide],
  ];
  for (const [quoi, nom, octets, type, erreur] of CAS) {
    it(`${quoi} ⇒ refusé, aucune ligne, objet supprimé du bucket`, async () => {
      const { url, cle } = deposer(ids.wsB, nom, octets);
      expect(await registerUploadedAssetAction({ name: nom, url, mimeType: type, sizeBytes: 10 })).toEqual({ error: erreur });
      expect(await ligne(url), `${quoi} · une ligne a été écrite`).toEqual([]);
      expect(bucket.has(cle), `${quoi} · l’objet refusé est resté dans le bucket`).toBe(false);
      expect(requetes.filter((r) => r.methode === 'DELETE').map((r) => r.cle)).toEqual([cle]);
    });
  }

  it('un objet refusé qu’une ligne EXISTANTE référence déjà n’est pas supprimé, la ligne n’est pas touchée', async () => {
    const { url, cle } = deposer(ids.wsB, 'ancien.png', HTML);
    const [ancienne] = await db.insert(schema.assets).values({ workspaceId: ids.wsB, name: 'ancien', kind: 'image', source: 'upload', url, mimeType: 'image/png' }).returning();
    expect(await registerUploadedAssetAction({ name: 'ancien.png', url, mimeType: 'image/png', sizeBytes: 10 })).toEqual({ error: MESSAGES_REFUS_RELU.balisage });
    expect(bucket.has(cle)).toBe(true);
    expect(await ligne(url)).toEqual([ancienne]);
  });
});

describe('registerUploadedAssetAction · aucune adresse hors de l’espace n’est lue', () => {
  it('une adresse hors du bucket de l’espace ⇒ refusée, AUCUNE requête', async () => {
    for (const url of [
      'https://evil.test/assets/x.png',
      'http://169.254.169.254/latest/meta-data/',
      `https://cdn.exemple.test/bucket-voisin/assets/${ids.wsB}/1-ab-x.png`,
      `${BASE}@evil.test/assets/${ids.wsB}/1-ab-x.png`,
      `${BASE}/assets/${ids.wsB}/%2e%2e/${ids.wsA}/1-ab-x.png`,
      `https://${CFG.endpoint}/${CFG.bucket}/assets/${ids.wsB}/1-ab-x.png`,
    ]) {
      expect(await registerUploadedAssetAction({ name: 'x.png', url, mimeType: 'image/png', sizeBytes: 10 }), url).toEqual({ error: 'Ce fichier n’a pas été téléversé depuis cet espace.' });
    }
    expect(requetes, 'une adresse hors espace a été requêtée').toEqual([]);
  });

  it('un fichier d’un AUTRE espace ⇒ refusé, ni lu ni supprimé, aucune ligne', async () => {
    const { url, cle } = deposer(ids.wsA, 'html.png', HTML);
    expect(await registerUploadedAssetAction({ name: 'html.png', url, mimeType: 'image/png', sizeBytes: 10 })).toEqual({ error: 'Ce fichier n’a pas été téléversé depuis cet espace.' });
    expect(requetes).toEqual([]);
    expect(bucket.has(cle)).toBe(true);
    expect(await ligne(url)).toEqual([]);
  });

  it('le lecteur seul refuse aussi · objet d’un autre espace ou hors bucket ⇒ `hors_espace`, aucune requête', async () => {
    const { url } = deposer(ids.wsA, 'photo.png', PNG);
    expect(await lireDebutObjetEspace(CFG, url, ids.wsB, OCTETS_RELUS_DEPOT)).toEqual({ ok: false, raison: 'hors_espace' });
    expect(await lireDebutObjetEspace(CFG, 'https://evil.test/assets/x.png', ids.wsB, OCTETS_RELUS_DEPOT)).toEqual({ ok: false, raison: 'hors_espace' });
    expect(requetes).toEqual([]);
    // Témoin · le même objet, lu par SON espace.
    expect(await lireDebutObjetEspace(CFG, url, ids.wsA, OCTETS_RELUS_DEPOT)).toMatchObject({ ok: true, taille: PNG.length });
  });

  it('une redirection du stockage n’est pas suivie ⇒ refus « lecture impossible », rien d’écrit, rien de supprimé', async () => {
    redirigerHead = true;
    const { url, cle } = deposer(ids.wsB, 'photo.png', PNG);
    const r = await registerUploadedAssetAction({ name: 'photo.png', url, mimeType: 'image/png', sizeBytes: 10 });
    expect(r).toEqual({ error: 'Lecture du fichier impossible pour l’instant · réessaie dans un instant.' });
    expect(requetes.map((q) => [q.methode, q.hote])).toEqual([['HEAD', CFG.endpoint]]);
    expect(bucket.has(cle)).toBe(true);
    expect(await ligne(url)).toEqual([]);
  });

  it('un objet remplacé entre HEAD et GET (taille de la plage ≠ taille vue) ⇒ « lecture impossible », rien d’écrit', async () => {
    remplacant = Buffer.concat([HTML, Buffer.alloc(4096)]);
    const { url, cle } = deposer(ids.wsB, 'photo.png', PNG);
    expect(await registerUploadedAssetAction({ name: 'photo.png', url, mimeType: 'image/png', sizeBytes: 10 })).toEqual({ error: 'Lecture du fichier impossible pour l’instant · réessaie dans un instant.' });
    expect(await ligne(url)).toEqual([]);
    expect(bucket.has(cle)).toBe(true);
  });

  it('un objet absent du bucket ⇒ refus clair, rien d’écrit', async () => {
    const url = `${BASE}/assets/${ids.wsB}/1-zz-absent.png`;
    expect(await registerUploadedAssetAction({ name: 'absent.png', url, mimeType: 'image/png', sizeBytes: 10 })).toEqual({ error: 'Fichier introuvable dans le stockage · relance le téléversement.' });
    expect(await ligne(url)).toEqual([]);
  });
});
