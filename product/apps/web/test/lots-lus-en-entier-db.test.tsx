// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Une marque de plus de 2 000 variantes · chaque lot affiché est lu EN ENTIER,
 * ou dit « Lecture incomplète » · jamais un état calculé sur une partie de ses
 * variantes. Sur une VRAIE base (pglite, migrations du dépôt), avec les VRAIES
 * gardes et les VRAIES vues · la coquille (pastilles du rail), l'Accueil
 * (« À traiter », « À faire maintenant »), « Lots de test », la fiche d'un lot
 * (son formulaire d'arbitrage) et l'écran d'import · on lit le DOM.
 *
 * Le semis · l'ancienne lecture prenait les 2 000 premières variantes de la
 * marque par code (`a…` puis `b…`) · un lot de remplissage (#1, 1 995
 * brouillons `b…`) la comble avec les cinq `a…` · chaque `z…` était coupée.
 *  · #20 et #24 · `a…` arbitrée, `z…` calculée gagnante qui attend · à
 *    conclure · lus `a…` seule, ils sortaient « Conclu » ;
 *  · #21 · `a2` calculée qui attend, `z2` sans verdict · des mesures manquent ·
 *    lu `a2` seule, il sortait « À conclure » ;
 *  · #22 · `a3` arbitrée, `z3` sans verdict · des mesures manquent · lu `a3`
 *    seule, il sortait « Conclu », jamais compté « à importer » ;
 *  · #23 · `a4` et `z4` calculées · le formulaire d'arbitrage omettait `z4` ;
 *  · #25 · 600 variantes calculées gagnantes, au-delà du plafond d'un lot et
 *    de celui d'un lot SEUL (mesurés, `MESURE_LECTURE_LOT_SEUL`) · ni la liste,
 *    ni le rail, ni sa fiche ne le lisent · « Lecture incomplète », compté
 *    nulle part · sa fiche le dit sans une phrase tirée de rien (synthèse,
 *    contrôles, conseil, conclusion) et dit quoi faire.
 * Une seconde marque (« Vaste ») · 300 lots de 8 · c'est le BUDGET qui coupe ·
 * les 250 plus récents sont lus, les 50 plus anciens non · le plus ancien
 * (#1) attend son arbitrage · la liste le dit « Lecture incomplète », sa fiche
 * le lit et l'arbitre.
 * Toutes les dates sont en 2020 · les fenêtres sont écoulées. Aucun réseau, 0 $.
 */

const h = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['ws', 'b', 'v', 'p', 'uo']) h.ids[k] = randomUUID();
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

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { BORNES_LECTURE_LOTS, variantesDesLotsLus, type VariantesDuLot } from '@tiktrends/core';
/** Ce que la lecture a vu de chaque lot · `[id, 'entiere', n]` ou `[id, 'partielle', en base, lues]`. */
const triplets = (x: { lots: ReadonlyArray<{ id: string } & VariantesDuLot<ReadonlyArray<unknown>>> }) =>
  x.lots.map((y) => (y.partielle ? [y.id, 'partielle', y.partielle.variantesEnBase, y.partielle.variantesLues] : [y.id, 'entiere', y.ads.length]));
import { avecSpatial } from './spatial/fournisseur';
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';
import LotsSpatial from '../app/(spatial)/sp/adsmap/lots/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import ImportSpatial from '../app/(spatial)/sp/adsmap/import/page';
import { chargerCoquille } from '../lib/spatial/coquille';
import { Coquille } from '../spatial/coquille/Coquille';
import { chargerFaitsRail, chargerLots } from '../app/(spatial)/sp/adsmap/donnees';
import ResultatsSpatial from '../app/(spatial)/sp/adsmap/page';
import BoucleSpatial from '../app/(spatial)/sp/adsmap/boucle/page';
import { resoudreContexteJarvis } from '../lib/jarvis-contexte';
import { gestesPourContexte } from '../lib/jarvis-gestes';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const I = h.ids;
const L: Record<string, string> = {};
const J = 86_400_000;
/** Lundi 6 janvier 2020 · fenêtre du moteur par défaut (7 jours) · fermée le 13 janvier. */
const T0 = new Date('2020-01-06T09:00:00Z');
const A = (jours: number) => new Date(T0.getTime() + jours * J);
/** L'ancienne borne globale (`LIMITE_ADS_LOTS`) · le remplissage la comble avec les cinq `a…`. */
const BORNE = 2000;
/** Le lot trop grand pour être lu · au-delà du plafond d'un lot (`PLAFOND_VARIANTES_LOT`, vérifié plus bas). */
const GRAND = 600;

function commeProprietaire(marque: { id: string; name: string } = { id: I.b!, name: 'Neva' }, role = 'owner') {
  h.session = { user: { id: I.uo!, email: 'uo@entier.test', name: 'Camille' }, workspaceId: I.ws!, workspaceName: 'Espace', role, plan: 'plus', equipe: null };
  h.marque = marque;
}
const VASTE = () => ({ id: I.v!, name: 'Vaste' });
/** « Petite » · deux lots seulement, tous deux au-delà du plafond d'un lot · la vue d'ensemble les montre (« autres lots »). */
const PETITE = () => ({ id: I.p!, name: 'Petite' });
/**
 * Ce qu'aucune phrase ne doit dire d'un lot lu en partie · elle serait tirée d'une partie (ou de rien) · « Aucune
 * mesure ni aucun verdict ne suit » (la duplication, vraie de toute copie) n'en est pas une.
 */
const PHRASES_FAUSSES = /aucune variante|Aucune mesure(?! ni aucun verdict ne suit)|Durée prévue atteinte|en préparation : 0|à choisir|Aucune hypothèse|Aucun persona|Aucune variante rangée|Pas encore lancé|0 étape/;
/**
 * Les phrases tirées de rien dans un texte, avec leur contexte · `[]` attendu. Exemptions NOMMÉES (phrases vraies) ·
 *  · « Aucune mesure ni aucun verdict ne suit » · la duplication, vraie de toute copie (motif) ;
 *  · « Aucun lot en préparation » · la colonne vide de la Boucle, vraie quand aucun lot n'y est.
 */
const EXEMPTIONS = [/Aucun lot en préparation/g];
const phrasesFausses = (texte: string) => {
  const t = EXEMPTIONS.reduce((x, e) => x.replace(e, '·'), texte);
  return [...t.matchAll(new RegExp(`.{0,80}(${PHRASES_FAUSSES.source}).{0,80}`, 'g'))].map((m) => m[0]);
};

async function chaine(titre: string) {
  const [p] = await db.insert(schema.personas).values({ brandId: I.b!, name: `P ${titre}` }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: I.ws!, personaId: p!.id, label: 'D' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: I.ws!, desireId: d!.id, label: 'A', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: I.ws!, angleId: a!.id, title: titre }).returning();
  const [offre] = await db.insert(schema.offers).values({ workspaceId: I.ws!, brandId: I.b!, label: 'Offre' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: I.ws!, brandId: I.b!, url: 'https://neva.test/p', label: 'Page' }).returning();
  return { concept: c!.id, offre: offre!.id, page: page!.id };
}

