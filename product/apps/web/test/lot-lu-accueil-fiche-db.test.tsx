// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Ce que l'Accueil et la fiche disent d'un lot (suite de #1113) · sur une
 * VRAIE base (pglite, migrations du dépôt), avec les VRAIES gardes et les
 * VRAIES vues · l'Accueil (`/dashboard`), la fiche d'un lot
 * (`/adsmap/lots/[id]`) et l'écran d'import (`/adsmap/import?lot=`) · on lit
 * le DOM. Toutes les dates sont en 2020 · plus de 120 jours ont passé.
 *  · #10 · deux variantes · `a1` arbitrée, `z9` sans verdict · l'ancienne
 *    lecture était bornée globalement (2 000 variantes par code) et un lot de
 *    remplissage (#9, 1 995 brouillons `b…`) poussait `z9` au-delà · elle ne
 *    voyait que `a1`, arbitrée · le lot sortait « conclu » et disparaissait de
 *    « fin prévue passée ». Chaque lot est désormais lu en entier ou dit lu en
 *    partie (`lotsALire`) · #10 est lu en entier, le remplissage (au-delà du
 *    plafond d'un lot) ne l'est pas · #10 reste dans « fin prévue passée » ;
 *  · #12 · `a2` sans verdict, `a3` calculée à J3, jamais recalculée · « fin
 *    prévue passée » · le diagnostic dit « mesures arrêtées », pas « 1
 *    variante sur 2 sans mesure » ;
 *  · #11 · `a4`, `a5` calculées à J3 · l'état s'arbitre (borne de 120 jours,
 *    gardée) · la fiche dit à l'arbitre que la fenêtre est incomplète et lui
 *    donne le recours (l'import de CE lot) · on suit le lien · l'import dit
 *    « mesures arrêtées ».
 * Aucun réseau, 0 $.
 */

const h = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['ws', 'b', 'uo']) h.ids[k] = randomUUID();
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('../lib/brands', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/brands')>()), getActiveBrand: async () => h.marque }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); },
  notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }), headers: async () => new Headers({ host: 'localhost' }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));
vi.mock('../app/actions/adsmap-attribution', () => ({ attributionViewAction: async () => ({}), creativeTrendAction: async () => ({}) }));

import { db, schema } from '@tiktrends/db';
import { lienImportLot, nombreVariantes, phraseFinPrevuePassee } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import ImportSpatial from '../app/(spatial)/sp/adsmap/import/page';
import { chargerFaitsRail } from '../app/(spatial)/sp/adsmap/donnees';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const I = h.ids;
const L: Record<string, string> = {};
const J = 86_400_000;
/** Lundi 6 janvier 2020, 10 h à Paris · fenêtre du moteur par défaut (7 jours) · fermée le 13 janvier. */
const T0 = new Date('2020-01-06T09:00:00Z');
const A = (jours: number) => new Date(T0.getTime() + jours * J);
/** La borne de la lecture des lots (`LIMITE_ADS_LOTS`) · le remplissage la comble avec les cinq variantes `a…`. */
const BORNE = 2000;

function commeProprietaire() {
  h.session = { user: { id: I.uo!, email: 'uo@lu.test', name: 'Camille' }, workspaceId: I.ws!, workspaceName: 'Espace', role: 'owner', plan: 'plus', equipe: null };
  h.marque = { id: I.b!, name: 'Neva' };
}

async function concept(titre: string) {
  const [p] = await db.insert(schema.personas).values({ brandId: I.b!, name: `P ${titre}` }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: I.ws!, personaId: p!.id, label: 'D' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: I.ws!, desireId: d!.id, label: 'A', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: I.ws!, angleId: a!.id, title: titre }).returning();
  return c!.id;
}

