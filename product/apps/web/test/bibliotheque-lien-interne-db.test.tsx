import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · le LIEN INTERNE (« Copier le lien ») ouvert par l'adresse ·
 * sur une VRAIE base (pglite, migrations du dépôt) et la VRAIE page Spatial
 * `/assets`, la VRAIE marque active (`getActiveBrand`, cookie posé sur A1). On
 * lit le HTML rendu · jamais la présence d'un appel.
 *
 * `?fichier=<id>` d'un fichier de l'espace dans la portée de la marque · son
 * aperçu est OUVERT, dans son dossier. `?dossier=<id>` · ce dossier est ouvert.
 * Un fichier d'un autre espace, d'une marque hors portée, à la corbeille, un
 * dossier d'un autre espace ou jeté, un identifiant inconnu ou forgé · la page
 * est rendue EXACTEMENT comme sans paramètre (même HTML, octet pour octet ·
 * aucune fuite d'existence). Un lecteur client (`client_viewer`) est renvoyé à
 * l'accueil, avec ou sans paramètre. En lecture seule (Starter), le lien
 * s'ouvre · c'est une lecture.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
// Marque active · le VRAI `getActiveBrand` (qui vérifie l'espace), cookie posé sur A1.
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (k === 'tt_brand' ? { value: etat.ids.brandA1 } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (f: unknown) => f }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/assets',
}));
vi.mock('../lib/studios/bibliotheque', () => ({ listerSortiesStudiosBibliotheque: async () => [], sortieCommeAsset: (x: unknown) => x }));
vi.mock('../lib/creations-historiques', () => ({ listerCreationsHistoriques: async () => [], creationCommeAsset: (x: unknown) => x }));

import { db, schema } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

const ids = etat.ids;
const F = { range: '', commun: '', horsMarque: '', jete: '', autreEspace: '' };
const D = { photos: '', jete: '', autreEspace: '' };
const INCONNU = '00000000-0000-4000-8000-000000000000';

const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const page = async (sp: Record<string, string> = {}) => renderToStaticMarkup(
  <FournisseurSpatial value={CTX}>{(await BibliothequeSpatiale({ searchParams: Promise.resolve(sp) })) as ReactElement}</FournisseurSpatial>,
);
/** Le titre de l'aperçu ouvert · null sans aperçu. */
const apercu = (html: string) => html.match(/<aside class="tile dprev" aria-label="Aperçu"><div class="sech"[^>]*><strong[^>]*>([^<]*)<\/strong>/)?.[1] ?? null;
/** Le fil d'Ariane · le dossier ouvert en dernier. */
const fil = (html: string) => [...(html.match(/<nav class="crumb" aria-label="Emplacement">([\s\S]*?)<\/nav>/)?.[1] ?? '').matchAll(/>([^<>]+)</g)].map((m) => m[1]!.trim()).filter((x) => x && x !== '/' && x !== '›');

const media = async (workspaceId: string, name: string, extra: Partial<typeof schema.assets.$inferInsert> = {}) => {
  const [r] = await db!.insert(schema.assets).values({
    workspaceId, brandId: workspaceId === ids.wsA ? ids.brandA1 : ids.brandB1, name, kind: 'image', source: 'upload',
    url: `https://stockage.invalid/assets/${workspaceId}/${name.replace(/\W/g, '')}.png`, mimeType: 'image/png', ...extra,
  }).returning({ id: schema.assets.id });
  return r!.id;
};
const dossier = async (workspaceId: string, name: string, extra: Partial<typeof schema.libraryFolders.$inferInsert> = {}) => {
  const [r] = await db!.insert(schema.libraryFolders).values({ workspaceId, name, ...extra }).returning({ id: schema.libraryFolders.id });
  return r!.id;
};

beforeAll(async () => {
  await semer(db, schema, ids);
  D.photos = await dossier(ids.wsA, 'Photos produit');
  D.jete = await dossier(ids.wsA, 'Ancien shooting', { deletedAt: new Date() });
  D.autreEspace = await dossier(ids.wsB, 'Dossier secret de B');
  F.range = await media(ids.wsA, 'flacon face.png', { folderId: D.photos });
  F.commun = await media(ids.wsA, 'logo commun.png', { brandId: null });
  F.horsMarque = await media(ids.wsA, 'pot marque A2.png', { brandId: ids.brandA2 });
  F.jete = await media(ids.wsA, 'tube jete.png', { deletedAt: new Date() });
  F.autreEspace = await media(ids.wsB, 'secret de B.png');
});

