// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Savoir de partout qu'un lot attend ses mesures · sur une VRAIE base (pglite,
 * migrations du dépôt), avec les VRAIES gardes et les VRAIES vues · la coquille
 * (`chargerCoquille` → `Coquille`, la pastille « à importer » sous Résultats)
 * et l'écran d'import (`/adsmap/import`, sa liste « Lot ») · on lit le DOM, on
 * SUIT le lien. Sur un même semis ·
 *  · pastille « à importer » = nombre de lots du groupe « Mesures manquantes »
 *    de la liste « Lot » (un lot en diffusion, « mesures en cours », y reste
 *    sans allumer la pastille · `pastille-bruit-db.test.tsx`) ;
 *  · un seul lot → le lien ouvre l'import sur lui (`?lot=`) · plusieurs → l'écran
 *    d'import, sa liste les montre ;
 *  · le minimum du moteur est celui de la MARQUE ;
 *  · un membre · ni pastille, ni lecture du compte (l'écran le refuse) ;
 *  · autre marque, autre espace · leur compte à eux ; formule Core · rien ;
 *  · « à conclure » inchangé, jamais additionné ;
 *  · LA lecture du rail (`chargerFaitsRail`) retient les MÊMES lots que `chargerLots`, à la borne ;
 *  · rien n'est écrit.
 * Horloge injectée (`Date` seule simulée, 1er février 2020) · aucune date « à venir ».
 * Aucun réseau, aucun modèle, 0 $.
 */

const h = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['wsA', 'wsB', 'bA', 'bA2', 'bB', 'bBorne', 'uo', 'um', 'ub']) h.ids[k] = randomUUID();
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('../lib/brands', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/brands')>()), getActiveBrand: async () => h.marque }));
// La VRAIE source de la pastille, comptée · un membre ne doit même pas la lire.
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

import { db, schema } from '@tiktrends/db';
import { compteAImporter } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import ImportSpatial from '../app/(spatial)/sp/adsmap/import/page';
import { chargerCoquille } from '../lib/spatial/coquille';
import { pastilleImport } from '../lib/spatial/pastilles/import';
import { chargerLots, chargerFaitsRail, compterAImporter } from '../app/(spatial)/sp/adsmap/donnees';
import { Coquille } from '../spatial/coquille/Coquille';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const I = h.ids;
const L: Record<string, string> = {};
/** L'horloge · fixe, dans le passé · la fenêtre (7 jours) est écoulée pour un lot lancé le 6 janvier, pas pour un lancé le 30. */
const MAINTENANT = new Date('2020-02-01T09:00:00Z');
const ANCIEN = new Date('2020-01-06T09:00:00Z');
const RECENT = new Date('2020-01-30T09:00:00Z');
const FIN_BORNE = new Date('2020-01-31T09:00:00Z');

type Qui = 'uo' | 'um' | 'ub';
const ROLE: Record<Qui, string> = { uo: 'owner', um: 'member', ub: 'owner' };
function comme(qui: Qui, marque: { id: string; name: string }, plan = 'plus') {
  h.session = { user: { id: I[qui]!, email: `${qui}@pimp.test`, name: 'Camille' }, workspaceId: qui === 'ub' ? I.wsB! : I.wsA!, workspaceName: 'Espace', role: ROLE[qui], plan, equipe: null };
  h.marque = marque;
}
const NEVA = () => ({ id: I.bA!, name: 'Neva' });
const AUTRE = () => ({ id: I.bA2!, name: 'Autre' });
const AILLEURS = () => ({ id: I.bB!, name: 'Ailleurs' });

async function chaine(ws: string, brand: string, titre: string) {
  const [p] = await db.insert(schema.personas).values({ brandId: brand, name: `P ${titre}` }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: p!.id, label: 'D' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: d!.id, label: 'A', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: a!.id, title: titre }).returning();
  const [offre] = await db.insert(schema.offers).values({ workspaceId: ws, brandId: brand, label: 'Offre' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: ws, brandId: brand, url: 'https://neva.test/p', label: 'Page' }).returning();
  return { concept: c!.id, offre: offre!.id, page: page!.id };
}

