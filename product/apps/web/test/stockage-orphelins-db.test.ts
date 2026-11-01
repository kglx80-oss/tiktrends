import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Stockage · inventaire des candidats orphelins · vraie base (pglite +
 * migrations du dépôt) et FAUX S3 (liste ListObjectsV2, HEAD/GET d'objet).
 *
 * Chaque référence du recensement (`RECENSEMENT_REFERENCES_STOCKAGE`) est
 * semée dans SA vraie colonne, avec sa forme (texte, tableau, JSON, adresse
 * encodée, clé brute) · le dépôt de la Bibliothèque passe par les VRAIES
 * actions (`presignAssetUploadAction` → `registerUploadedAssetAction`), le
 * logo de charte par `saveBrandDAAction`. On lit ce qui SORT de
 * `chargerInventaireStockage` · le verdict de chaque objet, les comptes, les
 * requêtes envoyées au bucket (aucune écriture, aucune suppression).
 */
const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
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

import { randomUUID } from 'node:crypto';
import { db, schema, sql } from '@tiktrends/db';
import {
  DELAI_GRACE_ORPHELIN_MS, RECENSEMENT_REFERENCES_STOCKAGE, charteAvecLogoImporte, inventaireOrphelins, referencesDansTexte, verdictObjetStocke,
  type ReferenceRecensee,
} from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { presignAssetUploadAction, registerUploadedAssetAction } from '../app/actions/assets';
import { saveBrandDAAction } from '../app/actions/brand-detail';
import { chargerInventaireStockage, lireColonne, lireReferencesStockage } from '../lib/stockage-inventaire';
import { contenuPour as contenuPourBase, semerDans as semerDansBase } from './helpers/semer-reference';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const ids = etat.ids;
const BASE = CFG.publicBaseUrl;
const MAINTENANT = new Date();
const VIEUX = new Date(MAINTENANT.getTime() - 3 * 86_400_000);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');

/* ───────────── Le faux bucket · objets, et liste ListObjectsV2 ───────────── */

const bucket = new Map<string, { octets: Buffer; le: Date }>();
const requetes: Array<{ methode: string; liste: boolean }> = [];

async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  const methode = init?.method ?? 'GET';
  const liste = u.pathname === `/${CFG.bucket}` && u.searchParams.get('list-type') === '2';
  requetes.push({ methode, liste });
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  if (liste) {
    const prefixe = u.searchParams.get('prefix') ?? '';
    const contenus = [...bucket].filter(([k]) => k.startsWith(prefixe)).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `<Contents><Key>${k}</Key><LastModified>${v.le.toISOString()}</LastModified><Size>${v.octets.length}</Size></Contents>`).join('');
    return new Response(`<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>${contenus}</ListBucketResult>`, { status: 200 });
  }
  const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  const o = bucket.get(cle);
  if (methode === 'DELETE') { bucket.delete(cle); return new Response(null, { status: 204 }); }
  if (methode === 'HEAD') return o ? new Response(null, { status: 200, headers: { 'content-length': String(o.octets.length) } }) : new Response(null, { status: 404 });
  if (!o) return new Response('NoSuchKey', { status: 404 });
  const m = /^bytes=0-(\d+)$/.exec(new Headers(init?.headers).get('range') ?? '');
  const fin = m ? Math.min(o.octets.length, Number(m[1]) + 1) : o.octets.length;
  return m
    ? new Response(new Uint8Array(o.octets.subarray(0, fin)), { status: 206, headers: { 'content-range': `bytes 0-${fin - 1}/${o.octets.length}` } })
    : new Response(new Uint8Array(o.octets), { status: 200, headers: { 'content-length': String(o.octets.length) } });
}

/* ───────────── Semer une référence dans n'importe quelle colonne recensée ───────────── */

const lignes = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
let n = 0;
const nouvelleCle = (ws: string, nom: string) => `assets/${ws}/${1_700_000_000_000 + ++n}-ab${n}-${nom}`;
const semerDans = (r: ReferenceRecensee, contenu: string) => semerDansBase(db, sql, r, contenu);
const contenuPour = (r: ReferenceRecensee, cle: string, i: number) => contenuPourBase(BASE, r, cle, i);


const referencees: Array<{ cle: string; ou: string }> = [];
let orphelin = '';
let recent = '';
let horsFormat = '';
let espaceInconnu = '';