type Verdict = { calcule: 'winner' | 'loser'; valide?: true };
async function lot(cle: string, numero: number, variantes: Array<{ code: string; verdict?: Verdict }>) {
  const ch = await chaine(`Concept ${cle}`);
  const [b] = await db.insert(schema.batches).values({ workspaceId: I.ws!, brandId: I.b!, number: numero, status: 'testing', launchedAt: T0, plannedEndAt: A(7), goal: `Lot ${cle}` }).returning();
  L[cle] = b!.id;
  for (let i = 0; i < variantes.length; i += 500) {
    const tranche = variantes.slice(i, i + 500);
    const ads = await db.insert(schema.ads).values(tranche.map((v) => ({
      workspaceId: I.ws!, conceptId: ch.concept, batchId: b!.id, variantCode: v.code, status: (v.verdict?.valide ? 'done' : 'live') as 'done' | 'live', adType: 'ideation' as const, format: 'static' as const, platform: 'meta' as const,
      hypothesis: 'Si on montre la preuve chiffrée, alors le coût par achat baisse parce que la cible doute.', testedVariable: 'hook' as const, variableValue: `Preuve ${v.code}`,
      offerId: ch.offre, landingPageId: ch.page, launchedAt: T0, generatedName: `NEVA_${cle}_${v.code}`,
    }))).returning({ id: schema.ads.id, code: schema.ads.variantCode });
    const parCode = new Map(tranche.map((v) => [v.code, v.verdict]));
    const verdicts = ads.flatMap((a) => {
      const v = parCode.get(a.code);
      return v ? [{
        adId: a.id, workspaceId: I.ws!, computed: v.calcule, validated: v.valide ? v.calcule : null, status: (v.valide ? 'validated' : 'computed') as 'validated' | 'computed',
        comparable: true, computedAt: A(8), metricsAgg: { spend: 150, impressions: 20_000, purchases: 3, cpa: 50, reason: 'Moteur', daysElapsed: 8 },
      }] : [];
    });
    if (verdicts.length) await db.insert(schema.verdicts).values(verdicts);
  }
  const ids = await db.select({ id: schema.ads.id, code: schema.ads.variantCode }).from(schema.ads).where(eq(schema.ads.batchId, b!.id));
  for (const a of ids) L[`${cle}:${a.code}`] = a.id;
}