type Variante = null | { calcule: 'winner' | 'loser' | 'inconclusive'; valide?: boolean; impressions: number; depense: number };
const HAUT = { impressions: 40_000, depense: 200 };
async function lot(cle: string, o: { ws?: string; brand?: string; numero: number; but: string; statut?: 'planned' | 'testing'; lance?: Date; variantes: Variante[]; plateforme?: 'meta' | 'tiktok'; brouillon?: boolean }) {
  const ws = o.ws ?? I.wsA!, brand = o.brand ?? I.bA!;
  const statut = o.statut ?? 'testing';
  const lance = statut === 'testing' ? (o.lance ?? ANCIEN) : null;
  const ch = await chaine(ws, brand, `Concept ${cle}`);
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId: brand, number: o.numero, status: statut, launchedAt: lance, goal: o.but }).returning();
  L[cle] = b!.id;
  for (const [i, v] of o.variantes.entries()) {
    const [a] = await db.insert(schema.ads).values({
      workspaceId: ws, conceptId: ch.concept, batchId: b!.id, variantCode: `v${i + 1}`, status: statut === 'testing' && !o.brouillon ? (v?.valide ? 'done' : 'live') : 'draft', adType: 'ideation', format: 'static', platform: o.plateforme ?? 'meta',
      hypothesis: 'Si on montre la preuve chiffrée, alors le coût par achat baisse parce que la cible doute.', testedVariable: 'hook', variableValue: `Preuve ${i + 1}`,
      offerId: ch.offre, landingPageId: ch.page, launchedAt: lance, generatedName: `NEVA_${cle}_v${i + 1}`,
    }).returning();
    if (v) {
      await db.insert(schema.verdicts).values({
        adId: a!.id, workspaceId: ws, computed: v.calcule, validated: v.valide ? v.calcule : null, status: v.valide ? 'validated' : 'computed', comparable: true,
        metricsAgg: { spend: v.depense, impressions: v.impressions, purchases: 3, cpa: 40, reason: 'Moteur', daysElapsed: 7 },
      });
    }
  }
}

/**
 * La borne · 3 lots × 700 variantes (codes v0001…v0700 dans CHAQUE lot), en diffusion · v0001…v0666 mesurées
 * au-dessus du minimum, v0667…v0700 sans mesure. `LIMITE_ADS_LOTS` (2 000) coupe après 666 codes × 3 = 1 998,
 * puis DEUX des trois v0667 · départagées par l'identifiant. Seuls les deux lots dont la v0667 est lue attendent ·
 * une lecture sans la borne en verrait trois, un autre départage choisirait d'autres lots. Leur fin prévue est
 * passée (31 janvier) · leurs mesures MANQUENT, le compte les voit (sans elle, « en cours », il se tairait).
 */
