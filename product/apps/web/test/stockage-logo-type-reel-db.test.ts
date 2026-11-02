import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Stockage · un logo importé est RELU avant de devenir logo · vraie base
 * (pglite + migrations du dépôt), FAUX S3 qui sert de VRAIS octets (HEAD,
 * GET + Range, DELETE), les VRAIES actions : `presignAssetUploadAction` (jeton
 * signé avec type et taille) puis `saveBrandDAAction`.
 *
 * On lit ce qui SORT · la réponse de l'action, la charte relue en base, le
 * contenu du bucket et les requêtes reçues :
 *  - un PNG conforme au jeton · enregistré, rien retiré ;
 *  - un PDF, un MP4, du HTML déposés par un présigné « image/png » · refusés,
 *    la charte intacte, l'objet retiré ;
 *  - une taille relue au-delà de 4 Mo · refusée, retirée ;
 *  - un jeton d'un autre type que le contenu (JPEG annoncé, vidéo annoncée) ·
 *    refusé, retiré ; une taille relue autre que la signée · refusée, retirée ;
 *  - un objet cité par une autre marque · refusé, jamais retiré ;
 *  - logos déjà en base, adresse externe `https:` · aucune relecture.
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

import { db, schema, eq } from '@tiktrends/db';
import { MESSAGES_REFUS_LOGO_RELU, MESSAGES_RELECTURE_DEPOT, LOGO_DEPOSE, TEXTES_REFUS_JETON_DEPOT, charteAvecLogoImporte } from '@tiktrends/core';
import { cleDuLienDepot } from './helpers/depot-jeton';
import { presignAssetUploadAction } from '../app/actions/assets';
import { saveBrandDAAction } from '../app/actions/brand-detail';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BASE = CFG.publicBaseUrl;
const ANCIEN = 'https://site.exemple.fr/logo.png';

/* ───────────── De vrais octets ───────────── */

const b64 = (s: string) => Buffer.from(s, 'base64');
const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=');
const boite = (type: string, ...corps: Buffer[]) => { const c = Buffer.concat(corps); const t = Buffer.alloc(8); t.writeUInt32BE(8 + c.length, 0); t.write(type, 4, 'latin1'); return Buffer.concat([t, c]); };
const MP4 = Buffer.concat([boite('ftyp', Buffer.from('isom'), Buffer.alloc(4), Buffer.from('isomiso2avc1mp41')), boite('free'), boite('mdat', Buffer.alloc(512))]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const HTML = Buffer.from('<!doctype html><html><body><script>fetch("/api/vol?c="+document.cookie)</script></body></html>');
/** Un PNG (vraie signature et en-tête) complété jusqu'à `n` octets. */
const pngDe = (n: number) => Buffer.concat([PNG, Buffer.alloc(Math.max(0, n - PNG.length), 0)]);

/* ───────────── Le faux bucket · HEAD, GET (Range), DELETE ───────────── */

const bucket = new Map<string, Buffer>();
const requetes: Array<{ methode: string; cle: string }> = [];
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  const methode = init?.method ?? 'GET';
  const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  requetes.push({ methode, cle });
  const o = bucket.get(cle);
  if (methode === 'DELETE') { bucket.delete(cle); return new Response(null, { status: 204 }); }
  if (methode === 'HEAD') return o ? new Response(null, { status: 200, headers: { 'content-length': String(o.length) } }) : new Response(null, { status: 404 });
  if (methode !== 'GET') return new Response(null, { status: 405 });
  if (!o) return new Response('NoSuchKey', { status: 404 });
  const m = /^bytes=0-(\d+)$/.exec(new Headers(init?.headers).get('range') ?? '');
  if (!m) return new Response(new Uint8Array(o), { status: 200, headers: { 'content-length': String(o.length) } });
  const fin = Math.min(o.length, Number(m[1]) + 1);
  return new Response(new Uint8Array(o.subarray(0, fin)), { status: 206, headers: { 'content-range': `bytes 0-${fin - 1}/${o.length}` } });
}
const cleDe = (url: string) => url.slice(BASE.length + 1);
const supprimes = () => requetes.filter((r) => r.methode === 'DELETE').map((r) => r.cle);
const relectures = () => requetes.filter((r) => r.methode === 'HEAD' || r.methode === 'GET');

/* ───────────── Un espace, deux marques ───────────── */

const A = { ws: randomUUID(), b1: randomUUID(), b2: randomUUID(), user: randomUUID() };
const lire = async (id: string) => (await db.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos }).from(schema.brands).where(eq(schema.brands.id, id)))[0]!;

/**
 * Le VRAI présigné pour `annonce` (nom, type, taille déclarés par le
 * navigateur), puis le PUT · le bucket n'impose que l'en-tête de type et la
 * longueur, il range les octets envoyés quels qu'ils soient.
 */
