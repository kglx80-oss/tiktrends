// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * UN compte « à conclure » partout (suite de #1075) · sur une VRAIE base
 * (pglite, migrations du dépôt), avec les VRAIES gardes et les VRAIES vues
 * rendues · la coquille (`chargerCoquille` → `Coquille`, pastille de
 * Résultats), l'Accueil (`/dashboard` · « À traiter », « À faire
 * maintenant ») et « Lots de test » (`/adsmap/lots` · la liste du membre, le
 * filtre « À conclure » de l'admin) · on lit le DOM, jamais la présence d'un
 * appel. Sur un même semis ·
 *  · pastille du rail = nombre de « À traiter » = lignes de la liste
 *    « À conclure », pour le membre ET pour l'admin ;
 *  · un lot « non concluant » dont des verdicts attendent compte ;
 *  · un lot sans verdict en attente ne compte pas · fin prévue passée ou non ·
 *    la fin prévue passée est dite à part, sous son libellé ;
 *  · la tuile et la barre mènent à la liste filtrée · on suit le lien ;
 *  · une autre marque, un autre espace · leur compte à eux ;
 *  · une formule sans Résultats · ni pastille, ni compte, la liste refuse.
 * Rien n'est écrit, aucun réseau, aucun modèle, 0 $.
 */

const h = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['wsA', 'wsB', 'bA', 'bA2', 'bB', 'uo', 'um', 'ub']) h.ids[k] = randomUUID();
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
import { LIEN_A_CONCLURE } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import LotsSpatial from '../app/(spatial)/sp/adsmap/lots/page';
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';
import { chargerCoquille } from '../lib/spatial/coquille';
import { Coquille } from '../spatial/coquille/Coquille';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const I = h.ids;
const L: Record<string, string> = {};
const JOUR = 86_400_000;
/** Une date FIXE, loin dans le passé · la fenêtre du moteur y est toujours écoulée. */
const ANCIEN = new Date('2020-01-06T09:00:00Z');
const FIN = (jour: number) => new Date(Date.UTC(2020, 0, jour, 9));

type Qui = 'uo' | 'um' | 'ub';
const ROLE: Record<Qui, string> = { uo: 'owner', um: 'member', ub: 'owner' };
function comme(qui: Qui, marque: { id: string; name: string }, plan = 'plus') {
  h.session = { user: { id: I[qui]!, email: `${qui}@compte.test`, name: 'Camille' }, workspaceId: qui === 'ub' ? I.wsB! : I.wsA!, workspaceName: 'Espace', role: ROLE[qui], plan, equipe: null };
  h.marque = marque;
}
const NEVA = () => ({ id: I.bA!, name: 'Neva' });
const AUTRE = () => ({ id: I.bA2!, name: 'Autre' });
const AILLEURS = () => ({ id: I.bB!, name: 'Ailleurs' });

async function concept(ws: string, brand: string, titre: string) {
  const [p] = await db.insert(schema.personas).values({ brandId: brand, name: `P ${titre}` }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: p!.id, label: 'D' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: d!.id, label: 'A', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: a!.id, title: titre }).returning();
  return c!.id;
}

