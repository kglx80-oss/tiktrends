import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · « Remplacer » un fichier · `remplacerAssetAction` sur une
 * VRAIE base (pglite + migrations du dépôt), VRAI lecteur
 * (`lireDebutObjetEspace`, liens signés) face à un faux bucket qui sert de
 * vrais octets (PNG, JPEG, MP4, HTML) et répond comme S3 (`HEAD`, `GET` avec
 * `Range`, `ETag` = MD5, `If-Match`, `DELETE`).
 *
 * On lit ce qui SORT · la MÊME ligne relue en base (adresse, type relu,
 * taille relue, empreinte, vignette vidée, le reste intact), l'ancien objet
 * toujours dans le bucket, le nouvel objet retiré à chaque refus et à chaque
 * échec d'écriture (un vrai refus de Postgres, par déclencheur), et la
 * référence Studios `bib_<id>` qui relit la NOUVELLE adresse.
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

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema, sql } from '@tiktrends/db';
import { MESSAGES_REFUS_RELU, REFUS_REMPLACEMENT, TEXTES_REFUS_JETON_FICHIER, refusFamilleRemplacement, verdictConsigne, type ConsigneImagePersistee, type UsageDepot } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { registerUploadedAssetAction, remplacerAssetAction, listAssets } from '../app/actions/assets';
import { referencesObjetEnBase } from '../lib/references-objet';
import { resoudreReferencesImage } from '../lib/studios/image/references';
import { hacherImage } from '../lib/studios/produit/catalogue';
import { mp4StructurePlausible } from '../../../packages/core/test/l3-fixtures-media';
import { jetonScelle } from './helpers/depot-jeton';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ids = etat.ids;
const BASE = CFG.publicBaseUrl;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');
const JPEG = Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAYDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAFWX/9k=', 'base64');
const MP4 = Buffer.from(mp4StructurePlausible({ largeur: 288, hauteur: 512, echantillons: [100], donnees: 256 }));
const HTML = Buffer.from('<!doctype html><html><body><script>fetch("/api/vol?c="+document.cookie)</script></body></html>');

/* ───────────── Le faux bucket · répond comme S3 sur l'hôte configuré ───────────── */

const bucket = new Map<string, Buffer>();
const supprimes: string[] = [];
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  const methode = init?.method ?? 'GET';
  const h = new Headers(init?.headers);
  const prefixe = `/${CFG.bucket}/`;
  const cle = u.pathname.startsWith(prefixe) ? decodeURIComponent(u.pathname.slice(prefixe.length)) : '';
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  const corps = bucket.get(cle);
  if (methode === 'DELETE') { supprimes.push(cle); bucket.delete(cle); return new Response(null, { status: 204 }); }
  if (methode === 'HEAD') return corps ? new Response(null, { status: 200, headers: { 'content-length': String(corps.length), etag: `"${md5(corps)}"` } }) : new Response(null, { status: 404 });
  if (!corps) return new Response('NoSuchKey', { status: 404 });
  const ifMatch = h.get('if-match');
  if (ifMatch !== null && ifMatch !== `"${md5(corps)}"`) return new Response('PreconditionFailed', { status: 412 });
  const m = /^bytes=0-(\d+)$/.exec(h.get('range') ?? '');
  const fin = m ? Math.min(corps.length, Number(m[1]) + 1) : corps.length;
  return m
    ? new Response(new Uint8Array(corps.subarray(0, fin)), { status: 206, headers: { 'content-range': `bytes 0-${fin - 1}/${corps.length}`, etag: `"${md5(corps)}"` } })
    : new Response(new Uint8Array(corps), { status: 200, headers: { 'content-length': String(corps.length), etag: `"${md5(corps)}"` } });
}

/* ──────────────────────────────── Outils ──────────────────────────────── */

let n = 0;
/**
 * Dépose des octets chez l'espace `ws` · l'adresse canonique (pour lire la
 * ligne) et le JETON scellé du dépôt, celui que `presignAssetUploadAction`
 * rendrait à un membre de cet espace pour `usage` (remplacement par défaut).
 */
function deposer(ws: string, nom: string, octets: Buffer, usage: UsageDepot = 'remplacement'): { url: string; cle: string; jeton: string } {
  const cle = `assets/${ws}/${1_700_000_000_000 + ++n}-rp${n}-${nom}`;
  bucket.set(cle, octets);
  return { url: `${BASE}/${cle}`, cle, jeton: jetonScelle({ espace: ws, utilisateur: ws === ids.wsB ? ids.ub : ids.ua, usage, cle }) };
}
const ligneId = async (id: string) => (await db.select().from(schema.assets).where(eq(schema.assets.id, id)))[0]!;
const nAssets = async () => (await db.select({ id: schema.assets.id }).from(schema.assets)).length;

