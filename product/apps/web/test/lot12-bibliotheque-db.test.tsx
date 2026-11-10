// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 12 V5 · Bibliothèque · aperçu complet, tags à la main, références au
 * brief · au RÉSULTAT · vraie base (pglite, migrations du dépôt), VRAIES
 * actions (`definirTagsMainAssetAction`, `tagAssetAction`,
 * `verserSelectionDansProjet`, `creerProjet`), VRAIES pages (`/assets`,
 * `/studio/projets/nouveau`) montées dans le DOM · on clique, on tape des
 * touches, on lit le DOM ET la base.
 *
 *  · tags · posés à la main → relus en base et à l'écran, filtrables par la
 *    barre · une analyse garde la main et le marqueur · autre espace, lecteur,
 *    plus de 10 tags · refus, rien d'écrit ;
 *  · aperçu complet · grand format, métadonnées (dimensions lues à
 *    l'affichage), précédent / suivant dans la liste FILTRÉE, bornes dites,
 *    flèches jamais volées à la saisie, focus rendu à la fermeture ;
 *  · « Ajouter au brief » · projet existant (la fenêtre de versement) et
 *    assistant (`?media=`) · références écrites dans le projet, autre marque
 *    refusée sans fuite ;
 *  · aucune adresse brute du stockage à l'écran · aucun crédit hors l'analyse
 *    payante déjà existante (simulée ici, aucun modèle appelé).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, vision: 0, reservations: 0 }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
const CFG = vi.hoisted(() => ({ endpoint: 's3.lot12.test', region: 'gra', bucket: 'tt-prive', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://adresse-brute.stockage.test/tt-prive' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
// Marque active · le VRAI `getActiveBrand` (qui vérifie l'espace), cookie posé sur A1.
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (k === 'tt_brand' ? { value: h.ids.brandA1 } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {}, unstable_cache: (f: unknown) => f }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/assets', useParams: () => ({}),
}));
vi.mock('../lib/studios/bibliotheque', () => ({ listerSortiesStudiosBibliotheque: async () => [], sortieCommeAsset: (x: unknown) => x }));
vi.mock('../lib/creations-historiques', () => ({ listerCreationsHistoriques: async () => [], creationCommeAsset: (x: unknown) => x }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));
vi.mock('../lib/jarvis-memory', () => ({ invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }) }));
// Aucune dépense · le client IA est factice, la vision compte ses appels, la réservation de crédits aussi.
vi.mock('../lib/spend-guard', async (o) => ({ ...(await o<typeof import('../lib/spend-guard')>()), guardedAnthropic: () => ({}), spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));
vi.mock('@tiktrends/ai', async (o) => ({ ...(await o<typeof import('@tiktrends/ai')>()), describeAssetImage: async () => { h.vision++; return { tags: ['soleil', '__main__:faux', '__template__'] }; } }));
vi.mock('../lib/credits', async (o) => ({ ...(await o<typeof import('../lib/credits')>()), unlimitedCredits: () => false, reserveCredits: async () => { h.reservations++; return true; }, refundCredits: async () => {} }));
vi.mock('@tiktrends/integrations', async (o) => ({ ...(await o<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));

import { db, schema, eq, sql } from '@tiktrends/db';
import { PREFIXE_TAG_MAIN, REFUS_FICHIER, TAG_TEMPLATE, type BriefCanonique, type ContenuVersion } from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { definirTagsMainAssetAction, tagAssetAction } from '../app/actions/assets';
import { verserSelectionDansProjet } from '../app/actions/studios/versement';
import { TEXTE_REFUS_BIBLIOTHEQUE } from '../lib/bibliotheque-acces';
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import NouveauProjetSpatial from '../app/(spatial)/sp/studio/projets/nouveau/page';
import { semerCatalogue, projetStatique } from './l5c-outils';
import { avecSpatial } from './spatial/fournisseur';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ids = h.ids;
const A: Record<'flacon' | 'tube' | 'pot' | 'rush' | 'bucket' | 'autreMarque' | 'autreEspace', string> = {} as never;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const membre = () => session(ids, 'ua', { plan: 'plus' });
const inserer = async (name: string, o: Partial<typeof schema.assets.$inferInsert> = {}) => {
  const [r] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name, kind: 'image', source: 'upload', url: PNG, mimeType: 'image/png', rights: 'photo_marque', sizeBytes: 2048, createdAt: new Date('2026-10-12T09:00:00Z'), ...o }).returning({ id: schema.assets.id });
  return r!.id;
};
const colonne = async (id: string) => (await db.select({ t: schema.assets.tags }).from(schema.assets).where(eq(schema.assets.id, id)))[0]!.t;
async function empreinte(): Promise<string> {
  const r = await db.execute(sql.raw('select count(*)::int as n, md5(coalesce(string_agg(md5(x::text), \',\' order by md5(x::text)), \'\')) as h from public."assets" x'));
  const [l] = (r as unknown as { rows: Array<{ n: number; h: string }> }).rows;
  return `${l!.n}|${l!.h}`;
}
let projetExistant = '';
const refs = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, p!.currentVersionId!));
  return ((v!.content as ContenuVersion).brief as unknown as BriefCanonique).references;
};

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus' });
  const cat = await semerCatalogue(db, ids);
  projetExistant = (await projetStatique(db, ids, cat)).projectId;
  A.flacon = await inserer('flacon.png', { tags: ['plage', TAG_TEMPLATE] });
  A.tube = await inserer('tube.png');
  A.pot = await inserer('pot.png', { brandId: null, rights: 'ugc_accord' });
  A.rush = await inserer('rush.mp4', { kind: 'video', mimeType: 'video/mp4', url: 'data:video/mp4;base64,AAAA' });
  A.bucket = await inserer('bucket.png', { url: `${CFG.publicBaseUrl}/${ids.wsA}/assets/bucket.png` });
  A.autreMarque = await inserer('secret-a2.png', { brandId: ids.brandA2 });
  A.autreEspace = await inserer('secret-b.png', { workspaceId: ids.wsB, brandId: ids.brandB1 });
  // Le vocabulaire de la Veille de la marque A1 · proposé à la saisie, jamais écrit depuis la Bibliothèque.
  await db.insert(schema.veilleTags).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'Avant / Après', nameKey: 'avant / apres' });
  h.session = membre();
});

