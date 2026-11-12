// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SessionTest } from './studios-semis';

/**
 * « À conclure » ouvert aux membres qui peuvent arbitrer · sur une VRAIE base
 * (pglite, migrations du dépôt), avec les VRAIES gardes, les VRAIES actions et
 * les VRAIES pages Spatiales rendues et montées · on lit le DOM et la base,
 * jamais la présence d'un appel.
 *  · un membre ouvre « Lots de test » · il voit les lots de SA marque qu'on peut
 *    conclure (et eux seuls), le seul filtre « À conclure », la raison écrite à
 *    la place de « Nouveau lot » · le filtre « À conclure » de l'admin rend la
 *    même liste ;
 *  · il ouvre la fiche d'un lot et arbitre (l'action EXISTANTE) · la base le dit ;
 *  · composer, préparer, lancer, dupliquer · absents de la liste, et refusés
 *    par le serveur · rien n'est écrit ;
 *  · un lecteur client, une autre marque, un autre espace · refus sans fuite ;
 *  · ↓ ↑ et Entrée parcourent la liste du membre · rien n'est écrit.
 * Aucun réseau, aucun modèle, 0 $.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  session: null as SessionTest | null,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['wsA', 'wsB', 'bA', 'bA2', 'bB', 'uo', 'um', 'uc', 'ub']) h.ids[k] = randomUUID();
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/brands')>()), getActiveBrand: async () => h.marque }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); },
  notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => '/adsmap/lots',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }), headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));

import { db, schema, eq } from '@tiktrends/db';
import { RAISON_LISTE_A_CONCLURE, VIDE_LISTE_A_CONCLURE, messageBorneListeLots } from '@tiktrends/core';
import { avecSpatial, CTX_TEST } from './spatial/fournisseur';
import LotsSpatial from '../app/(spatial)/sp/adsmap/lots/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import { createBatchAction, duplicateBatchAction, launchBatchAction, prepareBatchAction, setBatchAdAction } from '../app/actions/adsmap-batch';
import { validateVerdictAction } from '../app/actions/adsmap-verdict';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const I = h.ids;
const JOUR = 86_400_000;
const L: Record<string, string> = {};
const A: Record<string, string[]> = {};
let horsLot = '';
const REFUS_ADMIN = 'Action réservée aux administrateurs de l’espace.';
const ENONCE = 'La preuve chiffrée en accroche bat la promesse sur cette cible, à garder.';

type Qui = 'uo' | 'um' | 'uc' | 'ub';
const ROLE: Record<Qui, SessionTest['role']> = { uo: 'owner', um: 'member', uc: 'client_viewer', ub: 'owner' };
function comme(qui: Qui, marque: { id: string; name: string }) {
  h.session = { user: { id: I[qui]!, email: `${qui}@aconc.test`, name: null }, workspaceId: qui === 'ub' ? I.wsB! : I.wsA!, workspaceName: 'Espace', role: ROLE[qui], plan: 'plus', equipe: null };
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
/** Un lot de la marque, ses variantes et leurs verdicts · `il` jours depuis le lancement (`null` · jamais lancé). */
async function lot(cle: string, o: { ws?: string; brand?: string; numero: number; but: string; statut: 'planned' | 'ready' | 'testing' | 'analyzed'; il: number | null; variantes: Verdict[] }) {
  const ws = o.ws ?? I.wsA!, brand = o.brand ?? I.bA!;
  const lance = o.il === null ? null : new Date(Date.now() - o.il * JOUR);
  const [offre] = await db.insert(schema.offers).values({ workspaceId: ws, brandId: brand, label: 'Offre de lancement' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: ws, brandId: brand, url: 'https://neva.test/p', label: 'Page produit' }).returning();
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId: brand, number: o.numero, status: o.statut, launchedAt: lance, goal: o.but }).returning();
  L[cle] = b!.id;
  A[cle] = [];
  for (const [i, v] of o.variantes.entries()) {
    const c = await concept(ws, brand, `Concept ${cle} ${i + 1}`);
    const [a] = await db.insert(schema.ads).values({
      workspaceId: ws, conceptId: c, batchId: b!.id, variantCode: `v${i + 1}`, status: v?.valide ? 'done' : lance ? 'live' : 'draft', adType: 'ideation', format: 'static',
      hypothesis: 'Si on montre la preuve chiffrée, alors le coût par achat baisse parce que la cible doute.', testedVariable: 'hook', variableValue: `Preuve ${i + 1}`,
      offerId: offre!.id, landingPageId: page!.id, launchedAt: lance,
      ...(lance ? { generatedName: `NEVA_B${o.numero}_C${i + 1}_v${i + 1}_hook`, externalIds: { ad_id: `meta-${cle}-${i}` } } : {}),
    }).returning();
    A[cle].push(a!.id);
    if (v) {
      await db.insert(schema.verdicts).values({
        adId: a!.id, workspaceId: ws, computed: v.calcule, validated: v.valide ? v.calcule : null, status: v.valide ? 'validated' : 'computed', comparable: true,
        metricsAgg: { spend: 120, impressions: 20000, purchases: v.calcule === 'winner' ? 6 : 1, cpa: v.calcule === 'winner' ? 20 : 120, reason: 'Moteur', daysElapsed: 20 },
      });
    }
  }
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: I.wsA!, name: 'Espace A', plan: 'plus' }, { id: I.wsB!, name: 'Espace B', plan: 'plus' }]);
  await db.insert(schema.users).values((['uo', 'um', 'uc', 'ub'] as const).map((q) => ({ id: I[q]!, email: `${q}@aconc.test` })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: I.wsA!, userId: I.uo!, role: 'owner' }, { workspaceId: I.wsA!, userId: I.um!, role: 'member' },
    { workspaceId: I.wsA!, userId: I.uc!, role: 'client_viewer' }, { workspaceId: I.wsB!, userId: I.ub!, role: 'owner' },
  ]);
  await db.insert(schema.brands).values([
    { id: I.bA!, workspaceId: I.wsA!, name: 'Neva' }, { id: I.bA2!, workspaceId: I.wsA!, name: 'Autre' }, { id: I.bB!, workspaceId: I.wsB!, name: 'Ailleurs' },
  ]);
  // Neva · un lot par état réel · seuls n4 (à conclure) et n5 (non concluant, des verdicts attendent) se concluent.
  await lot('n1', { numero: 1, but: 'Composer un format', statut: 'planned', il: null, variantes: [null] });
  await lot('n2', { numero: 2, but: 'Prêt à partir', statut: 'ready', il: null, variantes: [null] });
  await lot('n3', { numero: 3, but: 'Encore en diffusion', statut: 'testing', il: 2, variantes: [{ calcule: 'winner' }] });
  await lot('n4', { numero: 4, but: 'Preuve ou promesse', statut: 'testing', il: 20, variantes: [{ calcule: 'winner' }, { calcule: 'loser' }] });
  await lot('n5', { numero: 5, but: 'Le silence du format court', statut: 'testing', il: 20, variantes: [{ calcule: 'inconclusive' }] });
  await lot('n6', { numero: 6, but: 'Déjà tranché', statut: 'analyzed', il: 40, variantes: [{ calcule: 'winner', valide: true }] });
  // Une ad de Neva rangée dans aucun lot (le vivier de « composer »).
  const c = await concept(I.wsA!, I.bA!, 'Vivier');
  horsLot = (await db.insert(schema.ads).values({ workspaceId: I.wsA!, conceptId: c, variantCode: 'v9', status: 'draft', adType: 'ideation', format: 'static' }).returning())[0]!.id;
  // Une autre marque du même espace, et un autre espace · chacune un lot à conclure.
  await lot('autre', { brand: I.bA2!, numero: 1, but: 'Autre marque à conclure', statut: 'testing', il: 20, variantes: [{ calcule: 'winner' }] });
  await lot('ailleurs', { ws: I.wsB!, brand: I.bB!, numero: 1, but: 'Autre espace à conclure', statut: 'testing', il: 20, variantes: [{ calcule: 'winner' }] });
}, 180_000);