/**
 * La marque « Vaste » · 300 lots de 8 variantes (2 400 > budget) · c'est le budget qui coupe, aucun lot ne passe
 * le plafond d'un lot. #1, le plus ancien · ses 8 variantes calculées gagnantes, à conclure · les autres sans verdict.
 */
async function vaste() {
  await db.insert(schema.brands).values({ id: I.v!, workspaceId: I.ws!, name: 'Vaste' });
  const [p] = await db.insert(schema.personas).values({ brandId: I.v!, name: 'P Vaste' }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: I.ws!, personaId: p!.id, label: 'D' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: I.ws!, desireId: d!.id, label: 'A', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: I.ws!, angleId: a!.id, title: 'Vaste' }).returning();
  const [offre] = await db.insert(schema.offers).values({ workspaceId: I.ws!, brandId: I.v!, label: 'Offre' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: I.ws!, brandId: I.v!, url: 'https://vaste.test/p', label: 'Page' }).returning();
  const lots = await db.insert(schema.batches).values(Array.from({ length: 300 }, (_, i) => ({ workspaceId: I.ws!, brandId: I.v!, number: i + 1, status: 'testing' as const, launchedAt: T0, plannedEndAt: A(7), goal: `Vaste ${i + 1}` })))
    .returning({ id: schema.batches.id, n: schema.batches.number });
  for (const b of lots) L[`vaste${b.n}`] = b.id;
  const ads = lots.flatMap((b) => Array.from({ length: 8 }, (_, k) => ({
    workspaceId: I.ws!, conceptId: c!.id, batchId: b.id, variantCode: `v${k}`, status: 'live' as const, adType: 'ideation' as const, format: 'static' as const, platform: 'meta' as const,
    hypothesis: 'Si on montre la preuve chiffrée, alors le coût par achat baisse parce que la cible doute.', testedVariable: 'hook' as const, variableValue: `P${k}`,
    offerId: offre!.id, landingPageId: page!.id, launchedAt: T0,
  })));
  const ids: Array<{ id: string; b: string | null }> = [];
  for (let i = 0; i < ads.length; i += 500) ids.push(...await db.insert(schema.ads).values(ads.slice(i, i + 500)).returning({ id: schema.ads.id, b: schema.ads.batchId }));
  await db.insert(schema.verdicts).values(ids.filter((x) => x.b === L.vaste1).map((x) => ({
    adId: x.id, workspaceId: I.ws!, computed: 'winner' as const, status: 'computed' as const, comparable: true, computedAt: A(8),
    metricsAgg: { spend: 150, impressions: 20_000, purchases: 3, cpa: 50, reason: 'Moteur', daysElapsed: 8 },
  })));
}