type Verdict = { calcule: 'winner' | 'loser' | 'inconclusive'; valide?: boolean } | null;
async function lot(cle: string, o: { ws?: string; brand?: string; numero: number; but: string; statut: 'planned' | 'testing' | 'analyzed'; lance: Date | null; fin?: Date | null; variantes: Verdict[] }) {
  const ws = o.ws ?? I.wsA!, brand = o.brand ?? I.bA!;
  const [offre] = await db.insert(schema.offers).values({ workspaceId: ws, brandId: brand, label: 'Offre' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: ws, brandId: brand, url: 'https://neva.test/p', label: 'Page' }).returning();
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId: brand, number: o.numero, status: o.statut, launchedAt: o.lance, plannedEndAt: o.fin ?? null, goal: o.but }).returning();
  L[cle] = b!.id;
  for (const [i, v] of o.variantes.entries()) {
    const c = await concept(ws, brand, `Concept ${cle} ${i + 1}`);
    const [a] = await db.insert(schema.ads).values({
      workspaceId: ws, conceptId: c, batchId: b!.id, variantCode: `v${i + 1}`, status: v?.valide ? 'done' : o.lance ? 'live' : 'draft', adType: 'ideation', format: 'static',
      hypothesis: 'Si on montre la preuve chiffrée, alors le coût par achat baisse parce que la cible doute.', testedVariable: 'hook', variableValue: `Preuve ${i + 1}`,
      offerId: offre!.id, landingPageId: page!.id, launchedAt: o.lance,
      ...(o.lance ? { generatedName: `NEVA_B${o.numero}_C${i + 1}_v${i + 1}_hook`, externalIds: { ad_id: `meta-${cle}-${i}` } } : {}),
    }).returning();
    if (v) {
      await db.insert(schema.verdicts).values({
        adId: a!.id, workspaceId: ws, computed: v.calcule, validated: v.valide ? v.calcule : null, status: v.valide ? 'validated' : 'computed', comparable: true,
        metricsAgg: { spend: 120, impressions: 20000, purchases: 3, cpa: 40, reason: 'Moteur', daysElapsed: 20 },
      });
    }
  }
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: I.wsA!, name: 'Espace A', plan: 'plus', onboardedAt: ANCIEN }, { id: I.wsB!, name: 'Espace B', plan: 'plus', onboardedAt: ANCIEN }]);
  await db.insert(schema.users).values((['uo', 'um', 'ub'] as const).map((q) => ({ id: I[q]!, email: `${q}@compte.test`, name: 'Camille' })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: I.wsA!, userId: I.uo!, role: 'owner' }, { workspaceId: I.wsA!, userId: I.um!, role: 'member' }, { workspaceId: I.wsB!, userId: I.ub!, role: 'owner' },
  ]);
  await db.insert(schema.brands).values([
    { id: I.bA!, workspaceId: I.wsA!, name: 'Neva' }, { id: I.bA2!, workspaceId: I.wsA!, name: 'Autre' }, { id: I.bB!, workspaceId: I.wsB!, name: 'Ailleurs' },
  ]);
  // Neva · seuls n4 (à conclure) et n5 (non concluant, des verdicts attendent, SANS fin prévue) se concluent.
  // L'ancienne règle de l'Accueil (en diffusion, fin prévue passée) comptait n3, n4, n7 · l'ancienne pastille (état `a_conclure`), n4 seul.
  await lot('n1', { numero: 1, but: 'Composer un format', statut: 'planned', lance: null, variantes: [null] });
  await lot('n2', { numero: 2, but: 'Encore en diffusion', statut: 'testing', lance: new Date(Date.now() - 2 * JOUR), variantes: [{ calcule: 'winner' }] });
  await lot('n3', { numero: 3, but: 'Mesures pas encore remontées', statut: 'testing', lance: ANCIEN, fin: FIN(10), variantes: [null, null] });
  await lot('n4', { numero: 4, but: 'Preuve ou promesse', statut: 'testing', lance: ANCIEN, fin: FIN(20), variantes: [{ calcule: 'winner' }, { calcule: 'loser' }] });
  await lot('n5', { numero: 5, but: 'Le silence du format court', statut: 'testing', lance: ANCIEN, variantes: [{ calcule: 'inconclusive' }] });
  await lot('n6', { numero: 6, but: 'Historique tranché', statut: 'analyzed', lance: ANCIEN, fin: FIN(12), variantes: [{ calcule: 'winner', valide: true }] });
  await lot('n7', { numero: 7, but: 'Arbitré, encore en diffusion', statut: 'testing', lance: ANCIEN, fin: FIN(15), variantes: [{ calcule: 'winner', valide: true }, { calcule: 'loser', valide: true }] });
  // Une autre marque du même espace, et un autre espace · chacune UN lot à conclure.
  await lot('autre', { brand: I.bA2!, numero: 1, but: 'Autre marque à conclure', statut: 'testing', lance: ANCIEN, variantes: [{ calcule: 'winner' }] });
  await lot('ailleurs', { ws: I.wsB!, brand: I.bB!, numero: 1, but: 'Autre espace à conclure', statut: 'testing', lance: ANCIEN, variantes: [{ calcule: 'winner' }] });
}, 180_000);