let root: Root | null = null;
const toasts: string[] = [];
beforeEach(() => { toasts.length = 0; document.cookie = 'tt_raccourcis=; path=/; max-age=0'; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; h.session = null; h.marque = null; });

const visible = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return { d, texte: (d.textContent ?? '').replace(/\s+/g, ' ') }; };
const pageListe = async () => visible(renderToStaticMarkup(avecSpatial(await LotsSpatial({ searchParams: Promise.resolve({}) }))));
const ficheLot = (id: string) => LotSpatial({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
async function monter(el: ReactElement) {
  act(() => { root?.unmount(); });
  document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el, { ...CTX_TEST, toast: (m) => { toasts.push(m); } })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
}
const touche = async (key: string, cible: Element = document.activeElement ?? document.body) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => { cible.dispatchEvent(ev); });
  return ev;
};
const liensLots = (racine: ParentNode = document) => [...racine.querySelectorAll<HTMLAnchorElement>('[data-lot-lien]')];
/** Tout ce qu'un geste pourrait écrire · lots, variantes (lot, statut, nom régie), verdicts, apprentissages. */
async function traces() {
  return JSON.stringify([
    (await db.select({ id: schema.batches.id, s: schema.batches.status, n: schema.batches.number }).from(schema.batches)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.ads.id, b: schema.ads.batchId, s: schema.ads.status, g: schema.ads.generatedName }).from(schema.ads)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.verdicts.adId, s: schema.verdicts.status, v: schema.verdicts.validated }).from(schema.verdicts)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.learnings.id }).from(schema.learnings)).length,
  ]);
}