/** « Petite » · #2 en préparation, 501 brouillons · #1 en diffusion, 501 variantes sans verdict · aucun n'est lu (plafond d'un lot). */
async function petite() {
  await db.insert(schema.brands).values({ id: I.p!, workspaceId: I.ws!, name: 'Petite' });
  const [p] = await db.insert(schema.personas).values({ brandId: I.p!, name: 'P Petite' }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: I.ws!, personaId: p!.id, label: 'D' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: I.ws!, desireId: d!.id, label: 'A', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: I.ws!, angleId: a!.id, title: 'Petite' }).returning();
  const [offre] = await db.insert(schema.offers).values({ workspaceId: I.ws!, brandId: I.p!, label: 'Offre' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: I.ws!, brandId: I.p!, url: 'https://petite.test/p', label: 'Page' }).returning();
  const [diff] = await db.insert(schema.batches).values({ workspaceId: I.ws!, brandId: I.p!, number: 1, status: 'testing', launchedAt: T0, plannedEndAt: A(7), goal: 'Petite diffusion' }).returning();
  const [prep] = await db.insert(schema.batches).values({ workspaceId: I.ws!, brandId: I.p!, number: 2, status: 'planned', goal: 'Petite préparation' }).returning();
  L.petiteDiffusion = diff!.id; L.petitePreparation = prep!.id;
  const n = BORNES_LECTURE_LOTS.plafondParLot + 1;
  const ads = [
    ...Array.from({ length: n }, (_, k) => ({ workspaceId: I.ws!, conceptId: c!.id, batchId: diff!.id, variantCode: `v${k}`, status: 'live' as const, adType: 'ideation' as const, format: 'static' as const, platform: 'meta' as const,
      hypothesis: 'Si on montre la preuve chiffrée, alors le coût par achat baisse parce que la cible doute.', testedVariable: 'hook' as const, variableValue: `P${k}`, offerId: offre!.id, landingPageId: page!.id, launchedAt: T0 })),
    ...Array.from({ length: n }, (_, k) => ({ workspaceId: I.ws!, conceptId: c!.id, batchId: prep!.id, variantCode: `b${k}`, status: 'draft' as const, adType: 'ideation' as const, format: 'static' as const })),
  ];
  for (let i = 0; i < ads.length; i += 500) await db.insert(schema.ads).values(ads.slice(i, i + 500));
}

const GAGNE: Verdict = { calcule: 'winner' };
const ARBITRE: Verdict = { calcule: 'winner', valide: true };

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: I.ws!, name: 'Espace', plan: 'plus', onboardedAt: T0 });
  await db.insert(schema.users).values({ id: I.uo!, email: 'uo@entier.test', name: 'Camille' });
  await db.insert(schema.workspaceMembers).values({ workspaceId: I.ws!, userId: I.uo!, role: 'owner' });
  await db.insert(schema.brands).values({ id: I.b!, workspaceId: I.ws!, name: 'Neva' });
  await lot('conclure', 20, [{ code: 'a1', verdict: ARBITRE }, { code: 'z1', verdict: GAGNE }]);
  await lot('fauxConclure', 21, [{ code: 'a2', verdict: GAGNE }, { code: 'z2' }]);
  await lot('importer', 22, [{ code: 'a3', verdict: ARBITRE }, { code: 'z3' }]);
  await lot('arbitrage', 23, [{ code: 'a4', verdict: GAGNE }, { code: 'z4', verdict: { calcule: 'loser' } }]);
  await lot('conclure2', 24, [{ code: 'a5', verdict: ARBITRE }, { code: 'z5', verdict: GAGNE }]);
  await lot('grand', 25, Array.from({ length: GRAND }, (_, i) => ({ code: `y${String(i).padStart(4, '0')}`, verdict: GAGNE })));
  await vaste();
  await petite();
  // Le remplissage · un lot en composition, ses brouillons rangés après les `a…` et avant les `y…` et `z…`.
  const [f] = await db.insert(schema.batches).values({ workspaceId: I.ws!, brandId: I.b!, number: 1, status: 'planned', goal: 'Remplissage' }).returning();
  L.remplissage = f!.id;
  const ch = await chaine('Remplissage');
  const n = BORNE - 5;
  for (let i = 0; i < n; i += 500) {
    await db.insert(schema.ads).values(Array.from({ length: Math.min(500, n - i) }, (_, k) => ({
      workspaceId: I.ws!, conceptId: ch.concept, batchId: f!.id, variantCode: `b${String(i + k).padStart(4, '0')}`, status: 'draft' as const, adType: 'ideation' as const, format: 'static' as const,
    })));
  }
}, 180_000);

afterEach(() => { h.session = null; h.marque = null; });

