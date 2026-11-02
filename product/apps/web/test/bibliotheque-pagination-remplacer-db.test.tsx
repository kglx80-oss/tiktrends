import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · « Charger plus » et « Remplacer » ensemble · sur une VRAIE
 * base (pglite, migrations du dépôt), la VRAIE page `/assets`, les VRAIES
 * actions `pageBibliothequeAction` et `remplacerAssetAction`, un stockage
 * configuré et un faux bucket qui sert de vrais octets (comme S3 · `HEAD`,
 * `GET` avec `Range`, `ETag` = MD5).
 *
 * 450 fichiers téléversés au stockage · la page en charge 400, les 50 plus
 * anciens ne viennent que par « Charger plus ». On lit ce qui SORT · un
 * fichier lu par la fenêtre et par une page suivante porte la MÊME adresse
 * servie (versionnée par l'empreinte) et le même contenu ; un fichier chargé
 * par « Charger plus » se remplace comme les autres ; remplacé, il change
 * d'adresse, les comptes restent exacts et il n'apparaît qu'une fois.
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
  storageConfigured: () => true,
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (f: unknown) => f }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/assets',
}));
vi.mock('../lib/studios/bibliotheque', () => ({ listerSortiesStudiosBibliotheque: async () => [], sortieCommeAsset: (x: unknown) => x }));
vi.mock('../lib/creations-historiques', () => ({ listerCreationsHistoriques: async () => [], creationCommeAsset: (x: unknown) => x }));

import { createHash } from 'node:crypto';
import { db, schema } from '@tiktrends/db';
import {
  ajouterMedias, ETAT_DRIVE_INITIAL, FENETRE_BIBLIOTHEQUE, remplacementFichier, vueDrive,
  type CurseurBibliotheque, type DonneesDrive, type FenetresBibliotheque, type MediaSource,
} from '@tiktrends/core';
import { session, semer } from './studios-semis';
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import { listAssets, pageBibliothequeAction, remplacerAssetAction } from '../app/actions/assets';
import { lireFenetre } from '../lib/bibliotheque-pages';

const ids = etat.ids;
const BASE = CFG.publicBaseUrl;
const N = 450;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');
const JPEG = Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAYDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAFWX/9k=', 'base64');
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

/* Le faux bucket · répond comme S3 sur l'hôte configuré (même banc que `bibliotheque-remplacer-fichier-db`). */
const bucket = new Map<string, Buffer>();
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  const methode = init?.method ?? 'GET';
  const h = new Headers(init?.headers);
  const prefixe = `/${CFG.bucket}/`;
  const cle = u.pathname.startsWith(prefixe) ? decodeURIComponent(u.pathname.slice(prefixe.length)) : '';
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  const corps = bucket.get(cle);
  if (methode === 'DELETE') { bucket.delete(cle); return new Response(null, { status: 204 }); }
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

const T = (minutesAvant: number) => new Date(Date.parse('2026-10-30T12:00:00.000Z') - minutesAvant * 60_000);
/** Un fichier téléversé au stockage de l'espace · la ligne telle que `registerUploadedAssetAction` l'écrit (empreinte comprise). */
const deposer = (nom: string, octets: Buffer) => {
  const cle = `assets/${ids.wsA}/1700000000000-pg-${nom}`;
  bucket.set(cle, octets);
  return { url: `${BASE}/${cle}`, cle };
};
const ANCIEN = 'photo-0449.png';
let ancien = '';

const pageRendue = async () => {
  const el = (await BibliothequeSpatiale({ searchParams: Promise.resolve({}) })) as ReactElement<{ donnees: DonneesDrive; pagination: FenetresBibliotheque; stockage: boolean }>;
  return el.props;
};
const lire = async (curseur: CurseurBibliotheque | null) => {
  const r = await pageBibliothequeAction({ portee: { type: 'dossier', dossier: 'r:assets' }, curseur });
  if ('error' in r) throw new Error(r.error);
  return r;
};
/** Toutes les pages de la racine depuis `depart`. */
const toutes = async (depart: CurseurBibliotheque | null) => {
  const out: MediaSource[] = [];
  let c = depart;
  for (let i = 0; i < 20; i++) { const p = await lire(c); out.push(...p.medias); if (!p.suivant) return out; c = p.suivant; }
  throw new Error('liste sans fin');
};

