import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · le TÉLÉCHARGEMENT GROUPÉ (`POST /api/bibliotheque/archive`).
 *
 * Vraie base (pglite + migrations du dépôt), VRAI handler, VRAIE lecture en
 * flux (`lecture-flux.ts`) · le stockage est un faux bucket et un faux Drive
 * (un `fetch` qui sert de VRAIS octets par clé). On lit ce qui SORT : l'archive
 * est décompressée par un lecteur indépendant (`lire-zip.ts`, CRC de
 * `node:zlib`) et ses octets comparés à ceux du stockage ; on lit aussi CHAQUE
 * requête réellement envoyée (hôte, clé).
 */

const etat = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  bucket: new Map<string, Uint8Array>(),
  drive: new Map<string, Uint8Array>(),
  requetes: [] as string[],
  externes: [] as string[],
  plafondReel: null as number | null,
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
vi.mock('../lib/archive-lecture', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/archive-lecture')>();
  return { ...actual, plafondArchiveReel: () => etat.plafondReel ?? actual.plafondArchiveReel() };
});
vi.mock('../lib/drive-token', () => ({ driveRefreshTokenFor: async (ws: string) => (ws === etat.ids.wsA ? 'jeton-rafraichi' : null) }));
vi.mock('@tiktrends/integrations/src/safe-fetch', () => ({ safeFetch: async (url: string) => { etat.externes.push(url); return null; } }));
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  return { ...actual, storageFromEnv: () => CFG, googleAccessToken: async () => 'acces-de-test' };
});

import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { PLAFOND_ARCHIVE_OCTETS, RAISONS_ARCHIVE, TAG_SELECTION_MAX, refusArchiveTailleInconnue, refusArchiveTropDeFichiers, refusArchiveVolume } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { lireZip } from '../../../packages/core/test/helpers/lire-zip';
import { POST } from '../app/api/bibliotheque/archive/route';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ids = etat.ids;
const BASE = CFG.publicBaseUrl;

/** Le faux stockage · bucket (`s3.test/bucket/<clé>`) et Drive (`googleapis.com/drive/v3/files/<id>`), servis en morceaux. */
function stockage(u: string | URL | Request): Promise<Response> {
  const url = new URL(typeof u === 'string' ? u : u instanceof URL ? u.href : u.url);
  etat.requetes.push(url.origin + url.pathname);
  let octets: Uint8Array | undefined;
  if (url.host === 's3.test' && url.pathname.startsWith('/bucket/')) octets = etat.bucket.get(decodeURIComponent(url.pathname.slice('/bucket/'.length)));
  else if (url.host === 'www.googleapis.com' && url.pathname.startsWith('/drive/v3/files/') && url.searchParams.get('alt') === 'media') octets = etat.drive.get(decodeURIComponent(url.pathname.slice('/drive/v3/files/'.length)));
  if (!octets) return Promise.resolve(new Response('absent', { status: 404 }));
  const o = octets;
  const corps = new ReadableStream<Uint8Array>({
    start(c) { for (let i = 0; i < o.length; i += 16_384) c.enqueue(o.slice(i, i + 16_384)); c.close(); },
  });
  return Promise.resolve(new Response(corps, { status: 200, headers: { 'content-length': String(o.length) } }));
}

const requete = (corps: unknown, o: { verifier?: boolean; forme?: 'json' | 'formulaire'; entetes?: Record<string, string> } = {}) => {
  const forme = o.forme ?? 'json';
  const body = forme === 'json' ? JSON.stringify(corps)
    : new URLSearchParams([...((corps as { ids: string[] }).ids ?? []).map((id) => ['ids', id] as [string, string]), ...Object.entries((corps as Record<string, unknown>).extra ?? {}).map(([k, v]) => [k, String(v)] as [string, string])]).toString();
  return POST(new Request(`http://local/api/bibliotheque/archive${o.verifier ? '?verifier=1' : ''}`, {
    method: 'POST', body,
    headers: { 'content-type': forme === 'json' ? 'application/json' : 'application/x-www-form-urlencoded', ...o.entetes },
  }));
};
const octets = async (r: Response) => Buffer.from(await r.arrayBuffer());
const fermee = (r: Response) => {
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(r.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
};

async function poser(v: Partial<typeof schema.assets.$inferInsert> & { url: string }): Promise<string> {
  const [a] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'x', kind: 'image', source: 'upload', ...v }).returning();
  return a!.id;
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');
const PHOTO = randomBytes(300_000);
const VIDEO = randomBytes(150_001);
const AUTRE = randomBytes(1234);
const A: Record<string, string> = {};

