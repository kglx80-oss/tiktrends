import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { and, count, eq } from 'drizzle-orm';

/**
 * Lot 19C · message 55 · constats b, c, d, e sur une VRAIE base (pglite,
 * migrations réelles). On appelle les actions serveur et on rend la page
 * `/veille/formats` · on lit la ligne en base, la réponse, le HTML.
 *
 * b · l'auteur d'un classement vient de la SESSION, jamais du JSON client ·
 *     l'affichage de l'auteur ne révèle rien hors de l'espace (ni nom d'un
 *     autre espace, ni e-mail, ni partie d'e-mail).
 * c · classer et lire se limitent à l'espace ET à la marque active · une
 *     sauvegarde d'une autre marque ou d'un autre espace est refusée / absente ·
 *     `saveAd` ne répond pas « oui » quand l'annonce reste invisible ici.
 * d · le pont Adsmap (« Préparer un test » → `trackSavedAdAction`) refuse côté
 *     SERVEUR sans le droit Adsmap (offre Plus) · le bouton suit le même droit.
 * e · une valeur de l'ANCIENNE taxonomie déjà en base reste lisible, et elle
 *     est signalée « à revoir » au lieu d'être reclassée en silence.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return {
    wsA: randomUUID(), wsB: randomUUID(), marqueX: randomUUID(), marqueY: randomUUID(),
    camille: randomUUID(), sansNom: randomUUID(), externeSansNom: randomUUID(), externeNomme: randomUUID(),
  };
});
const session = vi.hoisted(() => ({ plan: 'core' as string, role: 'member' as string, marque: 'Y' as 'X' | 'Y' | null }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: { id: ids.camille, email: 'camille@agence-a.test', name: 'Camille' },
    workspaceId: ids.wsA, workspaceName: 'Agence A', role: session.role, plan: session.plan,
  }),
}));
vi.mock('../lib/brands', () => ({
  getActiveBrand: async () => session.marque === null ? null
    : session.marque === 'X' ? { id: ids.marqueX, name: 'Marque X', workspaceId: ids.wsA } : { id: ids.marqueY, name: 'Marque Y', workspaceId: ids.wsA },
}));
// Le pont ne doit RIEN atteindre de payant ni de lent · la mémoire Jarvis est neutralisée.
vi.mock('../lib/jarvis-memory', () => ({ invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }) }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error('redirect ' + u); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/veille/formats',
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }), useToastSiPresent: () => null }));

import { db, schema } from '@tiktrends/db';
import { classerFormatSauvegarde, saveAd } from '../app/actions/inspo';
import { trackSavedAdAction } from '../app/actions/adsmap-bridge';
import FormatsPage from '../app/(app)/veille/formats/page';
import type { InspoAd } from '@tiktrends/integrations';

const ad = (id: string, mediaType: string): InspoAd =>
  ({ id, platform: 'meta', status: 'active', daysRunning: 9, mediaType, advertiserName: 'Annonceur ' + id, thumbnailUrl: `https://cdn.exemple.test/${id}.jpg` });
const classe = (id: string, auteur: string) => ({ id, version: 1, date: '2026-10-04T09:00:00Z', auteur });
const sauver = (ws: string, brandId: string | null, ext: string, snap: Record<string, unknown>) =>
  db!.insert(schema.savedAds).values({ workspaceId: ws, brandId, platform: 'meta', externalId: ext, snapshot: snap, createdAt: new Date('2026-10-01T10:00:00Z') });
async function ligne(ws: string, ext: string) {
  const [r] = await db!.select().from(schema.savedAds)
    .where(and(eq(schema.savedAds.workspaceId, ws), eq(schema.savedAds.platform, 'meta'), eq(schema.savedAds.externalId, ext)));
  return r;
}
const rendre = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await FormatsPage({ searchParams: Promise.resolve(sp) }));
const carte = (h: string, ext: string) => { const i = h.indexOf(`data-annonce="${ext}"`); return i < 0 ? '' : h.slice(i, h.indexOf('</article>', i)); };

beforeAll(async () => {
  await db!.insert(schema.users).values([
    { id: ids.camille, email: 'camille@agence-a.test', name: 'Camille' },
    { id: ids.sansNom, email: 'membre.sans.nom@agence-a.test', name: null },
    { id: ids.externeSansNom, email: 'secret.personne@autre-espace.test', name: null },
    { id: ids.externeNomme, email: 'dominique@autre-espace.test', name: 'Dominique Externe' },
  ]);
  await db!.insert(schema.workspaces).values([{ id: ids.wsA, name: 'Agence A', plan: 'core' }, { id: ids.wsB, name: 'Agence B', plan: 'core' }]);
  await db!.insert(schema.workspaceMembers).values([
    { workspaceId: ids.wsA, userId: ids.camille, role: 'member' },
    { workspaceId: ids.wsA, userId: ids.sansNom, role: 'member' },
    { workspaceId: ids.wsB, userId: ids.externeSansNom, role: 'member' },
    { workspaceId: ids.wsB, userId: ids.externeNomme, role: 'member' },
  ]);
  await db!.insert(schema.brands).values([{ id: ids.marqueX, workspaceId: ids.wsA, name: 'Marque X' }, { id: ids.marqueY, workspaceId: ids.wsA, name: 'Marque Y' }]);
  // Marque Y (active) · quatre auteurs, une ancienne valeur, une valeur retirée.
  await sauver(ids.wsA, ids.marqueY, 'y-camille', { ...ad('y-camille', 'image'), formatCreatif: classe('packshot', ids.camille) });
  await sauver(ids.wsA, ids.marqueY, 'y-sans-nom', { ...ad('y-sans-nom', 'image'), formatCreatif: classe('packshot', ids.sansNom) });
  await sauver(ids.wsA, ids.marqueY, 'y-externe-sans-nom', { ...ad('y-externe-sans-nom', 'image'), formatCreatif: classe('packshot', ids.externeSansNom) });
  await sauver(ids.wsA, ids.marqueY, 'y-externe-nomme', { ...ad('y-externe-nomme', 'image'), formatCreatif: classe('packshot', ids.externeNomme) });
  await sauver(ids.wsA, ids.marqueY, 'y-ancienne', { ...ad('y-ancienne', 'video'), formatCreatif: 'ugc_talking_head' });
  await sauver(ids.wsA, ids.marqueY, 'y-retiree', { ...ad('y-retiree', 'image'), formatCreatif: { id: 'ai_generated' } });
  await sauver(ids.wsA, ids.marqueY, 'y-a-classer', ad('y-a-classer', 'image'));
  // Marque X (même espace) · une annonce non classée.
  await sauver(ids.wsA, ids.marqueX, 'x-autre-marque', ad('x-autre-marque', 'image'));
  // Autre espace.
  await sauver(ids.wsB, null, 'b-seule', ad('b-seule', 'image'));
});
beforeEach(() => { session.plan = 'core'; session.role = 'member'; session.marque = 'Y'; });

describe('b · auteur du classement', () => {
  it('l’auteur écrit est celui de la SESSION · un auteur glissé dans le JSON est ignoré', async () => {
    const r = await classerFormatSauvegarde({ platform: 'meta', externalId: 'y-a-classer', format: 'packshot', auteur: ids.externeNomme } as unknown as Parameters<typeof classerFormatSauvegarde>[0]);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const fc = (await ligne(ids.wsA, 'y-a-classer'))!.snapshot as { formatCreatif: { auteur: string } };
    expect(fc.formatCreatif.auteur, 'l’auteur vient du client').toBe(ids.camille);
    await classerFormatSauvegarde({ platform: 'meta', externalId: 'y-a-classer', format: 'non_classe' });
  });

  it('saveAd · un classement (et son auteur) glissé dans le snapshot n’est jamais écrit', async () => {
    session.marque = null;
    const r = await saveAd({ platform: 'meta', externalId: 'passager-m55', snapshot: { ...ad('passager-m55', 'image'), formatCreatif: classe('packshot', ids.externeNomme) } as unknown as InspoAd });
    expect(r.ok).toBe(true);
    expect(((await ligne(ids.wsA, 'passager-m55'))!.snapshot as Record<string, unknown>).formatCreatif).toBeUndefined();
    await db!.delete(schema.savedAds).where(and(eq(schema.savedAds.workspaceId, ids.wsA), eq(schema.savedAds.externalId, 'passager-m55')));
  });

  it('l’auteur affiché · un membre par son nom, rien d’un autre espace, aucun morceau d’e-mail', async () => {
    const h = await rendre({ format: 'packshot' });
    expect(carte(h, 'y-camille'), 'la carte de Camille n’est pas rendue').toContain('par Camille');
    expect(h, 'un morceau d’e-mail d’un autre espace est affiché').not.toContain('secret.personne');
    expect(h, 'le nom d’une personne d’un autre espace est affiché').not.toContain('Dominique Externe');
    expect(h, 'un morceau d’e-mail d’un membre est affiché').not.toContain('membre.sans.nom');
    expect(h).not.toMatch(/@(agence-a|autre-espace)\.test/);
    expect(carte(h, 'y-sans-nom'), 'un membre sans nom n’a pas de libellé').toContain('par un membre de l’espace');
    expect(carte(h, 'y-externe-sans-nom')).toContain('classée le 04/10/2026');
    expect(carte(h, 'y-externe-sans-nom'), 'un auteur hors de l’espace est nommé').not.toMatch(/classée le [^<]*<!-- --> par /);
  });
});

describe('c · espace ET marque active', () => {
  it('classer une sauvegarde d’une AUTRE marque de l’espace est refusé, rien n’est écrit', async () => {
    const avant = await ligne(ids.wsA, 'x-autre-marque');
    const r = await classerFormatSauvegarde({ platform: 'meta', externalId: 'x-autre-marque', format: 'packshot' });
    expect(r.ok, 'une sauvegarde d’une autre marque est classée depuis la marque active').toBe(false);
    expect(!r.ok && r.error).toBe('Annonce introuvable dans les sauvegardes de cette marque · recharge la page.');
    expect((await ligne(ids.wsA, 'x-autre-marque'))!.snapshot).toEqual(avant!.snapshot);
  });

  it('la même sauvegarde se classe depuis SA marque', async () => {
    session.marque = 'X';
    const r = await classerFormatSauvegarde({ platform: 'meta', externalId: 'x-autre-marque', format: 'packshot' });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    await classerFormatSauvegarde({ platform: 'meta', externalId: 'x-autre-marque', format: 'non_classe' });
  });

  it('classer une sauvegarde d’un autre espace est refusé, rien n’est écrit', async () => {
    session.marque = null;
    const avant = await ligne(ids.wsB, 'b-seule');
    const r = await classerFormatSauvegarde({ platform: 'meta', externalId: 'b-seule', format: 'packshot' });
    expect(r.ok).toBe(false);
    expect((await ligne(ids.wsB, 'b-seule'))!.snapshot).toEqual(avant!.snapshot);
  });

  it('/veille/formats · la marque active seule · ni l’autre marque ni l’autre espace', async () => {
    const h = await rendre({ format: 'non_classe' });
    expect(h).toContain('data-annonce="y-a-classer"');
    expect(h, 'une sauvegarde d’une autre marque est listée').not.toContain('x-autre-marque');
    expect(h, 'une sauvegarde d’un autre espace est listée').not.toContain('b-seule');
    session.marque = 'X';
    const hx = await rendre({ format: 'non_classe' });
    expect(hx).toContain('data-annonce="x-autre-marque"');
    expect(hx).not.toContain('y-a-classer');
  });

  it('saveAd · une annonce déjà gardée pour une AUTRE marque ne répond pas « sauvegardée » ici', async () => {
    const r = await saveAd({ platform: 'meta', externalId: 'x-autre-marque', snapshot: ad('x-autre-marque', 'image') });
    expect(r.ok, 'oui répondu alors que l’annonce reste invisible dans les sauvegardes de la marque active').toBe(false);
    expect(!r.ok && r.error).toContain('autre marque');
    expect((await ligne(ids.wsA, 'x-autre-marque'))!.brandId, 'la sauvegarde a changé de marque').toBe(ids.marqueX);
  });

  it('saveAd · déjà gardée pour CETTE marque · oui (idempotent)', async () => {
    const r = await saveAd({ platform: 'meta', externalId: 'y-camille', snapshot: ad('y-camille', 'image') });
    expect(r.ok).toBe(true);
  });
});

describe('d · pont Adsmap · droit vérifié côté serveur', () => {
  const concepts = async () => (await db!.select({ n: count() }).from(schema.concepts).where(eq(schema.concepts.workspaceId, ids.wsA)))[0]!.n;

  it('Core (sans Adsmap) · l’action refuse, aucun concept créé', async () => {
    const avant = await concepts();
    const r = await trackSavedAdAction({ platform: 'meta', externalId: 'y-camille' });
    expect(r.error).toBe('Adsmap est disponible à partir de l’offre Plus.');
    expect(r.ok).toBeUndefined();
    expect(await concepts()).toBe(avant);
  });

  it('Starter · l’action refuse aussi', async () => {
    session.plan = 'starter';
    const r = await trackSavedAdAction({ platform: 'meta', externalId: 'y-camille' });
    expect(r.error).toBe('Adsmap est disponible à partir de l’offre Plus.');
  });

  it('Plus, lecteur client · refus par le rôle', async () => {
    session.plan = 'plus'; session.role = 'client_viewer';
    const r = await trackSavedAdAction({ platform: 'meta', externalId: 'y-camille' });
    expect(r.error).toBe('Ton rôle ne permet pas d’accéder à Adsmap.');
  });

  it('le bouton suit le même droit · absent en Core, présent en Plus', async () => {
    const core = await rendre({ format: 'packshot' });
    expect(core).toContain('data-annonce="y-camille"');
    expect(core, 'le pont Adsmap est proposé sans le droit Adsmap').not.toContain('Préparer un test');
    session.plan = 'plus';
    const plus = await rendre({ format: 'packshot' });
    expect(plus).toContain('Préparer un test · Adsmap');
  });
});

describe('e · ancienne taxonomie déjà en base', () => {
  it('une ancienne valeur reprise reste lisible ET est signalée « à revoir »', async () => {
    const h = await rendre({ format: 'face_camera' });
    const c = carte(h, 'y-ancienne');
    expect(c, 'la sauvegarde à l’ancienne valeur n’est pas rendue').not.toBe('');
    expect(c).toContain('<option value="face_camera" selected="">Face caméra</option>');
    expect(c, 'ancienne valeur reclassée en silence').toContain('classée avec une version antérieure de la liste, à revoir');
  });

  it('une valeur retirée (ai_generated) · non classée, et signalée', async () => {
    const h = await rendre({ format: 'non_classe' });
    const c = carte(h, 'y-retiree');
    expect(c, 'la sauvegarde à la valeur retirée n’est pas rendue').not.toBe('');
    expect(c).toContain('<option value="non_classe" selected="">Non classé</option>');
    expect(c, 'valeur retirée effacée en silence').toContain('classée avec une version antérieure de la liste, à revoir');
  });

  it('un classement v1 n’est PAS signalé', async () => {
    const h = await rendre({ format: 'packshot' });
    expect(carte(h, 'y-camille')).not.toContain('version antérieure');
  });
});
