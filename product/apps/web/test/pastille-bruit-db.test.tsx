// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * La pastille « à importer » ne s'allume que quand il manque VRAIMENT quelque
 * chose · sur une VRAIE base (pglite, migrations du dépôt), avec les VRAIES
 * gardes et les VRAIES vues · la coquille (`chargerCoquille` → `Coquille`),
 * l'Accueil (`/dashboard`, étape « En diffusion ») et l'écran d'import
 * (`/adsmap/import`, sa liste « Lot », la section du lot) · on lit le DOM, on
 * SUIT le lien. L'horloge est INJECTÉE (`Date` seule simulée) et DÉPLACÉE de
 * part et d'autre de la fin prévue d'un même lot ·
 *  · en diffusion, sous le minimum, avant sa fin prévue · aucune pastille,
 *    mais le lot est dans la liste « Lot », groupe « Mesures en cours », et sa
 *    section le dit · l'Accueil ne propose aucun import ;
 *  · le même lot après sa fin prévue · la pastille, qui mène à lui · le même
 *    lien que le geste de l'Accueil · la section dit « Mesures manquantes » ;
 *  · un lot « Mesures à importer » (fenêtre du moteur écoulée) · la pastille ;
 *  · « à conclure » identique sur le même semis, avant et après ;
 *  · UNE lecture des variantes pour les deux comptes du rail (requêtes comptées) ;
 *  · un membre · ni pastille, ni lecture du compte « à importer » ;
 *  · rien n'est écrit (aucune requête d'écriture, base identique).
 * Aucun réseau, aucun modèle, 0 $.
 */

const h = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
  requetes: [] as string[],
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['ws', 'bN', 'bL', 'uo', 'um']) h.ids[k] = randomUUID();
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoireBrut } = await import('./helpers/pg-memoire');
  const { drizzle } = await import('drizzle-orm/pglite');
  const pg = await pgMemoireBrut();
  // Chaque requête envoyée à la base est notée · on compte les lectures des variantes, on refuse toute écriture.
  const q = pg.query.bind(pg) as (...a: unknown[]) => Promise<unknown>;
  (pg as unknown as { query: (...a: unknown[]) => Promise<unknown> }).query = (t: unknown, ...r: unknown[]) => { h.requetes.push(String(t)); return q(t, ...r); };
  return { ...actual, db: drizzle(pg, { schema: actual.schema as unknown as Record<string, unknown> }) };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('../lib/brands', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/brands')>()), getActiveBrand: async () => h.marque }));
// La VRAIE source de la pastille « à importer », comptée · un membre ne doit même pas la lire.
vi.mock('../lib/spatial/pastilles/import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/spatial/pastilles/import')>();
  return { pastilleImport: vi.fn(actual.pastilleImport) };
});
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
import { compteAConclure, pastilleAConclure } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';
import ImportSpatial from '../app/(spatial)/sp/adsmap/import/page';
import { chargerCoquille } from '../lib/spatial/coquille';
import { pastilleImport } from '../lib/spatial/pastilles/import';
import { chargerLots } from '../app/(spatial)/sp/adsmap/donnees';
import { Coquille } from '../spatial/coquille/Coquille';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const I = h.ids;
const L: Record<string, string> = {};
/** Le lot en diffusion · lancé le 28 janvier, fin prévue le 31 à 9 h · la fenêtre du moteur (7 jours) court jusqu'au 4 février. */
const LANCE = new Date('2020-01-28T09:00:00Z');
const FIN = new Date('2020-01-31T09:00:00Z');
/** Avant la fin prévue · 1 ms avant · et après · le 1er février (toujours en diffusion pour le moteur). */
const AVANT = new Date(FIN.getTime() - 1);
const APRES = new Date('2020-02-01T09:00:00Z');
const ANCIEN = new Date('2020-01-06T09:00:00Z');