type Variante = { code: string; verdict?: { calcule: 'winner' | 'loser' | 'inconclusive'; valide?: true; le: Date } };
async function lot(cle: string, numero: number, fin: Date, variantes: Variante[]) {
  const [offre] = await db.insert(schema.offers).values({ workspaceId: I.ws!, brandId: I.b!, label: 'Offre' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: I.ws!, brandId: I.b!, url: 'https://neva.test/p', label: 'Page' }).returning();
  const [b] = await db.insert(schema.batches).values({ workspaceId: I.ws!, brandId: I.b!, number: numero, status: 'testing', launchedAt: T0, plannedEndAt: fin, goal: `Lot ${cle}` }).returning();
  L[cle] = b!.id;
  for (const v of variantes) {
    const [a] = await db.insert(schema.ads).values({
      workspaceId: I.ws!, conceptId: await concept(`Concept ${cle} ${v.code}`), batchId: b!.id, variantCode: v.code, status: v.verdict?.valide ? 'done' : 'live', adType: 'ideation', format: 'static', platform: 'meta',
      hypothesis: 'Si on montre la preuve chiffrée, alors le coût par achat baisse parce que la cible doute.', testedVariable: 'hook', variableValue: `Preuve ${v.code}`,
      offerId: offre!.id, landingPageId: page!.id, launchedAt: T0, generatedName: `NEVA_${cle}_${v.code}`,
    }).returning();
    if (v.verdict) {
      await db.insert(schema.verdicts).values({
        adId: a!.id, workspaceId: I.ws!, computed: v.verdict.calcule, validated: v.verdict.valide ? v.verdict.calcule : null, status: v.verdict.valide ? 'validated' : 'computed',
        comparable: true, computedAt: v.verdict.le, metricsAgg: { spend: 150, impressions: 20000, purchases: 1, cpa: 150, reason: 'Moteur', daysElapsed: 3 },
      });
    }
  }
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: I.ws!, name: 'Espace', plan: 'plus', onboardedAt: T0 });
  await db.insert(schema.users).values({ id: I.uo!, email: 'uo@lu.test', name: 'Camille' });
  await db.insert(schema.workspaceMembers).values({ workspaceId: I.ws!, userId: I.uo!, role: 'owner' });
  await db.insert(schema.brands).values({ id: I.b!, workspaceId: I.ws!, name: 'Neva' });
  await lot('tronque', 10, A(7), [{ code: 'a1', verdict: { calcule: 'winner', valide: true, le: A(7) } }, { code: 'z9' }]);
  await lot('incomplet', 12, A(6), [{ code: 'a2' }, { code: 'a3', verdict: { calcule: 'loser', le: A(3) } }]);
  await lot('arbitrable', 11, A(7), [{ code: 'a4', verdict: { calcule: 'loser', le: A(3) } }, { code: 'a5', verdict: { calcule: 'inconclusive', le: A(3) } }]);
  // Le remplissage · un lot en composition, ses brouillons rangés après les `a…` et avant `z9`.
  const [f] = await db.insert(schema.batches).values({ workspaceId: I.ws!, brandId: I.b!, number: 9, status: 'planned', goal: 'Remplissage' }).returning();
  const c = await concept('Remplissage');
  const n = BORNE - 5;
  for (let i = 0; i < n; i += 500) {
    await db.insert(schema.ads).values(Array.from({ length: Math.min(500, n - i) }, (_, k) => ({
      workspaceId: I.ws!, conceptId: c, batchId: f!.id, variantCode: `b${String(i + k).padStart(4, '0')}`, status: 'draft' as const, adType: 'ideation' as const, format: 'static' as const,
    })));
  }
}, 180_000);

afterEach(() => { h.session = null; h.marque = null; });

const dom = (el: ReactNode) => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(el as ReactElement); return d; };
const net = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** L'Accueil rendu · l'étape « En diffusion » (sous-titre, nombre, diagnostic du premier lot). */
async function accueil() {
  const d = dom(avecSpatial(await AccueilSpatial({ searchParams: Promise.resolve({}) })));
  const e = [...d.querySelectorAll<HTMLAnchorElement>('.pipe a.tile.stage')].find((a) => net(a.querySelector('strong')?.textContent) === 'En diffusion') ?? null;
  expect(e, 'préalable · l’étape « En diffusion » de la boucle').not.toBeNull();
  return {
    sous: net(e!.querySelector('strong + span')?.textContent),
    n: Number(net(e!.querySelector('.big3')?.textContent)),
    diagnostic: e!.querySelector('[data-fin-prevue]') ? net(e!.querySelector('[data-fin-prevue] > span:not(.btn)')?.textContent) : null,
  };
}