describe('un membre trouve ses lots à conclure · « Lots de test », en lecture', () => {
  it('les lots de SA marque qu’on peut conclure, eux seuls · le seul filtre « À conclure » · la raison à la place de « Nouveau lot »', async () => {
    comme('um', NEVA());
    const { d, texte } = await pageListe();
    expect(liensLots(d).map((a) => a.dataset.lotLien), 'le membre ne voit pas exactement les lots à conclure de sa marque').toEqual([L.n5, L.n4]);
    expect(liensLots(d).map((a) => a.getAttribute('href')), 'une ligne ne mène pas à la fiche du lot').toEqual([`/adsmap/lots/${L.n5}`, `/adsmap/lots/${L.n4}`]);
    expect(texte).toContain('Lot #5 · Le silence du format court');
    expect(texte).toContain('Lot #4 · Preuve ou promesse');
    for (const autre of ['Composer un format', 'Prêt à partir', 'Encore en diffusion', 'Déjà tranché', 'Autre marque à conclure', 'Autre espace à conclure']) {
      expect(texte, `fuite · « ${autre} » montré au membre`).not.toContain(autre);
    }
    expect(d.querySelector('header')?.textContent, 'le serveur envoie au membre des lots qu’il ne peut pas conclure').toContain('2 lots à conclure · Neva');
    expect([...d.querySelectorAll('.toolbar .seg button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]), 'le membre voit un autre filtre que « À conclure »').toEqual([['À conclure · 2', 'true']]);
    expect(d.querySelector('[data-raison-ferme="lots-composer"]')?.textContent, 'la raison n’est pas écrite').toBe(RAISON_LISTE_A_CONCLURE);
    expect(texte, 'un geste d’admin est montré au membre').not.toMatch(/Nouveau lot|Ouvrir le lot|Préparer le lot|Lancer le lot|Dupliquer/);
    expect(d.querySelector('form'), 'un formulaire de composition est rendu au membre').toBeNull();
    expect(d.querySelector('a[href="/adsmap/import"]'), 'le membre est envoyé vers l’import').toBeNull();
    expect(d.querySelector('[data-boucle]'), 'la barre « Itérer » est posée chez le membre').toBeNull();
    expect([...d.querySelectorAll('nav.subnav a')].map((a) => a.textContent), 'la porte « Lots de test » manque au membre').toContain('Lots de test');
  });

  it('le filtre « À conclure » de l’admin rend la même liste · l’admin garde la liste complète et « Nouveau lot »', async () => {
    comme('uo', NEVA());
    const s = await pageListe();
    expect(liensLots(s.d), 'l’admin a perdu la liste complète').toHaveLength(6);
    expect(s.texte).toContain('Nouveau lot');
    expect([...s.d.querySelectorAll('.toolbar .seg button')].map((b) => b.textContent), 'le filtre « À conclure » de l’admin ne compte pas la liste du membre').toEqual(['Tous · 6', 'En préparation · 2', 'En diffusion · 1', 'À importer · 0', 'À conclure · 2']);
    expect(s.d.querySelector('[data-raison-ferme="lots-composer"]'), 'la raison du membre est montrée à l’admin').toBeNull();
    await monter(await LotsSpatial({ searchParams: Promise.resolve({}) }));
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>('.toolbar .seg button')].find((b) => b.textContent?.startsWith('À conclure'))!.click(); });
    expect(liensLots().map((a) => a.dataset.lotLien), 'le filtre « À conclure » de l’admin et la liste du membre divergent').toEqual([L.n5, L.n4]);
  });

  it('une marque sans lot à conclure · la liste le dit', async () => {
    comme('um', AUTRE());
    await db.update(schema.verdicts).set({ status: 'validated', validated: 'winner' }).where(eq(schema.verdicts.adId, A.autre![0]!));
    try {
      const { d, texte } = await pageListe();
      expect(liensLots(d)).toHaveLength(0);
      expect(texte).toContain(VIDE_LISTE_A_CONCLURE);
      expect(texte).toContain('Aucun lot à conclure · Autre');
    } finally {
      await db.update(schema.verdicts).set({ status: 'computed', validated: null }).where(eq(schema.verdicts.adId, A.autre![0]!));
    }
  });
});

