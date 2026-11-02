import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Stockage · un dépôt dont l'écriture en base échoue est RETIRÉ · vraie base
 * (pglite + migrations du dépôt), FAUX S3 (PUT, HEAD, GET, DELETE), faux Drive
 * (module `google-drive` remplacé, le reste du connecteur est le vrai).
 *
 * L'échec d'écriture est un VRAI refus de Postgres · un déclencheur posé sur
 * `assets` (insertion et mise à jour) lève une exception tant que
 * `test.refus` vaut `on`. Pour chaque chemin `retrait_si_echec`
 * (`CHEMINS_DEPOT_PUIS_ECRITURE`), on lit ce qui SORT :
 *  - l'objet tout juste déposé n'existe plus dans le bucket ;
 *  - un objet PRÉEXISTANT au même endroit, cité par une ligne, est toujours là
 *    et n'a reçu aucun DELETE ;
 *  - l'erreur remonte comme avant (compteur, rejet, bilan) ;
 *  - le cas nominal (sans refus) dépose ET écrit, sans aucun DELETE.
 */
const etat = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  marque: '' as string,
  fichiers: [] as Array<{ id: string; name: string; mimeType: string; size?: number; webViewLink?: string; thumbnailLink?: string }>,
  cles: [] as string[],
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
const CFG = vi.hoisted(() => ({ endpoint: 's3.test', region: 'gra', bucket: 'bucket', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://cdn.exemple.test/bucket' }));
const PNG = vi.hoisted(() => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64'));
const JPEG = vi.hoisted(() => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => (etat.marque ? { id: etat.marque, name: 'Marque', workspaceId: etat.ids.wsA } : null) }));
// Le faux Drive · seul le module d'appel à Google est remplacé ; `syncDriveAssets`,
// `storeDriveThumb` et `putObject` sont les vrais.
vi.mock('../../../packages/integrations/src/google-drive', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  googleConfigured: () => true,
  drivePickerConfigured: () => true,
  googleAccessToken: async () => 'acces',
  driveListFilesDeep: async () => etat.fichiers,
  driveFileMeta: async (_t: string, id: string) => etat.fichiers.find((f) => f.id === id)!,
  driveDownload: async () => PNG,
  driveThumbnailLink: async (_t: string, id: string) => `https://vignette.drive.test/${id}`,
  driveThumbBytes: async () => JPEG,
}));
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  return {
    ...actual,
    storageFromEnv: () => CFG,
    decryptSecret: (v: unknown) => (v ? 'jeton-de-rafraichissement' : ''),
    // Une clé imposée par le test (objet préexistant au même endroit), sinon la vraie.
    newAssetKey: (ws: string, nom: string) => etat.cles.shift() ?? actual.newAssetKey(ws, nom),
  };
});

import { and, eq } from 'drizzle-orm';
import { db, schema, sql, lireReferencesObjet } from '@tiktrends/db';
import { RECENSEMENT_REFERENCES_STOCKAGE, TEXTES_REFUS_JETON_FICHIER, formesRechercheesObjet, type ReferenceRecensee } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { contenuPour, semerDans } from './helpers/semer-reference';
import { syncDriveFilesAction, syncDriveNowAction } from '../app/actions/drive';
import { migrateEmbeddedImagesAction } from '../app/actions/storage';
import { presignAssetUploadAction, registerUploadedAssetAction } from '../app/actions/assets';
import { cleDuLienDepot } from './helpers/depot-jeton';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const ids = etat.ids;
const WS = ids.wsA;
const BASE = CFG.publicBaseUrl;
const url = (cle: string) => `${BASE}/${cle}`;
const cleDrive = (id: string, ext = 'png') => `assets/${WS}/drive-${id}.${ext}`;
const cleVignette = (id: string) => `assets/${WS}/drive-${id}-thumb.jpg`;
const ANCIEN = Buffer.from('octets-preexistants');

/* ───────────── Le faux bucket · PUT, HEAD, GET (plage), DELETE ───────────── */

const bucket = new Map<string, Buffer>();
const supprimes: string[] = [];
const deposes: string[] = [];