const brut = (el: ReactNode) => renderToStaticMarkup(el as ReactElement);
const dom = (el: ReactNode) => { const d = document.createElement('div'); d.innerHTML = brut(el); return d; };
const net = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** La VRAIE coquille · les deux pastilles du rail (« à conclure » sur Résultats, « à importer » juste dessous). */
async function rail() {
  const donnees = await chargerCoquille();
  const d = document.createElement('div');
  d.innerHTML = brut(<Coquille donnees={donnees}><p>page</p></Coquille>);
  const resultats = d.querySelector('nav.rail a[data-r="resultats"]');
  expect(resultats, 'préalable · l’entrée Résultats du rail').not.toBeNull();
  const imp = d.querySelector<HTMLAnchorElement>('nav.rail a[data-pastille-import]');
  return {
    conclure: resultats!.querySelector('.badge')?.getAttribute('aria-label') ?? null,
    importer: imp ? Number(net(imp.querySelector('.rbadge')?.textContent)) : 0,
  };
}

/** « Lots de test » rendu · pour chaque lot, le libellé de son état. */
async function liste() {
  const d = dom(avecSpatial(await LotsSpatial({ searchParams: Promise.resolve({}) })));
  const etats = new Map<string, string>();
  for (const r of d.querySelectorAll('.lotrow')) {
    const id = r.querySelector<HTMLElement>('[data-lot-lien]')?.dataset.lotLien;
    if (id) etats.set(id, net(r.querySelector('.meta .pill:not(.c)')?.textContent));
  }
  const lignes = new Map<string, string>();
  for (const r of d.querySelectorAll('.lotrow')) {
    const id = r.querySelector<HTMLElement>('[data-lot-lien]')?.dataset.lotLien;
    if (id) lignes.set(id, net(r.textContent));
  }
  return { etats, lignes, note: net(d.querySelector('[data-lecture-incomplete]')?.textContent) || null };
}

/** La fiche d'un lot rendue · ses variantes listées, les variantes du formulaire d'arbitrage, la réserve de lecture. */
async function fiche(id: string) {
  const d = dom(avecSpatial(await LotSpatial({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })));
  return {
    variantes: [...d.querySelectorAll('section[aria-label="Les variantes du lot"] .ev strong')].map((s) => net(s.textContent).split(' · ')[0]),
    aArbitrer: [...d.querySelectorAll<HTMLTextAreaElement>('textarea[data-apprentissage]')].map((t) => t.dataset.apprentissage),
    lecture: (() => {
      const s = d.querySelector(`section[data-lecture-incomplete="${id}"]`);
      return s ? `${net(s.querySelector('h2')?.textContent)} · ${net(s.querySelector('p')?.textContent)}` : null;
    })(),
    texte: net(d.textContent),
    tests: d.querySelector<HTMLAnchorElement>('[data-lecture-incomplete] a[data-geste="tests-du-lot"]')?.getAttribute('href') ?? null,
  };
}

describe('le compte « à conclure » · un lot coupé ne sort plus conclu, ni à conclure à tort', () => {
  it('la pastille du rail compte #24, #23 et #20 · pas #21, dont une variante attend ses mesures', async () => {
    commeProprietaire();
    expect((await rail()).conclure, 'la pastille « à conclure » compte un lot sur une partie de ses variantes').toBe('3 lots à conclure');
  });

  it('l’Accueil · « À traiter » et « À faire maintenant » disent les mêmes trois lots', async () => {
    commeProprietaire();
    const d = dom(avecSpatial(await AccueilSpatial({ searchParams: Promise.resolve({}) })));
    const t = [...d.querySelectorAll<HTMLAnchorElement>('.pipe a.tile.stage')].find((a) => net(a.querySelector('strong')?.textContent) === 'À traiter');
    expect(t, 'préalable · l’étape « À traiter »').toBeTruthy();
    expect(Number(net(t!.querySelector('.big3')?.textContent)), '« À traiter » compte un lot sur une partie de ses variantes').toBe(3);
    expect(net(d.querySelector('a.tile.nowbar strong')?.textContent), '« À faire maintenant » compte un lot sur une partie de ses variantes').toBe('À faire maintenant : conclure 3 lots');
  });
});