async function deposer(annonce: { nom: string; type: string }, octets: Buffer) {
  const pre = await presignAssetUploadAction({ filename: annonce.nom, contentType: annonce.type, sizeBytes: octets.length, usage: 'logo' });
  expect(pre.error).toBeUndefined();
  // Le navigateur dépose au lien de PUT · il ne reçoit aucune autre adresse.
  const cle = cleDuLienDepot(pre.uploadUrl!, CFG.bucket);
  bucket.set(cle, octets);
  return { url: `${BASE}/${cle}`, jeton: pre.jetonDepot! };
}
const importer = (brandId: string, d: { url: string; jeton: string }) =>
  saveBrandDAAction({ brandId, ...charteAvecLogoImporte({ logos: [ANCIEN], defaut: ANCIEN }, LOGO_DEPOSE), colors: ['#112233'], fonts: ['Inter'], jetonDepot: d.jeton });
const INTACTE = { logoUrl: ANCIEN, logos: [ANCIEN] };

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: A.ws, name: 'A', plan: 'core' });
  await db.insert(schema.users).values({ id: A.user, email: `${A.user.slice(0, 8)}@exemple.invalid` });
  await db.insert(schema.brands).values([
    { id: A.b1, workspaceId: A.ws, name: 'A1', logoUrl: ANCIEN, logos: [ANCIEN], colors: ['#112233'], fonts: ['Inter'] },
    { id: A.b2, workspaceId: A.ws, name: 'A2', logoUrl: ANCIEN, logos: [ANCIEN], colors: ['#112233'], fonts: ['Inter'] },
  ]);
});
beforeEach(async () => {
  requetes.length = 0;
  vi.stubGlobal('fetch', fauxBucket);
  await db.update(schema.brands).set({ logoUrl: ANCIEN, logos: [ANCIEN] });
  etat.session = { workspaceId: A.ws, workspaceName: 'Espace', role: 'admin', plan: 'core', user: { id: A.user, email: `${A.user.slice(0, 8)}@exemple.invalid`, name: null } };
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Logo importé · relu avant d’être enregistré', () => {
  it('PNG conforme au jeton · relu (HEAD + début), enregistré par défaut, rien retiré', async () => {
    const d = await deposer({ nom: 'logo.png', type: 'image/png' }, pngDe(2048));
    expect(await importer(A.b1, d)).toEqual({ ok: true });
    expect(await lire(A.b1)).toEqual({ logoUrl: d.url, logos: [ANCIEN, d.url] });
    expect(relectures().map((r) => r.methode)).toEqual(['HEAD', 'GET']);
    expect(supprimes()).toEqual([]);
    expect(bucket.has(cleDe(d.url))).toBe(true);
  });

  it('PDF, MP4, HTML déposés par un présigné « image/png » · refusés, la charte intacte, l’objet retiré', async () => {
    const cas: Array<[string, Buffer, string]> = [
      ['pdf', PDF, MESSAGES_REFUS_LOGO_RELU.contenu],
      ['mp4', MP4, MESSAGES_REFUS_LOGO_RELU.contenu],
      ['html', HTML, MESSAGES_REFUS_LOGO_RELU.balisage],
    ];
    for (const [nom, octets, erreur] of cas) {
      requetes.length = 0;
      const d = await deposer({ nom: 'logo.png', type: 'image/png' }, octets);
      expect(await importer(A.b1, d), nom).toEqual({ error: erreur });
      expect(await lire(A.b1), nom).toEqual(INTACTE);
      expect(supprimes(), nom).toEqual([cleDe(d.url)]);
      expect(bucket.has(cleDe(d.url)), nom).toBe(false);
    }
  });

  it('une vidéo déposée comme vidéo (présigné « video/mp4 ») · refusée, retirée', async () => {
    const d = await deposer({ nom: 'clip.mp4', type: 'video/mp4' }, MP4);
    expect(await importer(A.b1, d)).toEqual({ error: MESSAGES_REFUS_LOGO_RELU.contenu });
    expect(await lire(A.b1)).toEqual(INTACTE);
    expect(supprimes()).toEqual([cleDe(d.url)]);
  });

  it('taille RELUE au-delà de 4 Mo (présigné « image/png » de 4 000 001 octets) · refusée, retirée', async () => {
    const d = await deposer({ nom: 'logo.png', type: 'image/png' }, pngDe(4_000_001));
    expect(await importer(A.b1, d)).toEqual({ error: MESSAGES_REFUS_LOGO_RELU.lourd });
    expect(await lire(A.b1)).toEqual(INTACTE);
    expect(supprimes()).toEqual([cleDe(d.url)]);
    expect(bucket.has(cleDe(d.url))).toBe(false);
  });

  it('exactement 4 Mo · accepté', async () => {
    const d = await deposer({ nom: 'logo.png', type: 'image/png' }, pngDe(4_000_000));
    expect(await importer(A.b1, d)).toEqual({ ok: true });
    expect(supprimes()).toEqual([]);
  });
});