async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  const methode = init?.method ?? 'GET';
  const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  if (methode === 'PUT') { bucket.set(cle, Buffer.from(init!.body as Uint8Array)); deposes.push(cle); return new Response(null, { status: 200 }); }
  if (methode === 'DELETE') { supprimes.push(cle); bucket.delete(cle); return new Response(null, { status: 204 }); }
  const o = bucket.get(cle);
  if (methode === 'HEAD') return o ? new Response(null, { status: 200, headers: { 'content-length': String(o.length) } }) : new Response(null, { status: 404 });
  if (!o) return new Response('NoSuchKey', { status: 404 });
  const m = /^bytes=0-(\d+)$/.exec(new Headers(init?.headers).get('range') ?? '');
  const fin = m ? Math.min(o.length, Number(m[1]) + 1) : o.length;
  return m
    ? new Response(new Uint8Array(o.subarray(0, fin)), { status: 206, headers: { 'content-range': `bytes 0-${fin - 1}/${o.length}` } })
    : new Response(new Uint8Array(o), { status: 200, headers: { 'content-length': String(o.length) } });
}

/* ───────────── Le refus d'écriture · un vrai refus de Postgres ───────────── */

async function poserRefus() {
  await db.execute(sql.raw(`
    create or replace function refus_ecriture_test() returns trigger language plpgsql as $$
    begin
      if current_setting('test.refus', true) = 'on' then raise exception 'écriture refusée (test)'; end if;
      -- « silence » · la ligne n'est pas écrite, SANS erreur (comme une ligne disparue entre-temps).
      if current_setting('test.refus', true) = 'silence' then return null; end if;
      return new;
    end $$`));
  await db.execute(sql.raw('create trigger refus_ecriture_test before insert or update on assets for each row execute function refus_ecriture_test()'));
}
const refuser = async (oui: boolean | 'silence') => { await db.execute(sql.raw(`set test.refus = '${oui === 'silence' ? 'silence' : oui ? 'on' : 'off'}'`)); };

const lignesAssets = (marque: string) => db.select({ url: schema.assets.url, thumbUrl: schema.assets.thumbUrl, externalId: schema.assets.externalId })
  .from(schema.assets).where(and(eq(schema.assets.workspaceId, WS), eq(schema.assets.brandId, marque)));

beforeAll(async () => {
  await semer(db, schema, ids);
  await poserRefus();
  etat.session = session(ids, 'ua', { role: 'admin' });
  // Les deux marques de l'espace sont branchées sur Drive.
  await db.update(schema.brands).set({ driveRefreshToken: 'chiffre', driveFolderId: 'dossier' }).where(eq(schema.brands.workspaceId, WS));
  // Un fichier Drive DÉJÀ synchronisé par la marque A1 · copie et vignette à elle, dans le bucket.
  for (const id of ['partage', 'partage-picker']) {
    bucket.set(cleDrive(id), ANCIEN);
    bucket.set(cleVignette(id), ANCIEN);
    await db.insert(schema.assets).values({ workspaceId: WS, brandId: ids.brandA1, name: id, kind: 'image', source: 'drive', url: url(cleDrive(id)), thumbUrl: url(cleVignette(id)), externalId: id, mimeType: 'image/png' });
  }
});
beforeEach(async () => {
  supprimes.length = 0; deposes.length = 0; etat.cles = []; etat.marque = ids.brandA2;
  vi.stubGlobal('fetch', fauxBucket);
  await refuser(false);
});
afterEach(async () => { vi.unstubAllGlobals(); await refuser(false); });

const fichier = (id: string) => ({ id, name: `${id}.png`, mimeType: 'image/png', size: PNG.length, webViewLink: `https://drive.google.com/file/d/${id}/view` });