type Qui = 'uo' | 'um';
function comme(qui: Qui, marque: { id: string; name: string }) {
  h.session = { user: { id: I[qui]!, email: `${qui}@bruit.test`, name: 'Camille' }, workspaceId: I.ws!, workspaceName: 'Espace', role: qui === 'uo' ? 'owner' : 'member', plan: 'plus', equipe: null };
  h.marque = marque;
}
const NEVA = () => ({ id: I.bN!, name: 'Neva' });
const LIMA = () => ({ id: I.bL!, name: 'Lima' });

type Variante = null | { calcule: 'winner' | 'loser' | 'inconclusive'; impressions: number; depense: number };
async function lot(cle: string, o: { brand: string; numero: number; but: string; lance: Date; fin?: Date; variantes: Variante[] }) {
  const ws = I.ws!;
  const [p] = await db.insert(schema.personas).values({ brandId: o.brand, name: `P ${cle}` }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: p!.id, label: 'D' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: d!.id, label: 'A', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: a!.id, title: `Concept ${cle}` }).returning();
  const [offre] = await db.insert(schema.offers).values({ workspaceId: ws, brandId: o.brand, label: 'Offre' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: ws, brandId: o.brand, url: 'https://neva.test/p', label: 'Page' }).returning();
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId: o.brand, number: o.numero, status: 'testing', launchedAt: o.lance, plannedEndAt: o.fin ?? null, goal: o.but }).returning();
  L[cle] = b!.id;
  for (const [i, v] of o.variantes.entries()) {
    const [ad] = await db.insert(schema.ads).values({
      workspaceId: ws, conceptId: c!.id, batchId: b!.id, variantCode: `v${i + 1}`, status: 'live', adType: 'ideation', format: 'static', platform: 'meta',
      hypothesis: 'Si on montre la preuve chiffrée, alors le coût par achat baisse parce que la cible doute.', testedVariable: 'hook', variableValue: `Preuve ${i + 1}`,
      offerId: offre!.id, landingPageId: page!.id, launchedAt: o.lance, generatedName: `NEVA_${cle}_v${i + 1}`,
    }).returning();
    if (v) {
      await db.insert(schema.verdicts).values({
        adId: ad!.id, workspaceId: ws, computed: v.calcule, status: 'computed', comparable: true,
        metricsAgg: { spend: v.depense, impressions: v.impressions, purchases: 0, cpa: null, reason: 'Moteur', daysElapsed: 2 },
      });
    }
  }
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: AVANT });
  await db.insert(schema.workspaces).values({ id: I.ws!, name: 'Espace', plan: 'plus', onboardedAt: ANCIEN });
  await db.insert(schema.users).values((['uo', 'um'] as const).map((q) => ({ id: I[q]!, email: `${q}@bruit.test`, name: 'Camille' })));
  await db.insert(schema.workspaceMembers).values([{ workspaceId: I.ws!, userId: I.uo!, role: 'owner' }, { workspaceId: I.ws!, userId: I.um!, role: 'member' }]);
  await db.insert(schema.brands).values([{ id: I.bN!, workspaceId: I.ws!, name: 'Neva' }, { id: I.bL!, workspaceId: I.ws!, name: 'Lima' }]);
  // Neva · d · en diffusion, chaque variante mesurée SOUS le minimum du moteur (900 impressions, 12 €), fin prévue le 31 ·
  // c · à conclure (fenêtre écoulée, deux verdicts au-dessus du minimum) · le compte « à conclure » de #1080.
  await lot('d', { brand: I.bN!, numero: 2, but: 'Preuve en diffusion', lance: LANCE, fin: FIN, variantes: [{ calcule: 'inconclusive', impressions: 900, depense: 12 }, { calcule: 'inconclusive', impressions: 1200, depense: 15 }] });
  await lot('c', { brand: I.bN!, numero: 1, but: 'Preuve ou promesse', lance: ANCIEN, variantes: [{ calcule: 'winner', impressions: 40_000, depense: 200 }, { calcule: 'loser', impressions: 40_000, depense: 200 }] });
  // Lima · i · « Mesures à importer » (lancé le 6 janvier, aucune mesure, sans fin prévue).
  await lot('i', { brand: I.bL!, numero: 1, but: 'Mesures jamais remontées', lance: ANCIEN, variantes: [null, null] });
}, 180_000);