describe('Logo importé · l’objet relu face au type et à la taille signés dans le jeton', () => {
  it('jeton d’un AUTRE type que le contenu (PNG déposé par un présigné « image/jpeg » ou « video/mp4 ») · refusé, retiré', async () => {
    for (const annonce of [{ nom: 'logo.jpg', type: 'image/jpeg' }, { nom: 'clip.mp4', type: 'video/mp4' }]) {
      requetes.length = 0;
      const d = await deposer(annonce, pngDe(2048));
      expect(await importer(A.b1, d), annonce.type).toEqual({ error: MESSAGES_REFUS_LOGO_RELU.type_different });
      expect(await lire(A.b1), annonce.type).toEqual(INTACTE);
      expect(supprimes(), annonce.type).toEqual([cleDe(d.url)]);
    }
  });

  it('taille relue autre que la taille signée (objet remplacé) · refusée, retirée', async () => {
    const d = await deposer({ nom: 'logo.png', type: 'image/png' }, pngDe(2048));
    bucket.set(cleDe(d.url), pngDe(2047));
    expect(await importer(A.b1, d)).toEqual({ error: MESSAGES_REFUS_LOGO_RELU.taille_differente });
    expect(await lire(A.b1)).toEqual(INTACTE);
    expect(supprimes()).toEqual([cleDe(d.url)]);
  });

  it('objet jamais envoyé (PUT absent) · refusé, rien retiré (l’import peut se relancer)', async () => {
    const pre = await presignAssetUploadAction({ filename: 'logo.png', contentType: 'image/png', sizeBytes: 2048, usage: 'logo' });
    expect(await importer(A.b1, { url: `${BASE}/${cleDuLienDepot(pre.uploadUrl!, CFG.bucket)}`, jeton: pre.jetonDepot! })).toEqual({ error: MESSAGES_RELECTURE_DEPOT.absent });
    expect(await lire(A.b1)).toEqual(INTACTE);
    expect(supprimes()).toEqual([]);
  });

  it('objet CITÉ par une autre marque puis remplacé par un PDF · le jeton rejoué est refusé (déjà employé) avant toute relecture, jamais retiré', async () => {
    const octets = pngDe(2048);
    const d = await deposer({ nom: 'logo.png', type: 'image/png' }, octets);
    expect(await importer(A.b2, d)).toEqual({ ok: true });
    // Le lien de dépôt vit encore · même type d'en-tête, même longueur, autres octets.
    bucket.set(cleDe(d.url), Buffer.concat([PDF, Buffer.alloc(octets.length - PDF.length, 0x20)]));
    requetes.length = 0;
    expect(await importer(A.b1, d)).toEqual({ error: TEXTES_REFUS_JETON_DEPOT.deja_employe });
    expect(requetes, 'un jeton déjà employé ne fait rien relire').toEqual([]);
    expect(await lire(A.b1)).toEqual(INTACTE);
    expect(supprimes()).toEqual([]);
    expect(bucket.has(cleDe(d.url))).toBe(true);
    expect((await lire(A.b2)).logoUrl).toBe(d.url);
  });
});

describe('Compatibilité · aucune relecture hors logo nouveau attesté', () => {
  it('logo du bucket DÉJÀ en base (y compris un objet devenu illisible) · accepté sans relecture', async () => {
    const d = await deposer({ nom: 'logo.png', type: 'image/png' }, pngDe(2048));
    expect(await importer(A.b1, d)).toEqual({ ok: true });
    bucket.set(cleDe(d.url), PDF);
    requetes.length = 0;
    expect(await saveBrandDAAction({ brandId: A.b1, logoUrl: ANCIEN, logos: [ANCIEN, d.url], colors: [], fonts: [] })).toEqual({ ok: true });
    expect(await saveBrandDAAction({ brandId: A.b1, logoUrl: d.url, logos: [ANCIEN, d.url], colors: [], fonts: [] })).toEqual({ ok: true });
    expect(await lire(A.b1)).toEqual({ logoUrl: d.url, logos: [ANCIEN, d.url] });
    expect(requetes).toEqual([]);
  });

  it('adresse externe https · « Ajouter » par adresse inchangé, aucune requête au bucket', async () => {
    const EXT = 'https://cdn.exemple.fr/logo.pdf';
    expect(await saveBrandDAAction({ brandId: A.b1, logoUrl: EXT, logos: [ANCIEN, EXT], colors: [], fonts: [] })).toEqual({ ok: true });
    expect(await lire(A.b1)).toEqual({ logoUrl: EXT, logos: [ANCIEN, EXT] });
    expect(requetes).toEqual([]);
  });
});