describe('le compte « à importer » · un lot dont la variante sans verdict était coupée est compté', () => {
  it('la pastille « à importer » compte #22 et #21', async () => {
    commeProprietaire();
    expect((await rail()).importer, 'la pastille « à importer » ignore un lot dont la variante sans verdict est coupée').toBe(2);
  });

  it('l’import du lot #22 · ses deux variantes, et la liste « Lot » le range dans « Mesures manquantes »', async () => {
    commeProprietaire();
    const d = dom(avecSpatial(await ImportSpatial({ searchParams: Promise.resolve({ lot: L.importer! }) })));
    const s = d.querySelector<HTMLElement>('section[data-lot-cible]');
    expect(s?.dataset.lotCible, 'préalable · l’import s’ouvre sur le lot #22').toBe(L.importer);
    expect([...s!.querySelectorAll('[data-tableau="variantes-lot"] .mrow:not(.h) .num')].map((x) => net(x.textContent)), 'l’import du lot omet une variante coupée').toEqual(['a3', 'z3']);
    const manquantes = [...d.querySelectorAll('[data-liste-lot] optgroup[data-cas="manquantes"] option')].map((o) => o.getAttribute('value'));
    expect(manquantes, 'la liste « Lot » ignore les lots dont la variante sans verdict est coupée').toEqual([L.importer, L.fauxConclure]);
  });
});

describe('« Lots de test » et la fiche · chaque lot lu en entier, ou dit lu en partie', () => {
  it('la liste · l’état de chaque lot sur TOUTES ses variantes · le grand lot dit « Lecture incomplète »', async () => {
    commeProprietaire();
    const l = await liste();
    expect(Object.fromEntries([...l.etats].map(([id, e]) => [Object.keys(L).find((k) => L[k] === id), e])), 'un lot de la liste a un état calculé sur une partie de ses variantes').toEqual({
      grand: 'Lecture incomplète', conclure2: 'À conclure', arbitrage: 'À conclure', importer: 'Mesures à importer', fauxConclure: 'Mesures à importer', conclure: 'À conclure', remplissage: 'En préparation',
    });
    expect(l.note ?? '(aucune note)', 'la liste ne dit pas que des lots sont lus en partie').toMatch(/^2 lots lus en partie · /);
    expect(l.note ?? '', 'tiret cadratin à l’écran').not.toMatch(/—/);
  });

  it('la fiche du lot #20 · ses deux variantes, et l’arbitrage de `z1`', async () => {
    commeProprietaire();
    const f = await fiche(L.conclure!);
    expect(f.variantes, 'la fiche omet une variante coupée').toEqual(['a1', 'z1']);
    expect(f.aArbitrer, 'la fiche ne propose pas l’arbitrage de la variante coupée').toEqual([L['conclure:z1']]);
    expect(f.lecture, 'un lot lu en entier se dit lu en partie').toBeNull();
  });

  it('la fiche du lot #23 · le formulaire d’arbitrage propose ses DEUX variantes', async () => {
    commeProprietaire();
    expect((await fiche(L.arbitrage!)).aArbitrer, 'le formulaire d’arbitrage omet la variante coupée').toEqual([L['arbitrage:a4'], L['arbitrage:z4']]);
  });

  it('la fiche du grand lot #25, au-delà du plafond d’un lot seul · « Lecture incomplète », quoi faire, aucune phrase tirée de rien', async () => {
    commeProprietaire();
    expect(GRAND, 'préalable · le grand lot passe le plafond d’un lot seul').toBeGreaterThan(BORNES_LECTURE_LOTS.plafondLotSeul);
    const f = await fiche(L.grand!);
    expect(f.lecture ?? '(aucune réserve)', 'la fiche ne dit pas que le lot est lu en partie').toMatch(new RegExp(`^Lecture incomplète · 0 variante lue sur ${GRAND} · son état n’est pas calculé`));
    expect(phrasesFausses(f.texte), 'la fiche d’un lot lu en partie dit une phrase tirée de rien').toEqual([]);
    expect(f.lecture ?? '', 'la fiche ne dit pas quoi faire d’un lot trop grand pour elle').toMatch(/ouvre la fiche de test d’une variante \(Résultats · Tests\) pour l’arbitrer seule\.$/);
    expect(f.aArbitrer, 'un lot lu en partie propose un arbitrage').toEqual([]);
    expect(f.tests, 'la réserve ne mène pas aux tests de ce lot (où chaque variante s’arbitre seule)').toBe(`/adsmap/tests?lot=${L.grand}`);
    expect(f.texte, 'tiret cadratin à l’écran').not.toMatch(/—/);
  });
});

