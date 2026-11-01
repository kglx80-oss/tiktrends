import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Worker · synchro quotidienne des dossiers Drive (`runDailySync` →
 * `syncDriveAssets`) · un dépôt dont l'insertion échoue est RETIRÉ. Vraie base
 * (pglite, migrations réelles), FAUX S3 (PUT, DELETE), faux Drive (module
 * `google-drive` remplacé, le reste du connecteur est le vrai). L'échec est un
 * vrai refus de Postgres (déclencheur sur `assets` tant que `test.refus` vaut
 * `on`). On lit ce qui SORT · le bucket, les lignes, le bilan.
 */
const etat = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return {
    ws: randomUUID(), brandA: randomUUID(), brandB: randomUUID(),
    fichiers: [] as Array<{ id: string; name: string; mimeType: string; size?: number; webViewLink?: string }>,
  };
});
const CFG = vi.hoisted(() => ({ endpoint: 's3.test', region: 'gra', bucket: 'bucket', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://cdn.exemple.test/bucket' }));
const PNG = vi.hoisted(() => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64'));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const pg = new PGlite();
  const dir = join(process.cwd(), '../../packages/db/drizzle');
  const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> };
  for (const e of journal.entries) {
    await pg.exec(readFileSync(join(dir, `${e.tag}.sql`), 'utf8')
      .replace(/-->\s*statement-breakpoint/g, '')
      .replace(/CREATE EXTENSION IF NOT EXISTS vector;?/gi, '')
      .replace(/vector\(\d+\)/gi, 'text'));
  }
  return { ...actual, db: drizzle(pg, { schema: actual.schema }) };
});
vi.mock('../../../packages/integrations/src/google-drive', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  googleAccessToken: async () => 'acces',
  driveListFilesDeep: async () => etat.fichiers,
  driveDownload: async () => PNG,
  driveThumbnailLink: async () => null,
  driveThumbBytes: async () => null,
}));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiktrends/integrations')>()),
  storageFromEnv: () => CFG,
  decryptSecret: (v: unknown) => (v ? 'jeton-de-rafraichissement' : ''),
}));

import { and, eq } from 'drizzle-orm';
import { db, schema, sql } from '@tiktrends/db';
import { runDailySync } from '../src/sync';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const { ws, brandA, brandB } = etat;
const BASE = CFG.publicBaseUrl;
const cle = (id: string) => `assets/${ws}/drive-${id}.png`;
const ANCIEN = Buffer.from('octets-preexistants');

const bucket = new Map<string, Buffer>();
const supprimes: string[] = [];
const deposes: string[] = [];
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  const k = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  const methode = init?.method ?? 'GET';
  if (methode === 'PUT') { bucket.set(k, Buffer.from(init!.body as Uint8Array)); deposes.push(k); return new Response(null, { status: 200 }); }
  if (methode === 'DELETE') { supprimes.push(k); bucket.delete(k); return new Response(null, { status: 204 }); }
  return bucket.has(k) ? new Response(new Uint8Array(bucket.get(k)!), { status: 200 }) : new Response(null, { status: 404 });
}
const refuser = async (oui: boolean) => { await db.execute(sql.raw(`set test.refus = '${oui ? 'on' : 'off'}'`)); };
const lignesB = () => db.select({ externalId: schema.assets.externalId, url: schema.assets.url }).from(schema.assets)
  .where(and(eq(schema.assets.workspaceId, ws), eq(schema.assets.brandId, brandB)));
const fichier = (id: string) => ({ id, name: `${id}.png`, mimeType: 'image/png', size: PNG.length, webViewLink: `https://drive.google.com/file/d/${id}/view` });

beforeAll(async () => {
  await db.execute(sql.raw(`create or replace function refus_ecriture_test() returns trigger language plpgsql as $$
    begin
      if current_setting('test.refus', true) = 'on' then raise exception 'écriture refusée (test)'; end if;
      return new;
    end $$`));
  await db.execute(sql.raw('create trigger refus_ecriture_test before insert or update on assets for each row execute function refus_ecriture_test()'));
  await db.insert(schema.workspaces).values({ id: ws, name: 'W', plan: 'core' });
  // Seule la marque B est branchée · A a déjà synchronisé « partage » autrefois (copie à elle, citée).
  await db.insert(schema.brands).values([{ id: brandA, workspaceId: ws, name: 'A' }, { id: brandB, workspaceId: ws, name: 'B', driveRefreshToken: 'chiffre', driveFolderId: 'dossier' }]);
  bucket.set(cle('partage'), ANCIEN);
  await db.insert(schema.assets).values({ workspaceId: ws, brandId: brandA, name: 'partage', kind: 'image', source: 'drive', url: `${BASE}/${cle('partage')}`, externalId: 'partage', mimeType: 'image/png' });
});
beforeEach(async () => { supprimes.length = 0; deposes.length = 0; vi.stubGlobal('fetch', fauxBucket); await refuser(false); });
afterEach(async () => { vi.unstubAllGlobals(); await refuser(false); });

describe('Worker · synchro Drive quotidienne · retrait des dépôts sans ligne', () => {
  it('insertion refusée · la copie neuve est retirée, celle citée par A reste ; rien n’est compté ajouté', async () => {
    etat.fichiers = [fichier('partage'), fichier('neuf')];
    await refuser(true);
    const r = await runDailySync();
    expect(r.drive).toBe(0);
    expect(deposes.sort()).toEqual([cle('neuf'), cle('partage')]);
    expect(bucket.has(cle('neuf')), 'copie neuve restée sans ligne').toBe(false);
    expect(bucket.has(cle('partage')), 'copie de A retirée').toBe(true);
    expect(supprimes).toEqual([cle('neuf')]);
    expect(await lignesB()).toEqual([]);
  });

  it('nominal · les deux copies sont déposées ET enregistrées, aucun DELETE', async () => {
    etat.fichiers = [fichier('partage'), fichier('neuf')];
    const r = await runDailySync();
    expect(r.drive).toBe(2);
    expect(supprimes).toEqual([]);
    expect(bucket.has(cle('neuf'))).toBe(true);
    expect((await lignesB()).map((l) => l.url).sort()).toEqual([`${BASE}/${cle('neuf')}`, `${BASE}/${cle('partage')}`]);
  });
});