let root: Root | null = null; let hote: HTMLDivElement | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; hote?.remove(); hote = null; document.body.innerHTML = ''; h.session = membre(); });
const attendre = async (ms = 20) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const attendreQue = async (cond: () => boolean | Promise<boolean>) => { for (let i = 0; i < 150 && !(await cond()); i++) await attendre(); };
async function monter(el: ReactElement) {
  if (root) act(() => root!.unmount());
  hote?.remove();
  hote = document.createElement('div'); document.body.appendChild(hote); root = createRoot(hote);
  await act(async () => { root!.render(avecSpatial(el)); });
  await attendre();
  return hote;
}
const biblio = async () => (await BibliothequeSpatiale({ searchParams: Promise.resolve({}) })) as ReactElement;
const cliquer = async (e: Element | null | undefined) => { if (!e) throw new Error('élément absent'); await act(async () => { (e as HTMLElement).click(); }); await attendre(); };
const choisir = async (el: Element | null | undefined, v: string) => {
  if (!el) throw new Error('menu absent');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await attendre();
};
const taper = async (el: Element | null | undefined, v: string) => {
  if (!el) throw new Error('champ absent');
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const touche = async (key: string, cible: EventTarget = document.body) => { await act(async () => { cible.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); await attendre(); };
const fichiersAffiches = (d: ParentNode) => [...d.querySelectorAll('.dfiles .dcard .nm')].map((x) => x.textContent);
const modal = () => document.querySelector<HTMLElement>('[data-apercu-complet]');
const ouvrirComplet = async (d: ParentNode, nom: string) => {
  await cliquer(d.querySelector(`button.dopen[aria-label="Aperçu de ${nom}"]`));
  await cliquer(d.querySelector('[data-ouvrir-apercu-complet]'));
  expect(modal(), 'l’aperçu complet ne s’ouvre pas').not.toBeNull();
};

describe('tags posés à la main · action réelle, relus en base et à l’écran', () => {
  it('poser · la liste écrite à côté des tags IA et du marqueur · les doublons de casse et d’espaces fusionnés', async () => {
    expect(await definirTagsMainAssetAction({ id: A.flacon, tags: ['Hook UGC', 'hook  ugc', 'Packshot'] })).toEqual({ ok: true, main: ['Hook UGC', 'Packshot'], ia: ['plage'] });
    expect(await colonne(A.flacon)).toEqual(['plage', TAG_TEMPLATE, `${PREFIXE_TAG_MAIN}Hook UGC`, `${PREFIXE_TAG_MAIN}Packshot`]);
    expect(await definirTagsMainAssetAction({ id: A.tube.toUpperCase(), tags: ['Hook UGC'] })).toEqual({ ok: true, main: ['Hook UGC'], ia: [] });
    expect(h.reservations, 'poser un tag à la main a réservé un crédit').toBe(0);
    expect(h.vision, 'poser un tag à la main a appelé le modèle').toBe(0);
  });

  it('une nouvelle analyse (payante, simulée) remplace les tags IA et GARDE la main et le marqueur · le modèle ne pose ni l’un ni l’autre', async () => {
    expect(await tagAssetAction({ id: A.flacon })).toMatchObject({ ok: true });
    expect(await colonne(A.flacon)).toEqual(['soleil', 'faux', `${PREFIXE_TAG_MAIN}Hook UGC`, `${PREFIXE_TAG_MAIN}Packshot`, TAG_TEMPLATE]);
    expect(h.vision).toBe(1);
  });

  it('refus · autre espace, inconnu, corbeille, plus de 10 tags, lecteur client · même phrase, rien d’écrit', async () => {
    const avant = await empreinte();
    expect(await definirTagsMainAssetAction({ id: A.autreEspace, tags: ['x'] })).toEqual({ error: REFUS_FICHIER.introuvable });
    expect(await definirTagsMainAssetAction({ id: 'pas-un-id', tags: ['x'] })).toEqual({ error: REFUS_FICHIER.introuvable });
    expect(await definirTagsMainAssetAction({ id: A.flacon, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).toEqual({ error: '10 tags au plus par fichier · retire-en 1.' });
    h.session = session(ids, 'uv');
    expect(await definirTagsMainAssetAction({ id: A.flacon, tags: ['x'] })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE.role });
    expect(await empreinte(), 'un refus a écrit').toBe(avant);
  });

  it('la vraie page · le menu « Tags » de la barre les compte, filtrer ne garde que les fichiers tagués · aucun tag d’une autre marque', async () => {
    const d = await monter(await biblio());
    const menu = d.querySelector<HTMLSelectElement>('[data-filtre-tags] select')!;
    expect(menu, 'le filtre « Tags » est absent de la barre').not.toBeNull();
    expect([...menu.options].map((o) => o.textContent)).toEqual(['Tous les tags', 'faux · 1', 'Hook UGC · 2', 'Packshot · 1', 'soleil · 1']);
    // « Coureuse de face » · l'image du catalogue semé (sans tag).
    expect(fichiersAffiches(d)).toEqual(['bucket.png', 'Coureuse de face', 'flacon.png', 'pot.png', 'rush.mp4', 'tube.png']);
    await choisir(menu, 'hook ugc');
    expect(fichiersAffiches(d), 'le filtre ne garde pas les fichiers tagués à la main').toEqual(['flacon.png', 'tube.png']);
    expect(d.textContent).not.toContain('secret-a2');
  });
});

describe('aperçu complet · la vraie page montée', () => {
  it('grand format, métadonnées, précédent / suivant dans la liste FILTRÉE, bornes dites, focus rendu à la fermeture', async () => {
    const d = await monter(await biblio());
    await choisir(d.querySelector('[data-filtre-tags] select'), 'hook ugc');
    await ouvrirComplet(d, 'flacon.png');
    const m = modal()!;
    expect(m.getAttribute('role')).toBe('dialog');
    expect(document.activeElement, 'le focus ne va pas à la croix').toBe(m.querySelector('[data-fermer-apercu]'));
    expect(m.querySelector('[data-position-apercu]')!.textContent).toBe('Fichier 1 sur 2 · Premier fichier de la liste');
    expect(m.querySelector('[data-nav-apercu="precedente"]')!.getAttribute('aria-disabled')).toBe('true');
    const meta = () => Object.fromEntries([...modal()!.querySelectorAll('[data-meta]')].map((x) => [x.getAttribute('data-meta'), x.textContent]));
    expect(meta()).toMatchObject({ type: 'Image', dimensions: 'Lues à l’affichage…', poids: '2 Ko', ajoute: '12 octobre 2026', droits: 'Photo de la marque', dossier: 'Assets de la marque' });
    const img = m.querySelector('img')!;
    Object.defineProperty(img, 'naturalWidth', { value: 1080, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 1350, configurable: true });
    await act(async () => { img.dispatchEvent(new Event('load')); });
    expect(meta().dimensions, 'les dimensions ne sont pas lues à l’affichage').toBe('1 080 × 1 350 px');

    await touche('ArrowRight');
    expect(modal()!.getAttribute('data-apercu-complet'), '→ ne passe pas au fichier suivant de la liste filtrée').toBe(A.tube);
    expect(modal()!.querySelector('[data-position-apercu]')!.textContent).toBe('Fichier 2 sur 2 · Dernier fichier de la liste');
    expect(meta().dimensions, 'les dimensions du fichier précédent restent affichées').toBe('Lues à l’affichage…');
    await touche('ArrowRight');
    expect(modal()!.getAttribute('data-apercu-complet'), 'la navigation boucle au-delà de la borne').toBe(A.tube);
    // Une flèche dans le champ de tag appartient à la saisie.
    const champ = modal()!.querySelector<HTMLInputElement>('[data-geste="tags-main"] input')!;
    champ.focus();
    await touche('ArrowLeft', champ);
    expect(modal()!.getAttribute('data-apercu-complet'), 'la flèche est volée au champ de saisie').toBe(A.tube);
    await cliquer(modal()!.querySelector('[data-nav-apercu="precedente"]'));
    expect(modal()!.getAttribute('data-apercu-complet')).toBe(A.flacon);

    // Fond et zoom.
    await cliquer([...modal()!.querySelectorAll('[data-zoom-apercu] button')].find((b) => b.textContent === 'Taille réelle'));
    await cliquer([...modal()!.querySelectorAll('[data-fond-apercu] button')].find((b) => b.textContent === 'Fond inversé'));
    expect(modal()!.querySelector('[data-scene-apercu]')!.getAttribute('data-zoom')).toBe('reel');
    expect(modal()!.querySelector('[data-scene-apercu]')!.getAttribute('data-scene-apercu')).toBe('inverse');

    await touche('Escape');
    expect(modal(), 'Échap ne ferme pas l’aperçu complet').toBeNull();
    await attendre();
    expect(document.activeElement, 'le focus n’est pas rendu au bouton qui a ouvert l’aperçu').toBe(d.querySelector('[data-ouvrir-apercu-complet]'));
    expect(d.querySelector('.dprev strong')!.textContent, 'le panneau ne suit pas le fichier parcouru').toBe('flacon.png');
  });

  it('un tag posé dans l’aperçu complet (action réelle) · relu en base, puis filtrable sur la page relue · le vocabulaire de la Veille est proposé', async () => {
    let d = await monter(await biblio());
    await ouvrirComplet(d, 'pot.png');
    const zone = modal()!.querySelector('[data-geste="tags-main"]')!;
    expect([...zone.querySelectorAll('datalist option')].map((o) => o.getAttribute('value')), 'le vocabulaire de la Veille n’est pas proposé').toEqual(['Avant / Après']);
    await taper(zone.querySelector('input'), '  Été  ');
    await act(async () => { zone.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await attendreQue(async () => ((await colonne(A.pot)) ?? []).length > 0);
    expect(await colonne(A.pot)).toEqual([`${PREFIXE_TAG_MAIN}Été`]);
    expect([...modal()!.querySelectorAll('[data-tag-main]')].map((x) => x.getAttribute('data-tag-main'))).toEqual(['Été']);
    // Retirer · le × du tag.
    await cliquer(modal()!.querySelector('[data-retirer-tag="Été"]'));
    await attendreQue(async () => ((await colonne(A.pot)) ?? []).length === 0);
    expect(await colonne(A.pot)).toEqual([]);
    await definirTagsMainAssetAction({ id: A.pot, tags: ['Été'] });
    d = await monter(await biblio());
    await choisir(d.querySelector('[data-filtre-tags] select'), 'ete');
    expect(fichiersAffiches(d)).toEqual(['pot.png']);
    expect(await db.select().from(schema.veilleTags).then((l) => l.length), 'un tag de Veille a été créé depuis la Bibliothèque').toBe(1);
  });

  it('le × d’un tag IA (action réelle) · seul ce tag IA part · la main et le marqueur restent', async () => {
    const d = await monter(await biblio());
    await ouvrirComplet(d, 'flacon.png');
    expect([...modal()!.querySelectorAll('[data-tag-ia]')].map((x) => x.getAttribute('data-tag-ia'))).toEqual(['soleil', 'faux']);
    await cliquer(modal()!.querySelector('[data-retirer-tag-ia="faux"]'));
    await attendreQue(async () => !((await colonne(A.flacon)) ?? []).includes('faux'));
    expect(await colonne(A.flacon), 'le × d’un tag IA n’a pas retiré CE tag seul').toEqual(['soleil', TAG_TEMPLATE, `${PREFIXE_TAG_MAIN}Hook UGC`, `${PREFIXE_TAG_MAIN}Packshot`]);
    expect([...modal()!.querySelectorAll('[data-tag-ia]')].map((x) => x.getAttribute('data-tag-ia'))).toEqual(['soleil']);
  });

  it('aucune adresse brute du stockage · l’image en grand passe par le proxy gardé', async () => {
    const d = await monter(await biblio());
    await ouvrirComplet(d, 'bucket.png');
    expect(modal()!.querySelector('img')!.getAttribute('src')).toMatch(/^\/api\/asset[/?]/);
    expect(document.body.innerHTML).not.toContain('adresse-brute.stockage.test');
  });
});

describe('« Ajouter au brief » · projet existant et assistant', () => {
  it('fermé pour une vidéo, la raison écrite à côté · ouvert pour une image, l’assistant armé de CE fichier', async () => {
    const d = await monter(await biblio());
    await ouvrirComplet(d, 'rush.mp4');
    expect(modal()!.querySelector('[data-raison-brief]')!.textContent).toBe('Pas une image · les références d’un projet sont des images.');
    expect(modal()!.querySelector('[data-geste="brief-existant"]')!.getAttribute('aria-disabled')).toBe('true');
    expect(modal()!.querySelector('[data-raison-reglages]'), 'une vidéo ferme le fond et le zoom').toBeNull();
    await touche('Escape');
    await ouvrirComplet(d, 'flacon.png');
    expect(modal()!.querySelector('[data-geste="brief-nouveau"]')!.getAttribute('href')).toBe(`/studio/projets/nouveau?type=ads&media=${A.flacon}`);
  });

  it('« Dans un projet existant » · la fenêtre de versement s’ouvre sur CE fichier · la référence est écrite dans le projet', async () => {
    const d = await monter(await biblio());
    await ouvrirComplet(d, 'flacon.png');
    await cliquer(modal()!.querySelector('[data-geste="brief-existant"]'));
    expect(modal(), 'l’aperçu complet reste ouvert sous la fenêtre').toBeNull();
    await attendreQue(() => !!document.querySelector('select[data-versement="projet"] option[value]:not([value=""])'));
    expect(document.querySelector('[data-versement="phrase"]')!.textContent).toBe('1 image deviendra une référence du projet.');
    await choisir(document.querySelector('select[data-versement="projet"]'), projetExistant);
    await choisir(document.querySelector('select[data-versement="role"]'), 'style');
    await choisir(document.querySelector('select[data-versement="portee"]'), 'global');
    await cliquer(document.querySelector('[data-versement="verser"]'));
    await attendreQue(() => !!document.querySelector('[data-versement="succes"]'));
    expect(JSON.stringify(await refs(projetExistant)), 'le fichier n’est pas devenu une référence du projet').toContain(A.flacon);
  });

  it('autre marque · le versement est refusé, rien n’est écrit', async () => {
    const avant = JSON.stringify(await refs(projetExistant));
    const r = await verserSelectionDansProjet({ projectId: projetExistant, ids: [A.autreMarque], role: 'style', scope: 'global' });
    expect(r).toMatchObject({ ok: false, violations: [{ raison: '« secret-a2.png » appartient à une autre marque que le projet.' }] });
    expect(JSON.stringify(await refs(projetExistant))).toBe(avant);
  });

  it('l’assistant · seuls les fichiers de la marque active sont proposés, l’écart est dit sans nom · sans rôle rien n’est créé · avec rôle et portée, la référence est dans le projet créé', async () => {
    const sp = { type: 'ads', media: [A.flacon, A.autreMarque, A.autreEspace] };
    const html = renderToStaticMarkup(avecSpatial(await NouveauProjetSpatial({ searchParams: Promise.resolve(sp) })));
    expect(html).not.toContain('secret-a2');
    expect(html).not.toContain('secret-b');
    expect(html).toContain('2 fichiers de la Bibliothèque de ce lien ne sont pas repris');

    const orn = document.createElement('div'); orn.id = 'orn'; orn.hidden = true; document.body.appendChild(orn);
    const d = await monter(await NouveauProjetSpatial({ searchParams: Promise.resolve(sp) }));
    expect([...d.querySelectorAll('[data-media-brief]')].map((x) => x.getAttribute('data-media-brief'))).toEqual([A.flacon]);
    await taper(d.querySelector('[data-champ="intention"]'), 'Tester le flacon en plein soleil');
    const projets = async () => db.select({ id: schema.studioProjects.id }).from(schema.studioProjects).where(eq(schema.studioProjects.brandId, ids.brandA1));
    const avant = (await projets()).length;
    await cliquer(document.querySelector('[data-bouton="creer-projet"]'));
    expect(document.querySelector('[data-etat="erreur"]')?.textContent ?? '', 'le manque de rôle n’est pas dit avant la création').toContain('Références de la Bibliothèque · Choisis un rôle');
    expect((await projets()).length, 'un projet a été créé sans rôle choisi').toBe(avant);

    await choisir(d.querySelector('select[data-champ="role-media"]'), 'style');
    await choisir(d.querySelector('select[data-champ="portee-media"]'), 'global');
    await cliquer(document.querySelector('[data-bouton="creer-projet"]'));
    await attendreQue(async () => (await projets()).length === avant + 1);
    const nouveaux = (await projets()).map((p) => p.id).filter((x) => x !== projetExistant);
    await attendreQue(async () => JSON.stringify(await refs(nouveaux[0]!)).includes(A.flacon));
    expect(JSON.stringify(await refs(nouveaux[0]!)), 'la référence de la Bibliothèque n’est pas dans le projet créé').toContain(A.flacon);
    expect(JSON.stringify(await refs(nouveaux[0]!))).not.toContain(A.autreMarque);
    expect(h.vision, 'l’assistant a appelé un modèle').toBe(1);
  });
});
