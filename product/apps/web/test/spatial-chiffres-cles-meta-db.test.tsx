// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SessionTest } from './studios-semis';

/**
 * Planche finale, D2 · sur la MÊME marque, l'Accueil montrait « Reporting Meta ·
 * 503 €, ROAS 1,53 », Analytics « les KPI du compte n'ont pas encore été
 * relevés », Jarvis « Chiffres clés · aucune source branchée · n.c. », le Radar
 * « aucune créa Meta relevée ». Chaque écran lisait SA source.
 *
 * Garde de RÉSULTAT sur une VRAIE base (pglite, migrations du dépôt) · on rend
 * les quatre VRAIES pages Spatial (vraies requêtes, vraie règle), pour trois
 * états de base · aucune donnée, mesure par annonce seule, KPI de compte (avec
 * la même mesure par annonce à côté, pour éprouver la priorité). On lit, dans
 * le HTML, les quatre chiffres (`data-chiffre-meta`) et la phrase de source
 * (`data-source-meta`) de chaque écran · ils doivent être IDENTIQUES, et égaux
 * aux valeurs attendues. Le Radar note exactement le nombre de créas que la
 * phrase annonce.
 */

const h = vi.hoisted(() => ({ session: null as SessionTest | null, marque: null as { id: string; name: string } | null, ids: {} as Record<string, string> }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['ws', 'u', 'b', 'c1', 'c2', 'i1', 'i2']) h.ids[k] = randomUUID();
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/brands')>()), getActiveBrand: async () => h.marque }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect ${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));
// Le bilan avancé d'Analytics n'est pas le sujet · ses actions ne lisent rien ici.
vi.mock('../app/actions/adsmap-attribution', () => ({ attributionViewAction: async () => ({}), creativeTrendAction: async () => ({}) }));

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { decalerJour, jourParis } from '@tiktrends/core';
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';
import RadarSpatial from '../app/(spatial)/sp/radar/page';
import JarvisSpatial from '../app/(spatial)/sp/jarvis/page';
import { avecSpatial } from './spatial/fournisseur';

const I = h.ids;
const HEURE = 3_600_000;
const ECRANS = ['Accueil', 'Analytics', 'Jarvis', 'Radar'] as const;
type Lu = { chiffres: Record<string, string>; source: string; creasNotees: number };

const net = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

/** Ce qu'un écran AFFICHE · ses quatre chiffres et sa phrase de source, lus dans le HTML. */
function lire(html: string): Lu {
  const d = document.createElement('div');
  d.innerHTML = html;
  const chiffres = Object.fromEntries([...d.querySelectorAll('[data-chiffre-meta]')].map((e) => [e.getAttribute('data-chiffre-meta')!, net(e.textContent)]));
  const sources = [...d.querySelectorAll('[data-source-meta]')].map((e) => net(e.textContent));
  return { chiffres, source: sources.length === 1 ? sources[0]! : `${sources.length} phrases de source`, creasNotees: d.querySelectorAll('[data-crea]').length };
}

async function quatreEcrans(): Promise<Record<(typeof ECRANS)[number], Lu>> {
  h.session = { user: { id: I.u!, email: 'proprio@chiffres.test', name: 'Camille' }, workspaceId: I.ws!, workspaceName: 'Espace', role: 'owner', plan: 'business', equipe: null };
  h.marque = { id: I.b!, name: 'Enissati' };
  return {
    Accueil: lire(renderToStaticMarkup(avecSpatial(await AccueilSpatial({ searchParams: Promise.resolve({}) })))),
    Analytics: lire(renderToStaticMarkup(avecSpatial(await AccueilSpatial({ searchParams: Promise.resolve({ vue: 'analytics' }) })))),
    Jarvis: lire(renderToStaticMarkup(avecSpatial(await JarvisSpatial({ searchParams: Promise.resolve({}) })))),
    Radar: lire(renderToStaticMarkup(avecSpatial(await RadarSpatial()))),
  };
}

async function etatBase(v: Partial<typeof schema.brands.$inferInsert>, mesures: boolean) {
  await db!.update(schema.brands).set({
    metaToken: 'jeton-chiffre', metaAdAccountId: 'act_1', metaAdAccounts: null, adsInsights: null, metaSyncedAt: null, adsmapSyncedAt: null, ...v,
  }).where(eq(schema.brands.id, I.b!));
  await db!.delete(schema.metricsDaily);
  if (!mesures) return;
  // Deux annonces suivies, mesurées dans la fenêtre (hier, il y a 10 jours) · plus une journée d'aujourd'hui, hors fenêtre.
  const auj = jourParis(new Date());
  await db!.insert(schema.metricsDaily).values([
    { adInstanceId: I.i1!, date: decalerJour(auj, -1), spend: 300, revenue: 450, conv: 10, impressions: 10000, clicks: 200, v3s: 3000, p75: 600 },
    { adInstanceId: I.i2!, date: decalerJour(auj, -10), spend: 203, revenue: 320, conv: 7, impressions: 5000, clicks: 50 },
    { adInstanceId: I.i1!, date: auj, spend: 999, revenue: 0, conv: 0 },
  ]);
}

/** Les quatre écrans affichent les MÊMES chiffres et la MÊME phrase de source, égaux à l'attendu. */
function memesChiffres(e: Record<string, Lu>, attendu: { chiffres: Record<string, string>; source: RegExp }) {
  const ref = e.Accueil!;
  for (const nom of ECRANS) {
    const lu = e[nom]!;
    expect(Object.keys(lu.chiffres), `${nom} · ses quatre chiffres clés`).toEqual(['depense', 'cpa', 'roas', 'valeur']);
    expect(lu.chiffres, `${nom} · chiffres`).toEqual(attendu.chiffres);
    expect(lu.source, `${nom} · phrase de source`).toMatch(attendu.source);
    expect(lu.chiffres, `${nom} contredit l'Accueil`).toEqual(ref.chiffres);
    expect(lu.source, `${nom} contredit l'Accueil`).toBe(ref.source);
  }
}

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: I.ws!, name: 'Espace', plan: 'business' });
  await db!.insert(schema.users).values({ id: I.u!, email: 'proprio@chiffres.test' });
  await db!.insert(schema.workspaceMembers).values({ workspaceId: I.ws!, userId: I.u!, role: 'owner' });
  await db!.insert(schema.brands).values({ id: I.b!, workspaceId: I.ws!, name: 'Enissati', description: 'Cosmétiques' });
  await db!.insert(schema.creatives).values([
    { id: I.c1!, brandId: I.b!, fingerprintHash: 'f1', type: 'video' },
    { id: I.c2!, brandId: I.b!, fingerprintHash: 'f2', type: 'image' },
  ]);
  await db!.insert(schema.adInstances).values([
    { id: I.i1!, creativeId: I.c1!, externalAdId: 'ad-1', adsetName: 'Routine du soir', platform: 'meta' },
    { id: I.i2!, creativeId: I.c2!, externalAdId: 'ad-2', adsetName: 'Huile pure', platform: 'meta' },
  ]);
});
beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Chiffres clés Meta · l’Accueil, Analytics, Jarvis et le Radar affichent les mêmes chiffres', () => {
  it('aucune donnée · quatre « n.c. » partout, la même phrase, aucune créa notée', async () => {
    await etatBase({ adsmapSyncedAt: new Date(Date.now() - 30 * HEURE) }, false);
    const e = await quatreEcrans();
    memesChiffres(e, { chiffres: { depense: 'n.c.', cpa: 'n.c.', roas: 'n.c.', valeur: 'n.c.' }, source: /^Aucun chiffre Meta sur les 30 derniers jours$/ });
    expect(e.Radar.creasNotees).toBe(0);
  });

  it('le cas du banc · mesure par annonce seule · les chiffres de l’Accueil partout, « d’après tes annonces suivies », et le Radar note ces deux créas', async () => {
    await etatBase({ adsmapSyncedAt: new Date(Date.now() - 30 * HEURE) }, true);
    const e = await quatreEcrans();
    memesChiffres(e, {
      chiffres: { depense: '503 €', cpa: '29,59 €', roas: '1,53', valeur: '770 €' },
      source: /^D’après tes annonces suivies · 30 jours au \d+ \S+ · 2 créas mesurées · le compte entier n’est pas encore relevé$/,
    });
    expect(e.Radar.creasNotees, 'le Radar note les créas que la phrase annonce').toBe(2);
  });

  it('KPI de compte · ils priment sur la mesure par annonce, partout · le Radar note les annonces du compte', async () => {
    const perf = (n: number) => ({ adId: `a${n}`, name: `Pub ${n}`, spend: 400 * n, impressions: 20000 * n, clicks: 300 * n, ctr: 1.5, roas: n, purchases: 10 * n, cpa: 40, hookRate: 25, holdRate: 30 });
    await etatBase({
      metaSyncedAt: new Date(Date.now() - 8 * 24 * HEURE), adsmapSyncedAt: new Date(Date.now() - 30 * HEURE),
      adsInsights: {
        accountName: 'Compte Enissati', currency: '€',
        window: { spend: 1200, revenue: 3000, purchases: 60, roas: 2.5, cpa: 20, aov: 50, impressions: 0, clicks: 0, linkClicks: 0, cpcAll: 1, cpcLink: 1.5, cpm: 10, ctr: 0 },
        previous: { spend: 1000, revenue: 2000, purchases: 40, roas: 2, cpa: 25, aov: 50, impressions: 0, clicks: 0, linkClicks: 0, cpcAll: 1, cpcLink: 1.5, cpm: 8, ctr: 0 },
        topAds: [], ads: [perf(1), perf(2), perf(3)],
      },
    }, true);
    const e = await quatreEcrans();
    memesChiffres(e, {
      chiffres: { depense: '1 200 €', cpa: '20,00 €', roas: '2,50', valeur: '3 000 €' },
      source: /^D’après ton compte publicitaire Meta · 30 jours au \d+ \S+ · 3 créas mesurées$/,
    });
    expect(e.Radar.creasNotees).toBe(3);
  });
});
