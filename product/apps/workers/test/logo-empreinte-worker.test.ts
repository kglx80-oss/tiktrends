import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { schema, eq } from '@tiktrends/db';
import { idLogoMarque, MESSAGES_LOGO_SERVI } from '@tiktrends/core';
import { hacherImage, resoudreMedias } from '../src/studios/fournisseurs';
import type { BaseStudio } from '../src/studios/types';
import { pgMemoire } from './pg-memoire';

/**
 * Worker studio · un logo IMPORTÉ (empreinte gardée, `brands.logo_empreintes_json`)
 * ne part au fournisseur que si l'objet du stockage est encore celui de son
 * empreinte · vraie base (pglite, migrations réelles, 0066 comprise), faux S3
 * qui rend l'ETag (MD5) et honore `If-Match` (412). On lit le RÉSULTAT de
 * `resoudreMedias` (l'adresse transmise ou non, le motif), jamais la présence
 * d'un appel. Un logo sans empreinte part comme avant, sans vérification.
 */
let base: BaseStudio;
const ws = randomUUID();
const brand = randomUUID();
const stockage = { endpoint: 's3.gra.exemple.invalid', bucket: 'tt', region: 'gra', accessKeyId: 'k', secretAccessKey: 's' };
const IMPORTE = `https://s3.gra.exemple.invalid/tt/assets/${ws}/1-abcd1234-logo.png`;
const ANCIEN = `https://s3.gra.exemple.invalid/tt/assets/${ws}/1-dcba4321-ancien.png`;
const id = (u: string) => idLogoMarque(brand, hacherImage(u).sha256);
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');
const ORIGINAL = Buffer.from('logo original · octets relus à l’import');
const AUTRE = Buffer.from('logo remplacé · même longueur, autres!');

const objets = new Map<string, Buffer>();
const requetes: Array<{ methode: string; cle: string; ifMatch: string | null }> = [];
const options = { ignoreIfMatch: false };
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  const cle = decodeURIComponent(u.pathname.slice(`/${stockage.bucket}/`.length));
  const ifMatch = new Headers(init?.headers).get('if-match');
  requetes.push({ methode: init?.method ?? 'GET', cle, ifMatch });
  const o = objets.get(cle);
  if (!o) return new Response(null, { status: 404 });
  const etag = `"${md5(o)}"`;
  if (ifMatch !== null && ifMatch !== etag && !options.ignoreIfMatch) return new Response(null, { status: 412 });
  return new Response(null, { status: 200, headers: { 'content-length': String(o.length), etag } });
}
const cle = (u: string) => u.slice(`https://${stockage.endpoint}/${stockage.bucket}/`.length);
const resoudre = async () => new Map((await resoudreMedias(base, { workspaceId: ws, brandId: brand }, [id(IMPORTE), id(ANCIEN)], stockage)).map((m) => [m.assetId, m]));

beforeAll(async () => {
  base = await pgMemoire();
  await base.insert(schema.workspaces).values({ id: ws, name: 'W', plan: 'core' });
  await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'B', logoUrl: IMPORTE, logos: [IMPORTE, ANCIEN], logoEmpreintes: { [IMPORTE]: md5(ORIGINAL) } });
});
beforeEach(() => {
  requetes.length = 0; options.ignoreIfMatch = false;
  objets.set(cle(IMPORTE), ORIGINAL); objets.set(cle(ANCIEN), ORIGINAL);
  vi.stubGlobal('fetch', fauxBucket);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('resoudreMedias · logo importé et son empreinte', () => {
  it('objet conforme · transmis par lecture signée, vérifié par HEAD + If-Match ; logo ancien transmis sans vérification', async () => {
    const r = await resoudre();
    expect(r.get(id(IMPORTE))).toMatchObject({ etat: 'autorise' });
    expect((r.get(id(IMPORTE)) as { url: string }).url).toContain('X-Amz-Signature=');
    expect(r.get(id(ANCIEN))).toMatchObject({ etat: 'autorise' });
    expect(requetes).toEqual([{ methode: 'HEAD', cle: cle(IMPORTE), ifMatch: `"${md5(ORIGINAL)}"` }]);
  });

  it('objet REMPLACÉ après l’import · jamais transmis, le motif dit « à réimporter » ; le logo ancien part toujours', async () => {
    objets.set(cle(IMPORTE), AUTRE);
    const r = await resoudre();
    expect(r.get(id(IMPORTE))).toEqual({ assetId: id(IMPORTE), etat: 'sans_media', motif: MESSAGES_LOGO_SERVI.remplace });
    expect(JSON.stringify(r.get(id(IMPORTE)))).not.toContain('X-Amz-Signature');
    expect(r.get(id(ANCIEN))).toMatchObject({ etat: 'autorise' });
  });

  it('stockage qui ignorerait If-Match · l’ETag relu, différent, suffit à refuser', async () => {
    objets.set(cle(IMPORTE), AUTRE);
    options.ignoreIfMatch = true;
    expect((await resoudre()).get(id(IMPORTE))).toMatchObject({ etat: 'sans_media', motif: MESSAGES_LOGO_SERVI.remplace });
  });

  it('objet disparu · absent ; stockage injoignable · rien ne part', async () => {
    objets.delete(cle(IMPORTE));
    expect((await resoudre()).get(id(IMPORTE))).toMatchObject({ etat: 'absent', motif: MESSAGES_LOGO_SERVI.absent });
    vi.stubGlobal('fetch', async () => { throw new Error('injoignable'); });
    expect((await resoudre()).get(id(IMPORTE))).toMatchObject({ etat: 'sans_media', motif: MESSAGES_LOGO_SERVI.illisible });
    // Rien n'est réécrit en base.
    const [b] = await base.select({ logoEmpreintes: schema.brands.logoEmpreintes }).from(schema.brands).where(eq(schema.brands.id, brand));
    expect(b!.logoEmpreintes).toEqual({ [IMPORTE]: md5(ORIGINAL) });
  });
});