async function borne() {
  const ws = I.wsA!, brand = I.bBorne!;
  for (const k of [1, 2, 3]) {
    const ch = await chaine(ws, brand, `Borne ${k}`);
    const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId: brand, number: k, status: 'testing', launchedAt: RECENT, plannedEndAt: FIN_BORNE, goal: `Borne ${k}` }).returning();
    L[`borne${k}`] = b!.id;
    const ads = await db.insert(schema.ads).values(Array.from({ length: 700 }, (_, i) => ({
      workspaceId: ws, conceptId: ch.concept, batchId: b!.id, variantCode: `v${String(i + 1).padStart(4, '0')}`, status: 'live' as const, adType: 'ideation' as const, format: 'static' as const, platform: 'meta' as const,
      hypothesis: 'Si on montre la preuve chiffrée, alors le coût par achat baisse parce que la cible doute.', testedVariable: 'hook' as const, variableValue: `P${i}`,
      offerId: ch.offre, landingPageId: ch.page, launchedAt: RECENT,
    }))).returning({ id: schema.ads.id, code: schema.ads.variantCode });
    await db.insert(schema.verdicts).values(ads.filter((a) => a.code <= 'v0666').map((a) => ({
      adId: a.id, workspaceId: ws, computed: 'winner' as const, status: 'computed' as const, comparable: true,
      metricsAgg: { spend: 200, impressions: 40_000, purchases: 3, cpa: 40, reason: 'Moteur', daysElapsed: 2 },
    })));
  }
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: MAINTENANT });
  await db.insert(schema.workspaces).values([{ id: I.wsA!, name: 'Espace A', plan: 'plus', onboardedAt: ANCIEN }, { id: I.wsB!, name: 'Espace B', plan: 'plus', onboardedAt: ANCIEN }]);
  await db.insert(schema.users).values((['uo', 'um', 'ub'] as const).map((q) => ({ id: I[q]!, email: `${q}@pimp.test`, name: 'Camille' })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: I.wsA!, userId: I.uo!, role: 'owner' }, { workspaceId: I.wsA!, userId: I.um!, role: 'member' }, { workspaceId: I.wsB!, userId: I.ub!, role: 'owner' },
  ]);
  await db.insert(schema.brands).values([
    { id: I.bA!, workspaceId: I.wsA!, name: 'Neva' }, { id: I.bA2!, workspaceId: I.wsA!, name: 'Autre' }, { id: I.bB!, workspaceId: I.wsB!, name: 'Ailleurs' },
    { id: I.bBorne!, workspaceId: I.wsA!, name: 'Borne' },
  ]);
  // Neva a réglé son minimum · 30 000 impressions, 150 € (3 × 50 €) · le défaut est 5 000 impressions, 105 €.
  await db.insert(schema.verdictConfigs).values({ brandId: I.bA!, workspaceId: I.wsA!, config: { minImpressions: 30_000, targetCpa: 50, minSpendMultiple: 3 } });
  // Neva · attendent · n1 (aucune mesure), n3 (partielles), n6 (en diffusion, sous le minimum de la MARQUE, pas du défaut ·
  // mesures EN COURS, sans fin prévue · dans la liste, hors de la pastille).
  // N'attendent pas · n2 à conclure, n4 en préparation, n5 sur TikTok (aucune source), n7 en diffusion au-dessus du minimum, n8 conclu,
  // n9 et n10 plus bas.
  await lot('n1', { numero: 1, but: 'Mesures pas encore remontées', variantes: [null, null] });
  await lot('n2', { numero: 2, but: 'Preuve ou promesse', variantes: [{ calcule: 'winner', ...HAUT }, { calcule: 'loser', ...HAUT }] });
  await lot('n3', { numero: 3, but: 'Une variante mesurée', variantes: [{ calcule: 'loser', ...HAUT }, null] });
  await lot('n4', { numero: 4, but: 'En préparation', statut: 'planned', variantes: [null] });
  await lot('n5', { numero: 5, but: 'Sur TikTok', variantes: [null], plateforme: 'tiktok' });
  await lot('n6', { numero: 6, but: 'Sous le minimum de la marque', lance: RECENT, variantes: [{ calcule: 'winner', impressions: 20_000, depense: 120 }] });
  await lot('n7', { numero: 7, but: 'Au-dessus du minimum', lance: RECENT, variantes: [{ calcule: 'winner', ...HAUT }, { calcule: 'loser', ...HAUT }] });
  await lot('n8', { numero: 8, but: 'Tranché', variantes: [{ calcule: 'winner', valide: true, ...HAUT }] });
  // n9 · lancé, mais sa seule variante est restée en brouillon · aucune source. n10 · non concluant (sous le minimum,
  // fenêtre écoulée) · on l'arbitre, on n'importe pas · il compte « à conclure » (#1080), jamais « à importer ».
  await lot('n9', { numero: 9, but: 'Brouillon', brouillon: true, variantes: [null] });
  await lot('n10', { numero: 10, but: 'Le silence du format court', variantes: [{ calcule: 'inconclusive', impressions: 900, depense: 12 }] });
  // Autre marque, même espace · UN lot attend (le second est en préparation).
  await lot('a1', { brand: I.bA2!, numero: 7, but: 'Lot de la marque Autre', variantes: [null] });
  await lot('a2', { brand: I.bA2!, numero: 8, but: 'Préparation', statut: 'planned', variantes: [null] });
  // Un autre espace · UN lot attend.
  await lot('b1', { ws: I.wsB!, brand: I.bB!, numero: 9, but: 'Lot d’un autre espace', variantes: [null, null] });
  await borne();
}, 180_000);

