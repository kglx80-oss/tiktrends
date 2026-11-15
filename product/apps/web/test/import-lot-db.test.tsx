// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Chaque « Importer » arrive sur son lot (suite de #1084) · sur une VRAIE base
 * (pglite, migrations du dépôt), avec les VRAIES gardes et les VRAIES vues ·
 * « Lots de test » (`/adsmap/lots`), la fiche d'un lot (`/adsmap/lots/[id]`) et
 * l'écran d'import EXISTANT (`/adsmap/import`) · on lit le DOM, on SUIT le lien.
 *  · le bouton « Importer » des lots « Mesures à importer » de « Lots de test »
 *    et celui de la fiche d'un lot · l'écran d'import ouvert sur CE lot ;
 *  · la liste « Lot » · les lots de la portée qui attendent des mesures, dans
 *    l'ordre lu · jamais ceux d'une autre marque ni d'un autre espace · la
 *    sélection change l'adresse, l'adresse change la section ;
 *  · « Tous les lots » · le rendu est, octet pour octet, la capture prise sur
 *    main AVANT la modification (8fc3bf00 · `fixtures/import-tous-les-lots-avant.html`),
 *    la liste seule retirée · de même pour l'écran ouvert sur un lot
 *    (`fixtures/import-lot-n1-avant.html`) et pour la fiche d'un lot, la
 *    section « Mesures à importer » seule retirée, aux identifiants de `useId` près
 *    (`fixtures/import-fiche-n1-*-avant.html`) ;
 *  · un export déposé · combien d'annonces vont au lot choisi, et quelles
 *    variantes restent sans mesure · rien n'est écrit avant de confirmer ;
 *  · un membre · le bouton de la fiche fermé, la raison écrite à côté · la page
 *    d'import le refuse · aucun lien vers elle.
 * Aucune date « à venir » · tout est lancé en 2020. Aucun réseau, 0 $.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
  pousse: [] as string[],
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
  useRouter: () => ({ refresh: () => {}, push: (u: string) => { h.pousse.push(u); }, replace: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => '/adsmap/import',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }), headers: async () => new Headers({ host: 'localhost' }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));

import { db, schema } from '@tiktrends/db';
import { RAISON_IMPORT_FERME } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import ImportSpatial from '../app/(spatial)/sp/adsmap/import/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import LotsSpatial from '../app/(spatial)/sp/adsmap/lots/page';
import ResultatsSpatial from '../app/(spatial)/sp/adsmap/page';
import BoucleSpatial from '../app/(spatial)/sp/adsmap/boucle/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const I = h.ids;
const L: Record<string, string> = {};
const ANCIEN = new Date('2020-01-06T09:00:00Z');
const NOM = (cle: string, i: number) => `NEVA_${cle}_C${i + 1}_v${i + 1}_hook`;

