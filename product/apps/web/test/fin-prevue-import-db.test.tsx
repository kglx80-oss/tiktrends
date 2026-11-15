// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * « Fin prévue passée » mène à l'import des mesures du lot (suite de #1080) ·
 * sur une VRAIE base (pglite, migrations du dépôt), avec les VRAIES gardes et
 * les VRAIES vues · l'Accueil (`/dashboard`, étape « En diffusion » de la
 * boucle, où vit le libellé de #1080) et l'écran d'import EXISTANT
 * (`/adsmap/import`) · on lit le DOM, on SUIT le lien.
 *  · un lot à fin prévue passée sans mesure · « aucune mesure reçue depuis le
 *    lancement » · « Importer les mesures du lot #1 » · le lien ouvre l'import
 *    sur CE lot (ses variantes, leur état) · après l'aperçu d'un export, le
 *    nombre d'annonces qui vont à lui ;
 *  · un lot aux mesures sous le minimum du moteur (seuil de la MARQUE) · dit ;
 *  · un lot sans source (TikTok) · dit, aucun lien vers un écran vide ;
 *  · un membre · le contrôle fermé et sa raison · la vraie page d'import le
 *    refuse aussi ;
 *  · une autre marque, un autre espace · le paramètre est ignoré ;
 *  · le compte « à conclure » ne bouge pas · le libellé de #1080 reste mot pour mot ;
 *  · rien n'est écrit, ni à l'affichage ni à l'aperçu · aucun réseau, 0 $.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['wsA', 'wsB', 'bA', 'bA2', 'bA3', 'bB', 'uo', 'um', 'ub']) h.ids[k] = randomUUID();
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
import { LIEN_A_CONCLURE, RAISON_IMPORT_FERME, phraseFinPrevuePassee } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';
import ImportSpatial from '../app/(spatial)/sp/adsmap/import/page';
import LotsSpatial from '../app/(spatial)/sp/adsmap/lots/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const I = h.ids;
const L: Record<string, string> = {};
/** Des dates FIXES, loin dans le passé · la fenêtre du moteur y est toujours écoulée, la fin prévue toujours passée. */
const ANCIEN = new Date('2020-01-06T09:00:00Z');
const FIN = (jour: number) => new Date(Date.UTC(2020, 0, jour, 9));
const NOM = (cle: string, i: number) => `NEVA_${cle}_C${i + 1}_v${i + 1}_hook`;

type Qui = 'uo' | 'um' | 'ub';
const ROLE: Record<Qui, string> = { uo: 'owner', um: 'member', ub: 'owner' };
function comme(qui: Qui, marque: { id: string; name: string }) {
  h.session = { user: { id: I[qui]!, email: `${qui}@fin.test`, name: 'Camille' }, workspaceId: qui === 'ub' ? I.wsB! : I.wsA!, workspaceName: 'Espace', role: ROLE[qui], plan: 'plus', equipe: null };
  h.marque = marque;
}
const NEVA = () => ({ id: I.bA!, name: 'Neva' });
const AUTRE = () => ({ id: I.bA2!, name: 'Autre' });
const TIK = () => ({ id: I.bA3!, name: 'Tik' });
const AILLEURS = () => ({ id: I.bB!, name: 'Ailleurs' });

async function concept(ws: string, brand: string, titre: string) {
  const [p] = await db.insert(schema.personas).values({ brandId: brand, name: `P ${titre}` }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: p!.id, label: 'D' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: d!.id, label: 'A', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: a!.id, title: titre }).returning();
  return c!.id;
}