afterAll(() => { vi.useRealTimers(); });
afterEach(() => { h.session = null; h.marque = null; vi.mocked(pastilleImport).mockClear(); vi.setSystemTime(AVANT); });

const brut = (el: ReactNode) => renderToStaticMarkup(el as ReactElement);
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const net = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
/** Les lectures des variantes (`adsmap_ads`) et les écritures, parmi les requêtes notées. */
const lecturesVariantes = (r: readonly string[]) => r.filter((t) => /from "adsmap_ads"/i.test(t)).length;
const ecritures = (r: readonly string[]) => r.filter((t) => /^\s*(insert|update|delete|truncate|alter|create|drop)\b/i.test(t));

/** La VRAIE coquille · la pastille « à importer », l'entrée Résultats · et les requêtes de CETTE coquille. */
async function rail() {
  h.requetes.length = 0;
  const donnees = await chargerCoquille();
  const requetes = [...h.requetes];
  const d = dom(brut(<Coquille donnees={donnees}><p>page</p></Coquille>));
  const a = d.querySelector<HTMLAnchorElement>('nav.rail a[data-pastille-import]');
  const resultats = d.querySelector('nav.rail a[data-r="resultats"]');
  expect(resultats, 'préalable · l’entrée Résultats du rail').not.toBeNull();
  return {
    importer: a ? { href: a.getAttribute('href'), n: Number(net(a.querySelector('.rbadge')?.textContent)), nom: a.getAttribute('aria-label') } : null,
    conclure: resultats!.querySelector('.badge')?.getAttribute('aria-label') ?? null,
    resultats: resultats!.outerHTML,
    requetes,
  };
}

/** L'écran d'import rendu au serveur à cette adresse · la liste « Lot » par groupe, la section du lot. */
async function ecranImport(href: string) {
  const u = new URL(href, 'https://app.test');
  expect(u.pathname, `le lien ${href} ne mène pas à l’écran d’import`).toBe('/adsmap/import');
  const d = dom(brut(avecSpatial(await ImportSpatial({ searchParams: Promise.resolve(Object.fromEntries(u.searchParams)) }))));
  const sel = d.querySelector<HTMLSelectElement>('[data-liste-lot] select');
  const s = d.querySelector<HTMLElement>('section[data-lot-cible]');
  return {
    groupes: sel ? [...sel.querySelectorAll('optgroup')].map((g) => ({ cas: g.getAttribute('data-cas'), libelle: g.getAttribute('label'), lots: [...g.querySelectorAll('option')].map((o) => o.getAttribute('value')) })) : null,
    choisi: sel?.querySelector<HTMLOptionElement>('option[selected]')?.value ?? null,
    lot: s?.dataset.lotCible ?? null,
    cas: s?.querySelector('[data-cas-mesures]')?.getAttribute('data-cas-mesures') ?? null,
    phrase: net(s?.querySelector('[data-cas-mesures]')?.textContent) || null,
  };
}

/** L'Accueil rendu · l'étape « En diffusion » (lien, bouton, diagnostic). */
async function accueil() {
  const d = dom(brut(avecSpatial(await AccueilSpatial({ searchParams: Promise.resolve({}) }))));
  const e = [...d.querySelectorAll<HTMLAnchorElement>('.pipe a.tile.stage')].find((a) => net(a.querySelector('strong')?.textContent) === 'En diffusion') ?? null;
  expect(e, 'préalable · l’étape « En diffusion » de la boucle').not.toBeNull();
  return {
    href: e!.getAttribute('href'),
    bouton: net(e!.querySelector(':scope > .btn')?.textContent) || null,
    diagnostic: e!.querySelector('[data-fin-prevue]') ? net(e!.querySelector('[data-fin-prevue] > span:not(.btn)')?.textContent) : null,
  };
}