afterAll(() => { vi.useRealTimers(); });
afterEach(() => { h.session = null; h.marque = null; vi.mocked(pastilleImport).mockClear(); });

const brut = (el: ReactNode) => renderToStaticMarkup(el as ReactElement);
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const net = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** La VRAIE coquille · données réelles, composant réel · la pastille « à importer » et l'entrée Résultats. */
async function rail() {
  const donnees = await chargerCoquille();
  const d = dom(brut(<Coquille donnees={donnees}><p>page</p></Coquille>));
  const resultats = d.querySelector('nav.rail a[data-r="resultats"]');
  expect(resultats, 'préalable · l’entrée Résultats du rail').not.toBeNull();
  const imp = d.querySelectorAll<HTMLAnchorElement>('nav.rail a[data-pastille-import]');
  expect(imp.length, 'plus d’une pastille « à importer »').toBeLessThanOrEqual(1);
  const a = imp[0] ?? null;
  // La même coquille, sans la pastille « à importer » · ce que #1080 rendait.
  const sans = dom(brut(<Coquille donnees={{ ...donnees, aImporter: null }}><p>page</p></Coquille>));
  return {
    importer: a ? {
      href: a.getAttribute('href'),
      n: Number(net(a.querySelector('.rbadge')?.textContent)),
      nom: a.getAttribute('aria-label'),
      apresResultats: a.previousElementSibling === resultats,
    } : null,
    conclure: resultats!.querySelector('.badge')?.getAttribute('aria-label') ?? null,
    resultats: resultats!.outerHTML,
    resultatsSans: sans.querySelector('nav.rail a[data-r="resultats"]')!.outerHTML,
    railSans: sans.querySelector('nav.rail')!.outerHTML,
    railSansImport: (() => { a?.remove(); return d.querySelector('nav.rail')!.outerHTML; })(),
  };
}

/** L'écran d'import rendu au serveur à cette adresse · la section du lot, la liste « Lot ». */
async function ecranImport(href: string) {
  const u = new URL(href, 'https://app.test');
  expect(u.pathname, `le lien ${href} ne mène pas à l’écran d’import`).toBe('/adsmap/import');
  const d = dom(brut(avecSpatial(await ImportSpatial({ searchParams: Promise.resolve(Object.fromEntries(u.searchParams)) }))));
  const sel = d.querySelector<HTMLSelectElement>('[data-liste-lot] select');
  const options = sel ? [...sel.querySelectorAll('option')].map((o) => o.value) : [];
  return {
    lot: d.querySelector<HTMLElement>('section[data-lot-cible]')?.dataset.lotCible ?? null,
    choisi: sel ? (sel.querySelector<HTMLOptionElement>('option[selected]')?.value ?? options[0] ?? null) : null,
    /** Les lots de la liste « Lot » · « Tous les lots » (valeur vide) retiré. */
    lots: options.filter(Boolean),
    /** Les lots du groupe « Mesures manquantes ». */
    manquantes: sel ? [...sel.querySelectorAll('optgroup[data-cas="manquantes"] option')].map((o) => o.getAttribute('value')) : [],
    texte: net(d.textContent),
  };
}