describe('un lot en préparation lu en partie · son état vient du statut, le reste ne se tire pas de rien', () => {
  it('la fiche du remplissage #1 (1 995 brouillons) · « Lecture incomplète », aucun « 0 variante », aucune phrase tirée de rien', async () => {
    // Un membre · la fiche sans les gestes de composition (réservés aux admins, et qui relisent chaque brouillon).
    commeProprietaire(undefined, 'member');
    const f = await fiche(L.remplissage!);
    expect(f.lecture ?? '(aucune réserve)', 'la fiche d’un lot en préparation lu en partie ne le dit pas').toMatch(/^Lecture incomplète · 0 variante lue sur 1\s995 · ses variantes ne sont pas affichées, aucune n’est tirée d’une partie du lot\. /);
    expect(phrasesFausses(f.texte), 'la fiche d’un lot lu en partie dit une phrase tirée de rien').toEqual([]);
  });
});

describe('« Vaste » · c’est le budget qui coupe · les plus récents d’abord, le plus ancien reste arbitrable sur sa fiche', () => {
  it('la liste · le plus récent lu, le plus ancien « Lecture incomplète » · rail et liste lisent les mêmes lots', async () => {
    commeProprietaire(VASTE());
    const l = await liste();
    expect(l.etats.get(L.vaste300!), 'le lot le plus récent n’est pas lu').toBe('Mesures à importer');
    expect(l.etats.get(L.vaste51!), 'le 250e lot le plus récent n’est pas lu').toBe('Mesures à importer');
    expect(l.etats.get(L.vaste50!), 'le budget ne coupe pas au 251e lot').toBe('Lecture incomplète');
    expect(l.etats.get(L.vaste1!), 'le lot le plus ancien a un état calculé sans être lu').toBe('Lecture incomplète');
    const [rail, liste2] = await Promise.all([chargerFaitsRail(I.ws!, I.v!), chargerLots(I.ws!, I.v!)]);
    expect(triplets(rail), 'le rail et la liste ne lisent pas les mêmes lots').toEqual(triplets(liste2));
    expect(variantesDesLotsLus(liste2.lots).length, 'le budget n’est pas tenu').toBe(BORNES_LECTURE_LOTS.budget);
  });

  it('la fiche du lot #1, le plus ancien · lue en entier, ses 8 variantes à arbitrer', async () => {
    commeProprietaire(VASTE());
    const f = await fiche(L.vaste1!);
    expect(f.lecture, 'la fiche du lot le plus ancien le dit encore lu en partie').toBeNull();
    expect(f.aArbitrer.length, 'le lot le plus ancien n’est pas arbitrable sur sa fiche').toBe(8);
  });
});