afterEach(() => { h.session = null; h.marque = null; });

const dom = (el: ReactNode) => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(el as ReactElement); return d; };
const net = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** La pastille de Résultats dans le VRAI rail · données réelles de la coquille, composant réel · le nombre lu dans son libellé. */
async function pastille(): Promise<number | null> {
  const d = dom(<Coquille donnees={await chargerCoquille()}><p>page</p></Coquille>);
  const entree = d.querySelector('a[data-r="resultats"]');
  expect(entree, 'préalable · l’entrée Résultats du rail').not.toBeNull();
  const b = entree!.querySelector('.badge');
  if (!b) return null;
  const l = b.getAttribute('aria-label') ?? '';
  return l === 'Un lot à conclure' ? 1 : Number(/^(\d+) lots à conclure$/.exec(l)?.[1] ?? NaN);
}

/** L'Accueil rendu · la tuile « À traiter » (nombre, lien, phrase), l'étape « En diffusion », la barre « À faire maintenant ». */
async function accueil() {
  const d = dom(avecSpatial(await AccueilSpatial({ searchParams: Promise.resolve({}) })));
  const etape = (titre: string) => [...d.querySelectorAll<HTMLAnchorElement>('.pipe a.tile.stage')].find((a) => net(a.querySelector('strong')?.textContent) === titre) ?? null;
  const t = etape('À traiter');
  const barre = d.querySelector<HTMLAnchorElement>('a.tile.nowbar');
  return {
    traiter: t ? { n: Number(net(t.querySelector('.big3')?.textContent)), href: t.getAttribute('href'), texte: net(t.textContent) } : null,
    diffusion: net(etape('En diffusion')?.textContent),
    barre: barre ? { texte: net(barre.textContent), href: barre.getAttribute('href') } : null,
    texte: net(d.textContent),
  };
}

/** « Lots de test » rendue au serveur · les liens de lot de la liste AFFICHÉE (filtre initial compris). */
async function liste(href: string = '/adsmap/lots') {
  const u = new URL(href, 'https://app.test');
  expect(u.pathname, 'le lien ne mène pas à « Lots de test »').toBe('/adsmap/lots');
  const d = dom(avecSpatial(await LotsSpatial({ searchParams: Promise.resolve(Object.fromEntries(u.searchParams)) })));
  return {
    lots: [...d.querySelectorAll<HTMLAnchorElement>('[data-lot-lien]')].map((a) => a.dataset.lotLien),
    filtre: [...d.querySelectorAll('.toolbar .seg button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent ?? null,
    texte: net(d.textContent),
  };
}

async function traces() {
  return JSON.stringify([
    (await db.select({ id: schema.batches.id, s: schema.batches.status }).from(schema.batches)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.verdicts.adId, s: schema.verdicts.status, v: schema.verdicts.validated }).from(schema.verdicts)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.learnings.id }).from(schema.learnings)).length,
  ]);
}

