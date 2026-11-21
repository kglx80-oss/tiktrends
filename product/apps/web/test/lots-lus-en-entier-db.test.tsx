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
 *  · #25 · 600 variantes calculées gagnantes, au-delà du plafond d'un lot ·
 *    ni lu, ni deviné · « Lecture incomplète », compté nulle part.
 * Toutes les dates sont en 2020 · les fenêtres sont écoulées. Aucun réseau, 0 $.
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

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { avecSpatial } from './spatial/fournisseur';
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';
import LotsSpatial from '../app/(spatial)/sp/adsmap/lots/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import ImportSpatial from '../app/(spatial)/sp/adsmap/import/page';
import { chargerCoquille } from '../lib/spatial/coquille';
import { Coquille } from '../spatial/coquille/Coquille';

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

function commeProprietaire() {
  h.session = { user: { id: I.uo!, email: 'uo@entier.test', name: 'Camille' }, workspaceId: I.ws!, workspaceName: 'Espace', role: 'owner', plan: 'plus', equipe: null };
  h.marque = { id: I.b!, name: 'Neva' };
}

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
  return { etats, note: net(d.querySelector('[data-lecture-incomplete]')?.textContent) || null };
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

  it('la fiche du grand lot #25 · « Lecture incomplète », aucun arbitrage, aucune variante devinée', async () => {
    commeProprietaire();
    const f = await fiche(L.grand!);
    expect(f.lecture ?? '(aucune réserve)', 'la fiche ne dit pas que le lot est lu en partie').toMatch(new RegExp(`^Lecture incomplète · 0 variante lue sur ${GRAND} · son état n’est pas calculé`));
    expect(f.aArbitrer, 'un lot lu en partie propose un arbitrage').toEqual([]);
    expect(f.texte, 'tiret cadratin à l’écran').not.toMatch(/—/);
  });
});
