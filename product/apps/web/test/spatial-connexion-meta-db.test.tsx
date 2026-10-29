// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SessionTest } from './studios-semis';

/**
 * Planche de banc v4 · trois écrans se CONTREDISAIENT sur la même marque ·
 * l'Accueil « Reporting Meta · synchronisé hier », la vue Analytics « Meta Ads
 * est connecté · première synchronisation en attente », le Radar « Aucune créa
 * synchronisée · Brancher Meta Ads ». Chacun lisait sa colonne et concluait seul.
 *
 * Garde de RÉSULTAT sur une VRAIE base (pglite, migrations du dépôt) · on rend
 * les trois VRAIES pages Spatial (vraies requêtes, vraie règle) pour un même
 * état de la marque, on lit le passage Meta de chacune, et on exige qu'elles
 * disent LA MÊME chose · le même libellé, aucun mot d'un autre état.
 *
 * Quatrième écran · Connexions (`/connections`), là où l'on branche Meta. Il
 * datait la carte par `meta_synced_at` seul · mesure Adsmap d'hier sans KPI de
 * compte, il disait « pas encore synchronisé » quand les trois autres disaient
 * « synchronisé hier ». Sa carte Meta est rendue par la VRAIE page et doit dire
 * la même chose que les trois autres, pour chaque état.
 */