describe('la lecture bornée ne fait plus passer un lot pour conclu', () => {
  it('préalable · #10 est lu EN ENTIER (`a1` arbitrée, `z9` sans verdict) · le remplissage, au-delà du plafond d’un lot, n’est pas lu', async () => {
    const f = await chargerFaitsRail(I.ws!, I.b!);
    const t = f.lots.find((l) => l.id === L.tronque);
    expect(f.lots.reduce((k, l) => k + nombreVariantes(l), 0), 'préalable · la marque dépasse l’ancienne borne globale (2 001 · les cinq `a…`, le remplissage, `z9`)').toBe(BORNE + 1);
    expect(t?.partielle, 'le lot #10 est lu en partie').toBeUndefined();
    expect(t?.ads?.map((a) => a.verdict?.statut ?? null), 'le lot #10 n’expose pas ses deux variantes').toEqual(['validated', null]);
  });

  it('l’Accueil · le lot #10, une variante coupée sans verdict · « fin prévue passée » et « En diffusion », jamais caché', async () => {
    commeProprietaire();
    const a = await accueil();
    expect(a.sous, 'le lot dont une variante a été coupée disparaît de « fin prévue passée »').toBe(phraseFinPrevuePassee([{ numero: 12 }, { numero: 10 }]));
    // #10 et #12 en diffusion · #11 se conclut (compté « à traiter ») · #9 en composition.
    expect(a.n, 'le lot tronqué n’est plus compté « En diffusion »').toBe(2);
  });
});

describe('après 120 jours · l’état s’arbitre, la phrase dit toujours « mesures arrêtées »', () => {
  it('l’Accueil · le premier lot à fin prévue passée (#12) · « mesures arrêtées », pas « sans mesure »', async () => {
    commeProprietaire();
    expect((await accueil()).diagnostic, 'le diagnostic de l’Accueil se tait après 120 jours').toBe('Lot #12 · mesures arrêtées le 9 janv., avant la fin de la fenêtre du moteur (7 jours) · 1 variante sur 2');
  });

  it('la fiche du lot #11, à arbitrer · l’arbitre lit que la fenêtre est incomplète · l’import le dit aussi', async () => {
    commeProprietaire();
    const d = dom(avecSpatial(await LotSpatial({ params: Promise.resolve({ id: L.arbitrable! }), searchParams: Promise.resolve({}) })));
    expect(d.querySelector('#conclure, [data-conclure], form'), 'préalable · la fiche propose l’arbitrage').toBeTruthy();
    const f = d.querySelector<HTMLElement>(`section[data-fenetre-incomplete="${L.arbitrable}"]`);
    expect(f, 'la fiche ne dit pas à l’arbitre que la fenêtre est incomplète').not.toBeNull();
    expect(net(f!.querySelector('h2')?.textContent)).toBe('Fenêtre incomplète');
    expect(net(f!.querySelector('[data-diagnostic]')?.textContent), 'la phrase de la fiche n’est pas celle attendue (constat, recours)').toBe(
      'Mesures arrêtées le 9 janv., avant la fin de la fenêtre du moteur (7 jours) · 2 variantes sur 2 · un export importé peut encore la compléter, sinon tu arbitres sur ce qui a été mesuré.',
    );
    expect(net(f!.textContent), 'la fiche affirme ce que la synchro fait').not.toMatch(/synchro/);
    expect(d.querySelector(`[data-import-lot="${L.arbitrable}"]`), 'le lot arbitrable est présenté « Mesures à importer »').toBeNull();
    const geste = f!.querySelector<HTMLAnchorElement>('a[data-geste="importer-lot"]');
    expect(geste?.getAttribute('href'), 'le recours n’ouvre pas l’import de ce lot').toBe(lienImportLot(L.arbitrable!));
    expect(net(geste?.textContent)).toBe('Importer les mesures du lot #11');
    expect(net(d.textContent), 'tiret cadratin à l’écran').not.toMatch(/—/);

    // On SUIT le lien · l'écran d'import s'ouvre sur ce lot, et y dit le même constat.
    const u = new URL(geste!.getAttribute('href')!, 'https://app.test');
    expect(u.pathname).toBe('/adsmap/import');
    const i = dom(avecSpatial(await ImportSpatial({ searchParams: Promise.resolve(Object.fromEntries(u.searchParams)) })));
    const s = i.querySelector<HTMLElement>('section[data-lot-cible]');
    expect(s?.dataset.lotCible, 'l’écran d’import ne s’ouvre pas sur le lot #11').toBe(L.arbitrable);
    expect(net(s!.querySelector('[data-diagnostic]')?.textContent), 'l’import se tait après 120 jours').toBe('Lot #11 · mesures arrêtées le 9 janv., avant la fin de la fenêtre du moteur (7 jours) · 2 variantes sur 2');
  });
});