describe('Synchro de dossier Drive (site · `syncDriveNowAction` → `syncDriveAssets`)', () => {
  it('insertion refusée · la copie et la vignette du fichier neuf sont retirées ; celles partagées avec A1 restent ; l’erreur est comptée', async () => {
    etat.fichiers = [fichier('partage'), fichier('neuf')];
    await refuser(true);
    const r = await syncDriveNowAction();
    expect(r).toMatchObject({ ok: true, added: 0, errors: 2 });
    // Les quatre dépôts ont bien eu lieu, avant le refus.
    expect(deposes.sort()).toEqual([cleDrive('neuf'), cleVignette('neuf'), cleDrive('partage'), cleVignette('partage')].sort());
    expect(bucket.has(cleDrive('neuf')), 'copie neuve restée sans ligne').toBe(false);
    expect(bucket.has(cleVignette('neuf')), 'vignette neuve restée sans ligne').toBe(false);
    expect(bucket.has(cleDrive('partage')), 'copie de A1 retirée').toBe(true);
    expect(bucket.has(cleVignette('partage')), 'vignette de A1 retirée').toBe(true);
    expect(supprimes.sort()).toEqual([cleDrive('neuf'), cleVignette('neuf')].sort());
    expect(await lignesAssets(ids.brandA2)).toEqual([]);
    expect((await lignesAssets(ids.brandA1)).map((l) => l.externalId).sort()).toEqual(['partage', 'partage-picker']);
  });

  it('nominal · les deux fichiers sont déposés ET enregistrés, aucun DELETE', async () => {
    etat.fichiers = [fichier('partage'), fichier('neuf')];
    const r = await syncDriveNowAction();
    expect(r).toMatchObject({ ok: true, added: 2, errors: 0 });
    expect(supprimes).toEqual([]);
    expect(bucket.has(cleDrive('neuf')) && bucket.has(cleVignette('neuf'))).toBe(true);
    const a2 = await lignesAssets(ids.brandA2);
    expect(a2.map((l) => [l.externalId, l.url, l.thumbUrl]).sort()).toEqual([
      ['neuf', url(cleDrive('neuf')), url(cleVignette('neuf'))],
      ['partage', url(cleDrive('partage')), url(cleVignette('partage'))],
    ]);
  });
});

describe('Import Drive par le sélecteur (`syncDriveFilesAction`)', () => {
  it('insertion refusée · le fichier neuf est retiré, celui partagé avec A1 reste ; les deux sont comptés ignorés', async () => {
    etat.marque = ids.brandA2;
    etat.fichiers = [fichier('partage-picker'), fichier('neuf-picker')];
    await refuser(true);
    const r = await syncDriveFilesAction(etat.fichiers.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })));
    expect(r).toEqual({ ok: true, added: 0, skipped: 2 });
    expect(deposes).toContain(cleDrive('neuf-picker'));
    expect(bucket.has(cleDrive('neuf-picker'))).toBe(false);
    expect(bucket.has(cleVignette('neuf-picker'))).toBe(false);
    expect(bucket.has(cleDrive('partage-picker'))).toBe(true);
    expect(bucket.has(cleVignette('partage-picker'))).toBe(true);
    expect(supprimes.sort()).toEqual([cleDrive('neuf-picker'), cleVignette('neuf-picker')].sort());
    expect((await lignesAssets(ids.brandA2)).filter((l) => l.externalId?.endsWith('-picker'))).toEqual([]);
  });

  it('nominal · déposé ET enregistré, aucun DELETE', async () => {
    etat.fichiers = [fichier('partage-picker'), fichier('neuf-picker')];
    const r = await syncDriveFilesAction(etat.fichiers.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })));
    expect(r).toEqual({ ok: true, added: 2, skipped: 0 });
    expect(supprimes).toEqual([]);
    expect(bucket.has(cleDrive('neuf-picker'))).toBe(true);
    expect((await lignesAssets(ids.brandA2)).filter((l) => l.externalId?.endsWith('-picker')).map((l) => l.url).sort())
      .toEqual([url(cleDrive('neuf-picker')), url(cleDrive('partage-picker'))]);
  });
});

