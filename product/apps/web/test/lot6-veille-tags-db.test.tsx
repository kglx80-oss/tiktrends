// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { and, eq } from 'drizzle-orm';

/**
 * Lot 6 V5 · Veille · tags, note et pop-up « Sauvegarder », sur une VRAIE base
 * (pglite, migrations réelles, 0070 comprise), avec les VRAIES actions
 * (`saveAd`, `majSauvegarde`, `lireSauvegardeVeille`, `creerTagVeille`,
 * `renommerTagVeille`) et les VRAIES pages montées dans le DOM (« Pubs du
 * moment », Sauvegardes, Tagging). On clique, on tape, on lit le DOM ET la
 * base · jamais « une fonction est appelée quelque part ».
 *
 *  · sauvegarder depuis la pop-up (tag, note, collections) → relu sur la
 *    carte, dans le détail, dans les Sauvegardes et dans `/tags` ;
 *  · « Hook UGC » et « hook  ugc » sont UN tag (une ligne de vocabulaire) ;
 *  · le filtre « Tags » des pubs chargées ne garde que les pubs attendues ;
 *  · retirer un tag n'efface ni la sauvegarde ni la note ;
 *  · autre marque, autre espace, lecteur client → refus, rien d'écrit, rien
 *    de l'autre marque n'est lu.
 * Aucun réseau (la source est remplacée par quatre pubs fixes · la page, ses
 * gardes et ses lectures restent les vraies), aucun modèle, 0 $.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsA: randomUUID(), wsB: randomUUID(), marqueX: randomUUID(), marqueY: randomUUID(), marqueB: randomUUID(), user: randomUUID(), userB: randomUUID() };
});
const session = vi.hoisted(() => ({ plan: 'core' as string, role: 'member' as string, marque: 'X' as 'X' | 'Y' | 'B' | null, ws: 'A' as 'A' | 'B' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: session.ws === 'A' ? { id: ids.user, email: 'membre@agence-a.test', name: 'Membre' } : { id: ids.userB, email: 'membre@agence-b.test', name: 'Autre' },
    workspaceId: session.ws === 'A' ? ids.wsA : ids.wsB, workspaceName: 'Agence', role: session.role, plan: session.plan, equipe: null,
  }),
}));
vi.mock('../lib/brands', async (orig) => ({
  ...(await orig<typeof import('../lib/brands')>()),
  getActiveBrand: async () => (session.marque === null ? null
    : session.marque === 'X' ? { id: ids.marqueX, name: 'Marque X', workspaceId: ids.wsA }
      : session.marque === 'Y' ? { id: ids.marqueY, name: 'Marque Y', workspaceId: ids.wsA } : { id: ids.marqueB, name: 'Marque B', workspaceId: ids.wsB }),
}));
vi.mock('../lib/veille-recette-base', () => ({ baseUrlRecette: () => undefined, cleEffective: () => 'cle-de-test' }));
const SOURCE = vi.hoisted(() => {
  const pub = (i: number) => ({ id: `lot6-${i}`, platform: 'meta', status: 'active', daysRunning: 10 + i, mediaType: 'image', advertiserName: `Annonceur ${i}`, body: `Texte de la pub ${i}`, callToAction: 'Acheter' });
  return [pub(0), pub(1), pub(2), pub(3)];
});
// La source d'annonces · quatre pubs fixes, aucun appel réseau.
vi.mock('@tiktrends/integrations', async (orig) => ({
  ...(await orig<typeof import('@tiktrends/integrations')>()),
  ttSearchAds: async () => ({ ads: SOURCE, total: SOURCE.length }),
}));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/veille',
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));

import { db, schema } from '@tiktrends/db';
import type { InspoAd } from '@tiktrends/integrations';
import { creerTagVeille, lireSauvegardeVeille, majSauvegarde, renommerTagVeille, saveAd, setSavedAdFolder } from '../app/actions/inspo';
import VeilleSpatiale from '../app/(spatial)/sp/veille/page';
import SauvegardesSpatiales from '../app/(spatial)/sp/saved/page';
import TaggingSpatial from '../app/(spatial)/sp/tags/page';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

const toasts: string[] = [];
const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m) => { toasts.push(m); } };

const [A0, A1, A2] = SOURCE as unknown as [InspoAd, InspoAd, InspoAd];

let racine: HTMLDivElement; let root: Root;
beforeEach(() => {
  session.plan = 'core'; session.role = 'member'; session.marque = 'X'; session.ws = 'A';
  window.history.replaceState(null, '', '/veille?q=piscine');
  racine = document.createElement('div'); document.body.appendChild(racine); root = createRoot(racine); toasts.length = 0;
});
afterEach(() => { act(() => root.unmount()); racine.remove(); document.body.innerHTML = ''; });

beforeAll(async () => {
  await db!.insert(schema.users).values([{ id: ids.user, email: 'membre@agence-a.test', name: 'Membre' }, { id: ids.userB, email: 'membre@agence-b.test', name: 'Autre' }]);
  await db!.insert(schema.workspaces).values([{ id: ids.wsA, name: 'Agence A', plan: 'core' }, { id: ids.wsB, name: 'Agence B', plan: 'core' }]);
  await db!.insert(schema.workspaceMembers).values([{ workspaceId: ids.wsA, userId: ids.user, role: 'member' }, { workspaceId: ids.wsB, userId: ids.userB, role: 'member' }]);
  await db!.insert(schema.brands).values([{ id: ids.marqueX, workspaceId: ids.wsA, name: 'Marque X' }, { id: ids.marqueY, workspaceId: ids.wsA, name: 'Marque Y' }, { id: ids.marqueB, workspaceId: ids.wsB, name: 'Marque B' }]);
});

// Chaque rendu de page est une NOUVELLE visite · l'arbre d'avant est démonté (comme une navigation vers une autre adresse).
const monter = async (el: ReactElement) => {
  act(() => root.unmount()); root = createRoot(racine);
  await act(async () => { root.render(<FournisseurSpatial value={CTX}>{el}</FournisseurSpatial>); });
  await attendre();
};
const pageVeille = async (sp: Record<string, string> = { q: 'piscine' }) => (await VeilleSpatiale({ searchParams: Promise.resolve(sp) })) as ReactElement;
const pageSaved = async (sp: Record<string, string> = {}) => (await SauvegardesSpatiales({ searchParams: Promise.resolve(sp) })) as ReactElement;
const attendre = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const cliquer = async (e: Element | null | undefined) => { if (!e) throw new Error('élément absent'); await act(async () => { (e as HTMLElement).click(); }); await attendre(); };
const taper = async (el: Element | null | undefined, v: string) => {
  if (!el) throw new Error('champ absent');
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const entree = async (el: Element | null | undefined) => { await act(async () => { el!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }); };
const choisir = async (el: Element | null | undefined, v: string) => {
  if (!el) throw new Error('menu absent');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); });
};
const bouton = (texte: string, dans: ParentNode = document) => [...dans.querySelectorAll('button')].find((b) => b.textContent?.includes(texte));
const popup = () => document.querySelector('[data-popup-sauvegarde]');
const carte = (ad: InspoAd) => [...racine.querySelectorAll('.xgrid article.xa')].find((a) => a.querySelector('.xn strong')?.textContent === (ad.advertiserName?.trim() || 'Annonceur') && a.querySelector('.xp')?.textContent === (ad.body?.trim() ?? ''));
const tagsDe = (el: Element | null | undefined) => [...(el?.querySelectorAll('[data-tags-carte] .pill') ?? [])].map((p) => p.textContent);

const ligneSauvegarde = async (ws: string, ext: string) => (await db!.select().from(schema.savedAds).where(and(eq(schema.savedAds.workspaceId, ws), eq(schema.savedAds.externalId, ext))))[0];
const tagsEnBase = async (savedAdId: string) => (await db!.select({ nom: schema.veilleTags.name, cle: schema.veilleTags.nameKey }).from(schema.veilleTagsSauvegardes)
  .innerJoin(schema.veilleTags, eq(schema.veilleTags.id, schema.veilleTagsSauvegardes.tagId)).where(eq(schema.veilleTagsSauvegardes.savedAdId, savedAdId))).map((t) => t.nom).sort();
const vocabulaire = async (brandId: string | null) => (await db!.select({ nom: schema.veilleTags.name, cle: schema.veilleTags.nameKey }).from(schema.veilleTags)
  .where(and(eq(schema.veilleTags.workspaceId, session.ws === 'A' ? ids.wsA : ids.wsB), brandId ? eq(schema.veilleTags.brandId, brandId) : undefined)));

describe('la pop-up « Sauvegarder » · tags, note, collections en UNE action, relus partout', () => {
  it('signet → pop-up → tag, note, collection → « Sauvegarder » · écrit en base, la carte montre le tag aussitôt · Échap ferme et rend le focus au signet', async () => {
    await monter(await pageVeille());
    const c0 = carte(A0);
    expect(c0, 'la carte de la première pub n’est pas rendue').toBeTruthy();
    const signet = c0!.querySelector('button.xi') as HTMLButtonElement;
    expect(signet.getAttribute('aria-pressed')).toBe('false');

    // Échap ferme sans rien écrire, et le focus revient au signet.
    await act(async () => { signet.focus(); });
    await cliquer(signet);
    expect(popup(), 'le signet n’ouvre pas la pop-up').not.toBeNull();
    expect(document.activeElement?.closest('[data-popup-sauvegarde]'), 'le focus n’entre pas dans la pop-up').not.toBeNull();
    expect(popup()!.textContent).toContain(A0.advertiserName!.trim());
    expect(popup()!.querySelector('[data-mention-conservation]')?.textContent).toBe('La source, la plateforme et la date de sauvegarde sont conservées · la source ne donne pas les dates de diffusion.');
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(popup(), 'Échap ne ferme pas la pop-up').toBeNull();
    expect(document.activeElement, 'le focus n’est pas rendu au signet').toBe(signet);
    expect(await ligneSauvegarde(ids.wsA, A0.id), 'Échap a sauvegardé').toBeUndefined();

    await cliquer(signet);
    const p = popup()!;
    await taper(p.querySelector('[data-champ="tags"] input'), 'Hook UGC');
    await entree(p.querySelector('[data-champ="tags"] input'));
    expect([...p.querySelectorAll('[data-tags-choisis] button')].map((b) => b.textContent)).toEqual(['Hook UGC']);
    await taper(p.querySelector('textarea'), 'Le hook tient trois secondes');
    await taper(p.querySelector('[data-champ="collections"] input[aria-label]'), 'Inspirations été');
    await cliquer(bouton('Créer', p));
    await taper(p.querySelector('[data-champ="collections"] input[aria-label]'), 'Hooks');
    await cliquer(bouton('Créer', p));
    await cliquer(p.querySelector('[data-envoyer-sauvegarde]'));

    expect(popup(), 'la pop-up reste ouverte après le oui').toBeNull();
    const l = await ligneSauvegarde(ids.wsA, A0.id);
    expect(l, 'la sauvegarde n’est pas écrite').toBeDefined();
    expect(l!.brandId).toBe(ids.marqueX);
    expect(l!.note).toBe('Le hook tient trois secondes');
    expect(l!.folder, 'le dossier n’est pas la première collection').toBe('Inspirations été');
    expect(await tagsEnBase(l!.id), 'le tag n’est pas posé sur la sauvegarde').toEqual(['Hook UGC']);
    expect((await vocabulaire(ids.marqueX)).map((t) => t.cle), 'la clé du tag n’est pas sa forme normalisée').toEqual(['hook ugc']);
    expect(toasts.at(-1), 'le message ne dit pas ce qui a été gardé').toBe('Pub gardée dans tes sauvegardes · 1 tag, 2 collections, une note');
    const colls = await db!.select({ n: schema.savedAdCollections.name }).from(schema.savedAdCollections).where(eq(schema.savedAdCollections.savedAdId, l!.id));
    expect(colls.map((x) => x.n).sort()).toEqual(['Hooks', 'Inspirations été']);
    // La carte · signet plein et pastille du tag, sans recharger.
    expect(carte(A0)!.querySelector('button.xi')!.getAttribute('aria-pressed')).toBe('true');
    expect(tagsDe(carte(A0)), 'la carte ne montre pas le tag après le oui').toEqual(['Hook UGC']);
  });

  it('« hook  ugc » sur une deuxième pub · le MÊME tag (une ligne de vocabulaire, libellé d’origine) · relu sur la carte au rendu suivant', async () => {
    const r = await saveAd({ platform: A1.platform, externalId: A1.id, snapshot: A1, tags: ['hook  ugc', 'Prix barré'] });
    expect(r.ok, r.error).toBe(true);
    expect(r.sauvegarde?.tags).toEqual([{ cle: 'hook ugc', nom: 'Hook UGC' }, { cle: 'prix barre', nom: 'Prix barré' }]);
    const voc = await vocabulaire(ids.marqueX);
    expect(voc.filter((t) => t.cle === 'hook ugc'), '« hook  ugc » a créé un doublon').toEqual([{ nom: 'Hook UGC', cle: 'hook ugc' }]);
    await saveAd({ platform: A2.platform, externalId: A2.id, snapshot: A2 });
    await monter(await pageVeille());
    expect(tagsDe(carte(A0))).toEqual(['Hook UGC']);
    expect(tagsDe(carte(A1))).toEqual(['Hook UGC', 'Prix barré']);
    expect(carte(A2)!.querySelector('[data-tags-carte]'), 'une pub sans tag montre une rangée de tags').toBeNull();
  });

  it('le détail (VB F15) montre les tags de la sauvegarde · « Ajouter » rouvre la pop-up en « Mettre à jour », note et collections relues', async () => {
    await monter(await pageVeille());
    await cliquer(carte(A0)!.querySelector('button.xv'));
    const d = document.querySelector('.xmod[role="dialog"]')!;
    expect([...d.querySelectorAll('[data-tags-detail] .pill')].map((x) => x.textContent)).toEqual(['Hook UGC']);
    await cliquer(bouton('Ajouter', d.querySelector('[data-tags-detail]')!));
    const p = popup()!;
    expect(p.querySelector('[data-envoyer-sauvegarde]')!.textContent).toContain('Mettre à jour');
    expect((p.querySelector('textarea') as HTMLTextAreaElement).value, 'la note n’est pas relue').toBe('Le hook tient trois secondes');
    const cochees = [...p.querySelectorAll('[data-champ="collections"] input[type="checkbox"]')].filter((x) => (x as HTMLInputElement).checked).map((x) => x.parentElement!.textContent);
    expect(cochees.sort()).toEqual(['Hooks', 'Inspirations été']);
    // Échap ne ferme QUE la pop-up · le détail reste ouvert.
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(popup()).toBeNull();
    expect(document.querySelector('.xmod[role="dialog"]'), 'Échap dans la pop-up a fermé le détail').not.toBeNull();
  });
});

describe('la pop-up · focus piégé', () => {
  it('Tab sur le dernier élément revient au premier, Maj+Tab sur le premier va au dernier · le focus ne sort jamais', async () => {
    await monter(await pageVeille());
    await cliquer(carte(A1)!.querySelector('button.xi'));
    const dialogue = popup()!.querySelector('[role="dialog"]')!;
    const f = [...dialogue.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
    expect(f.length).toBeGreaterThan(3);
    const premier = f[0]!; const dernier = f[f.length - 1]!;
    await act(async () => { dernier.focus(); dernier.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); });
    expect(document.activeElement, 'Tab sort de la pop-up').toBe(premier);
    await act(async () => { premier.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })); });
    expect(document.activeElement, 'Maj+Tab sort de la pop-up').toBe(dernier);
  });
});

describe('filtre « Tags » (VB V20) · barre des filtres locaux du lot 7', () => {
  it('« Hook UGC » ne garde que les deux pubs taguées · la puce dit le libellé · l’adresse garde la clé · Réinitialiser rend tout', async () => {
    await monter(await pageVeille());
    const toutes = racine.querySelectorAll('.xgrid article.xa').length;
    expect(toutes).toBeGreaterThan(2);
    const menu = racine.querySelector('[data-filtre-local="Tags"] select') as HTMLSelectElement;
    expect(menu.disabled, 'le filtre Tags est fermé alors que des pubs sont taguées').toBe(false);
    expect([...menu.options].map((o) => o.textContent)).toEqual(['Tous les tags', 'Hook UGC · 2', 'Prix barré · 1']);
    await choisir(menu, 'hook ugc');
    const visibles = [...racine.querySelectorAll('.xgrid article.xa')];
    expect(visibles.length, 'le filtre Tags ne garde pas que les pubs taguées').toBe(2);
    expect(visibles.every((a) => tagsDe(a).includes('Hook UGC'))).toBe(true);
    expect(new URLSearchParams(window.location.search).get('tag')).toBe('hook ugc');
    expect([...racine.querySelectorAll('[data-filtres-locaux] .chip.on[aria-label]')].map((b) => b.textContent)).toContain('Tag · Hook UGC');
    await cliquer(racine.querySelector('[data-reinitialiser-local]'));
    expect(racine.querySelectorAll('.xgrid article.xa').length).toBe(toutes);
  });

  it('tag posé dans la pop-up → le filtre le voit aussitôt, sans relancer la recherche', async () => {
    await monter(await pageVeille());
    await cliquer(carte(A2)!.querySelector('button.xi'));
    const p = popup()!;
    expect(p.querySelector('[data-envoyer-sauvegarde]')!.textContent, 'une pub gardée ne se met pas à jour').toContain('Mettre à jour');
    // Le vocabulaire de la marque est proposé · un clic le pose.
    await cliquer(bouton('Prix barré', p.querySelector('[data-suggestions-tags]')!));
    await cliquer(p.querySelector('[data-envoyer-sauvegarde]'));
    await choisir(racine.querySelector('[data-filtre-local="Tags"] select'), 'prix barre');
    expect([...racine.querySelectorAll('.xgrid article.xa')].length).toBe(2);
  });
});

describe('Sauvegardes (la bibliothèque des pubs gardées) · tags, note, collections multiples, « Voir » d’un tag', () => {
  it('la carte montre tags et note · une sauvegarde dans deux collections compte dans chacune · `?tag=` filtre · un tag inconnu est ignoré et dit', async () => {
    await monter(await pageSaved());
    const nav = [...racine.querySelectorAll('nav[aria-label="Collections"] button')].map((b) => b.textContent);
    expect(nav).toEqual(expect.arrayContaining(['Hooks1', 'Inspirations été1']));
    const art = [...racine.querySelectorAll('article.vitem')];
    expect(art).toHaveLength(3);
    const a0 = art.find((a) => a.querySelector('[data-note-sauvegarde]'))!;
    expect(a0.querySelector('[data-note-sauvegarde]')!.textContent).toContain('Le hook tient trois secondes');
    expect([...a0.querySelectorAll('[data-tags-sauvegarde] button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Retirer le tag « Hook UGC »']);

    await monter(await pageSaved({ tag: 'hook ugc' }));
    expect(racine.querySelectorAll('article.vitem'), '« Voir » ne filtre pas les Sauvegardes').toHaveLength(2);
    expect((racine.querySelector('[data-filtre-tag-sauvegardes]') as HTMLSelectElement).value).toBe('hook ugc');

    await monter(await pageSaved({ tag: 'tag de la marque y' }));
    expect(racine.querySelectorAll('article.vitem')).toHaveLength(3);
    expect(racine.querySelector('[data-tag-ignore]')?.textContent).toBe('Ce tag n’existe pas pour cette marque · toutes les sauvegardes sont affichées.');
  });

  it('retirer un tag n’efface ni la sauvegarde ni la note · le tag reste dans le vocabulaire (/tags le montre à 0)', async () => {
    await monter(await pageSaved());
    const a0 = [...racine.querySelectorAll('article.vitem')].find((a) => a.querySelector('[data-note-sauvegarde]'))!;
    await cliquer(a0.querySelector('[data-tags-sauvegarde] button'));
    const l = await ligneSauvegarde(ids.wsA, A0.id);
    expect(l, 'retirer un tag a supprimé la sauvegarde').toBeDefined();
    expect(l!.note, 'retirer un tag a effacé la note').toBe('Le hook tient trois secondes');
    expect(l!.folder).toBe('Inspirations été');
    expect(await tagsEnBase(l!.id)).toEqual([]);
    expect(toasts.at(-1)).toBe('Tag « Hook UGC » retiré · la sauvegarde et sa note restent');
    expect(a0.querySelector('[data-tags-sauvegarde]'), 'la pastille reste à l’écran').toBeNull();
    expect((await vocabulaire(ids.marqueX)).map((t) => t.nom).sort(), 'le tag a été supprimé du vocabulaire').toEqual(['Hook UGC', 'Prix barré']);

    // `setSavedAdFolder` (« Ranger dans ») range dans UN dossier · les collections multiples cèdent la place, tags et note restent.
    expect(await setSavedAdFolder({ platform: A0.platform, externalId: A0.id, folder: 'Hooks' })).toEqual({ ok: true });
    const relu = await lireSauvegardeVeille({ platform: A0.platform, externalId: A0.id });
    expect(relu.ok && relu.sauvegarde, '« Ranger dans » un dossier ne remplace pas les collections multiples').toEqual({ tags: [], note: 'Le hook tient trois secondes', collections: ['Hooks'] });
  });
});

describe('/tags (VB TG01 à TG04) · le vocabulaire de la marque, compté, renommé, ajouté', () => {
  const tableau = async () => {
    const d = document.createElement('div');
    d.innerHTML = renderToStaticMarkup(<FournisseurSpatial value={CTX}>{await TaggingSpatial()}</FournisseurSpatial>);
    return [...d.querySelectorAll('[data-ligne-tag]')].map((l) => [...l.querySelectorAll('[role="cell"]')].map((c) => c.textContent?.trim()));
  };
  it('tableau Tag · Créatives · Portée · « Voir » mène aux Sauvegardes filtrées · un tag à 0 reste, sans « Voir » ouvert', async () => {
    expect(await tableau()).toEqual([
      ['Hook UGC', '1 sauvegarde', 'Marque Marque X', 'VoirRenommer'],
      ['Prix barré', '2 sauvegardes', 'Marque Marque X', 'VoirRenommer'],
    ]);
    const d = document.createElement('div');
    d.innerHTML = renderToStaticMarkup(<FournisseurSpatial value={CTX}>{await TaggingSpatial()}</FournisseurSpatial>);
    expect(d.querySelector('[data-ligne-tag="prix barre"] a')?.getAttribute('href')).toBe('/saved?tag=prix%20barre');
    expect(d.querySelector('.dempty')?.textContent, 'l’état vide honnête de l’analyse par ingrédient a disparu').toContain('pas encore disponible');
  });
  it('« Ajouter un tag » à l’écran · pop-up Nom, Ajouter · la ligne apparaît à 0 · Échap ferme et rend le focus au bouton', async () => {
    await monter(await TaggingSpatial());
    const ouvrir = racine.querySelector('[data-ajouter-tag]') as HTMLButtonElement;
    await act(async () => { ouvrir.focus(); });
    await cliquer(ouvrir);
    expect(document.querySelector('[data-popup-tag] [role="dialog"]')).not.toBeNull();
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(document.querySelector('[data-popup-tag]')).toBeNull();
    expect(document.activeElement, 'le focus n’est pas rendu à « Ajouter un tag »').toBe(ouvrir);
    await cliquer(ouvrir);
    await taper(document.querySelector('[data-popup-tag] input'), '  Unboxing  ');
    await cliquer(bouton('Ajouter', document.querySelector('[data-popup-tag]')!));
    expect(document.querySelector('[data-popup-tag]')).toBeNull();
    expect(racine.querySelector('[data-ligne-tag="unboxing"]')?.textContent).toContain('0 sauvegarde');
    expect(toasts.at(-1)).toBe('Tag « Unboxing » ajouté');
  });

  it('ajouter · « hook ugc » est refusé (déjà là) · renommer vers la clé d’un autre tag est refusé · renommer pour de vrai change la ligne', async () => {
    expect(await creerTagVeille({ nom: '  HOOK ugc ' })).toEqual({ ok: false, error: 'Le tag « Hook UGC » existe déjà.' });
    const r = await creerTagVeille({ nom: 'Avant / après' });
    expect(r.ok).toBe(true);
    const voc = await db!.select().from(schema.veilleTags).where(eq(schema.veilleTags.brandId, ids.marqueX));
    const prix = voc.find((t) => t.nameKey === 'prix barre')!;
    expect(await renommerTagVeille({ id: prix.id, nom: 'hook UGC' })).toEqual({ ok: false, error: 'Le tag « Hook UGC » existe déjà · choisis un autre nom.' });
    expect(await renommerTagVeille({ id: prix.id, nom: 'Prix barré −30 %' })).toMatchObject({ ok: true, tag: { nom: 'Prix barré −30 %' } });
    const t = await tableau();
    expect(t.map((l) => [l[0], l[1]])).toEqual([['Avant / après', '0 sauvegarde'], ['Hook UGC', '1 sauvegarde'], ['Prix barré −30 %', '2 sauvegardes'], ['Unboxing', '0 sauvegarde']]);
  });
});

describe('autre marque, autre espace, lecteur client · refus sans fuite, rien d’écrit', () => {
  it('depuis la marque Y · la pub gardée pour X se lit « pas encore gardée », sans le vocabulaire ni la note de X · la mettre à jour est refusé', async () => {
    session.marque = 'Y';
    const l = await lireSauvegardeVeille({ platform: A1.platform, externalId: A1.id });
    expect(l, 'la sauvegarde de la marque X fuit vers Y (lecture de la pop-up)').toEqual({ ok: true, sauvee: false, sauvegarde: { tags: [], note: null, collections: [] }, vocabulaire: [], collections: [] });
    const r = await majSauvegarde({ platform: A1.platform, externalId: A1.id, tags: [], note: 'piratée' });
    expect(r).toEqual({ ok: false, error: 'Annonce introuvable dans les sauvegardes de cette marque · recharge la page.' });
    const x = await ligneSauvegarde(ids.wsA, A1.id);
    expect(x!.note, 'la note de X a été écrite depuis Y').toBeNull();
    expect(await tagsEnBase(x!.id)).toEqual(['Hook UGC', 'Prix barré −30 %']);
    // Sauvegarder depuis Y une pub gardée pour X · refus existant, rien de posé.
    const s = await saveAd({ platform: A1.platform, externalId: A1.id, snapshot: A1, tags: ['Volé'] });
    expect(s.ok).toBe(false);
    expect((await vocabulaire(ids.marqueY)).map((t) => t.nom), 'un tag a été créé chez Y').toEqual([]);
    // Renommer un tag de X depuis Y · introuvable.
    const tagX = (await db!.select().from(schema.veilleTags).where(eq(schema.veilleTags.brandId, ids.marqueX)))[0]!;
    expect(await renommerTagVeille({ id: tagX.id, nom: 'Renommé par Y' }), 'un tag de X est renommé depuis Y').toEqual({ ok: false, error: 'Tag introuvable pour cette marque · recharge la page.' });
    // La page de Y · ni tag ni pub de X.
    await monter(await pageVeille());
    expect(racine.querySelector('[data-tags-carte]'), 'un tag de X apparaît chez Y').toBeNull();
  });

  it('un autre espace · rien n’est lu ni écrit chez A', async () => {
    session.ws = 'B'; session.marque = 'B';
    const l = await lireSauvegardeVeille({ platform: A0.platform, externalId: A0.id });
    expect(l.ok && l.sauvee).toBe(false);
    expect(l.ok && l.vocabulaire).toEqual([]);
    expect((await majSauvegarde({ platform: A0.platform, externalId: A0.id, note: 'B' })).ok).toBe(false);
    const tagX = (await db!.select().from(schema.veilleTags).where(eq(schema.veilleTags.brandId, ids.marqueX)))[0]!;
    expect((await renommerTagVeille({ id: tagX.id, nom: 'B' })).ok).toBe(false);
    expect((await ligneSauvegarde(ids.wsA, A0.id))!.note).toBe('Le hook tient trois secondes');
  });

  it('lecteur client · lire, mettre à jour, créer ou renommer un tag · refusé · une note trop longue est refusée sans rien écrire', async () => {
    session.role = 'client_viewer';
    const refus = 'Ton rôle ne permet pas d’utiliser la Veille · demande à un administrateur de l’espace.';
    expect(await lireSauvegardeVeille({ platform: A0.platform, externalId: A0.id })).toEqual({ ok: false, error: refus });
    expect(await majSauvegarde({ platform: A0.platform, externalId: A0.id, note: 'lecteur' })).toEqual({ ok: false, error: refus });
    expect(await creerTagVeille({ nom: 'Lecteur' })).toEqual({ ok: false, error: refus });
    session.role = 'member';
    const r = await majSauvegarde({ platform: A0.platform, externalId: A0.id, note: 'x'.repeat(1001), tags: ['Écrit quand même'] });
    expect(r.ok, 'une note trop longue est acceptée').toBe(false);
    expect((await ligneSauvegarde(ids.wsA, A0.id))!.note, 'une note refusée a été écrite').toBe('Le hook tient trois secondes');
    expect((await vocabulaire(ids.marqueX)).map((t) => t.nom), 'un tag a été créé malgré le refus').not.toContain('Écrit quand même');
  });
});