/** Un fichier téléversé par le VRAI chemin de la Bibliothèque, puis rangé et réglé comme un fichier vivant. */
async function televerse(nom: string, octets: Buffer, type: string): Promise<{ id: string; url: string; cle: string }> {
  const { url, cle, jeton } = deposer(ids.wsB, nom, octets, 'envoi');
  expect(await registerUploadedAssetAction({ name: nom, jetonDepot: jeton, mimeType: type, sizeBytes: octets.length })).toEqual({ ok: true });
  const [l] = await db.select().from(schema.assets).where(eq(schema.assets.url, url));
  await db.update(schema.assets).set({ rights: 'photo_marque', useForAi: false, tags: ['flacon'], thumbUrl: `${BASE}/assets/${ids.wsB}/vignette-${n}.jpg` }).where(eq(schema.assets.id, l!.id));
  return { id: l!.id, url, cle };
}

/* ───────────── Le refus d'écriture · un vrai refus de Postgres ───────────── */

async function poserRefus() {
  await db.execute(sql.raw(`
    create or replace function refus_remplacement_test() returns trigger language plpgsql as $$
    begin
      if current_setting('test.remplacer', true) = 'on' then raise exception 'écriture refusée (test)'; end if;
      if current_setting('test.remplacer', true) = 'silence' then return null; end if;
      return new;
    end $$`));
  await db.execute(sql.raw('create trigger refus_remplacement_test before update on assets for each row execute function refus_remplacement_test()'));
}
const refuser = async (v: 'on' | 'off' | 'silence') => { await db.execute(sql.raw(`set test.remplacer = '${v}'`)); };

beforeAll(async () => { await semer(db, schema, ids); await poserRefus(); });
beforeEach(async () => {
  supprimes.length = 0;
  vi.stubGlobal('fetch', fauxBucket);
  etat.session = session(ids, 'ub');
  await refuser('off');
});
afterEach(() => { vi.unstubAllGlobals(); });

/* ──────────────────────────────── Gardes ──────────────────────────────── */

describe('remplacerAssetAction · la MÊME ligne porte la nouvelle version', () => {
  it('un PNG remplacé par un JPEG · même id, adresse, type RELU, taille RELUE et empreinte nouvelles, vignette vidée, le reste intact, l’ancien objet gardé', async () => {
    const f = await televerse('face.png', PNG, 'image/png');
    const avant = await ligneId(f.id);
    const total = await nAssets();
    const neuf = deposer(ids.wsB, 'face-v2.jpg', JPEG);
    // Le type DÉCLARÉ est faux · seul le type relu compte.
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: neuf.jeton, mimeType: 'image/png' })).toEqual({ ok: true });
    const apres = await ligneId(f.id);
    expect({ url: apres.url, type: apres.mimeType, taille: apres.sizeBytes, empreinte: apres.objectEtag, vignette: apres.thumbUrl, kind: apres.kind })
      .toEqual({ url: neuf.url, type: 'image/jpeg', taille: JPEG.length, empreinte: md5(JPEG), vignette: null, kind: 'image' });
    expect({ ...apres, url: avant.url, mimeType: avant.mimeType, sizeBytes: avant.sizeBytes, objectEtag: avant.objectEtag, thumbUrl: avant.thumbUrl }, 'une autre colonne a changé').toEqual(avant);
    expect(await nAssets(), 'une ligne a été créée ou supprimée').toBe(total);
    expect([bucket.has(f.cle), bucket.has(neuf.cle), supprimes], 'un objet a été effacé').toEqual([true, true, []]);
    // L'ancien objet n'est plus cité · candidat de l'inventaire des orphelins, jamais effacé ici.
    expect([await referencesObjetEnBase(f.cle), await referencesObjetEnBase(neuf.cle)]).toEqual(['aucune', 'referencee']);
  });

  it('l’adresse servie change avec l’objet · l’image affichée n’est pas reprise du cache', async () => {
    const f = await televerse('dos.png', PNG, 'image/png');
    const lire = async () => (await listAssets({ id: f.id }))[0]!;
    const avant = await lire();
    const neuf = deposer(ids.wsB, 'dos-v2.jpg', JPEG);
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: neuf.jeton, mimeType: 'image/jpeg' })).toEqual({ ok: true });
    const apres = await lire();
    expect([avant.url.startsWith(`/api/asset/${f.id}?`), apres.url.startsWith(`/api/asset/${f.id}?`), apres.url !== avant.url, apres.contenu]).toEqual([true, true, true, 'stockage']);
  });

  it('une vidéo remplacée par une vidéo · acceptée', async () => {
    const f = await televerse('rush.mp4', MP4, 'video/mp4');
    const neuf = deposer(ids.wsB, 'rush-v2.mp4', Buffer.from(mp4StructurePlausible({ largeur: 512, hauteur: 288, echantillons: [100], donnees: 300 })));
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: neuf.jeton, mimeType: 'video/mp4' })).toEqual({ ok: true });
    expect((await ligneId(f.id)).url).toBe(neuf.url);
  });
});