beforeAll(async () => {
  await semer(db, schema, ids);
  const [jete] = await db.insert(schema.libraryFolders).values({ workspaceId: ids.wsA, name: 'Jeté', deletedAt: new Date() }).returning();
  const [sous] = await db.insert(schema.libraryFolders).values({ workspaceId: ids.wsA, name: 'Sous jeté', parentId: jete!.id }).returning();
  const [vivant] = await db.insert(schema.libraryFolders).values({ workspaceId: ids.wsA, name: 'UGC' }).returning();

  A.png = await poser({ name: 'logo', url: `data:image/png;base64,${PNG.toString('base64')}`, mimeType: 'image/png', sizeBytes: PNG.length });
  A.photo = await poser({ name: 'photo.jpg', url: `${BASE}/assets/${ids.wsA}/1-ab-photo.jpg`, mimeType: 'image/jpeg', sizeBytes: PHOTO.length, folderId: vivant!.id });
  A.photoBis = await poser({ name: 'PHOTO.JPG', url: `${BASE}/assets/${ids.wsA}/2-cd-photo.jpg`, mimeType: 'image/jpeg', sizeBytes: AUTRE.length });
  A.video = await poser({ name: '../../etc/vidéo.mp4', kind: 'video', source: 'drive', externalId: 'drive-video', url: 'https://drive.google.com/file/d/drive-video/view', mimeType: 'video/mp4', sizeBytes: VIDEO.length });
  A.corbeille = await poser({ name: 'jete.jpg', url: `${BASE}/assets/${ids.wsA}/3-ef-jete.jpg`, sizeBytes: 10, deletedAt: new Date() });
  A.dossierJete = await poser({ name: 'dans-jete.jpg', url: `${BASE}/assets/${ids.wsA}/4-gh-dj.jpg`, sizeBytes: 10, folderId: sous!.id });
  A.sansTaille = await poser({ name: 'lien.jpg', source: 'url', url: 'https://images.exemple.test/lien.jpg', sizeBytes: null });
  A.autreEspaceCle = await poser({ name: 'vol.jpg', url: `${BASE}/assets/${ids.wsB}/5-ij-secret.jpg`, sizeBytes: 10 });
  A.embarqueVide = await poser({ name: 'casse.png', url: 'data:image/png;base64,', mimeType: 'image/png', sizeBytes: 10 });
  A.disparu = await poser({ name: 'disparu.jpg', url: `${BASE}/assets/${ids.wsA}/6-kl-disparu.jpg`, sizeBytes: 10 });
  A.lourd1 = await poser({ name: 'lourd1.mp4', url: `${BASE}/assets/${ids.wsA}/7-l1.mp4`, sizeBytes: PLAFOND_ARCHIVE_OCTETS / 2 });
  A.lourd2 = await poser({ name: 'lourd2.mp4', url: `${BASE}/assets/${ids.wsA}/8-l2.mp4`, sizeBytes: PLAFOND_ARCHIVE_OCTETS / 2 });
  const [b] = await db.insert(schema.assets).values({ workspaceId: ids.wsB, brandId: ids.brandB1, name: 'secret.jpg', kind: 'image', source: 'upload', url: `${BASE}/assets/${ids.wsB}/5-ij-secret.jpg`, sizeBytes: 10 }).returning();
  A.espaceB = b!.id;

  etat.bucket.set(`assets/${ids.wsA}/1-ab-photo.jpg`, PHOTO);
  etat.bucket.set(`assets/${ids.wsA}/2-cd-photo.jpg`, AUTRE);
  etat.bucket.set(`assets/${ids.wsB}/5-ij-secret.jpg`, Buffer.from('SECRET DE B'));
  etat.drive.set('drive-video', VIDEO);
});