async function traces() {
  return JSON.stringify([
    (await db.select({ id: schema.batches.id, s: schema.batches.status, p: schema.batches.protocolCheck }).from(schema.batches)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.verdicts.adId, s: schema.verdicts.status, v: schema.verdicts.validated, c: schema.verdicts.computed }).from(schema.verdicts)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.ads.id, s: schema.ads.status }).from(schema.ads)).length,
    (await db.select({ id: schema.mesuresCsv.adId }).from(schema.mesuresCsv)).length,
    (await db.select({ id: schema.remontees.id }).from(schema.remontees)).length,
    (await db.select({ id: schema.learnings.id }).from(schema.learnings)).length,
    (await db.select({ id: schema.notifications.id }).from(schema.notifications)).length,
  ]);
}

describe('la pastille « à importer » = les lots de la liste « Lot » qui attendent · on suit le lien', () => {
  it('admin · plusieurs lots · la pastille compte la liste, sous Résultats, et mène à l’écran d’import · minimum de la MARQUE · rien écrit', async () => {
    comme('uo', NEVA());
    const avant = await traces();
    const r = await rail();
    expect(r.importer, 'aucune pastille « à importer » pour un admin dont des lots attendent').not.toBeNull();
    const ecran = await ecranImport(r.importer!.href!);
    expect(ecran.lots, 'la liste « Lot » ne montre pas les lots qui attendent, regroupés par cas').toEqual([L.n3, L.n1, L.n6]);
    expect(ecran.manquantes, 'le groupe « Mesures manquantes »').toEqual([L.n3, L.n1]);
    expect(r.importer!.n, 'la pastille « à importer » ne compte pas les lots de la liste « Lot » dont les mesures manquent').toBe(ecran.manquantes.length);
    expect(r.importer!.href, 'plusieurs lots attendent · la pastille ne mène pas à l’écran d’import').toBe('/adsmap/import');
    expect(ecran.lot, 'l’écran s’ouvre sur un lot alors que plusieurs attendent').toBeNull();
    expect(r.importer!.nom).toBe('À importer · 2 lots attendent leurs mesures');
    expect(r.importer!.apresResultats, 'la pastille « à importer » a quitté sa place, juste sous Résultats').toBe(true);
    // n6 · 20 000 impressions et 120 € · sous le minimum de Neva (30 000, 150 €), au-dessus du défaut (5 000, 105 €).
    expect(ecran.lots, 'le minimum lu n’est pas celui de la marque').toContain(L.n6);
    expect(vi.mocked(pastilleImport)).toHaveBeenCalledTimes(1);
    expect(await traces(), 'une lecture a écrit').toEqual(avant);
  });

  it('« à conclure » inchangé · l’entrée Résultats est celle de #1080, octet pour octet · les deux comptes ne s’additionnent jamais', async () => {
    comme('uo', NEVA());
    const r = await rail();
    expect(r.conclure, 'la pastille « à conclure » a changé').toBe('2 lots à conclure');
    expect(r.resultats, 'l’entrée Résultats change quand la pastille « à importer » est posée').toBe(r.resultatsSans);
    expect(r.railSansImport, 'la pastille « à importer » change autre chose que sa propre entrée').toBe(r.railSans);
    expect(r.importer!.n, 'les deux comptes sont additionnés').toBe(2);
    expect(r.importer!.nom).not.toMatch(/conclure/);
  });

  it('un seul lot (autre marque du même espace) · le lien ouvre l’import sur LUI, choisi dans la liste · aucun lot de Neva', async () => {
    comme('uo', AUTRE());
    const r = await rail();
    expect(r.importer?.href, 'un seul lot attend · la pastille ne mène pas à son import').toBe(`/adsmap/import?lot=${L.a1}`);
    expect(r.importer!.n).toBe(1);
    expect(r.importer!.nom).toBe('À importer · Lot #7 · attend ses mesures');
    const ecran = await ecranImport(r.importer!.href!);
    expect(ecran.lot, 'l’écran ne s’ouvre pas sur le lot de la pastille').toBe(L.a1);
    expect(ecran.choisi, 'la liste « Lot » ne montre pas ce lot choisi').toBe(L.a1);
    expect(ecran.lots, 'la liste « Lot » de la marque Autre').toEqual([L.a1]);
    expect(ecran.texte).not.toMatch(/Mesures pas encore remontées|Une variante mesurée/);
    expect(r.conclure, 'la marque Autre n’a aucun lot à conclure').toBeNull();
  });

  it('un autre espace · son compte à lui', async () => {
    comme('ub', AILLEURS());
    const r = await rail();
    expect(r.importer?.href).toBe(`/adsmap/import?lot=${L.b1}`);
    expect((await ecranImport(r.importer!.href!)).lots).toEqual([L.b1]);
  });
});