type Variante = null | { calcule: 'winner' | 'loser' | 'inconclusive'; valide?: boolean; impressions?: number; depense?: number };
async function lot(cle: string, o: { ws?: string; brand?: string; numero: number; but: string; fin: Date; variantes: Variante[]; plateforme?: 'meta' | 'tiktok' }) {
  const ws = o.ws ?? I.wsA!, brand = o.brand ?? I.bA!;
  const [offre] = await db.insert(schema.offers).values({ workspaceId: ws, brandId: brand, label: 'Offre' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: ws, brandId: brand, url: 'https://neva.test/p', label: 'Page' }).returning();
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId: brand, number: o.numero, status: 'testing', launchedAt: ANCIEN, plannedEndAt: o.fin, goal: o.but }).returning();
  L[cle] = b!.id;
  for (const [i, v] of o.variantes.entries()) {
    const c = await concept(ws, brand, `Concept ${cle} ${i + 1}`);
    const [a] = await db.insert(schema.ads).values({
      workspaceId: ws, conceptId: c, batchId: b!.id, variantCode: `v${i + 1}`, status: v?.valide ? 'done' : 'live', adType: 'ideation', format: 'static', platform: o.plateforme ?? 'meta',
      hypothesis: 'Si on montre la preuve chiffrée, alors le coût par achat baisse parce que la cible doute.', testedVariable: 'hook', variableValue: `Preuve ${i + 1}`,
      offerId: offre!.id, landingPageId: page!.id, launchedAt: ANCIEN, generatedName: NOM(cle, i),
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
  await db.insert(schema.users).values((['uo', 'um', 'ub'] as const).map((q) => ({ id: I[q]!, email: `${q}@fin.test`, name: 'Camille' })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: I.wsA!, userId: I.uo!, role: 'owner' }, { workspaceId: I.wsA!, userId: I.um!, role: 'member' }, { workspaceId: I.wsB!, userId: I.ub!, role: 'owner' },
  ]);
  await db.insert(schema.brands).values([
    { id: I.bA!, workspaceId: I.wsA!, name: 'Neva' }, { id: I.bA2!, workspaceId: I.wsA!, name: 'Autre' }, { id: I.bA3!, workspaceId: I.wsA!, name: 'Tik' }, { id: I.bB!, workspaceId: I.wsB!, name: 'Ailleurs' },
  ]);
  // Le seuil de la MARQUE « Autre » · 15 000 impressions · 9 000 y restent sous le minimum (au-dessus du défaut, 5 000).
  await db.insert(schema.verdictConfigs).values({ brandId: I.bA2!, workspaceId: I.wsA!, config: { minImpressions: 15000 } });
  // Neva · n1 (le plus ancien) sans aucune mesure · n2 à conclure (compté, hors de la fin prévue) · n3 tout arbitré.
  await lot('n1', { numero: 1, but: 'Mesures pas encore remontées', fin: FIN(10), variantes: [null, null] });
  await lot('n2', { numero: 2, but: 'Preuve ou promesse', fin: FIN(12), variantes: [{ calcule: 'winner' }, { calcule: 'loser' }] });
  await lot('n3', { numero: 3, but: 'Arbitré, encore en diffusion', fin: FIN(15), variantes: [{ calcule: 'winner', valide: true }, { calcule: 'loser', valide: true }] });
  // Autre · a1 · une variante mesurée sous le minimum de la marque, l'autre sans mesure.
  await lot('a1', { brand: I.bA2!, numero: 1, but: 'Trop peu diffusé', fin: FIN(9), variantes: [{ calcule: 'inconclusive', impressions: 9000, depense: 12 }, null] });
  // Tik · aucune source · ses variantes sont sur TikTok.
  await lot('t1', { brand: I.bA3!, numero: 1, but: 'Sur TikTok', fin: FIN(9), variantes: [null], plateforme: 'tiktok' });
  // Un autre espace · son propre lot sans mesure.
  await lot('b1', { ws: I.wsB!, brand: I.bB!, numero: 1, but: 'Ailleurs', fin: FIN(9), variantes: [null] });
}, 180_000);

afterEach(() => { h.session = null; h.marque = null; });

const dom = (el: ReactNode) => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(el as ReactElement); return d; };
const net = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** L'Accueil rendu · l'étape « En diffusion » (lien, bouton, diagnostic, contrôle fermé) et « À traiter ». */
async function accueil() {
  const d = dom(avecSpatial(await AccueilSpatial({ searchParams: Promise.resolve({}) })));
  const etape = (titre: string) => [...d.querySelectorAll<HTMLAnchorElement>('.pipe a.tile.stage')].find((a) => net(a.querySelector('strong')?.textContent) === titre) ?? null;
  const e = etape('En diffusion');
  expect(e, 'préalable · l’étape « En diffusion » de la boucle').not.toBeNull();
  const t = etape('À traiter');
  return {
    href: e!.getAttribute('href'),
    sous: net(e!.querySelector('strong + span')?.textContent),
    bouton: net(e!.querySelector(':scope > .btn')?.textContent) || null,
    diagnostic: e!.querySelector('[data-fin-prevue]') ? net(e!.querySelector('[data-fin-prevue] > span:not(.btn)')?.textContent) : null,
    ferme: e!.querySelector<HTMLElement>('[data-geste-ferme]'),
    raison: net(e!.querySelector('[data-raison]')?.textContent) || null,
    traiter: t ? Number(net(t.querySelector('.big3')?.textContent)) : null,
    liens: [...d.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')!),
  };
}

/** L'écran d'import rendu au serveur à cette adresse · le lot ciblé (section, variantes) s'il y en a un. */
async function ecranImport(href: string) {
  const u = new URL(href, 'https://app.test');
  expect(u.pathname, 'le lien ne mène pas à l’écran d’import').toBe('/adsmap/import');
  const d = dom(avecSpatial(await ImportSpatial({ searchParams: Promise.resolve(Object.fromEntries(u.searchParams)) })));
  const s = d.querySelector<HTMLElement>('section[data-lot-cible]');
  return {
    lot: s?.dataset.lotCible ?? null,
    titre: net(s?.querySelector('h2')?.textContent) || null,
    diagnostic: net(s?.querySelector('[data-diagnostic]')?.textContent) || null,
    variantes: [...(s?.querySelectorAll('[data-tableau="variantes-lot"] .mrow[data-etat]') ?? [])].map((r) => `${net(r.querySelector('.num')?.textContent)}:${r.getAttribute('data-etat')}`),
    texte: net(d.textContent),
  };
}

async function traces() {
  return JSON.stringify([
    (await db.select({ id: schema.batches.id, s: schema.batches.status, p: schema.batches.protocolCheck }).from(schema.batches)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.verdicts.adId, s: schema.verdicts.status, v: schema.verdicts.validated, c: schema.verdicts.computed }).from(schema.verdicts)).sort((a, b) => a.id.localeCompare(b.id)),
    (await db.select({ id: schema.mesuresCsv.adId }).from(schema.mesuresCsv)).length,
    (await db.select({ id: schema.remontees.id }).from(schema.remontees)).length,
    (await db.select({ id: schema.learnings.id }).from(schema.learnings)).length,
  ]);
}

