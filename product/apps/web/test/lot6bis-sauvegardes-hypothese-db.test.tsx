// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 6 bis V5 · des sauvegardes de Veille au PROJET et à l'HYPOTHÈSE, sur une
 * VRAIE base (pglite, migrations réelles, 0070 comprise), avec les VRAIES
 * actions (`saveAd`, `creerHypotheseAction`) et les VRAIES pages (Sauvegardes,
 * Tagging, Nouveau projet, Hypothèses) montées dans le DOM ou rendues · on
 * coche, on clique, on lit le DOM ET la base.
 *
 *  · SV01 · sélection → l'assistant Nouveau projet EXISTANT s'ouvre avec ces
 *    sauvegardes en références et leurs tags et notes proposés dans « Ton
 *    intention » · rien n'est créé · multi-marques → refus dit ; adresse forgée
 *    avec une sauvegarde d'une autre marque → aucune jointe, rien d'elle lu ;
 *  · SV06 · grille → liste · mêmes sauvegardes, même ordre, préférence gardée ;
 *  · tag sous le seuil → aucune proposition ; au-dessus → formulaire EXISTANT
 *    pré-rempli, rien écrit avant le clic, puis hypothèse reliée aux
 *    sauvegardes ; autre marque, autre espace, lecteur client → refus sans fuite.
 * Aucun réseau, aucun modèle, 0 $.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, marque: null as string | null, affichage: null as string | null }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/saved', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : n === 'tt_sauvegardes_affichage' && h.affichage ? { value: h.affichage } : undefined),
    getAll: () => [], has: () => false, set: () => {}, delete: () => {},
  }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', () => ({ invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }) }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq } from '@tiktrends/db';
import { and } from 'drizzle-orm';
import type { InspoAd } from '@tiktrends/integrations';
import { REFUS_SELECTION_PROJET, REFUS_TAG_NON_RECURRENT, briefInspirationSauvegardes, lireOrigineHypothese } from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { saveAd } from '../app/actions/inspo';
import { creerHypotheseAction } from '../app/actions/adsmap-hypotheses';
import SauvegardesSpatiales from '../app/(spatial)/sp/saved/page';
import TaggingSpatial from '../app/(spatial)/sp/tags/page';
import NouveauProjetSpatial from '../app/(spatial)/sp/studio/projets/nouveau/page';
import HypothesesSpatial from '../app/(spatial)/sp/adsmap/hypotheses/page';
import { avecSpatial } from './spatial/fournisseur';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ids = h.ids;
const S: Record<string, string> = {};
const membre = (o: Partial<SessionTest> = {}): SessionTest => session(ids, 'ua', { plan: 'plus', ...o });
const pub = (id: string, annonceur: string, mediaType = 'image'): InspoAd => ({ id, platform: 'meta', status: 'active', daysRunning: 12, mediaType, advertiserName: annonceur, body: `Texte de ${annonceur}` });

async function sauver(brandId: string, ad: InspoAd, meta: { tags?: string[]; note?: string }) {
  h.marque = brandId;
  const r = await saveAd({ platform: ad.platform, externalId: ad.id, snapshot: ad, ...meta });
  expect(r.ok, r.error).toBe(true);
  const [l] = await db.select({ id: schema.savedAds.id }).from(schema.savedAds).where(and(eq(schema.savedAds.externalId, ad.id), eq(schema.savedAds.brandId, brandId)));
  return l!.id;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus' }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaces).set({ plan: 'plus' }).where(eq(schema.workspaces.id, ids.wsB));
  h.session = membre();
  // Marque A1 · « Hook UGC » sur 3 sauvegardes, 2 annonceurs (récurrent) · « Avant / Après » sur 2 (sous le seuil).
  S.s1 = await sauver(ids.brandA1, pub('p1', 'Ploufy'), { tags: ['Hook UGC', 'Avant / Après'], note: 'Le hook tient en deux secondes' });
  S.s2 = await sauver(ids.brandA1, pub('p2', 'Nagette'), { tags: ['hook  ugc'] });
  S.s3 = await sauver(ids.brandA1, pub('p3', 'Ploufy'), { tags: ['Hook UGC'], note: 'Même créatrice, autre décor' });
  S.s4 = await sauver(ids.brandA1, pub('p4', 'Lagonette'), { tags: ['Avant / Après'] });
  // Marque A2 (même espace) · « Hook UGC » une fois · une note qui ne doit JAMAIS sortir ailleurs.
  S.s5 = await sauver(ids.brandA2, pub('p5', 'Clapotis secret'), { tags: ['Hook UGC'], note: 'Note confidentielle de A2' });
  // Espace B · « Hook UGC » sur 3 sauvegardes de 3 annonceurs (récurrent CHEZ EUX).
  h.session = session(ids, 'ub', { plan: 'plus' });
  for (const [k, a] of [['b1', 'Bé Un'], ['b2', 'Bé Deux'], ['b3', 'Bé Trois']] as const) S[k] = await sauver(ids.brandB1, pub(`pb-${k}`, a), { tags: ['Hook UGC'] });
  h.session = membre();
  h.marque = ids.brandA1;
});