beforeAll(async () => {
  await semer(db, schema, ids);
  vi.stubGlobal('fetch', fauxBucket);
  etat.session = session(ids, 'ub', { role: 'admin' });

  // 1 · Bibliothèque · le VRAI dépôt direct, puis l'enregistrement relu.
  const pre = await presignAssetUploadAction({ filename: 'photo.png', contentType: 'image/png', sizeBytes: PNG.length });
  expect(pre.error).toBeUndefined();
  const cleBiblio = pre.publicUrl!.slice(BASE.length + 1);
  bucket.set(cleBiblio, { octets: PNG, le: VIEUX });
  expect(await registerUploadedAssetAction({ name: 'photo.png', url: pre.publicUrl!, mimeType: 'image/png', sizeBytes: PNG.length })).toEqual({ ok: true });
  referencees.push({ cle: cleBiblio, ou: 'assets.url · registerUploadedAssetAction' });

  // 2 · Logo de charte importé · dépôt de la Bibliothèque SANS ligne `assets`, puis la charte.
  const preLogo = await presignAssetUploadAction({ filename: 'logo.png', contentType: 'image/png', sizeBytes: PNG.length });
  const cleLogo = preLogo.publicUrl!.slice(BASE.length + 1);
  bucket.set(cleLogo, { octets: PNG, le: VIEUX });
  const charte = charteAvecLogoImporte({ logos: [], defaut: null }, preLogo.publicUrl!);
  expect(await saveBrandDAAction({ brandId: ids.brandB1, ...charte, colors: [], fonts: [] })).toEqual({ ok: true });
  referencees.push({ cle: cleLogo, ou: 'brands.logo_url · saveBrandDAAction' });
  vi.unstubAllGlobals();

  // 3 · Chaque autre référence recensée, dans sa vraie colonne.
  for (const [i, r] of RECENSEMENT_REFERENCES_STOCKAGE.entries()) {
    const cle = nouvelleCle(ids.wsB, `${r.table}-${r.colonne}.png`.replace(/_/g, '-'));
    bucket.set(cle, { octets: PNG, le: VIEUX });
    await semerDans(r, contenuPour(r, cle, i));
    referencees.push({ cle, ou: `${r.table}.${r.colonne}` });
  }

  // 4 · Les témoins · un vrai orphelin, un dépôt récent, une clé hors format, un espace inconnu.
  orphelin = nouvelleCle(ids.wsA, 'abandonne.mp4');
  bucket.set(orphelin, { octets: Buffer.alloc(4096, 1), le: VIEUX });
  recent = nouvelleCle(ids.wsA, 'en-cours.mp4');
  bucket.set(recent, { octets: Buffer.alloc(10), le: new Date(MAINTENANT.getTime() - DELAI_GRACE_ORPHELIN_MS / 2) });
  horsFormat = `assets/${ids.wsA}/sous-dossier/vieux.png`;
  bucket.set(horsFormat, { octets: Buffer.alloc(10), le: VIEUX });
  espaceInconnu = nouvelleCle(randomUUID(), 'espace-supprime.png');
  bucket.set(espaceInconnu, { octets: Buffer.alloc(10), le: VIEUX });
  bucket.set('assets/_healthcheck/temoin.txt', { octets: Buffer.alloc(3), le: VIEUX });
  bucket.set(`renders/${randomUUID()}/x.png`, { octets: Buffer.alloc(3), le: VIEUX });
});
beforeEach(() => { requetes.length = 0; vi.stubGlobal('fetch', fauxBucket); });
afterEach(() => { vi.unstubAllGlobals(); });

/**
 * Cliquet du recensement · une colonne ne SORT du recensement que par décision
 * (la retirer ici aussi) · sinon ses références disparaîtraient en silence et
 * leurs objets deviendraient candidats.
 */
const RECENSEES_ATTENDUES = [
  'assets.url', 'assets.thumb_url', 'brands.logo_url', 'brands.logos', 'studio_assets.storage_key',
  'users.avatar_url', 'workspaces.white_label_json', 'brands.brand_kit_json', 'scenarios.image_url', 'products.image_url', 'products.image_urls',
  'creatives.storage_url', 'creatives.thumb_url', 'library_ads.media_url', 'library_ads.storage_url', 'followed_brands.logo_url',
  'generations.asset_urls', 'generations.input_json', 'generations.output_json', 'adsmap_ads.asset_url', 'adsmap_ads.brief_url',
  'adsmap_ads.source_ref_json', 'adsmap_concepts.source_ref_json', 'briefs.content_json', 'saved_ads.snapshot_json',
  'brand_tracker_events.snapshot_json', 'studio_assets.legacy_ref', 'studio_projects.source_refs', 'studio_project_versions.content',
  'studio_jobs.snapshot', 'studio_jobs.result', 'agent_threads.messages_jsonb', 'jarvis_messages.content', 'app_settings.value',
];