describe('fin prévue passée sans mesure · « Importer les mesures du lot #n » · l’import s’ouvre sur ce lot', () => {
  it('admin · le diagnostic, le geste, le lien suivi · l’écran d’import montre CE lot · le compte « à conclure » ne bouge pas · rien écrit', async () => {
    comme('uo', NEVA());
    const avant = await traces();
    const a = await accueil();
    expect(a.sous, 'le libellé de #1080 a changé').toBe(phraseFinPrevuePassee([{ numero: 1 }, { numero: 3 }]));
    expect(a.diagnostic, 'le cas mesuré n’est pas dit').toBe('Lot #1 · aucune mesure reçue depuis le lancement');
    expect(a.bouton, 'le libellé n’a pas son geste').toBe('Importer les mesures du lot #1');
    expect(a.href, 'le geste ne mène pas à l’import sur ce lot').toBe(`/adsmap/import?lot=${L.n1}`);
    expect(a.ferme, 'un contrôle fermé pour un admin').toBeNull();
    // Le compte « à conclure » · inchangé · n2 seul, hors de la fin prévue · la tuile mène toujours à la liste.
    expect(a.traiter, 'le compte « à conclure » a bougé').toBe(1);
    expect(a.liens).toContain(LIEN_A_CONCLURE);
    // On SUIT le lien.
    const i = await ecranImport(a.href!);
    expect(i.lot, 'l’écran d’import ne s’ouvre pas sur ce lot').toBe(L.n1);
    expect(i.titre).toBe('Lot #1 · Mesures pas encore remontées · ses mesures');
    expect(i.diagnostic).toBe('Lot #1 · aucune mesure reçue depuis le lancement');
    expect(i.variantes, 'les variantes du lot ne sont pas listées avec leur état').toEqual(['v1:sans-mesure', 'v2:sans-mesure']);
    expect(i.texte, 'le nom régie de la variante n’est pas dit').toContain(NOM('n1', 0));
    expect(await traces(), 'une lecture a écrit').toEqual(avant);
  });

  it('l’écran monté · un export déposé · l’aperçu dit combien d’annonces vont au lot · rien écrit avant de confirmer', async () => {
    comme('uo', NEVA());
    const avant = await traces();
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const root = createRoot(hote);
    const el = await ImportSpatial({ searchParams: Promise.resolve({ lot: L.n1! }) });
    await act(async () => { root.render(avecSpatial(el)); });
    expect(hote.querySelector('section[data-lot-cible]')?.getAttribute('data-lot-cible')).toBe(L.n1);
    const entete = 'Début des rapports;Fin des rapports;Nom de la campagne;Nom de l’ensemble de publicités;Nom de la publicité;Identifiant de la publicité;Impressions;Montant dépensé (EUR);Clics sur un lien;Achats';
    const ligne = (nom: string) => ['2020-01-06', '2020-01-12', '[ADSMAP] TEST Neva B1', `ES ${nom}`, nom, '', '21 000', '150,00', '310', '0'].join(';');
    const csv = [entete, ligne(NOM('n1', 0)), ligne(NOM('n2', 0))].join('\r\n') + '\r\n';
    await act(async () => {
      const ev = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: { files: File[] } };
      Object.defineProperty(ev, 'dataTransfer', { value: { files: [new File([csv], 'export.csv', { type: 'text/csv' })] } });
      hote.querySelector('.drop')!.dispatchEvent(ev);
    });
    for (let k = 0; k < 50 && !hote.querySelector('[data-lot-cible-compte]'); k++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(net(hote.querySelector('[data-lot-cible-compte]')?.textContent), 'l’aperçu ne dit pas ce qui va au lot').toBe('1 annonce de ce fichier va aux variantes du lot #1.');
    act(() => root.unmount()); hote.remove();
    expect(await traces(), 'l’aperçu a écrit').toEqual(avant);
  });
});