describe('un lien de l’espace · l’aperçu ou le dossier s’ouvre depuis l’adresse', () => {
  it('`?fichier=` d’un fichier rangé · son aperçu ouvert, dans son dossier', async () => {
    etat.session = session(ids, 'ua');
    const sans = await page();
    expect(apercu(sans), 'sans paramètre, aucun aperçu n’est ouvert').toBeNull();
    const html = await page({ fichier: F.range });
    expect(apercu(html)).toBe('flacon face.png');
    expect(fil(html).at(-1)).toBe('Photos produit');
  });

  it('`?fichier=` d’un fichier commun à toutes les marques · ouvert aussi (même portée que la liste)', async () => {
    etat.session = session(ids, 'ua');
    expect(apercu(await page({ fichier: F.commun }))).toBe('logo commun.png');
    // Majuscules · le même fichier.
    expect(apercu(await page({ fichier: F.commun.toUpperCase() }))).toBe('logo commun.png');
  });

  it('`?dossier=` · ce dossier ouvert, aucun aperçu', async () => {
    etat.session = session(ids, 'ua');
    const html = await page({ dossier: D.photos });
    expect(apercu(html)).toBeNull();
    expect(fil(html).at(-1)).toBe('Photos produit');
    expect(html).toContain('flacon face.png');
    expect(fil(await page()).at(-1), 'sans paramètre, la page s’ouvre sur la racine').not.toBe('Photos produit');
  });

  it('lecture seule (Starter) · le lien s’ouvre, c’est une lecture', async () => {
    etat.session = session(ids, 'ua', { plan: 'starter' });
    expect(apercu(await page({ fichier: F.range }))).toBe('flacon face.png');
  });
});

describe('hors portée · la page est rendue EXACTEMENT comme sans paramètre (aucune fuite d’existence)', () => {
  const CAS: Array<[string, () => Record<string, string>, string | null]> = [
    ['un fichier d’un autre espace', () => ({ fichier: F.autreEspace }), 'secret de B.png'],
    ['un fichier d’une marque hors portée (A2, marque active A1)', () => ({ fichier: F.horsMarque }), 'pot marque A2.png'],
    ['un fichier à la corbeille', () => ({ fichier: F.jete }), null],
    ['un identifiant inconnu', () => ({ fichier: INCONNU }), null],
    ['un identifiant forgé', () => ({ fichier: `${F.range}' or 1=1` }), null],
    ['un dossier d’un autre espace', () => ({ dossier: D.autreEspace }), 'Dossier secret de B'],
    ['un dossier à la corbeille', () => ({ dossier: D.jete }), null],
    ['un dossier inconnu', () => ({ dossier: INCONNU }), null],
  ];
  for (const [quoi, sp, nom] of CAS) {
    it(quoi, async () => {
      etat.session = session(ids, 'ua');
      const sans = await page();
      const avec = await page(sp());
      expect(apercu(avec)).toBeNull();
      expect(avec === sans, 'le rendu diffère de celui sans paramètre').toBe(true);
      if (nom) expect(avec).not.toContain(nom);
    });
  }
  it('un membre de B · le lien d’un fichier de A ne s’ouvre pas, même rendu que sans paramètre', async () => {
    etat.session = session(ids, 'ub');
    const sans = await page();
    const avec = await page({ fichier: F.range });
    expect([apercu(avec), avec === sans, avec.includes('flacon face.png')]).toEqual([null, true, false]);
  });
});

describe('un lecteur client (`client_viewer`) · renvoyé à l’accueil, avec ou sans paramètre', () => {
  it('même redirection · le lien ne lui ouvre rien', async () => {
    etat.session = session(ids, 'uv');
    await expect(page()).rejects.toThrow('REDIRECT /dashboard');
    await expect(page({ fichier: F.range })).rejects.toThrow('REDIRECT /dashboard');
    await expect(page({ dossier: D.photos })).rejects.toThrow('REDIRECT /dashboard');
  });
  it('sans session · renvoyé à la connexion', async () => {
    etat.session = null;
    await expect(page({ fichier: F.range })).rejects.toThrow('REDIRECT /login');
  });
});