const h = vi.hoisted(() => ({ session: null as SessionTest | null, marque: null as { id: string; name: string } | null, ids: {} as Record<string, string> }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['ws', 'u', 'b']) h.ids[k] = randomUUID();
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
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';
import RadarSpatial from '../app/(spatial)/sp/radar/page';
import ConnexionsSpatiales from '../app/(spatial)/sp/connections/page';
import { avecSpatial } from './spatial/fournisseur';

const I = h.ids;
const HEURE = 3_600_000;

/** Le texte visible du passage Meta d'une page (l'élément repéré par son attribut). */
function passage(html: string, repere: RegExp, balise = 'section'): string {
  const d = document.createElement('div');
  d.innerHTML = html;
  const s = [...d.querySelectorAll(balise)].find((x) => repere.test(x.outerHTML.slice(0, 200)));
  return (s?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

type Ecran = 'Accueil' | 'Analytics' | 'Radar' | 'Connexions';

/** Les quatre écrans, rendus par leurs VRAIES pages, pour l'état de base courant. */
async function lesEcrans(): Promise<Record<Ecran, string>> {
  h.session = { user: { id: I.u!, email: 'proprio@meta.test', name: 'Camille' }, workspaceId: I.ws!, workspaceName: 'Espace', role: 'owner', plan: 'business', equipe: null };
  h.marque = { id: I.b!, name: 'Neva' };
  const accueil = renderToStaticMarkup(avecSpatial(await AccueilSpatial({ searchParams: Promise.resolve({}) })));
  const analytics = renderToStaticMarkup(avecSpatial(await AccueilSpatial({ searchParams: Promise.resolve({ vue: 'analytics' }) })));
  const radar = renderToStaticMarkup(avecSpatial(await RadarSpatial()));
  const connexions = renderToStaticMarkup(avecSpatial(await ConnexionsSpatiales()));
  return {
    Accueil: passage(accueil, /id="reporting"/),
    Analytics: passage(analytics, /data-section="(encart-meta|meta)"/),
    Radar: passage(radar, /data-section="radar-creatif"/),
    Connexions: passage(connexions, /data-connexion="meta"/, 'article'),
  };
}

async function etatBase(v: Partial<typeof schema.brands.$inferInsert>) {
  await db!.update(schema.brands).set({
    metaToken: null, metaAdAccountId: null, metaAdAccounts: null, adsInsights: null, metaSyncedAt: null, adsmapSyncedAt: null, ...v,
  }).where(eq(schema.brands.id, I.b!));
}

/** Les quatre disent `libelle`, et aucun ne dit un mot d'un autre état. */
function dientLaMemeChose(ecrans: Record<string, string>, libelle: string, interdits: RegExp) {
  for (const [nom, t] of Object.entries(ecrans)) {
    expect(t, `${nom} · passage Meta introuvable`).not.toBe('');
    expect(t, `${nom} ne dit pas « ${libelle} »`).toContain(libelle);
    expect(t, `${nom} contredit « ${libelle} »`).not.toMatch(interdits);
  }
}

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: I.ws!, name: 'Espace', plan: 'business' });
  await db!.insert(schema.users).values({ id: I.u!, email: 'proprio@meta.test' });
  await db!.insert(schema.workspaceMembers).values({ workspaceId: I.ws!, userId: I.u!, role: 'owner' });
  await db!.insert(schema.brands).values({ id: I.b!, workspaceId: I.ws!, name: 'Neva', description: 'Maillots' });
});
beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Connexion Meta · l’Accueil, Analytics, le Radar et Connexions disent la même chose', () => {
  it('le cas du banc · mesure Adsmap d’hier, aucun KPI de compte · « synchronisé hier » partout, ni « en attente » ni « brancher »', async () => {
    await etatBase({ metaToken: 'jeton-chiffre', metaAdAccountId: 'act_1', adsmapSyncedAt: new Date(Date.now() - 30 * HEURE) });
    const e = await lesEcrans();
    dientLaMemeChose(e, 'Meta Ads · synchronisé hier', /en attente|non connecté|Connecter Meta|Brancher|compte pub à choisir|pas encore synchronisé/);
    expect(e.Connexions, 'Connexions · la carte reste la carte d’un compte branché').toMatch(/Connecté.*act_1/);
  });

  it('connecté, jamais synchronisé · « première synchronisation en attente » partout', async () => {
    await etatBase({ metaToken: 'jeton-chiffre', metaAdAccountId: 'act_1' });
    const e = await lesEcrans();
    dientLaMemeChose(e, 'Meta Ads connecté · première synchronisation en attente', /synchronisé (hier|il y a|à l’instant|le )|non connecté|Connecter Meta|Brancher/);
    // Les trois lecteurs renvoient vers le geste · Connexions le PORTE (bouton de la carte).
    for (const nom of ['Accueil', 'Analytics', 'Radar'] as const) expect(e[nom], `${nom} · le geste`).toContain('Synchroniser Meta Ads');
    expect(e.Connexions, 'Connexions · le geste').toContain('Synchroniser');
  });

  it('non connecté · « Meta Ads non connecté » partout, et le seul cas qui invite à connecter', async () => {
    await etatBase({ adsmapSyncedAt: new Date(Date.now() - 30 * HEURE) }); // une vieille mesure ne fait pas une connexion
    const e = await lesEcrans();
    dientLaMemeChose(e, 'Meta Ads non connecté', /synchronisé|en attente|compte pub à choisir/);
    for (const [nom, t] of Object.entries(e)) expect(t, `${nom} · le geste`).toContain('Connecter Meta Ads');
  });

  it('KPI du compte présents · Analytics les montre, et le même libellé ouvre les trois passages', async () => {
    await etatBase({
      metaToken: 'jeton-chiffre', metaAdAccountId: 'act_1', metaSyncedAt: new Date(Date.now() - 8 * 24 * HEURE), adsmapSyncedAt: new Date(Date.now() - 30 * HEURE),
      adsInsights: { accountName: 'Compte Neva', currency: '€', window: { spend: 1200, cpa: 20, roas: 2.5, revenue: 3000, aov: 50, cpcAll: 1, cpcLink: 1.5, cpm: 10 }, previous: { spend: 1000, cpa: 25, roas: 2, revenue: 2000, aov: 50, cpcAll: 1, cpcLink: 1.5, cpm: 8 } },
    });
    const e = await lesEcrans();
    dientLaMemeChose(e, 'Meta Ads · synchronisé hier', /en attente|non connecté|Connecter Meta|Brancher|synchronisé le /);
    expect(e.Analytics, 'les KPI gardent LEUR date · une mesure plus récente ne les rajeunit pas').toMatch(/KPI du \d+ \S+/);
  });

  it('plusieurs comptes pub, aucun choisi · « compte pub à choisir » partout, jamais « synchronisé »', async () => {
    await etatBase({
      metaToken: 'jeton-chiffre', metaAdAccounts: [{ id: 'act_1', name: 'Neva FR' }, { id: 'act_2', name: 'Neva ES' }],
      adsmapSyncedAt: new Date(Date.now() - 30 * HEURE),
    });
    const e = await lesEcrans();
    dientLaMemeChose(e, 'Meta Ads connecté · compte pub à choisir', /synchronisé|en attente|non connecté|Brancher/);
  });
});