beforeEach(() => {
  etat.session = session(ids, 'ua');
  etat.requetes = [];
  etat.externes = [];
  vi.stubGlobal('fetch', vi.fn(stockage));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('l’archive · chaque fichier relu à l’identique', () => {
  it('quatre fichiers (embarqué, deux objets du bucket, Drive) · ZIP en pièce jointe, noms assainis et dédoublonnés, octets identiques', async () => {
    const r = await requete({ ids: [A.photo, A.png, A.video, A.photoBis] }, { forme: 'formulaire' });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/zip');
    expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename="bibliotheque-\d{4}-\d{2}-\d{2}\.zip"$/);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    fermee(r);
    expect(r.body, 'un flux, pas un tampon').toBeInstanceOf(ReadableStream);
    const lu = lireZip(await octets(r));
    expect(lu.map((e) => e.nom)).toEqual(['photo.jpg', 'logo.png', '-.-etc-vidéo.mp4', 'PHOTO (2).JPG']);
    expect(lu[0]!.octets.equals(PHOTO), 'objet du bucket').toBe(true);
    expect(lu[1]!.octets.equals(PNG), 'octets embarqués').toBe(true);
    expect(lu[2]!.octets.equals(VIDEO), 'fichier Drive').toBe(true);
    expect(lu[3]!.octets.equals(AUTRE), 'second objet du bucket').toBe(true);
    // Seuls l'hôte du stockage configuré (clés de CET espace) et Drive ont été demandés.
    expect(etat.requetes.sort()).toEqual([
      `https://s3.test/bucket/assets/${ids.wsA}/1-ab-photo.jpg`,
      `https://s3.test/bucket/assets/${ids.wsA}/2-cd-photo.jpg`,
      'https://www.googleapis.com/drive/v3/files/drive-video',
    ]);
  });

  it('EN FLUX · le premier morceau part avant que le second fichier soit seulement demandé au stockage', async () => {
    const r = await requete({ ids: [A.photo, A.photoBis] });
    const lecteur = r.body!.getReader();
    const premier = await lecteur.read();
    expect(Buffer.from(premier.value!).readUInt32LE(0), 'en-tête local du premier fichier').toBe(0x04034b50);
    expect(etat.requetes, 'un seul objet ouvert à ce stade').toEqual([`https://s3.test/bucket/assets/${ids.wsA}/1-ab-photo.jpg`]);
    await lecteur.cancel();
  });

  it('`?verifier=1` · la décision seule, en JSON, sans lire un octet du stockage', async () => {
    const r = await requete({ ids: [A.photo, A.png] }, { verifier: true });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, fichiers: 2, octets: PHOTO.length + PNG.length });
    expect(etat.requetes).toEqual([]);
  });

  it('un membre d’un espace Starter (offre sous Core) · télécharge (règle de LECTURE)', async () => {
    etat.session = session(ids, 'ua', { plan: 'starter' });
    const r = await requete({ ids: [A.png] });
    expect(r.status).toBe(200);
    expect(lireZip(await octets(r))[0]!.octets.equals(PNG)).toBe(true);
  });
});

describe('aucune adresse fournie par le client n’est lue', () => {
  it('JSON · `url`, `urls`, `workspaceId` ajoutés au corps · ignorés, seul l’objet en base est lu', async () => {
    const r = await requete({ ids: [A.photo], url: 'https://pirate.test/vol', urls: ['https://pirate.test/a'], workspaceId: ids.wsB, cle: `assets/${ids.wsB}/5-ij-secret.jpg` });
    expect(r.status).toBe(200);
    expect(lireZip(await octets(r))[0]!.octets.equals(PHOTO)).toBe(true);
    expect(etat.requetes).toEqual([`https://s3.test/bucket/assets/${ids.wsA}/1-ab-photo.jpg`]);
    expect(etat.externes).toEqual([]);
  });
  it('formulaire · un champ `url` ou un identifiant en forme d’adresse · refus entier, aucune requête', async () => {
    const r = await requete({ ids: [A.photo, 'https://pirate.test/vol'], extra: { url: 'https://pirate.test/x' } }, { forme: 'formulaire' });
    expect([r.status, await r.text()]).toEqual([400, RAISONS_ARCHIVE.illisible]);
    expect(etat.requetes).toEqual([]);
  });
});

describe('refus TOTAL · aucune archive, aucune lecture du stockage', () => {
  const refuse = async (corps: unknown, statut: number, raison: string) => {
    const r = await requete(corps);
    fermee(r);
    expect([r.status, await r.text()]).toEqual([statut, raison]);
    const v = await requete(corps, { verifier: true });
    expect([v.status, await v.json()]).toEqual([statut, { ok: false, raison }]);
    expect(etat.requetes, 'aucune requête au stockage').toEqual([]);
  };
  it('un fichier d’un AUTRE espace parmi les miens', () => refuse({ ids: [A.photo, A.espaceB] }, 409, RAISONS_ARCHIVE.introuvable));
  it('un fichier à la corbeille', () => refuse({ ids: [A.photo, A.corbeille] }, 409, RAISONS_ARCHIVE.introuvable));
  it('un fichier rangé sous un dossier en corbeille', () => refuse({ ids: [A.photo, A.dossierJete] }, 409, RAISONS_ARCHIVE.introuvable));
  it('un identifiant inconnu', () => refuse({ ids: [A.photo, '00000000-0000-4000-8000-000000000000'] }, 409, RAISONS_ARCHIVE.introuvable));
  it(`au-delà de ${TAG_SELECTION_MAX} identifiants`, () => {
    const trop = Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    return refuse({ ids: trop }, 400, refusArchiveTropDeFichiers(TAG_SELECTION_MAX + 1));
  });
  it('une taille inconnue', () => refuse({ ids: [A.photo, A.sansTaille] }, 409, refusArchiveTailleInconnue(1)));
  it('un volume au-delà du plafond (somme des size_bytes)', () => refuse({ ids: [A.photo, A.lourd1, A.lourd2] }, 409, refusArchiveVolume(PHOTO.length + PLAFOND_ARCHIVE_OCTETS)));
  it('un objet du bucket rangé sous la clé d’un AUTRE espace · jamais demandé', () => refuse({ ids: [A.photo, A.autreEspaceCle] }, 409, RAISONS_ARCHIVE.lecture));
  it('un corps illisible', () => refuse({ ids: 'tout' }, 400, RAISONS_ARCHIVE.illisible));
});

