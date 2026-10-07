import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Chantier L0 · « Ce qui scale » ne range plus n'importe quelle recherche.
 *
 * Le rendu de `/veille/scale` écrivait `app_settings` (`veille:<pays>:<niche>`)
 * pour CHAQUE `?q=` nouveau · une ligne de cent créas par mot inventé, sans
 * borne. On appelle la VRAIE page (composant serveur) contre une vraie base
 * (pglite) et on lit ce qui a été écrit :
 *  - une recherche libre n'écrit plus rien en base (cache mémoire borné) ;
 *  - une niche proposée à l'écran, dans un pays proposé, reste rangée · cache
 *    technique borné (niches × pays), qui évite de repayer le fournisseur ;
 *  - l'appel au fournisseur au rendu reste (limite documentée) mais ne se
 *    répète pas pour une même recherche libre.
 */

const espion = vi.hoisted(() => ({ actif: false, ecritures: [] as string[] }));
const h = vi.hoisted(() => ({ appels: [] as string[] }));
const ECRITURE = /\binsert\s+into\b|\bupdate\s+"?[a-z_]+"?\s+set\b|\bdelete\s+from\b/i;

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { PGlite } = await import('@electric-sql/pglite');
  const proto = PGlite.prototype as unknown as { query: (sql: string, ...rest: unknown[]) => Promise<unknown> };
  const query = proto.query;
  proto.query = function (this: unknown, sql: string, ...rest: unknown[]) {
    if (espion.actif && ECRITURE.test(sql)) espion.ecritures.push(sql.replace(/\s+/g, ' ').slice(0, 160));
    return query.call(this, sql, ...rest);
  };
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, notFound: () => { throw new Error('404'); } }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: '00000000-0000-4000-8000-000000000001', role: 'owner', plan: 'plus', user: { id: 'u', email: 'owner@l0.test' } }) }));
vi.mock('../lib/brands', async (orig) => ({ ...(await orig<typeof import('../lib/brands')>()), getActiveBrand: async () => null }));
vi.mock('../app/(app)/veille/scale/SwipeFile', () => ({ SwipeFile: () => null }));
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  return {
    ...actual,
    ttSearchAds: async (_c: unknown, p: { search: string; country: string }) => {
      h.appels.push(`${p.country}:${p.search}`);
      return { ads: [{ id: `a-${p.search}`, platform: 'meta', advertiserName: 'Rival', body: 'Texte', reachDelta30d: 10 }], total: 1 };
    },
  };
});

import { db, schema } from '@tiktrends/db';
import ScalePage from '../app/(app)/veille/scale/page';

async function visiter(sp: Record<string, string>) {
  espion.ecritures = []; espion.actif = true;
  try { await ScalePage({ searchParams: Promise.resolve(sp) }); }
  finally { espion.actif = false; }
  return [...espion.ecritures];
}
const cles = async () => (await db.select({ k: schema.appSettings.key }).from(schema.appSettings)).map((r) => r.k).sort();

beforeAll(() => { process.env.TRENDTRACK_API_KEY = 'cle-factice-locale'; });
beforeEach(() => { h.appels = []; });

describe('/veille/scale · le cache persistant est borné', () => {
  it('une recherche libre n’écrit rien en base, et ne repaie pas le fournisseur à la visite suivante', async () => {
    const e1 = await visiter({ q: 'niche-inedite' });
    const e2 = await visiter({ q: 'niche-inedite' });
    const e3 = await visiter({ q: 'niche-inedite', refresh: '1' });
    expect([...e1, ...e2, ...e3], 'une recherche libre a écrit en base').toEqual([]);
    expect(await cles(), 'une recherche libre a créé une ligne app_settings').toEqual([]);
    expect(h.appels, 'la même recherche libre a rappelé le fournisseur').toEqual(['FR:niche-inedite']);
  });

  it('une analyse de marque (domaine) n’écrit rien non plus', async () => {
    expect(await visiter({ q: 'https://boutique-rivale.test' })).toEqual([]);
    expect(await cles()).toEqual([]);
  });

  it('un pays inventé n’ouvre pas de ligne', async () => {
    expect(await visiter({ q: 'café', country: 'ZZ' })).toEqual([]);
    expect(await cles()).toEqual([]);
  });

  it('la niche par défaut reste rangée (cache technique borné), puis servie sans rappeler', async () => {
    const e = await visiter({});
    expect(e.length, 'la niche proposée n’a pas été rangée').toBe(1);
    expect(await cles()).toEqual(['veille:FR:café']);
    expect(await visiter({}), 'une seconde visite a réécrit le cache').toEqual([]);
    expect(h.appels).toEqual(['FR:café']);
  });
});