async function traces() {
  return JSON.stringify([
    (await db.select({ id: schema.batches.id, s: schema.batches.status, f: schema.batches.plannedEndAt }).from(schema.batches)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.verdicts.adId, s: schema.verdicts.status, v: schema.verdicts.validated, c: schema.verdicts.computed }).from(schema.verdicts)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.ads.id, s: schema.ads.status }).from(schema.ads)).length,
    (await db.select({ id: schema.mesuresCsv.adId }).from(schema.mesuresCsv)).length,
    (await db.select({ id: schema.notifications.id }).from(schema.notifications)).length,
  ]);
}

/** « À conclure » attendu, calculé à part · la liste entière (`chargerLots`) et la règle de #1080. */
async function aConclureAttendu(brand: string) {
  const liste = await chargerLots(I.ws!, brand, new Date());
  return pastilleAConclure(compteAConclure(liste.lots, liste.ctx))?.libelle ?? null;
}

describe('un lot en diffusion sous le minimum · avant sa fin prévue, aucune pastille · après, la pastille', () => {
  it('avant la fin prévue · aucune pastille, aucun import à l’Accueil · le lot est dans la liste, « Mesures en cours », et sa section le dit', async () => {
    comme('uo', NEVA());
    const r = await rail();
    expect(r.importer, 'la pastille « à importer » s’allume pendant la diffusion, avant la fin prévue').toBeNull();
    const e = await ecranImport('/adsmap/import');
    expect(e.groupes, 'le lot en diffusion a quitté la liste « Lot », ou n’y est pas dit « mesures en cours »').toEqual([
      { cas: 'en-cours', libelle: 'Mesures en cours · en diffusion', lots: [L.d] },
    ]);
    const s = await ecranImport(`/adsmap/import?lot=${L.d}`);
    expect([s.lot, s.cas], 'la section du lot ne dit pas « mesures en cours »').toEqual([L.d, 'en-cours']);
    expect(s.phrase).toBe('Mesures en cours · le lot #2 est en diffusion jusqu’au 31 janv. · sous le minimum du moteur d’ici là, c’est normal.');
    expect(s.choisi, 'la liste ne montre pas le lot de l’adresse choisi').toBe(L.d);
    const a = await accueil();
    expect(a.bouton, 'l’Accueil propose un import pendant la diffusion').toBeNull();
    expect(a.diagnostic, 'l’Accueil dit une fin prévue passée avant l’heure').toBeNull();
  });

  it('après la fin prévue · la pastille, sur CE lot · le même lien que le geste de l’Accueil · on le suit · « Mesures manquantes »', async () => {
    vi.setSystemTime(APRES);
    comme('uo', NEVA());
    const r = await rail();
    expect(r.importer, 'la pastille « à importer » ne s’allume pas après la fin prévue').not.toBeNull();
    expect(r.importer!.href, 'la pastille ne mène pas à l’import de ce lot').toBe(`/adsmap/import?lot=${L.d}`);
    expect(r.importer!.n).toBe(1);
    expect(r.importer!.nom).toBe('À importer · Lot #2 · attend ses mesures');
    const s = await ecranImport(r.importer!.href!);
    expect([s.lot, s.cas], 'la section du lot ne dit pas « mesures manquantes »').toEqual([L.d, 'manquantes']);
    expect(s.phrase).toBe('Mesures manquantes · la fin prévue du lot #2 (le 31 janv.) est passée.');
    expect(s.groupes).toEqual([{ cas: 'manquantes', libelle: 'Mesures manquantes · fin prévue passée ou fenêtre écoulée', lots: [L.d] }]);
    const a = await accueil();
    expect(a.bouton, 'l’Accueil ne propose pas l’import du lot à fin prévue passée').toBe('Importer les mesures du lot #2');
    expect(a.href, 'l’Accueil et la pastille ne mènent pas au même endroit').toBe(r.importer!.href);
    expect(a.diagnostic).toMatch(/^Lot #2 · mesures reçues, sous le minimum du moteur/);
  });

  it('un lot « Mesures à importer » (fenêtre du moteur écoulée, sans fin prévue) · la pastille, avant comme après', async () => {
    for (const t of [AVANT, APRES]) {
      vi.setSystemTime(t);
      comme('uo', LIMA());
      const r = await rail();
      expect(r.importer?.href, `« Mesures à importer » n’allume pas la pastille (${t.toISOString()})`).toBe(`/adsmap/import?lot=${L.i}`);
      const s = await ecranImport(r.importer!.href!);
      expect([s.lot, s.cas]).toEqual([L.i, 'manquantes']);
      expect(s.phrase).toBe('Mesures manquantes · la fenêtre du moteur du lot #1 (7 jours) est écoulée.');
    }
  });

  it('« à conclure » identique sur le même semis, avant et après la fin prévue · l’entrée Résultats ne bouge pas', async () => {
    comme('uo', NEVA());
    const avant = await rail();
    expect(avant.conclure, 'la pastille « à conclure » a changé').toBe(await aConclureAttendu(I.bN!));
    expect(avant.conclure).toBe('Un lot à conclure');
    vi.setSystemTime(APRES);
    const apres = await rail();
    expect(apres.conclure, 'la fin prévue a changé le compte « à conclure »').toBe(avant.conclure);
    expect(apres.resultats, 'l’entrée Résultats change avec la pastille « à importer »').toBe(avant.resultats);
  });
});

describe('UNE lecture pour les deux comptes du rail · qui voit quoi · rien écrit', () => {
  it('admin · les deux pastilles d’une coquille lisent les variantes UNE fois · aucune écriture', async () => {
    vi.setSystemTime(APRES);
    comme('uo', NEVA());
    const avantT = await traces();
    const r = await rail();
    expect([r.importer?.n, r.conclure], 'préalable · les deux pastilles sont posées').toEqual([1, 'Un lot à conclure']);
    expect(lecturesVariantes(r.requetes), `les deux comptes du rail lisent les variantes ${lecturesVariantes(r.requetes)} fois`).toBe(1);
    expect(vi.mocked(pastilleImport)).toHaveBeenCalledTimes(1);
    expect(ecritures(r.requetes), 'la coquille écrit').toEqual([]);
    h.requetes.length = 0;
    await ecranImport('/adsmap/import');
    await accueil();
    expect(ecritures(h.requetes), 'l’écran d’import ou l’Accueil écrit').toEqual([]);
    expect(await traces(), 'une lecture a écrit').toEqual(avantT);
  });

  it('un membre · ni pastille « à importer », ni lecture de son compte · « à conclure » le même que l’admin, une lecture', async () => {
    vi.setSystemTime(APRES);
    comme('um', NEVA());
    const avantT = await traces();
    const r = await rail();
    expect(r.importer, 'un membre reçoit la pastille « à importer »').toBeNull();
    expect(vi.mocked(pastilleImport), 'le compte « à importer » est lu pour un membre').not.toHaveBeenCalled();
    expect(r.conclure, 'le membre ne voit plus le même compte « à conclure »').toBe('Un lot à conclure');
    expect(lecturesVariantes(r.requetes)).toBe(1);
    await expect(ImportSpatial({ searchParams: Promise.resolve({}) }), 'préalable · l’écran d’import refuse le membre').rejects.toThrow('REDIRECT /adsmap');
    expect(ecritures(r.requetes)).toEqual([]);
    expect(await traces()).toEqual(avantT);
  });
});