beforeAll(async () => {
  vi.stubGlobal('fetch', fauxBucket);
  await semer(db, schema, ids);
  const lignes = Array.from({ length: N }, (_, i) => {
    const nom = `photo-${String(i).padStart(4, '0')}.png`;
    const { url } = deposer(nom, PNG);
    return { workspaceId: ids.wsA, brandId: null, name: nom, kind: 'image' as const, source: 'upload' as const, url, mimeType: 'image/png', sizeBytes: PNG.length, objectEtag: md5(PNG), createdAt: T(i) };
  });
  for (let i = 0; i < lignes.length; i += 200) await db!.insert(schema.assets).values(lignes.slice(i, i + 200));
  ancien = (await db!.select({ id: schema.assets.id, name: schema.assets.name }).from(schema.assets)).find((l) => l.name === ANCIEN)!.id;
}, 120_000);

beforeEach(() => { etat.session = session(ids, 'ua'); });

describe('une adresse servie, quelle que soit la lecture', () => {
  it('fenêtre et page suivante · même adresse versionnée (`&e=`), même contenu, la même que `listAssets`', async () => {
    const { donnees } = await pageRendue();
    const fenetre = (await lireFenetre({ workspaceId: ids.wsA, marque: null }, { corbeille: false, limite: FENETRE_BIBLIOTHEQUE })).medias;
    const premiere = (await lire(null)).medias;
    expect(premiere.length).toBeGreaterThan(0);
    for (const m of premiere) {
      const f = fenetre.find((x) => x.id === m.id)!;
      expect(m, m.name).toEqual(f);
      expect(m.url).toMatch(new RegExp(`^/api/asset/${m.id}\\?v=[^&]+&e=${md5(PNG).slice(0, 16)}$`));
      expect(m.contenu).toBe('stockage');
      expect(donnees.fichiers.find((x) => x.id === m.id)!.url).toBe(m.url);
    }
    const [l] = await listAssets({ id: premiere[0]!.id });
    expect(l!.url).toBe(premiere[0]!.url);
  });
});

describe('« Remplacer » un fichier chargé par « Charger plus »', () => {
  it('hors de la fenêtre · proposé et ouvert, exactement comme un fichier de la fenêtre', async () => {
    const { donnees, pagination, stockage } = await pageRendue();
    expect(donnees.fichiers.some((f) => f.id === ancien), 'précondition · le plus ancien n’est pas dans la fenêtre').toBe(false);
    const avecPages = ajouterMedias(donnees, await toutes(pagination.vivants));
    const f = avecPages.fichiers.find((x) => x.id === ancien)!;
    const deLaFenetre = donnees.fichiers.find((x) => !x.supprime)!;
    expect(f.remplacement).toEqual({ famille: 'image', refus: null });
    expect(f.remplacement).toEqual(deLaFenetre.remplacement);
    expect(remplacementFichier(f, { lectureSeule: null, stockage })).toMatchObject({ ouvert: true, raison: null, famille: 'image' });
  });

  it('remplacé · nouvelle adresse lue par « Charger plus », une seule fois, et les comptes restent exacts', async () => {
    const avant = await pageRendue();
    const octetsAvant = avant.donnees.comptes!.octets['r:assets']!;
    const urlAvant = (await toutes(avant.pagination.vivants)).find((m) => m.id === ancien)!.url;
    const neuf = deposer('photo-0449-v2.jpg', JPEG);
    expect(await remplacerAssetAction({ id: ancien, url: neuf.url, mimeType: 'image/jpeg' })).toEqual({ ok: true });

    const apres = await pageRendue();
    const v = vueDrive(apres.donnees, ETAT_DRIVE_INITIAL);
    expect(v.onglets.find((o) => o.id === 'r:assets')!.compte).toBe(N);
    expect(apres.donnees.comptes!.vivants['r:assets']!.tous).toBe(N);
    expect(apres.donnees.comptes!.octets['r:assets']).toBe(octetsAvant - PNG.length + JPEG.length);
    const pages = await toutes(apres.pagination.vivants);
    const lus = [...apres.donnees.fichiers.filter((f) => !f.supprime).map((f) => f.id), ...pages.map((m) => m.id)];
    expect(new Set(lus).size).toBe(N);
    expect(lus.filter((x) => x === ancien)).toEqual([ancien]);
    const m = pages.find((x) => x.id === ancien)!;
    expect(m.url).not.toBe(urlAvant);
    expect(m.url).toMatch(new RegExp(`&e=${md5(JPEG).slice(0, 16)}$`));
    expect([m.mimeType, m.sizeBytes, m.contenu]).toEqual(['image/jpeg', JPEG.length, 'stockage']);
  });
});
