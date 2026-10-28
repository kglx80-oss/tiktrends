import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Sauvegardes Spatial · la collection active vit dans l'adresse
 * (`/saved?collection=f:Hiver`), relue au RENDU SERVEUR sur une vraie base
 * (pglite, migrations réelles). On lit le HTML : la collection pressée et les
 * cartes affichées. Une collection d'une autre marque, d'un autre espace ou
 * inexistante est ignorée · « Toutes » et un message honnête, aucune carte
 * d'ailleurs.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsA: randomUUID(), wsB: randomUUID(), marqueX: randomUUID(), marqueY: randomUUID(), camille: randomUUID() };
});
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({
  getSession: async () => ({ user: { id: ids.camille, email: 'camille@agence-a.test', name: 'Camille' }, workspaceId: ids.wsA, workspaceName: 'Agence A', role: 'member', plan: 'core' }),
}));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: ids.marqueY, name: 'Marque Y', workspaceId: ids.wsA }) }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error('redirect ' + u); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/saved',
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema } from '@tiktrends/db';
import type { InspoAd } from '@tiktrends/integrations';
import SavedPage from '../app/(spatial)/sp/saved/page';

const ad = (id: string): InspoAd => ({ id, platform: 'meta', status: 'active', daysRunning: 9, mediaType: 'image', advertiserName: `Annonceur ${id}`, thumbnailUrl: `https://cdn.exemple.test/${id}.jpg` });
const sauver = (ws: string, brandId: string | null, ext: string, folder: string | null) =>
  db!.insert(schema.savedAds).values({ workspaceId: ws, brandId, platform: 'meta', externalId: ext, snapshot: ad(ext), folder, createdAt: new Date('2026-10-01T10:00:00Z') });
const rendre = async (sp: Record<string, string>) => renderToStaticMarkup(await SavedPage({ searchParams: Promise.resolve(sp) }));
const presse = (h: string) => [...h.matchAll(/<button type="button" aria-pressed="true"><span>([^<]*)<\/span>/g)].map((m) => m[1]);
const cartes = (h: string) => [...h.matchAll(/Annonceur ([a-z0-9-]+)</g)].map((m) => m[1]).sort();

beforeAll(async () => {
  await db!.insert(schema.users).values([{ id: ids.camille, email: 'camille@agence-a.test', name: 'Camille' }]);
  await db!.insert(schema.workspaces).values([{ id: ids.wsA, name: 'Agence A', plan: 'core' }, { id: ids.wsB, name: 'Agence B', plan: 'core' }]);
  await db!.insert(schema.workspaceMembers).values([{ workspaceId: ids.wsA, userId: ids.camille, role: 'member' }]);
  await db!.insert(schema.brands).values([{ id: ids.marqueX, workspaceId: ids.wsA, name: 'Marque X' }, { id: ids.marqueY, workspaceId: ids.wsA, name: 'Marque Y' }]);
  await sauver(ids.wsA, ids.marqueY, 'y-hiver-1', 'Hiver');
  await sauver(ids.wsA, ids.marqueY, 'y-hiver-2', 'Hiver');
  await sauver(ids.wsA, ids.marqueY, 'y-ete', 'Été');
  await sauver(ids.wsA, ids.marqueY, 'y-libre', null);
  await sauver(ids.wsA, ids.marqueX, 'x-secret', 'Dossier X');
  await sauver(ids.wsB, null, 'b-secret', 'Dossier B');
});

describe('Sauvegardes Spatial · la collection active relue dans l’adresse', () => {
  it('?collection=f:Hiver · la collection est pressée et seules ses créas sont affichées', async () => {
    const h = await rendre({ collection: 'f:Hiver' });
    expect(presse(h), 'la collection de l’adresse n’est pas la collection active').toEqual(['Hiver']);
    expect(cartes(h)).toEqual(['y-hiver-1', 'y-hiver-2']);
    expect(h).not.toContain('data-collection-ignoree');
  });

  it('?collection=none · les non classées · les autres filtres de l’adresse s’appliquent aussi', async () => {
    const h = await rendre({ collection: 'none', tri: 'ancien' });
    expect(presse(h)).toEqual(['Non classées']);
    expect(cartes(h)).toEqual(['y-libre']);
  });

  it('une collection d’une autre marque, d’un autre espace ou inexistante · ignorée, « Toutes », et l’écran le dit', async () => {
    for (const c of ['f:Dossier X', 'f:Dossier B', 'f:Inconnue', 'Hiver']) {
      const h = await rendre({ collection: c });
      expect(presse(h), c).toEqual(['Toutes les sauvegardes']);
      expect(cartes(h), c).toEqual(['y-ete', 'y-hiver-1', 'y-hiver-2', 'y-libre']);
      expect(h, `${c} · aucun message honnête`).toContain('data-collection-ignoree');
      expect(h).toContain('Cette collection n’existe pas pour cette marque · toutes les sauvegardes sont affichées.');
      expect(h, 'le nom d’un dossier d’ailleurs est affiché').not.toMatch(/Dossier [XB]/);
    }
  });

  it('sans paramètre · « Toutes », aucun message', async () => {
    const h = await rendre({});
    expect(presse(h)).toEqual(['Toutes les sauvegardes']);
    expect(h).not.toContain('data-collection-ignoree');
  });
});