describe('aucune vue ne tire une phrase d’un lot non lu (garde « B »)', () => {
  it('« Lots de test » · les lignes des lots non lus (#25, le remplissage) ne disent ni « à choisir », ni « Aucune hypothèse »', async () => {
    commeProprietaire();
    const l = await liste();
    for (const id of [L.grand!, L.remplissage!]) {
      expect(l.lignes.get(id), 'préalable · la ligne du lot non lu').toBeTruthy();
      expect(phrasesFausses(l.lignes.get(id)!), 'la ligne d’un lot non lu dit une phrase tirée de rien').toEqual([]);
    }
    expect(l.note ?? '', 'la note ne dit pas que la fiche lit le lot en entier').toMatch(/Sa fiche le lit en entier jusqu’à 500 variantes\.$/);
  });

  it('la vue d’ensemble de Résultats (« Petite ») · les lots non lus ne disent ni « Aucune variante rangée », ni « à choisir »', async () => {
    commeProprietaire(PETITE());
    const d = dom(avecSpatial(await ResultatsSpatial({ searchParams: Promise.resolve({}) })));
    const t = net(d.textContent);
    expect(t, 'préalable · la vue d’ensemble montre les deux lots non lus').toMatch(/Lot #2 · Petite préparation.*|Lot #1 · Petite diffusion/);
    expect(phrasesFausses(t), 'la vue d’ensemble dit une phrase tirée de rien').toEqual([]);
    expect(t, 'la vue d’ensemble ne dit pas qu’un lot n’est pas lu').toMatch(/Non lu · 0 variante lue sur 501 ·/);
  });

  it('la Boucle (Neva) · le remplissage lu en partie n’est pas « Préparation 0/4 » ni « Variable à choisir »', async () => {
    commeProprietaire();
    const d = dom(avecSpatial(await BoucleSpatial()));
    const t = net(d.textContent);
    expect(t, 'préalable · la Boucle montre le remplissage').toContain('Lot #1 · Remplissage');
    expect(phrasesFausses(t), 'la Boucle dit une phrase tirée de rien').toEqual([]);
    expect(t, 'la Boucle ne dit pas que la préparation n’est pas calculée').toMatch(/Préparation non calculée · 0 variante lue sur 1\s995/);
    expect(t).not.toMatch(/Préparation 0\/4/);
  });

  it('Jarvis · le contexte du grand lot #25 (au-delà du plafond d’un lot seul) · aucune phrase tirée de rien, la question neutre', async () => {
    commeProprietaire();
    const r = await resoudreContexteJarvis(h.session as never, { id: I.b! }, { type: 'lot', id: L.grand! });
    expect(r, 'préalable · le contexte du lot').not.toBeNull();
    const t = [...r!.lignes, r!.question].join('\n');
    expect(phrasesFausses(t), 'le contexte de Jarvis dit une phrase tirée de rien').toEqual([]);
    expect(t).toMatch(/600 variantes en base, 0 variante lue sur 600 · lecture incomplète/);
    expect(r!.question, 'la question de Jarvis parle d’un état « lecture incomplète »').not.toMatch(/ce lot est lecture incomplète/i);
  });
});

describe('le lot d’une fiche, de l’import et de Jarvis · lu en entier, hors budget, sans rien changer aux autres', () => {
  it('Jarvis (« Vaste » #1, hors budget) · le contexte compte ses 8 variantes, et « Conclure » est ouvert', async () => {
    commeProprietaire(VASTE());
    const r = await resoudreContexteJarvis(h.session as never, { id: I.v! }, { type: 'lot', id: L.vaste1! });
    expect(r!.lignes.join('\n'), 'le contexte de Jarvis ne lit pas le lot joint en entier').toMatch(/· 8 variantes(\n|$)/);
    const g = await gestesPourContexte(h.session as never, I.v!, { type: 'lot', id: L.vaste1! });
    expect(g?.conclure.cible ?? null, 'le geste « Conclure » de Jarvis est calculé sur un lot non lu').toEqual({ type: 'conclure', lotId: L.vaste1 });
  });

  it('l’import (« Vaste » #1, hors budget) · ses 8 variantes', async () => {
    commeProprietaire(VASTE());
    const d = dom(avecSpatial(await ImportSpatial({ searchParams: Promise.resolve({ lot: [L.vaste1!, L.vaste300!] }) })));
    const s = d.querySelector<HTMLElement>('section[data-lot-cible]');
    expect(s?.dataset.lotCible, '`?lot=a&lot=b` · l’import ne s’ouvre pas sur la première valeur').toBe(L.vaste1);
    expect(s!.querySelectorAll('[data-tableau="variantes-lot"] .mrow:not(.h) .num').length, 'l’import ne lit pas son lot en entier').toBe(8);
  });

  it('la fiche (« Vaste » #1) · chaque lot lu l’est en entier ou pas du tout, et les autres lots sont ceux de la liste', async () => {
    const liste2 = await chargerLots(I.ws!, I.v!);
    const fiche2 = await chargerLots(I.ws!, I.v!, new Date(), { lotEntier: L.vaste1! });
    expect(fiche2.lots.filter((l) => l.partielle && l.partielle.variantesLues > 0).map((l) => l.numero), 'un lot de la fiche est lu en partie (coupé)').toEqual([]);
    const entiers = (x: typeof liste2) => x.lots.filter((l) => !l.partielle).map((l) => l.id);
    expect(entiers(fiche2), 'la fiche ne lit pas les mêmes autres lots que la liste').toEqual([...entiers(liste2), L.vaste1].sort((a, b) => fiche2.lots.findIndex((l) => l.id === a) - fiche2.lots.findIndex((l) => l.id === b)));
  });

  it('portée · la fiche d’un lot de « Vaste » ouverte avec la marque Neva · introuvable', async () => {
    commeProprietaire();
    await expect(LotSpatial({ params: Promise.resolve({ id: L.vaste1! }), searchParams: Promise.resolve({}) }), 'la fiche d’un lot d’une autre marque s’ouvre').rejects.toThrow('NOT_FOUND');
  });
});