describe('qui voit la pastille', () => {
  it('un membre · l’écran d’import le refuse · ni pastille, ni lecture du compte · « à conclure » identique à l’admin', async () => {
    comme('um', NEVA());
    const avant = await traces();
    const r = await rail();
    expect(r.importer, 'un membre reçoit une pastille vers un écran fermé').toBeNull();
    expect(vi.mocked(pastilleImport), 'le compte « à importer » est lu pour un membre').not.toHaveBeenCalled();
    expect(r.conclure, 'le membre ne voit plus le même compte « à conclure »').toBe('2 lots à conclure');
    await expect(ImportSpatial({ searchParams: Promise.resolve({}) }), 'préalable · l’écran d’import refuse le membre').rejects.toThrow('REDIRECT /adsmap');
    expect(await traces()).toEqual(avant);
  });

  it('une formule sans Résultats (Core) · ni pastille, ni lecture du compte', async () => {
    comme('uo', NEVA(), 'core');
    const r = await rail();
    expect(r.importer, 'la formule verrouille Résultats, la pastille « à importer » reste').toBeNull();
    expect(vi.mocked(pastilleImport)).not.toHaveBeenCalled();
    const ecran = await ecranImport('/adsmap/import');
    expect(ecran.lots, 'préalable · l’écran d’import refuse la formule Core').toEqual([]);
  });
});

describe('LA lecture du rail · la MÊME portée, le MÊME ordre, la MÊME borne que `chargerLots`', () => {
  it('à la borne (2 000 variantes atteintes, départage par l’identifiant) · mêmes lots retenus, mêmes variantes par lot', async () => {
    const liste = await chargerLots(I.wsA!, I.bBorne!, MAINTENANT);
    const legere = await chargerFaitsRail(I.wsA!, I.bBorne!, MAINTENANT);
    expect(liste.lots.reduce((s, l) => s + l.ads.length, 0), 'préalable · la borne est atteinte').toBe(2000);
    expect(legere.lots.map((l) => [l.id, l.ads.length]), 'la lecture légère ne lit pas les mêmes variantes que la liste').toEqual(liste.lots.map((l) => [l.id, l.ads.length]));
    const attendu = compteAImporter(liste.lots, liste.ctx, liste.config);
    const lu = await compterAImporter(I.wsA!, I.bBorne!, MAINTENANT);
    expect(lu, 'la lecture légère ne retient pas les mêmes lots que `chargerLots`').toEqual(attendu);
    // Seuls deux des trois lots ont leur v0667 lue (sans mesure) · lesquels · les plus petits identifiants de v0667.
    expect(lu.n, 'la borne ne coupe pas où il faut').toBe(2);
  });

  it('chaque marque du semis · mêmes lots que `chargerLots` + la règle, et ce que la liste « Lot » montre', async () => {
    for (const [ws, b] of [[I.wsA!, I.bA!], [I.wsA!, I.bA2!], [I.wsB!, I.bB!]] as const) {
      const liste = await chargerLots(ws, b, MAINTENANT);
      expect(await compterAImporter(ws, b, MAINTENANT)).toEqual(compteAImporter(liste.lots, liste.ctx, liste.config));
    }
    expect((await compterAImporter(I.wsA!, I.bA!, MAINTENANT)).lots.map((l) => l.id)).toEqual([L.n3, L.n1]);
    // Une marque d'un AUTRE espace lue avec l'espace A · rien (la portée suit l'espace ET la marque).
    expect((await compterAImporter(I.wsA!, I.bB!, MAINTENANT)).n, 'la portée de la lecture légère ne suit pas l’espace').toBe(0);
  });
});