describe('la garde · celle des proxys', () => {
  it('un lecteur client (`client_viewer`) · refusé, aucune lecture', async () => {
    etat.session = session(ids, 'uv');
    const r = await requete({ ids: [A.photo] });
    expect(r.status).toBe(404);
    fermee(r);
    expect(etat.requetes).toEqual([]);
  });
  it('sans session · 401', async () => {
    etat.session = null;
    expect((await requete({ ids: [A.photo] })).status).toBe(401);
  });
  it('la session de l’espace B ne lit pas un fichier de A (l’espace vient de la session)', async () => {
    etat.session = session(ids, 'ub');
    const r = await requete({ ids: [A.photo] });
    expect([r.status, await r.text()]).toEqual([409, RAISONS_ARCHIVE.introuvable]);
    expect(etat.requetes).toEqual([]);
  });
  it('un formulaire posté depuis un autre site · refusé', async () => {
    const r = await requete({ ids: [A.photo] }, { forme: 'formulaire', entetes: { 'sec-fetch-site': 'cross-site' } });
    expect(r.status).toBe(403);
    expect(etat.requetes).toEqual([]);
  });
});

describe('une lecture qui échoue PENDANT l’écriture · le flux est coupé, jamais une archive fausse', () => {
  it('objet disparu du bucket après la décision · le corps de la réponse échoue', async () => {
    const r = await requete({ ids: [A.photo, A.disparu] });
    expect(r.status).toBe(200);
    await expect(r.arrayBuffer()).rejects.toThrow();
  });
  it('octets embarqués illisibles (lus au moment de les écrire) · le corps de la réponse échoue', async () => {
    const r = await requete({ ids: [A.png, A.embarqueVide] });
    expect(r.status).toBe(200);
    await expect(r.arrayBuffer()).rejects.toThrow();
  });
  it('une size_bytes sous-estimée AU-DELÀ du plafond réel · le flux est coupé, jamais une archive qui le dépasse', async () => {
    // La décision passe (size_bytes annonce 2 octets) ; le plafond réel passé à `fluxZip` est ramené
    // sous la taille VRAIE de l'objet · la route doit couper, sinon un `size_bytes` faux contournerait les 2 Gio.
    await db.update(schema.assets).set({ sizeBytes: 2 }).where(eq(schema.assets.id, A.photoBis!));
    etat.plafondReel = AUTRE.length - 1;
    try {
      const r = await requete({ ids: [A.photoBis] });
      expect(r.status).toBe(200);
      await expect(r.arrayBuffer()).rejects.toThrow();
    } finally {
      etat.plafondReel = null;
      await db.update(schema.assets).set({ sizeBytes: AUTRE.length }).where(eq(schema.assets.id, A.photoBis!));
    }
  });
  it('une size_bytes sous-estimée · l’archive porte les VRAIS octets, leur taille relue dans le flux', async () => {
    // L'objet sert plus que ce que `size_bytes` annonçait (2 octets) · la décision passe, le plafond réel tient.
    await db.update(schema.assets).set({ sizeBytes: 2 }).where(eq(schema.assets.id, A.photoBis!));
    try {
      const r = await requete({ ids: [A.photoBis] });
      expect(r.status).toBe(200);
      expect(lireZip(await octets(r))[0]!.octets.equals(AUTRE), 'sous le plafond, l’archive reste exacte').toBe(true);
    } finally {
      await db.update(schema.assets).set({ sizeBytes: AUTRE.length }).where(eq(schema.assets.id, A.photoBis!));
    }
  });
});