type Qui = 'uo' | 'um' | 'ub';
const ROLE: Record<Qui, string> = { uo: 'owner', um: 'member', ub: 'owner' };
function comme(qui: Qui, marque: { id: string; name: string }) {
  h.session = { user: { id: I[qui]!, email: `${qui}@imp.test`, name: 'Camille' }, workspaceId: qui === 'ub' ? I.wsB! : I.wsA!, workspaceName: 'Espace', role: ROLE[qui], plan: 'plus', equipe: null };
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

type Variante = null | { calcule: 'winner' | 'loser' | 'inconclusive'; valide?: boolean; impressions?: number; depense?: number };
async function lot(cle: string, o: { ws?: string; brand?: string; numero: number; but: string; statut?: 'planned' | 'testing'; variantes: Variante[]; plateforme?: 'meta' | 'tiktok' }) {
  const ws = o.ws ?? I.wsA!, brand = o.brand ?? I.bA!;
  const statut = o.statut ?? 'testing';
  const lance = statut === 'testing' ? ANCIEN : null;
  const [offre] = await db.insert(schema.offers).values({ workspaceId: ws, brandId: brand, label: 'Offre' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: ws, brandId: brand, url: 'https://neva.test/p', label: 'Page' }).returning();
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId: brand, number: o.numero, status: statut, launchedAt: lance, goal: o.but }).returning();
  L[cle] = b!.id;
  for (const [i, v] of o.variantes.entries()) {
    const c = await concept(ws, brand, `Concept ${cle} ${i + 1}`);
    const [a] = await db.insert(schema.ads).values({
      workspaceId: ws, conceptId: c, batchId: b!.id, variantCode: `v${i + 1}`, status: statut === 'testing' ? (v?.valide ? 'done' : 'live') : 'draft', adType: 'ideation', format: 'static', platform: o.plateforme ?? 'meta',
      hypothesis: 'Si on montre la preuve chiffrée, alors le coût par achat baisse parce que la cible doute.', testedVariable: 'hook', variableValue: `Preuve ${i + 1}`,
      offerId: offre!.id, landingPageId: page!.id, launchedAt: lance, generatedName: NOM(cle, i),
    }).returning();
    L[`${cle}.v${i + 1}`] = a!.id;
    if (v) {
      await db.insert(schema.verdicts).values({
        adId: a!.id, workspaceId: ws, computed: v.calcule, validated: v.valide ? v.calcule : null, status: v.valide ? 'validated' : 'computed', comparable: true,
        metricsAgg: { spend: v.depense ?? 120, impressions: v.impressions ?? 20000, purchases: 3, cpa: 40, reason: 'Moteur', daysElapsed: 7 },
      });
    }
  }
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: I.wsA!, name: 'Espace A', plan: 'plus', onboardedAt: ANCIEN }, { id: I.wsB!, name: 'Espace B', plan: 'plus', onboardedAt: ANCIEN }]);
  await db.insert(schema.users).values((['uo', 'um', 'ub'] as const).map((q) => ({ id: I[q]!, email: `${q}@imp.test`, name: 'Camille' })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: I.wsA!, userId: I.uo!, role: 'owner' }, { workspaceId: I.wsA!, userId: I.um!, role: 'member' }, { workspaceId: I.wsB!, userId: I.ub!, role: 'owner' },
  ]);
  await db.insert(schema.brands).values([
    { id: I.bA!, workspaceId: I.wsA!, name: 'Neva' }, { id: I.bA2!, workspaceId: I.wsA!, name: 'Autre' }, { id: I.bB!, workspaceId: I.wsB!, name: 'Ailleurs' },
  ]);
  // Neva · n1 sans aucune mesure (« Mesures à importer ») · n2 à conclure · n3 mesures partielles (« Mesures à importer »)
  // · n4 en préparation · n5 sur TikTok (« Mesures à importer », aucune source).
  await lot('n1', { numero: 1, but: 'Mesures pas encore remontées', variantes: [null, null] });
  await lot('n2', { numero: 2, but: 'Preuve ou promesse', variantes: [{ calcule: 'winner' }, { calcule: 'loser' }] });
  await lot('n3', { numero: 3, but: 'Une variante mesurée', variantes: [{ calcule: 'loser' }, null, null] });
  await lot('n4', { numero: 4, but: 'En préparation', statut: 'planned', variantes: [null] });
  await lot('n5', { numero: 5, but: 'Sur TikTok', variantes: [null], plateforme: 'tiktok' });
  // Autre marque, même espace · un lot qui attend · jamais dans la liste de Neva.
  await lot('a1', { brand: I.bA2!, numero: 7, but: 'Lot de la marque Autre', variantes: [null] });
  // Un autre espace.
  await lot('b1', { ws: I.wsB!, brand: I.bB!, numero: 8, but: 'Lot d’un autre espace', variantes: [null] });
}, 180_000);

afterEach(() => { h.session = null; h.marque = null; h.pousse = []; });

const brut = (el: ReactNode) => renderToStaticMarkup(el as ReactElement);
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const net = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const avant = (nom: string) => readFileSync(join(__dirname, 'fixtures', nom), 'utf8');

/** Les identifiants tirés au hasard · nommés par leur clé (`{{n1}}`), les autres par ordre d'apparition · comme la capture. */
function anon(x: string) {
  const t = Object.entries(L).reduce((acc, [k, v]) => acc.split(v).join(`{{${k}}}`), x);
  const vus: string[] = [];
  return t.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (u) => {
    if (!vus.includes(u)) vus.push(u);
    return `{{id${vus.indexOf(u)}}}`;
  });
}