describe('Stockage · inventaire des orphelins · vraie base, faux bucket', () => {
  it('le recensement garde chaque colonne attendue (cliquet · un retrait se décide ici)', () => {
    const ids = new Set(RECENSEMENT_REFERENCES_STOCKAGE.map((r) => `${r.table}.${r.colonne}`));
    expect(RECENSEES_ATTENDUES.filter((x) => !ids.has(x)), 'colonne retirée du recensement').toEqual([]);
  });

  it('toutes les colonnes recensées existent et se lisent entièrement', async () => {
    const refs = await lireReferencesStockage(db);
    expect(refs.lectures.filter((l) => !l.complete).map((l) => `${l.table}.${l.colonne} · ${l.erreur}`)).toEqual([]);
    expect(refs.complete).toBe(true);
  });

  it('un objet référencé par `assets`, par le logo de charte et par CHAQUE référence recensée n’est PAS candidat', async () => {
    const r = await chargerInventaireStockage({ maintenant: MAINTENANT });
    expect(r.etat).toBe('pret');
    if (r.etat !== 'pret') return;
    const refs = await lireReferencesStockage(db);
    const ctx = { maintenant: MAINTENANT, espaces: new Set([ids.wsA, ids.wsB]), references: refs.references, referencesCompletes: refs.complete };
    const nonVus = referencees.filter((x) => verdictObjetStocke({ cle: x.cle, taille: PNG.length, modifieLe: VIEUX }, ctx).motif !== 'reference').map((x) => x.ou);
    expect(nonVus, 'références non reconnues').toEqual([]);
    expect(referencees.length).toBe(RECENSEMENT_REFERENCES_STOCKAGE.length + 2);
    expect(r.inventaire.motifs.reference.nombre).toBe(referencees.length);
    const candidats = new Set(r.inventaire.plusGros.map((o) => o.cle));
    expect(referencees.filter((x) => candidats.has(x.cle)).map((x) => x.ou)).toEqual([]);
  });

  it('un vrai orphelin EST candidat · un récent, un hors format, un espace inconnu ne le sont pas', async () => {
    const r = await chargerInventaireStockage({ maintenant: MAINTENANT });
    if (r.etat !== 'pret') throw new Error(r.etat);
    expect(r.listeComplete).toBe(true);
    expect(r.inventaire.plusGros.map((o) => o.cle)).toEqual([orphelin]);
    expect(r.inventaire.candidats).toEqual({ nombre: 1, octets: 4096 });
    expect(r.inventaire.parEspace).toEqual([{ espace: ids.wsA, nombre: 1, octets: 4096 }]);
    expect(r.noms[ids.wsA]).toBe('Espace A');
    expect(r.inventaire.motifs.recent.nombre).toBe(1);
    expect(r.inventaire.motifs.hors_format.nombre).toBe(2); // sous-dossier + `_healthcheck`
    expect(r.inventaire.motifs.espace_inconnu.nombre).toBe(1);
    // `renders/` n'est pas sous le préfixe inventorié.
    expect(r.inventaire.objets.nombre).toBe(referencees.length + 5);
  });

  it('l’inventaire n’écrit ni ne supprime rien dans le bucket · une liste GET, rien d’autre', async () => {
    const avant = [...bucket.keys()].sort();
    await chargerInventaireStockage({ maintenant: MAINTENANT });
    expect(requetes).toEqual([{ methode: 'GET', liste: true }]);
    expect([...bucket.keys()].sort()).toEqual(avant);
  });

  it('une colonne illisible · lecture incomplète, et le vrai orphelin n’est plus compté (tout doute est un non)', async () => {
    const bancal: ReferenceRecensee = { table: 'assets', colonne: 'colonne_absente', forme: 'texte', nature: 'libre', ecrivains: [], note: 'test' };
    const refs = await lireReferencesStockage(db, [...RECENSEMENT_REFERENCES_STOCKAGE, bancal]);
    expect(refs.complete).toBe(false);
    const inv = inventaireOrphelins([{ cle: orphelin, taille: 4096, modifieLe: VIEUX }], {
      maintenant: MAINTENANT, espaces: new Set([ids.wsA]), references: refs.references, referencesCompletes: refs.complete,
    });
    expect(inv.candidats.nombre).toBe(0);
    expect(inv.motifs.references_incompletes.nombre).toBe(1);
  });

  it('une colonne au-delà de la borne · incomplète, pas tronquée en silence', async () => {
    const r = RECENSEMENT_REFERENCES_STOCKAGE.find((x) => x.table === 'assets' && x.colonne === 'url')!;
    const l = await lireColonne(db, r, 0);
    expect(l.lecture).toMatchObject({ complete: false, erreur: 'borne atteinte' });
  });

  it('le motif Postgres et le motif JavaScript du noyau extraient les mêmes fragments', async () => {
    for (const r of RECENSEMENT_REFERENCES_STOCKAGE.filter((x) => x.forme === 'json').slice(0, 3)) {
      const { fragments } = await lireColonne(db, r);
      const textes = lignes<{ t: string }>(await db.execute(sql.raw(`select "${r.colonne}"::text as t from "${r.table}" where "${r.colonne}"::text like '%assets/%'`)));
      const js = new Set(textes.flatMap((x) => referencesDansTexte(x.t)));
      expect(new Set(fragments), `${r.table}.${r.colonne}`).toEqual(js);
    }
  });
});