let racine: HTMLDivElement; let root: Root;
beforeEach(() => {
  h.session = membre(); h.marque = ids.brandA1; h.affichage = null;
  document.cookie = 'tt_sauvegardes_affichage=; max-age=0; path=/';
  window.history.replaceState(null, '', '/saved');
  racine = document.createElement('div'); document.body.appendChild(racine); root = createRoot(racine);
});
afterEach(() => { act(() => root.unmount()); racine.remove(); document.body.innerHTML = ''; });

const attendre = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const monter = async (el: ReactElement) => {
  act(() => root.unmount()); root = createRoot(racine);
  await act(async () => { root.render(avecSpatial(el)); });
  await attendre();
};
const cliquer = async (e: Element | null | undefined) => { if (!e) throw new Error('élément absent'); await act(async () => { (e as HTMLElement).click(); }); await attendre(); };
const taper = async (el: Element | null | undefined, v: string) => {
  if (!el) throw new Error('champ absent');
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const pageSaved = async (sp: Record<string, string> = {}) => (await SauvegardesSpatiales({ searchParams: Promise.resolve(sp) })) as ReactElement;
const caseDe = (id: string) => racine.querySelector(`[data-selection-sauvegarde="${id}"] input`) as HTMLInputElement | null;
const cartesAffichees = () => [...racine.querySelectorAll('[data-selection-sauvegarde]')].map((x) => x.getAttribute('data-selection-sauvegarde'));
const nouveauProjet = async (sp: Record<string, string | string[]>) => {
  const html = renderToStaticMarkup(avecSpatial(await NouveauProjetSpatial({ searchParams: Promise.resolve(sp) })));
  const t = document.createElement('template'); t.innerHTML = html; return { html, d: t.content };
};
const spDuLien = (href: string) => { const u = new URL(href, 'http://x'); const out: Record<string, string | string[]> = {}; for (const k of new Set(u.searchParams.keys())) { const v = u.searchParams.getAll(k); out[k] = v.length > 1 ? v : v[0]!; } return out; };
const nbProjets = async () => (await db.select({ id: schema.studioProjects.id }).from(schema.studioProjects)).length;
const nbAds = async () => (await db.select({ id: schema.ads.id }).from(schema.ads)).length;

describe('SV01 · « Créer un projet avec la sélection » → l’assistant Nouveau projet existant', () => {
  it('cocher deux sauvegardes · le lien porte LEURS références · l’assistant les joint et propose leurs tags et notes dans l’intention · rien n’est créé', async () => {
    await monter(await pageSaved());
    expect(racine.querySelector('[data-creer-selection]'), 'sans sélection · le geste d’avant').toBeNull();
    await act(async () => { caseDe(S.s3!)!.click(); });
    await act(async () => { caseDe(S.s1!)!.click(); });
    await attendre();
    const lien = racine.querySelector('a[data-creer-selection="ok"]') as HTMLAnchorElement;
    expect(lien, 'la sélection n’ouvre pas l’assistant').not.toBeNull();
    expect(lien.textContent).toBe('Créer un projet avec la sélection (2)');
    const sp = spDuLien(lien.getAttribute('href')!);
    expect(new URL(lien.getAttribute('href')!, 'http://x').pathname).toBe('/studio/projets/nouveau');
    expect(sp.ref, 'les références ne sont pas celles cochées, dans l’ordre').toEqual([S.s3, S.s1]);

    const avant = await nbProjets();
    const { d, html } = await nouveauProjet(sp);
    expect([...d.querySelectorAll('[data-reference]')].map((x) => x.getAttribute('data-reference')), 'l’assistant ne joint pas les sauvegardes choisies').toEqual([S.s3, S.s1]);
    const intention = d.querySelector('textarea[data-champ="intention"]')!.textContent;
    expect(intention, 'le brief d’inspiration n’est pas proposé dans l’intention').toBe(briefInspirationSauvegardes([
      { annonceur: 'Ploufy', tags: [{ cle: 'hook ugc', nom: 'Hook UGC' }], note: 'Même créatrice, autre décor' },
      { annonceur: 'Ploufy', tags: [{ cle: 'avant / apres', nom: 'Avant / Après' }, { cle: 'hook ugc', nom: 'Hook UGC' }], note: 'Le hook tient en deux secondes' },
    ]));
    expect(intention).toContain('Tags · Hook UGC (2), Avant / Après');
    expect(intention).toContain('Note · Le hook tient en deux secondes');
    expect(html).toContain('2 sources jointes au projet à sa création');
    expect(html, 'le titre n’est pas proposé d’après la sélection').toContain('D’après Ploufy');
    expect(await nbProjets(), 'ouvrir l’assistant a créé un projet').toBe(avant);
  });

  it('sans marque active, deux marques cochées · refus écrit à côté, aucun lien vers l’assistant', async () => {
    h.marque = null;
    await monter(await pageSaved());
    expect(cartesAffichees()).toContain(S.s5);
    await act(async () => { caseDe(S.s1!)!.click(); });
    await act(async () => { caseDe(S.s5!)!.click(); });
    await attendre();
    expect(racine.querySelector('a[data-creer-selection]'), 'une sélection multi-marques ouvre l’assistant').toBeNull();
    const ferme = racine.querySelector('button[data-creer-selection="refus"]')!;
    expect(ferme.getAttribute('aria-disabled')).toBe('true');
    expect(racine.querySelector('[data-raison-selection]')!.textContent, 'le refus ne dit pas que la sélection mêle deux marques').toBe('Ta sélection mêle 2 marques (Marque A1, Marque A2) · un projet se fait pour une seule marque · ne garde que les sauvegardes de l’une d’elles.');
    // Décocher l'autre marque · reste une marque qui n'est pas active · la raison le dit.
    await act(async () => { caseDe(S.s5!)!.click(); });
    await attendre();
    expect(racine.querySelector('[data-raison-selection]')!.textContent).toBe('Ces sauvegardes sont gardées pour Marque A1 · ouvre cette marque pour en faire un projet.');
  });

  it('adresse forgée · une sauvegarde d’une autre marque (ou d’un autre espace) parmi les références · aucune jointe, rien d’elle n’est lu', async () => {
    for (const intrus of [S.s5!, S.b1!]) {
      const { d } = await nouveauProjet({ type: 'ads', ref: [S.s1!, intrus] });
      expect(d.querySelectorAll('[data-reference]').length, 'une sélection hors portée est jointe').toBe(0);
      expect(d.textContent).toContain(REFUS_SELECTION_PROJET);
      for (const fuite of ['Clapotis secret', 'Note confidentielle de A2', 'Bé Un', 'Le hook tient en deux secondes']) expect(d.textContent, `fuite · ${fuite}`).not.toContain(fuite);
    }
  });
});

describe('SV06 · Grille / Liste des Sauvegardes', () => {
  it('la liste montre les MÊMES sauvegardes dans le MÊME ordre · la sélection la traverse · la préférence reste sur l’appareil et revient au rendu serveur', async () => {
    await monter(await pageSaved());
    const grille = cartesAffichees();
    expect(grille.length).toBe(4);
    await act(async () => { caseDe(S.s2!)!.click(); });
    const bascule = racine.querySelector('[data-bascule-affichage]')!;
    await cliquer([...bascule.querySelectorAll('button')].find((b) => b.textContent === 'Liste'));
    expect(racine.querySelector('.vfeed'), 'la grille reste affichée en liste').toBeNull();
    const lignes = [...racine.querySelectorAll('[data-ligne-sauvegarde]')].map((x) => x.getAttribute('data-ligne-sauvegarde'));
    expect(lignes, 'la liste ne suit pas la grille').toEqual(grille);
    expect((racine.querySelector(`[data-ligne-sauvegarde="${S.s2}"] input`) as HTMLInputElement).checked, 'la sélection se perd en liste').toBe(true);
    expect(racine.querySelector(`[data-ligne-sauvegarde="${S.s1}"]`)!.textContent).toContain('Avant / Après, Hook UGC');
    expect(document.cookie).toContain('tt_sauvegardes_affichage=liste');
    expect(document.cookie, 'la bascule des Sauvegardes renverse celle de la Veille').not.toContain('tt_veille_affichage=liste');

    // Filtrée par tag · la liste garde le filtre et l'ordre.
    h.affichage = 'liste';
    await monter(await pageSaved({ tag: 'hook ugc' }));
    expect(racine.querySelector('[data-vue-liste-sauvegardes]'), 'la préférence n’est pas relue au rendu serveur').not.toBeNull();
    expect([...racine.querySelectorAll('[data-ligne-sauvegarde]')].map((x) => x.getAttribute('data-ligne-sauvegarde'))).toEqual(grille.filter((id) => [S.s1, S.s2, S.s3].includes(id!)));
  });
});

describe('hypothèse depuis un tag récurrent', () => {
  it('/tags · « Hook UGC » (3 sauvegardes, 2 annonceurs) propose « Formuler une hypothèse », « Avant / Après » (2) ne propose rien', async () => {
    await monter((await TaggingSpatial()) as ReactElement);
    const ligne = (cle: string) => racine.querySelector(`[data-ligne-tag="${cle}"]`)!;
    expect(ligne('hook ugc').querySelector('[data-hypothese-tag]'), 'un tag récurrent ne propose rien').not.toBeNull();
    expect(ligne('avant / apres').querySelector('[data-hypothese-tag]'), 'un tag sous le seuil propose une hypothèse').toBeNull();
  });

  it('le formulaire EXISTANT s’ouvre pré-rempli · rien n’est écrit avant le clic · puis l’hypothèse est créée, reliée aux sauvegardes, et rangée dans « À formuler »', async () => {
    await monter((await TaggingSpatial()) as ReactElement);
    const avant = await nbAds();
    await cliquer(racine.querySelector('[data-ligne-tag="hook ugc"] [data-hypothese-tag] button'));
    const f = document.querySelector('[role="dialog"] form')!;
    expect(f, 'le formulaire ne s’ouvre pas').not.toBeNull();
    expect((f.querySelector('textarea[name="si"]') as HTMLTextAreaElement).value).toBe('nos pubs reprennent « Hook UGC »');
    expect((f.querySelector('textarea[name="alors"]') as HTMLTextAreaElement).value, 'le résultat attendu est inventé').toBe('');
    expect((f.querySelector('textarea[name="parceQue"]') as HTMLTextAreaElement).value).toBe('« Hook UGC » revient sur 3 pubs gardées de la Veille, chez 2 annonceurs (Ploufy, Nagette)');
    expect((f.querySelector('select[name="variable"]') as HTMLSelectElement).value).toBe('hook');
    expect(document.querySelector('[data-preuves-hypothese]')!.textContent).toBe('Preuves · 3 sauvegardes · Ploufy, Nagette, Ploufy');
    expect(await nbAds(), 'ouvrir le formulaire a écrit').toBe(avant);

    await taper(f.querySelector('textarea[name="alors"]'), 'le taux d’accroche monte');
    await cliquer([...f.querySelectorAll('button')].find((b) => b.textContent === 'Ranger dans « À formuler »'));
    expect(await nbAds(), 'l’hypothèse n’est pas créée').toBe(avant + 1);
    const [ad] = await db.select().from(schema.ads).where(and(eq(schema.ads.workspaceId, ids.wsA), eq(schema.ads.status, 'draft')));
    expect(ad!.hypothesis).toBe('Si nos pubs reprennent « Hook UGC », alors le taux d’accroche monte, parce que « Hook UGC » revient sur 3 pubs gardées de la Veille, chez 2 annonceurs (Ploufy, Nagette).');
    expect(ad!.testedVariable).toBe('hook');
    const o = lireOrigineHypothese(ad!.sourceRef);
    expect(o?.type).toBe('tag');
    expect(o?.type === 'tag' && [...o.savedAdIds].sort(), 'l’hypothèse n’est pas reliée à ses sauvegardes').toEqual([S.s1, S.s2, S.s3].sort());
    expect(o?.type === 'tag' && o.total).toBe(3);
    // Le concept est de la marque active.
    const [c] = await db.select({ brandId: schema.personas.brandId }).from(schema.concepts)
      .innerJoin(schema.angles, eq(schema.angles.id, schema.concepts.angleId)).innerJoin(schema.desires, eq(schema.desires.id, schema.angles.desireId))
      .innerJoin(schema.personas, eq(schema.personas.id, schema.desires.personaId)).where(eq(schema.concepts.id, ad!.conceptId));
    expect(c?.brandId).toBe(ids.brandA1);
    // Relu sur la vraie page Hypothèses · « À formuler », avec sa provenance.
    const page = renderToStaticMarkup(avecSpatial(await HypothesesSpatial()));
    expect(page).toContain('Veille · tag « Hook UGC » · 3 sauvegardes');
  });

  it('Sauvegardes filtrées par un tag récurrent · la proposition est là ; sous le seuil, rien', async () => {
    await monter(await pageSaved({ tag: 'hook ugc' }));
    expect(racine.querySelector('[data-proposition-tag="hook ugc"]')!.textContent).toContain('« Hook UGC » revient sur 3 sauvegardes de la marque, chez 2 annonceurs');
    await monter(await pageSaved({ tag: 'avant / apres' }));
    expect(racine.querySelector('[data-proposition-tag]'), 'sous le seuil, une proposition apparaît').toBeNull();
    await monter(await pageSaved());
    expect(racine.querySelector('[data-proposition-tag]'), 'sans filtre, une proposition apparaît').toBeNull();
  });

  it('Adsmap fermé (offre Core) · la proposition reste visible, fermée, sa raison écrite à côté', async () => {
    h.session = membre({ plan: 'core' });
    await monter((await TaggingSpatial()) as ReactElement);
    const p = racine.querySelector('[data-ligne-tag="hook ugc"] [data-hypothese-tag]')!;
    expect(p.querySelector('button')!.getAttribute('aria-disabled'), 'la proposition fermée n’est pas dite fermée').toBe('true');
    expect(p.querySelector('[data-raison-hypothese-tag]')!.textContent).toBe('Les hypothèses vivent dans Adsmap, ouvert à partir de l’offre Plus');
    await cliquer(p.querySelector('button'));
    expect(document.querySelector('[role="dialog"] form'), 'un bouton fermé ouvre le formulaire').toBeNull();
  });

  it('autre marque, autre espace, lecteur client, tag inconnu · refus, rien d’écrit, rien de l’autre marque dit', async () => {
    const saisie = { si: 'nos pubs reprennent « Hook UGC »', alors: 'ça monte', parceQue: 'forgé' };
    const avant = await nbAds();
    // A2 · son « Hook UGC » n'est que sur 1 sauvegarde · la clé seule ne suffit pas.
    h.marque = ids.brandA2;
    const r1 = await creerHypotheseAction({ source: { type: 'tag', cle: 'hook ugc' }, saisie });
    expect(r1.error, 'A2 formule une hypothèse avec les sauvegardes de A1').toBe(REFUS_TAG_NON_RECURRENT);
    await monter((await TaggingSpatial()) as ReactElement);
    expect(racine.querySelector('[data-hypothese-tag]'), 'A2 voit la proposition de A1').toBeNull();
    // Un tag de A1 sous le seuil, un tag inconnu, une clé illisible · même phrase.
    h.marque = ids.brandA1;
    for (const cle of ['avant / apres', 'inexistant', 'x'.repeat(500), 42 as unknown as string]) {
      expect((await creerHypotheseAction({ source: { type: 'tag', cle }, saisie })).error).toBe(REFUS_TAG_NON_RECURRENT);
    }
    // Espace B · récurrent chez EUX · la session A n'y touche pas, et leur session ne voit pas A.
    h.session = session(ids, 'ub', { plan: 'plus' }); h.marque = ids.brandB1;
    const rB = await creerHypotheseAction({ source: { type: 'tag', cle: 'hook ugc' }, saisie });
    expect(rB.ok, rB.error).toBe(true);
    const [adB] = await db.select().from(schema.ads).where(eq(schema.ads.workspaceId, ids.wsB));
    const oB = lireOrigineHypothese(adB!.sourceRef);
    expect(oB?.type === 'tag' && [...oB.savedAdIds].sort(), 'l’espace B cite des sauvegardes d’ailleurs').toEqual([S.b1, S.b2, S.b3].sort());
    expect(adB!.hypothesis).not.toContain('Ploufy');
    // Lecteur client de A · refusé par la garde Adsmap.
    h.session = session(ids, 'uv', { plan: 'plus' }); h.marque = ids.brandA1;
    expect((await creerHypotheseAction({ source: { type: 'tag', cle: 'hook ugc' }, saisie })).error).toBeTruthy();
    expect(await nbAds(), 'un refus a écrit').toBe(avant + 1);
  });
});
