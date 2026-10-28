import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { ReactElement } from 'react';

/**
 * Vague 4 · les derniers gestes des pages V5 de la Veille, portés dans les
 * pages Spatial (avant le retrait des pages V5) · on appelle la VRAIE page
 * serveur contre une base pglite et un fournisseur simulé, et on lit ce
 * qu'elle a fait (appels au fournisseur) ou ce qu'elle donne à la vue.
 *  - Pubs du moment · `?refresh=1` relit la source au lieu du cache mémoire ;
 *  - Ce qui scale · l'analyse d'UNE marque mène à toutes ses pubs ;
 *  - Tous les formats · les anciennes adresses `?format=` mènent aux
 *    Sauvegardes filtrées.
 */
const h = vi.hoisted(() => ({ appels: [] as string[] }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error('redirect ' + u); }, notFound: () => { throw new Error('404'); } }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: '00000000-0000-4000-8000-000000000004', role: 'owner', plan: 'plus', user: { id: 'u', email: 'owner@v4.test' } }) }));
vi.mock('../lib/brands', async (orig) => ({ ...(await orig<typeof import('../lib/brands')>()), getActiveBrand: async () => null }));
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  return {
    ...actual,
    ttSearchAds: async (_c: unknown, p: { search: string; searchIn?: string }) => {
      h.appels.push(`${p.searchIn ?? ''}:${p.search}`);
      return { ads: [{ id: `a-${p.search}`, platform: 'meta', advertiserName: 'Rival', body: 'Texte', reachDelta30d: 10, daysRunning: 12 }], total: 1 };
    },
  };
});

import VeillePage from '../app/(spatial)/sp/veille/page';
import ScalePage from '../app/(spatial)/sp/veille/scale/page';
import FormatsPage from '../app/(spatial)/sp/veille/formats/page';

beforeAll(() => { process.env.TRENDTRACK_API_KEY = 'cle-factice-locale'; });
beforeEach(() => { h.appels = []; });

describe('Pubs du moment (Spatial) · `?refresh=1`', () => {
  it('une même recherche est servie par le cache · `refresh=1` relit la source', async () => {
    await VeillePage({ searchParams: Promise.resolve({ q: 'recherche-v4' }) });
    await VeillePage({ searchParams: Promise.resolve({ q: 'recherche-v4' }) });
    expect(h.appels, 'la même recherche a rappelé le fournisseur').toEqual(['ad_copy:recherche-v4']);
    await VeillePage({ searchParams: Promise.resolve({ q: 'recherche-v4', refresh: '1' }) });
    expect(h.appels, '`refresh=1` n’a pas relu la source').toEqual(['ad_copy:recherche-v4', 'ad_copy:recherche-v4']);
  });
});

describe('Pubs du moment (Spatial) · l’échantillon hors catégorie est dit (ex N03, Veille V5)', () => {
  it('sans catégorie de marque · « hors catégorie » et l’invitation à la préciser · une recherche ne le dit pas', async () => {
    const defaut = (await VeillePage({ searchParams: Promise.resolve({}) })) as ReactElement<{ sous: string }>;
    expect(defaut.props.sous).toMatch(/^Pistes installées de ta catégorie · « [^»]+ » · hors catégorie, précise la catégorie de ta marque pour cibler · /);
    const cherche = (await VeillePage({ searchParams: Promise.resolve({ q: 'serum' }) })) as ReactElement<{ sous: string }>;
    expect(cherche.props.sous).not.toContain('hors catégorie');
  });
});

describe('Ce qui scale (Spatial) · l’analyse d’une marque', () => {
  type Outils = { outils: { marque: { terme: string; href: string } | null } };
  it('un domaine tapé · la vue reçoit le lien vers toutes ses pubs · une niche · rien', async () => {
    const mono = (await ScalePage({ searchParams: Promise.resolve({ q: 'https://www.boutique-rivale.test/produit' }) })) as ReactElement<Outils>;
    expect(mono.props.outils.marque).toEqual({ terme: 'boutique-rivale.test', href: '/veille?q=boutique-rivale.test' });
    const niche = (await ScalePage({ searchParams: Promise.resolve({ q: 'skincare' }) })) as ReactElement<Outils>;
    expect(niche.props.outils.marque).toBeNull();
  });
});

describe('Tous les formats (Spatial) · les anciennes adresses de l’écran Formats', () => {
  it('`?format=` mène aux Sauvegardes filtrées (tri et média gardés)', async () => {
    await expect(FormatsPage({ searchParams: Promise.resolve({ format: 'non_classe', tri: 'duree', media: 'video', plateforme: 'meta' }) }))
      .rejects.toThrow('redirect /saved?format=non_classe&tri=duree&media=video');
  });
  it('sans `?format=` · l’écran des styles, avec ses files de classement', async () => {
    const el = (await FormatsPage({ searchParams: Promise.resolve({}) })) as ReactElement<{ files: unknown[] }>;
    expect(el.props.files).toEqual([]);
  });
});