describe('le membre ouvre la fiche et arbitre · l’action existante', () => {
  it('fiche du lot #4 · « Conclure le lot » rendu · il écrit l’apprentissage, valide · la base porte le verdict et l’apprentissage', async () => {
    comme('um', NEVA());
    await monter(await ficheLot(L.n4!));
    const section = document.querySelector('[aria-label="Conclure le lot"]');
    expect(section, 'le membre n’a pas le formulaire de conclusion').not.toBeNull();
    const champ = document.querySelector<HTMLTextAreaElement>(`[data-apprentissage="${A.n4![0]}"]`)!;
    expect(champ, 'la variante à arbitrer manque').toBeTruthy();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(champ, ENONCE);
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { champ.closest('form')!.requestSubmit(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    const [v] = await db.select().from(schema.verdicts).where(eq(schema.verdicts.adId, A.n4![0]!));
    expect(v?.status, 'le verdict n’est pas validé').toBe('validated');
    const appris = await db.select().from(schema.learnings).where(eq(schema.learnings.adId, A.n4![0]!));
    expect(appris.map((x) => x.statement)).toEqual([ENONCE]);
    // Le lot reste à conclure (la seconde variante attend) · il est toujours dans la liste du membre.
    const { d } = await pageListe();
    expect(liensLots(d).map((a) => a.dataset.lotLien)).toEqual([L.n5, L.n4]);
  });
});

describe('composer, préparer, lancer, dupliquer · absents pour le membre, et refusés par le serveur', () => {
  it('fiche d’un lot en préparation · aucun geste de composition, « Dupliquer » fermé avec sa raison', async () => {
    comme('um', NEVA());
    const { d, texte } = visible(renderToStaticMarkup(avecSpatial(await ficheLot(L.n1!))));
    expect(texte, 'un geste de composition est rendu au membre').not.toMatch(/Préparer le lot|Marquer le lot lancé|Ranger dans le lot|Retirer du lot/);
    const dup = d.querySelector('[aria-label="Dupliquer le lot"]')!;
    expect(dup.querySelector('button')?.hasAttribute('disabled')).toBe(true);
    expect(dup.textContent).toContain('Dupliquer un lot est réservé aux admins de l’espace, comme en créer un.');
  });

  it('chaque action est refusée au membre · rien n’est écrit', async () => {
    comme('um', NEVA());
    const avant = await traces();
    expect(await createBatchAction('Un lot que le membre voudrait ouvrir')).toEqual({ error: REFUS_ADMIN });
    expect(await setBatchAdAction({ batchId: L.n1!, adId: horsLot, inBatch: true })).toEqual({ error: REFUS_ADMIN });
    expect(await prepareBatchAction(L.n1!)).toEqual({ error: REFUS_ADMIN });
    expect(await launchBatchAction(L.n2!)).toEqual({ error: REFUS_ADMIN });
    expect(await duplicateBatchAction(L.n4!)).toEqual({ error: REFUS_ADMIN });
    expect(await traces(), 'un geste refusé a écrit').toEqual(avant);
  });
});

describe('refus sans fuite · lecteur client, autre marque, autre espace', () => {
  it('un lecteur client · la liste et la fiche refusent, aucun lot nommé · il ne peut pas arbitrer', async () => {
    comme('uc', NEVA());
    const { d, texte } = await pageListe();
    expect(texte).toContain('Ton rôle ne permet pas d’accéder à Adsmap.');
    expect(liensLots(d)).toHaveLength(0);
    expect(texte).not.toMatch(/Preuve ou promesse|Le silence du format court/);
    const f = visible(renderToStaticMarkup(avecSpatial(await ficheLot(L.n4!))));
    expect(f.texte).toContain('Ton rôle ne permet pas d’accéder à Adsmap.');
    expect(f.texte).not.toContain('Preuve ou promesse');
    const avant = await traces();
    expect((await validateVerdictAction({ adId: A.n4![1]!, value: 'loser', learning: { statement: ENONCE, scope: 'ad', confidence: 3 } })).error).toBe('Ton rôle ne permet pas d’accéder à Adsmap.');
    expect(await traces()).toEqual(avant);
  });

  it('une autre marque active · sa liste à elle, jamais les lots de Neva · la fiche d’un lot de Neva « n’existe pas »', async () => {
    comme('um', AUTRE());
    const { d, texte } = await pageListe();
    expect(liensLots(d).map((a) => a.dataset.lotLien)).toEqual([L.autre]);
    expect(texte).not.toMatch(/Preuve ou promesse|Le silence du format court/);
    await expect(ficheLot(L.n4!)).rejects.toThrow('NOT_FOUND');
  });

  it('un autre espace · sa liste à lui · la fiche d’un lot de Neva « n’existe pas » · arbitrer une variante de Neva est refusé, rien écrit', async () => {
    comme('ub', AILLEURS());
    const { d, texte } = await pageListe();
    expect(liensLots(d).map((a) => a.dataset.lotLien)).toEqual([L.ailleurs]);
    expect(texte).not.toMatch(/Preuve ou promesse|Le silence du format court|Autre marque à conclure/);
    await expect(ficheLot(L.n4!)).rejects.toThrow('NOT_FOUND');
    const avant = await traces();
    expect((await validateVerdictAction({ adId: A.n4![1]!, value: 'loser', learning: { statement: ENONCE, scope: 'ad', confidence: 3 } })).error).toBeTruthy();
    expect(await traces()).toEqual(avant);
  });
});

describe('↓ ↑ et Entrée · le membre parcourt sa liste', () => {
  it('↓ suivant, ↑ précédent, bornes dites · le focus sur le lien du lot (Entrée l’ouvre) · l’aide est dite · rien n’est écrit', async () => {
    comme('um', NEVA());
    const avant = await traces();
    await monter(await LotsSpatial({ searchParams: Promise.resolve({}) }));
    expect(document.querySelector('[data-aide-liste-lots]')?.textContent, 'l’aide du parcours au clavier manque au membre').toMatch(/lot suivant ou précédent/);
    const liens = liensLots();
    expect(liens.map((a) => a.dataset.lotLien)).toEqual([L.n5, L.n4]);
    liens[0]!.focus();
    const ev = await touche('ArrowDown');
    expect(ev.defaultPrevented, '↓ ne mène pas au lot suivant · la touche n’est pas prise').toBe(true);
    expect((document.activeElement as HTMLElement).dataset.lotLien, '↓ ne mène pas au lot suivant').toBe(L.n4);
    await touche('ArrowDown');
    expect((document.activeElement as HTMLElement).dataset.lotLien, 'au bord, le focus reste').toBe(L.n4);
    expect(toasts).toEqual([messageBorneListeLots('dernier', 2)]);
    await touche('ArrowUp');
    expect((document.activeElement as HTMLElement).dataset.lotLien, '↑ ne mène pas au lot précédent').toBe(L.n5);
    await touche('ArrowUp');
    expect(toasts.at(-1)).toBe(messageBorneListeLots('premier', 2));
    // Entrée · le lien natif du lot · il ouvre la fiche, où l'arbitrage existe.
    const a = document.activeElement as HTMLAnchorElement;
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe(`/adsmap/lots/${L.n5}`);
    expect(document.getElementById(a.getAttribute('aria-describedby')!)?.textContent).toBe('Lot #5 · Le silence du format court');
    expect(await traces(), 'une touche a écrit').toEqual(avant);
  });
});