describe('un seul compte « à conclure » · rail, Accueil, liste · membre ET admin', () => {
  for (const qui of ['um', 'uo'] as const) {
    it(`${qui === 'um' ? 'un membre' : 'un admin'} · pastille = « À traiter » = lignes de la liste « À conclure » · la tuile mène à la liste filtrée`, async () => {
      comme(qui, NEVA());
      const avant = await traces();
      const p = await pastille();
      const a = await accueil();
      expect(a.traiter, 'préalable · la tuile « À traiter » de l’Accueil').not.toBeNull();
      const l = await liste(LIEN_A_CONCLURE);
      expect(l.lots, 'la liste « À conclure » ne rend pas exactement les lots qu’on peut conclure').toEqual([L.n5, L.n4]);
      expect(l.filtre, 'le lien n’ouvre pas la liste sur « À conclure »').toBe('À conclure · 2');
      expect(p, 'la pastille du rail ne compte pas les lignes de la liste « À conclure »').toBe(l.lots.length);
      expect(a.traiter!.n, '« À traiter » ne compte pas les lignes de la liste « À conclure »').toBe(l.lots.length);
      expect(a.traiter!.texte).toContain('2 lots à conclure');
      // On SUIT le lien de la tuile · la liste qu'il ouvre est celle qu'on compte.
      expect(a.traiter!.href, 'la tuile « À traiter » ne mène pas à la liste filtrée').toBe(LIEN_A_CONCLURE);
      expect((await liste(a.traiter!.href!)).lots, 'la tuile ouvre une autre liste').toEqual(l.lots);
      expect(a.barre, '« À faire maintenant » ne dit pas le même compte, ou ne mène pas à la liste filtrée').toEqual({ texte: expect.stringContaining('À faire maintenant : conclure 2 lots'), href: LIEN_A_CONCLURE });
      expect(a.barre!.texte).toContain('Lots #5 et #4');
      expect(await traces(), 'une lecture a écrit').toEqual(avant);
    });
  }

  it('la liste du membre et le filtre « À conclure » de l’admin rendent les mêmes lots · sans le lien, l’admin garde « Tous »', async () => {
    comme('um', NEVA());
    const membre = await liste();
    comme('uo', NEVA());
    const admin = await liste(LIEN_A_CONCLURE);
    expect(admin.lots, 'le filtre de l’admin et la liste du membre divergent').toEqual(membre.lots);
    const tous = await liste();
    expect(tous.filtre).toBe('Tous · 7');
    expect(tous.lots).toHaveLength(7);
  });

  it('un lot « non concluant » dont des verdicts attendent compte · un lot sans verdict en attente non, fin prévue passée ou pas', async () => {
    comme('um', NEVA());
    const a = await accueil();
    const { lots } = await liste();
    expect(lots, 'le lot « non concluant » #5, sans fin prévue, n’est pas compté').toContain(L.n5);
    for (const k of ['n1', 'n2', 'n3', 'n6', 'n7']) expect(lots, `${k} compté sans verdict à arbitrer`).not.toContain(L[k]);
    // La fin prévue passée sans verdict à arbitrer · dite à part, son libellé à elle, jamais « à conclure ».
    expect(a.diffusion, 'la fin prévue passée n’est pas dite, ou pas sous son libellé').toContain('Lots #3 et #7 · fin prévue passée, aucun verdict à arbitrer');
    expect(a.texte, 'un lot sans verdict à arbitrer est appelé « à conclure »').not.toMatch(/Lots? #[37] à conclure|conclure le lot #[37]|Lots #[0-9 et#]*[37][0-9 et#]* · des verdicts/i);
  });
});

describe('autre marque, autre espace, formule sans Résultats', () => {
  it('une autre marque du même espace · son compte à elle, aucun lot de Neva', async () => {
    comme('um', AUTRE());
    const p = await pastille();
    const a = await accueil();
    const l = await liste(LIEN_A_CONCLURE);
    expect(l.lots).toEqual([L.autre]);
    expect(p, 'la pastille compte les lots d’une autre marque').toBe(1);
    expect(a.traiter!.n, '« À traiter » compte les lots d’une autre marque').toBe(1);
    expect(a.barre?.texte).toContain('conclure le lot #1');
    expect(a.texte).not.toMatch(/Preuve ou promesse|#5|#4/);
  });

  it('un autre espace · son compte à lui', async () => {
    comme('ub', AILLEURS());
    expect(await pastille()).toBe(1);
    expect((await accueil()).traiter!.n).toBe(1);
    expect((await liste(LIEN_A_CONCLURE)).lots).toEqual([L.ailleurs]);
  });

  it('une formule sans Résultats (Core) · la liste refuse · ni pastille, ni compte à l’Accueil', async () => {
    comme('um', NEVA(), 'core');
    const l = await liste(LIEN_A_CONCLURE);
    expect(l.lots).toHaveLength(0);
    expect(await pastille(), 'la pastille dit un nombre que la liste refuse').toBeNull();
    const a = await accueil();
    expect(a.traiter, 'l’Accueil compte des lots que la liste refuse').toBeNull();
    expect(a.barre?.texte ?? '').not.toMatch(/conclure/);
  });
});