describe('les autres cas · sous le minimum, sans source, membre, autre marque, autre espace', () => {
  it('mesures reçues sous le minimum DE LA MARQUE · le libellé le dit · le geste reste l’import', async () => {
    comme('uo', AUTRE());
    const a = await accueil();
    expect(a.diagnostic, 'le minimum du moteur (réglé par la marque) n’est pas dit').toBe(net(`Lot #1 · mesures reçues, sous le minimum du moteur (${(15000).toLocaleString('fr-FR')} impressions ou 105 € dépensés par variante) · 1 variante sur 2 sans mesure`));
    expect(a.href).toBe(`/adsmap/import?lot=${L.a1}`);
    const i = await ecranImport(a.href!);
    expect(i.variantes).toEqual(['v1:sous-minimum', 'v2:sans-mesure']);
  });

  it('aucune source (TikTok) · dit honnêtement · aucun lien vers l’import, aucun bouton', async () => {
    comme('uo', TIK());
    const a = await accueil();
    expect(a.diagnostic).toBe('Lot #1 · aucune mesure reçue depuis le lancement · aucune source d’import · TikTok n’a encore ni connexion ni export, seul Meta remonte des mesures');
    expect(a.bouton, 'un geste vers un écran vide').toBeNull();
    expect(a.href, 'l’étape mène à l’import sans source').not.toMatch(/^\/adsmap\/import/);
    expect(a.ferme).toBeNull();
  });

  it('un membre · le contrôle fermé, sa raison écrite à côté · aucun lien vers l’import · la vraie page le refuse aussi', async () => {
    comme('um', NEVA());
    const avant = await traces();
    const a = await accueil();
    expect(a.diagnostic).toBe('Lot #1 · aucune mesure reçue depuis le lancement');
    expect(a.ferme, 'le contrôle n’est pas fermé').not.toBeNull();
    expect(net(a.ferme!.textContent)).toBe('Importer les mesures du lot #1');
    expect(a.ferme!.getAttribute('aria-disabled')).toBe('true');
    expect(a.ferme!.tagName, 'un contrôle fermé ne doit pas être un lien').not.toBe('A');
    expect(a.raison, 'la raison n’est pas écrite à côté').toBe(RAISON_IMPORT_FERME.role);
    expect(a.bouton, 'un bouton actif pour un membre').toBeNull();
    expect(a.liens.some((x) => x.startsWith('/adsmap/import')), 'un lien vers l’import proposé au membre').toBe(false);
    expect(a.traiter, 'le compte « à conclure » du membre a bougé').toBe(1);
    await expect(ImportSpatial({ searchParams: Promise.resolve({ lot: L.n1! }) }), 'la page d’import s’ouvre au membre').rejects.toThrow('REDIRECT /adsmap');
    expect(await traces()).toEqual(avant);
  });

  it('autre marque, autre espace · le paramètre est ignoré · inconnu aussi · son propre lot, oui', async () => {
    comme('uo', NEVA());
    for (const k of ['a1', 't1', 'b1']) {
      const i = await ecranImport(`/adsmap/import?lot=${L[k]}`);
      expect(i.lot, `le lot ${k} (hors portée) est montré`).toBeNull();
      expect(i.texte, `le lot ${k} fuit dans l’écran`).not.toMatch(/Trop peu diffusé|Sur TikTok|Ailleurs ·/);
    }
    expect((await ecranImport('/adsmap/import?lot=inconnu')).lot).toBeNull();
    expect((await ecranImport('/adsmap/import')).lot, 'sans paramètre, un lot est montré').toBeNull();
    comme('ub', AILLEURS());
    expect((await ecranImport(`/adsmap/import?lot=${L.n1}`)).lot, 'un lot d’un autre espace est montré').toBeNull();
    const a = await accueil();
    expect(a.href).toBe(`/adsmap/import?lot=${L.b1}`);
    expect((await ecranImport(a.href!)).lot).toBe(L.b1);
  });

  it('la liste « À conclure » rend toujours le même lot · aucun lot à fin prévue n’y entre', async () => {
    comme('um', NEVA());
    const d = dom(avecSpatial(await LotsSpatial({ searchParams: Promise.resolve({ filtre: 'conclure' }) })));
    expect([...d.querySelectorAll<HTMLAnchorElement>('[data-lot-lien]')].map((x) => x.dataset.lotLien)).toEqual([L.n2]);
  });
});