describe('remplacerAssetAction · refus, la ligne intacte, le NOUVEL objet retiré, l’ancien gardé', () => {
  it('autre famille (image ← vidéo) · refusé avec la phrase des deux familles', async () => {
    const f = await televerse('photo.png', PNG, 'image/png');
    const avant = await ligneId(f.id);
    const neuf = deposer(ids.wsB, 'clip.mp4', MP4);
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: neuf.jeton, mimeType: 'video/mp4' })).toEqual({ error: refusFamilleRemplacement('image', 'video') });
    expect(await ligneId(f.id)).toEqual(avant);
    expect([bucket.has(neuf.cle), bucket.has(f.cle), supprimes]).toEqual([false, true, [neuf.cle]]);
  });

  it('du HTML déguisé en PNG · refusé à la relecture, retiré', async () => {
    const f = await televerse('logo.png', PNG, 'image/png');
    const avant = await ligneId(f.id);
    const neuf = deposer(ids.wsB, 'logo-v2.png', HTML);
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: neuf.jeton, mimeType: 'image/png' })).toEqual({ error: MESSAGES_REFUS_RELU.balisage });
    expect(await ligneId(f.id)).toEqual(avant);
    expect([bucket.has(neuf.cle), bucket.has(f.cle)]).toEqual([false, true]);
  });

  it('un fichier d’un AUTRE espace · « introuvable », sa ligne intacte, le dépôt retiré', async () => {
    const [autre] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, name: 'secret', kind: 'image', source: 'upload', url: `${BASE}/assets/${ids.wsA}/1-zz-secret.png`, mimeType: 'image/png' }).returning();
    const neuf = deposer(ids.wsB, 'vol.png', PNG);
    expect(await remplacerAssetAction({ id: autre!.id, jetonDepot: neuf.jeton, mimeType: 'image/png' })).toEqual({ error: REFUS_REMPLACEMENT.introuvable });
    expect(await ligneId(autre!.id)).toEqual(autre);
    expect(bucket.has(neuf.cle)).toBe(false);
  });

  it('un fichier en CORBEILLE · « introuvable », rien n’est écrit, le dépôt retiré', async () => {
    const f = await televerse('jete.png', PNG, 'image/png');
    await db.update(schema.assets).set({ deletedAt: new Date() }).where(eq(schema.assets.id, f.id));
    const avant = await ligneId(f.id);
    const neuf = deposer(ids.wsB, 'jete-v2.png', PNG);
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: neuf.jeton, mimeType: 'image/png' })).toEqual({ error: REFUS_REMPLACEMENT.introuvable });
    expect(await ligneId(f.id)).toEqual(avant);
    expect([bucket.has(neuf.cle), bucket.has(f.cle)]).toEqual([false, true]);
  });

  it('Drive et image gardée en base · refusés avec leur phrase, rien n’est écrit', async () => {
    const [drive] = await db.insert(schema.assets).values({ workspaceId: ids.wsB, name: 'drive', kind: 'image', source: 'drive', url: `${BASE}/assets/${ids.wsB}/drive-abc.png`, externalId: 'abc', mimeType: 'image/png' }).returning();
    const [enBase] = await db.insert(schema.assets).values({ workspaceId: ids.wsB, name: 'base', kind: 'image', source: 'upload', url: `data:image/png;base64,${PNG.toString('base64')}`, mimeType: 'image/png' }).returning();
    for (const [l, phrase] of [[drive!, REFUS_REMPLACEMENT.drive], [enBase!, REFUS_REMPLACEMENT.base]] as const) {
      const neuf = deposer(ids.wsB, 'nv.png', PNG);
      expect(await remplacerAssetAction({ id: l.id, jetonDepot: neuf.jeton, mimeType: 'image/png' })).toEqual({ error: phrase });
      expect(await ligneId(l.id)).toEqual(l);
      expect(bucket.has(neuf.cle)).toBe(false);
    }
  });

  it('un dépôt déjà cité par une autre ligne · refusé, et l’objet cité n’est PAS effacé', async () => {
    const a = await televerse('a.png', PNG, 'image/png');
    const b = await televerse('b.png', PNG, 'image/png');
    const avant = await ligneId(a.id);
    // Un jeton de REMPLACEMENT qui désignerait l'objet de b (déjà cité par sa ligne).
    const jetonB = jetonScelle({ espace: ids.wsB, utilisateur: ids.ub, usage: 'remplacement', cle: b.cle });
    expect(await remplacerAssetAction({ id: a.id, jetonDepot: jetonB, mimeType: 'image/png' })).toEqual({ error: REFUS_REMPLACEMENT.dejaEnregistre });
    expect(await ligneId(a.id)).toEqual(avant);
    expect([bucket.has(a.cle), bucket.has(b.cle), supprimes]).toEqual([true, true, []]);
  });

  it('un dépôt hors de l’espace · refusé, rien n’est lu ni effacé', async () => {
    const f = await televerse('c.png', PNG, 'image/png');
    const ailleurs = deposer(ids.wsA, 'x.png', PNG);
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: ailleurs.jeton, mimeType: 'image/png' })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.autre_espace });
    // Le jeton d'envoi de la Bibliothèque ne remplace rien · un autre usage.
    const envoi = deposer(ids.wsB, 'y.png', PNG, 'envoi');
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: envoi.jeton, mimeType: 'image/png' })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.autre_usage });
    expect([bucket.has(ailleurs.cle), supprimes]).toEqual([true, []]);
  });

  it('l’écriture échoue (refus de Postgres, ou ligne disparue) · l’erreur remonte ou se dit, la ligne intacte, le NOUVEL objet retiré', async () => {
    const f = await televerse('d.png', PNG, 'image/png');
    const avant = await ligneId(f.id);
    const neuf = deposer(ids.wsB, 'd-v2.jpg', JPEG);
    await refuser('on');
    await expect(remplacerAssetAction({ id: f.id, jetonDepot: neuf.jeton, mimeType: 'image/jpeg' })).rejects.toThrow(/écriture refusée/);
    await refuser('off');
    expect([await ligneId(f.id), bucket.has(neuf.cle), bucket.has(f.cle)]).toEqual([avant, false, true]);
    const neuf2 = deposer(ids.wsB, 'd-v3.jpg', JPEG);
    await refuser('silence');
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: neuf2.jeton, mimeType: 'image/jpeg' })).toEqual({ error: REFUS_REMPLACEMENT.introuvable });
    await refuser('off');
    expect([await ligneId(f.id), bucket.has(neuf2.cle)]).toEqual([avant, false]);
  });
});