/**
 * L'écart déclaré de l'écran d'import · UN bloc `div[data-liste-lot]`, sans `div`
 * imbriqué, juste après la sous-navigation · on le retire, lui seul · absent,
 * deux fois, ou ailleurs · rien n'est retiré (la comparaison tombe).
 */
const LISTE = /<div data-liste-lot=""[^>]*>(?:(?!<div)[^])*?<\/div>/g;
function sansListe(html: string): string {
  const m = [...html.matchAll(LISTE)];
  if (m.length !== 1 || !html.slice(0, m[0]!.index).endsWith('</nav>')) return html;
  return html.replace(LISTE, '');
}
/**
 * L'écart déclaré de la section du lot · UN paragraphe `p[data-cas-mesures]` (« mesures en cours » ou
 * « mesures manquantes », `mesuresDuLot`), juste après le titre de la section · on le retire, lui seul ·
 * absent, deux fois, ou ailleurs · rien n'est retiré (la comparaison tombe).
 */
const CAS_MESURES = /<p class="muted" role="note" data-cas-mesures="(?:en-cours|manquantes)" style="font-size:12.5px">[^<]*<\/p>/g;
function sansCasMesures(html: string): string {
  const m = [...html.matchAll(CAS_MESURES)];
  if (m.length !== 1 || !html.slice(0, m[0]!.index).endsWith('ses mesures</h2>')) return html;
  return html.replace(CAS_MESURES, '');
}
/**
 * Les identifiants de `useId` (`_R_2r_`) encodent la place d'un composant parmi ses frères · une section
 * ajoutée dans le fragment des gestes les décale · ils sont ramenés à un seul nom, des deux côtés.
 */
const sansUseId = (x: string) => x.replace(/_R_[0-9a-zA-Z]+_/g, '_R_id_');
/** L'écart déclaré de la fiche · UNE section `section[data-import-lot]`, juste après les raccourcis du lot. */
const SECTION_IMPORT = /<section class="tile sec" aria-label="Importer les mesures du lot" data-import-lot="[^"]*">[^]*?<\/section>/g;
function sansSectionImport(html: string): string {
  const m = [...html.matchAll(SECTION_IMPORT)];
  return m.length === 1 ? html.replace(SECTION_IMPORT, '') : html;
}

async function pageImport(params: Record<string, string>) {
  return brut(avecSpatial(await ImportSpatial({ searchParams: Promise.resolve(params) })));
}

/** L'écran d'import rendu au serveur à cette adresse · la section du lot, la liste « Lot ». */
async function ecranImport(href: string) {
  const u = new URL(href, 'https://app.test');
  expect(u.pathname, `le lien ${href} ne mène pas à l’écran d’import`).toBe('/adsmap/import');
  const html = await pageImport(Object.fromEntries(u.searchParams));
  const d = dom(html);
  const s = d.querySelector<HTMLElement>('section[data-lot-cible]');
  const sel = d.querySelector<HTMLSelectElement>('[data-liste-lot] select');
  return {
    html,
    lot: s?.dataset.lotCible ?? null,
    titre: net(s?.querySelector('h2')?.textContent) || null,
    variantes: [...(s?.querySelectorAll('[data-tableau="variantes-lot"] .mrow[data-etat]') ?? [])].map((r) => `${net(r.querySelector('.num')?.textContent)}:${r.getAttribute('data-etat')}`),
    liste: sel ? {
      libelle: net(d.querySelector(`label[for="${sel.id}"]`)?.textContent),
      choisi: sel.querySelector<HTMLOptionElement>('option[selected]')?.value ?? sel.querySelector('option')!.value,
      options: [...sel.querySelectorAll('option')].map((o) => ({ id: o.value, libelle: net(o.textContent) })),
    } : null,
    texte: net(d.textContent),
  };
}

const fiche = async (cle: string) => brut(avecSpatial(await LotSpatial({ params: Promise.resolve({ id: L[cle]! }), searchParams: Promise.resolve({}) })));