describe('Migration des images embarquées (`migrateEmbeddedImagesAction`)', () => {
  const dataUri = `data:image/png;base64,${PNG.toString('base64')}`;
  let embarquee = '';
  beforeAll(async () => {
    const [a] = await db.insert(schema.assets).values({ workspaceId: WS, brandId: ids.brandA1, name: 'embarquee.png', kind: 'image', source: 'upload', url: dataUri }).returning({ id: schema.assets.id });
    embarquee = a!.id;
  });
  const ligne = async () => (await db.select({ url: schema.assets.url }).from(schema.assets).where(eq(schema.assets.id, embarquee)))[0]!.url;

  it('réécriture refusée · l’objet neuf est retiré, la ligne garde son image', async () => {
    await refuser(true);
    const r = await migrateEmbeddedImagesAction();
    expect(r.error).toBeUndefined();
    expect(r.migrees).toBe(0);
    expect(deposes).toHaveLength(1);
    expect(bucket.has(deposes[0]!), 'objet migré resté sans ligne').toBe(false);
    expect(supprimes).toEqual(deposes);
    expect(await ligne()).toBe(dataUri);
  });

  it('ligne non réécrite SANS erreur (disparue entre-temps) · l’objet neuf est retiré aussi', async () => {
    await refuser('silence');
    const r = await migrateEmbeddedImagesAction();
    expect(r.migrees).toBe(0);
    expect(deposes).toHaveLength(1);
    expect(bucket.has(deposes[0]!), 'objet migré resté sans ligne').toBe(false);
    expect(supprimes).toEqual(deposes);
    expect(await ligne()).toBe(dataUri);
  });

  it('réécriture refusée sur une clé DÉJÀ citée par une ligne · l’objet préexistant reste, aucun DELETE', async () => {
    const cle = `assets/${WS}/1700000000000-deja-cite.png`;
    bucket.set(cle, ANCIEN);
    await db.insert(schema.assets).values({ workspaceId: WS, brandId: ids.brandA1, name: 'deja', kind: 'image', source: 'upload', url: url(cle) });
    etat.cles = [cle];
    await refuser(true);
    const r = await migrateEmbeddedImagesAction();
    expect(r.migrees).toBe(0);
    expect(deposes).toEqual([cle]);
    expect(bucket.has(cle)).toBe(true);
    expect(supprimes).toEqual([]);
    expect(await ligne()).toBe(dataUri);
  });

  it('nominal · l’image passe dans le bucket et la ligne pointe l’objet, aucun DELETE', async () => {
    const r = await migrateEmbeddedImagesAction();
    expect(r.migrees).toBe(1);
    expect(supprimes).toEqual([]);
    expect(deposes).toHaveLength(1);
    expect(bucket.get(deposes[0]!)?.equals(PNG)).toBe(true);
    expect(await ligne()).toBe(url(deposes[0]!));
  });
});

describe('Téléversement direct (`registerUploadedAssetAction`)', () => {
  /** Le vrai lien de dépôt, puis le PUT du navigateur (simulé dans le bucket). */
  /** Le jeton opaque de chaque dépôt, par son adresse canonique (que le test lit en base). */
  const jetons = new Map<string, string>();
  async function deposer(nom: string): Promise<string> {
    const pre = await presignAssetUploadAction({ filename: nom, contentType: 'image/png', sizeBytes: PNG.length, usage: 'envoi' });
    expect(pre.error).toBeUndefined();
    const cle = cleDuLienDepot(pre.uploadUrl!, CFG.bucket);
    bucket.set(cle, PNG);
    jetons.set(`${BASE}/${cle}`, pre.jetonDepot!);
    return `${BASE}/${cle}`;
  }
  const enregistrer = (u: string) => registerUploadedAssetAction({ name: 'photo.png', jetonDepot: jetons.get(u)!, mimeType: 'image/png', sizeBytes: PNG.length });
  const nb = async (u: string) => (await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.url, u))).length;

  it('insertion refusée · l’erreur remonte (rejet) et l’objet déposé est retiré', async () => {
    const u = await deposer('neuve.png');
    await refuser(true);
    await expect(enregistrer(u)).rejects.toThrow(/écriture refusée/);
    expect(bucket.has(u.slice(BASE.length + 1))).toBe(false);
    expect(supprimes).toEqual([u.slice(BASE.length + 1)]);
    expect(await nb(u)).toBe(0);
  });

  it('insertion refusée pour un objet DÉJÀ cité ailleurs (logo d’une marque) · l’erreur remonte, l’objet reste, aucun DELETE', async () => {
    const u = await deposer('deja.png');
    await db.update(schema.brands).set({ logoUrl: u }).where(eq(schema.brands.id, ids.brandA2));
    await refuser(true);
    await expect(enregistrer(u)).rejects.toThrow(/écriture refusée/);
    expect(bucket.has(u.slice(BASE.length + 1))).toBe(true);
    expect(supprimes).toEqual([]);
    expect(await nb(u)).toBe(0);
    await refuser(false);
    await db.update(schema.brands).set({ logoUrl: null }).where(eq(schema.brands.id, ids.brandA2));
  });

  it('jeton rejoué pour un objet DÉJÀ enregistré · refusé « déjà enregistré », l’objet reste, aucun DELETE, une seule ligne', async () => {
    const u = await deposer('rejoue.png');
    expect(await enregistrer(u)).toEqual({ ok: true });
    supprimes.length = 0;
    expect(await enregistrer(u)).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.deja_employe });
    expect(bucket.has(u.slice(BASE.length + 1))).toBe(true);
    expect(supprimes).toEqual([]);
    expect(await nb(u)).toBe(1);
  });

  it('nominal · la ligne est écrite, l’objet reste, aucun DELETE', async () => {
    const u = await deposer('nominale.png');
    expect(await enregistrer(u)).toEqual({ ok: true });
    expect(bucket.has(u.slice(BASE.length + 1))).toBe(true);
    expect(supprimes).toEqual([]);
    expect(await nb(u)).toBe(1);
  });
});