describe('Studios · la référence `bib_<id>` relit la NOUVELLE version', () => {
  it('résolue sur la nouvelle adresse · une consigne compilée sur l’ancienne est « modifiée », rien n’est substitué', async () => {
    const f = await televerse('produit.png', PNG, 'image/png');
    const portee = { workspaceId: ids.wsB, brandId: ids.brandB1 };
    const ref = `bib_${f.id}`;
    const avant = (await resoudreReferencesImage(db as never, portee, [ref])).get(ref)!;
    expect(avant).toMatchObject({ etat: 'present', sha256: hacherImage(f.url).sha256 });
    const neuf = deposer(ids.wsB, 'produit-v2.jpg', JPEG);
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: neuf.jeton, mimeType: 'image/jpeg' })).toEqual({ ok: true });
    const apres = (await resoudreReferencesImage(db as never, portee, [ref])).get(ref)!;
    expect(apres).toMatchObject({ etat: 'present', sha256: hacherImage(neuf.url).sha256 });
    expect(apres.etat === 'present' && avant.etat === 'present' && apres.sha256 !== avant.sha256).toBe(true);
    if (avant.etat !== 'present') throw new Error('référence absente');
    const consigne = { entrees: 'e', references: [{ assetId: ref, assetVersion: avant.assetVersion, sha256: avant.sha256, role: 'style' }] } as unknown as ConsigneImagePersistee;
    const v = verdictConsigne({ consigne, attestee: true, entreesCourantes: 'e', resolutions: new Map([[ref, apres]]) });
    expect(v).toMatchObject({ ok: false, cause: 'reference_modifiee', cibles: [ref] });
  });
});