async function traces() {
  return JSON.stringify([
    (await db.select({ id: schema.batches.id, s: schema.batches.status, p: schema.batches.protocolCheck }).from(schema.batches)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.verdicts.adId, s: schema.verdicts.status, v: schema.verdicts.validated, c: schema.verdicts.computed }).from(schema.verdicts)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.mesuresCsv.adId }).from(schema.mesuresCsv)).length,
    (await db.select({ id: schema.remontees.id }).from(schema.remontees)).length,
    (await db.select({ id: schema.learnings.id }).from(schema.learnings)).length,
  ]);
}

const OPTIONS_NEVA = () => [
  { id: '', libelle: 'Tous les lots' },
  { id: L.n3!, libelle: 'Lot #3 · Une variante mesurée · Mesures à importer' },
  { id: L.n1!, libelle: 'Lot #1 · Mesures pas encore remontées · Mesures à importer' },
];

describe('chaque « Importer » d’un lot arrive sur lui · on suit le lien', () => {
  it('« Lots de test » · chaque bouton « Importer » (« Mesures à importer ») ouvre l’import sur SON lot · la liste « Lot » le montre choisi', async () => {
    comme('uo', NEVA());
    const avantT = await traces();
    const d = dom(brut(avecSpatial(await LotsSpatial({ searchParams: Promise.resolve({}) }))));
    const boutons = [...d.querySelectorAll<HTMLAnchorElement>('a[data-lot-lien]')].filter((a) => net(a.textContent) === 'Importer');
    expect(boutons.map((a) => a.dataset.lotLien), 'les lots « Mesures à importer » n’ont pas leur bouton').toEqual([L.n5, L.n3, L.n1]);
    for (const b of boutons) {
      const id = b.dataset.lotLien!;
      expect(b.getAttribute('href'), 'le bouton mène à l’import sans le lot').toBe(`/adsmap/import?lot=${id}`);
      const i = await ecranImport(b.getAttribute('href')!);
      expect(i.lot, 'l’écran d’import ne s’ouvre pas sur ce lot').toBe(id);
      expect(i.liste?.choisi, 'la liste « Lot » ne montre pas ce lot choisi').toBe(id);
    }
    // Le lot sur TikTok · mené là par son bouton · la section le dit, la liste le garde, dans son groupe à lui
    // (« Ouvert par le lien », après les lots qui attendent · la liste est regroupée par cas, `casMesuresLot`).
    const t = await ecranImport(`/adsmap/import?lot=${L.n5}`);
    expect(t.texte).toContain('Lot #5 · aucune source d’import · TikTok n’a encore ni connexion ni export, seul Meta remonte des mesures');
    expect(t.liste!.options.map((o) => o.id)).toEqual(['', L.n3, L.n1, L.n5]);
    // Aucun autre lien de la liste ne mène à l'import nu.
    expect([...d.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((x) => x === '/adsmap/import'), 'un lien nu vers l’import pour un lot').toEqual(['/adsmap/import']);
    expect(await traces(), 'une lecture a écrit').toEqual(avantT);
  });

  it('la fiche d’un lot « Mesures à importer » · « Importer les mesures du lot #1 » ouvre l’import sur lui · rien d’autre ne change sur la fiche', async () => {
    comme('uo', NEVA());
    const html = await fiche('n1');
    const d = dom(html);
    const s = d.querySelector<HTMLElement>('section[data-import-lot]');
    expect(s?.dataset.importLot, 'la fiche n’a pas le geste d’import').toBe(L.n1);
    expect(net(s!.querySelector('[data-diagnostic]')?.textContent)).toBe('Lot #1 · aucune mesure reçue depuis le lancement');
    const a = s!.querySelector<HTMLAnchorElement>('a[data-geste="importer-lot"]');
    expect(net(a?.textContent)).toBe('Importer les mesures du lot #1');
    expect(a!.getAttribute('href')).toBe(`/adsmap/import?lot=${L.n1}`);
    expect(a!.style.minHeight, 'cible de moins de 44 px').toBe('44px');
    const i = await ecranImport(a!.getAttribute('href')!);
    expect(i.lot).toBe(L.n1);
    expect(i.titre).toBe('Lot #1 · Mesures pas encore remontées · ses mesures');
    expect(i.variantes).toEqual(['v1:sans-mesure', 'v2:sans-mesure']);
    // Octet pour octet la fiche de main, la section seule retirée.
    expect(sansUseId(anon(sansSectionImport(html))), 'la fiche a changé ailleurs que la section déclarée').toBe(sansUseId(avant('import-fiche-n1-uo-avant.html')));
    // Une fiche dans un autre état · aucun geste d'import.
    for (const k of ['n2', 'n4']) expect(dom(await fiche(k)).querySelector('section[data-import-lot]'), `la fiche ${k} propose l’import`).toBeNull();
  });
});

describe('les autres liens d’un lot vers l’import · la boucle, la vue d’ensemble', () => {
  const versImport = (d: HTMLElement) => [...d.querySelectorAll<HTMLAnchorElement>('a[href^="/adsmap/import"]')].map((a) => a.getAttribute('href')!);
  it('admin · chaque lien d’un lot vers l’import porte SON lot · seul le lien général (sous-navigation, « Importer des résultats ») reste nu', async () => {
    comme('uo', NEVA());
    const boucle = versImport(dom(brut(avecSpatial(await BoucleSpatial()))));
    const ensemble = versImport(dom(brut(avecSpatial(await ResultatsSpatial({ searchParams: Promise.resolve({}) })))));
    const lots = new Set([`/adsmap/import?lot=${L.n1}`, `/adsmap/import?lot=${L.n3}`, `/adsmap/import?lot=${L.n5}`]);
    for (const [ecran, liens] of [['boucle', boucle], ['vue d’ensemble', ensemble]] as const) {
      expect(liens.filter((x) => x !== '/adsmap/import').length, `${ecran} · aucun lien d’un lot vers l’import`).toBeGreaterThan(0);
      expect(liens.filter((x) => x !== '/adsmap/import' && !lots.has(x)), `${ecran} · un lien vers l’import d’un lot hors de ceux à importer`).toEqual([]);
    }
    // La boucle · le prochain geste et la colonne « Analyse » portent le lot.
    expect(boucle.filter((x) => lots.has(x)).length, 'la boucle · ses « Importer » d’un lot').toBeGreaterThanOrEqual(3);
  });
  it('membre · la vue d’ensemble et la boucle ne lui proposent aucun import · « Voir le lot » à la place, la raison dite', async () => {
    comme('um', NEVA());
    const d = dom(brut(avecSpatial(await ResultatsSpatial({ searchParams: Promise.resolve({}) }))));
    expect(versImport(d), 'un lien vers l’import au membre').toEqual([]);
    // La boucle · la prochaine action « Importer les mesures du lot #7 » · au membre, la fiche du lot et la raison, jamais l'import.
    comme('um', AUTRE());
    const b = dom(brut(avecSpatial(await BoucleSpatial())));
    expect(versImport(b), 'la boucle propose l’import au membre').toEqual([]);
    const titre = [...b.querySelectorAll('h3')].find((x) => net(x.textContent) === 'Importer les mesures du lot #7');
    expect(titre, 'préalable · la prochaine action est l’import du lot #7').toBeTruthy();
    const bloc = titre!.parentElement!.parentElement!;
    expect(net(bloc.querySelector('p')?.textContent), 'la raison n’est pas dite au membre').toContain(RAISON_IMPORT_FERME.role);
    const voir = bloc.querySelector<HTMLAnchorElement>('a.btn');
    expect([net(voir?.textContent), voir?.getAttribute('href')]).toEqual(['Voir le lot', `/adsmap/lots/${L.a1}`]);
    const f = dom(await fiche('a1'));
    expect(f.querySelector('[data-geste-ferme="importer-lot"]'), 'la fiche suivie n’a pas le bouton fermé').not.toBeNull();
    comme('uo', AUTRE());
    const ba = dom(brut(avecSpatial(await BoucleSpatial())));
    expect(versImport(ba), 'l’admin · la prochaine action ne mène pas à l’import du lot').toContain(`/adsmap/import?lot=${L.a1}`);
  });
});

describe('la liste « Lot » de l’écran d’import', () => {
  it('les lots de la portée qui attendent des mesures, dans l’ordre lu · ni à conclure, ni en préparation, ni sans source · jamais une autre marque ni un autre espace', async () => {
    comme('uo', NEVA());
    const i = await ecranImport('/adsmap/import');
    expect(i.liste, 'aucune liste « Lot »').not.toBeNull();
    expect(i.liste!.libelle).toBe('Lot');
    expect(i.liste!.choisi, '« Tous les lots » n’est pas choisi sans adresse').toBe('');
    expect(i.liste!.options, 'la liste « Lot » ne montre pas les lots qui attendent, dans l’ordre lu').toEqual(OPTIONS_NEVA());
    expect(i.texte, 'un lot d’une autre marque ou d’un autre espace fuit').not.toMatch(/Lot #7|Lot #8|marque Autre|autre espace/);
    comme('uo', AUTRE());
    expect((await ecranImport('/adsmap/import')).liste!.options.map((o) => o.id), 'la liste d’une autre marque').toEqual(['', L.a1]);
    comme('ub', AILLEURS());
    const b = await ecranImport(`/adsmap/import?lot=${L.n1}`);
    expect(b.lot, 'un lot d’un autre espace est montré').toBeNull();
    expect(b.liste!.choisi, 'un lot d’un autre espace est choisi').toBe('');
    expect(b.liste!.options.map((o) => o.id)).toEqual(['', L.b1]);
  });

  it('« Tous les lots » · octet pour octet la capture de main, la liste seule retirée · l’écran ouvert sur un lot aussi', async () => {
    comme('uo', NEVA());
    const tous = await pageImport({});
    expect(tous).toContain('data-liste-lot');
    expect(sansListe(tous).length, 'l’écran « Tous les lots » a changé de taille').toBe(avant('import-tous-les-lots-avant.html').length);
    expect(sansListe(tous), 'l’écran « Tous les lots » a changé').toBe(avant('import-tous-les-lots-avant.html'));
    const surN1 = (await pageImport({ lot: L.n1! })).split(L.n1!).join('{{n1}}');
    expect(surN1, 'la section du lot ne dit pas son cas').toContain('data-cas-mesures="manquantes"');
    expect(sansCasMesures(sansListe(surN1)), 'l’écran ouvert sur un lot a changé').toBe(avant('import-lot-n1-avant.html'));
    // Paramètre inconnu · comme « Tous les lots ».
    expect(sansListe(await pageImport({ lot: 'inconnu' }))).toBe(avant('import-tous-les-lots-avant.html'));
  });

  it('l’écran monté · choisir un lot change l’adresse · l’adresse change la section · « Tous les lots » revient à l’écran sans lot', async () => {
    comme('uo', NEVA());
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const root = createRoot(hote);
    const monter = async (params: Record<string, string>) => {
      const el = await ImportSpatial({ searchParams: Promise.resolve(params) });
      await act(async () => { root.render(avecSpatial(el)); });
    };
    const choisir = async (valeur: string) => {
      const sel = hote.querySelector<HTMLSelectElement>('[data-liste-lot] select')!;
      await act(async () => { sel.value = valeur; sel.dispatchEvent(new Event('change', { bubbles: true })); });
      return h.pousse.at(-1)!;
    };
    await monter({});
    expect(hote.querySelector('section[data-lot-cible]')).toBeNull();
    const vers3 = await choisir(L.n3!);
    expect(vers3, 'choisir un lot ne change pas l’adresse').toBe(`/adsmap/import?lot=${L.n3}`);
    await monter(Object.fromEntries(new URL(vers3, 'https://app.test').searchParams));
    expect(hote.querySelector('section[data-lot-cible]')?.getAttribute('data-lot-cible'), 'l’adresse ne change pas la section').toBe(L.n3);
    expect(hote.querySelector<HTMLSelectElement>('[data-liste-lot] select')!.value).toBe(L.n3);
    expect([...hote.querySelectorAll('[data-tableau="variantes-lot"] .mrow[data-etat]')].map((r) => r.getAttribute('data-etat'))).toEqual(['mesuree', 'sans-mesure', 'sans-mesure']);
    const versTous = await choisir('');
    expect(versTous, '« Tous les lots » ne revient pas à l’écran sans lot').toBe('/adsmap/import');
    await monter({});
    expect(hote.querySelector('section[data-lot-cible]')).toBeNull();
    expect(h.pousse).toEqual([`/adsmap/import?lot=${L.n3}`, '/adsmap/import']);
    act(() => root.unmount()); hote.remove();
  });

  it('un export déposé, le lot #3 choisi · combien d’annonces lui vont, quelles variantes restent sans mesure · rien écrit avant de confirmer', async () => {
    comme('uo', NEVA());
    const avantT = await traces();
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const root = createRoot(hote);
    const el = await ImportSpatial({ searchParams: Promise.resolve({ lot: L.n3! }) });
    await act(async () => { root.render(avecSpatial(el)); });
    const entete = 'Début des rapports;Fin des rapports;Nom de la campagne;Nom de l’ensemble de publicités;Nom de la publicité;Identifiant de la publicité;Impressions;Montant dépensé (EUR);Clics sur un lien;Achats';
    const ligne = (nom: string) => ['2020-01-06', '2020-01-12', '[ADSMAP] TEST Neva B3', `ES ${nom}`, nom, '', '21 000', '150,00', '310', '0'].join(';');
    const csv = [entete, ligne(NOM('n3', 1)), ligne(NOM('n1', 0))].join('\r\n') + '\r\n';
    await act(async () => {
      const ev = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: { files: File[] } };
      Object.defineProperty(ev, 'dataTransfer', { value: { files: [new File([csv], 'export.csv', { type: 'text/csv' })] } });
      hote.querySelector('.drop')!.dispatchEvent(ev);
    });
    for (let k = 0; k < 50 && !hote.querySelector('[data-lot-cible-compte]'); k++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(net(hote.querySelector('[data-lot-cible-compte]')?.textContent), 'l’aperçu ne dit pas ce qui va au lot').toBe('1 annonce de ce fichier va aux variantes du lot #3.');
    expect(net(hote.querySelector('[data-lot-cible-restantes]')?.textContent), 'l’aperçu ne dit pas quelles variantes restent sans mesure').toBe('1 variante du lot #3 reste sans mesure après ce fichier · v3.');
    expect(hote.querySelector('[data-geste="ecrire-mesures"]'), 'la confirmation existante a disparu').not.toBeNull();
    act(() => root.unmount()); hote.remove();
    expect(await traces(), 'l’aperçu a écrit avant la confirmation').toEqual(avantT);
  });
});

describe('un membre · fermé, la raison écrite à côté', () => {
  it('la fiche · le bouton fermé et sa raison · aucun lien vers l’import · « Lots de test » n’en a aucun · la page d’import le refuse', async () => {
    comme('um', NEVA());
    const avantT = await traces();
    const html = await fiche('n1');
    const d = dom(html);
    const s = d.querySelector<HTMLElement>('section[data-import-lot]');
    expect(s, 'la fiche du membre n’a pas le geste (fermé)').not.toBeNull();
    const b = s!.querySelector<HTMLButtonElement>('[data-geste-ferme="importer-lot"]');
    expect(b?.tagName, 'le contrôle fermé n’est pas un bouton').toBe('BUTTON');
    expect(b!.disabled, 'le bouton du membre est ouvert').toBe(true);
    expect(net(b!.textContent)).toBe('Importer les mesures du lot #1');
    const raison = d.querySelector(`#${b!.getAttribute('aria-describedby')}`);
    expect(net(raison?.textContent), 'la raison n’est pas écrite à côté').toBe(RAISON_IMPORT_FERME.role);
    expect(RAISON_IMPORT_FERME.role).toContain('réservé aux admins de l’espace');
    expect([...d.querySelectorAll('a[href]')].some((a) => a.getAttribute('href')!.startsWith('/adsmap/import')), 'un lien vers l’import au membre').toBe(false);
    expect(sansUseId(anon(sansSectionImport(html))), 'la fiche du membre a changé ailleurs que la section').toBe(sansUseId(avant('import-fiche-n1-um-avant.html')));
    const liste = dom(brut(avecSpatial(await LotsSpatial({ searchParams: Promise.resolve({}) }))));
    expect([...liste.querySelectorAll('a[href]')].some((a) => a.getAttribute('href')!.startsWith('/adsmap/import')), 'un lien vers l’import dans la liste du membre').toBe(false);
    await expect(ImportSpatial({ searchParams: Promise.resolve({ lot: L.n1! }) }), 'la page d’import s’ouvre au membre').rejects.toThrow('REDIRECT /adsmap');
    expect(await traces()).toEqual(avantT);
  });
});