describe('Lecture des références avant retrait (`lireReferencesObjet` sur le recensement)', () => {
  let n = 0;
  const nouvelleCle = (nom: string) => `assets/${ids.wsB}/${1_800_000_000_000 + ++n}-rr${n}-${nom}`;
  const lire = (cle: string, colonnes: readonly ReferenceRecensee[] = RECENSEMENT_REFERENCES_STOCKAGE) => lireReferencesObjet(db, colonnes, formesRechercheesObjet(cle));

  it('une référence dans CHAQUE colonne recensée, sous sa forme (texte, tableau, JSON, encodée, clé brute), garde l’objet', async () => {
    const nonVues: string[] = [];
    for (const [i, r] of RECENSEMENT_REFERENCES_STOCKAGE.entries()) {
      const cle = nouvelleCle(`${r.table}-${r.colonne}.png`.replace(/_/g, '-'));
      expect(await lire(cle), `${r.table}.${r.colonne} avant semis`).toBe('aucune');
      await semerDans(db, sql, r, contenuPour(BASE, r, cle, i));
      if (await lire(cle) !== 'referencee') nonVues.push(`${r.table}.${r.colonne}`);
    }
    expect(nonVues, 'colonnes dont la référence n’est pas vue').toEqual([]);
  });

  it('une clé que rien ne cite · `aucune` ; une colonne illisible · `inconnue` (le doute garde l’objet)', async () => {
    const cle = nouvelleCle('personne.png');
    expect(await lire(cle)).toBe('aucune');
    const bancal: ReferenceRecensee = { table: 'assets', colonne: 'colonne_absente', forme: 'texte', nature: 'libre', ecrivains: [], note: 'test' };
    expect(await lire(cle, [...RECENSEMENT_REFERENCES_STOCKAGE, bancal])).toBe('inconnue');
    expect(await lireReferencesObjet(db, RECENSEMENT_REFERENCES_STOCKAGE, [])).toBe('inconnue');
  });

  it('une clé voisine (préfixe commun) n’est pas confondue · seule la sous-chaîne exacte compte', async () => {
    const cle = nouvelleCle('voisin.png');
    const r = RECENSEMENT_REFERENCES_STOCKAGE.find((x) => x.table === 'assets' && x.colonne === 'url')!;
    await semerDans(db, sql, r, url(`${cle}.bak`));
    expect(await lire(`${cle}.bak`)).toBe('referencee');
    // `voisin.png` est un préfixe de `voisin.png.bak` · une citation de trop GARDE l'objet, jamais l'inverse.
    expect(await lire(cle)).toBe('referencee');
    expect(await lire(nouvelleCle('autre.png'))).toBe('aucune');
  });
});
