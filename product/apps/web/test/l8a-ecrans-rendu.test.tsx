// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * L8-A · écrans image, produit, textes et éditeur · RÉSULTATS lus dans le DOM
 * (jsdom) ou le HTML rendu, jamais la présence d'un appel. Chaque bloc répare
 * un défaut MESURÉ au navigateur (inventaire L8-A, base locale semée,
 * 1280/1440/390 × 720) :
 *
 *  · calques à noms longs : à 1280, la colonne de 270 px réduisait le nom à
 *    une lettre (« I » pour « Bandeau masqué ») ; l'état « verrouillé » et le
 *    calque choisi n'étaient portés que par la couleur ;
 *  · focus perdu sur <body> après « Supprimer » (panneau plein écran 390) et
 *    après « Recharger la version courante » d'un conflit ;
 *  · textes : section « Écrire à la main » nommée par elle-même
 *    (`aria-labelledby` pointait sur son propre id), « Ajouter » inactif sans
 *    raison, export et proposition hors ligne muets, brouillon perdu au
 *    rechargement d'un conflit ;
 *  · produit : « Associer » muet quand seul le fichier manque ;
 *  · Image IA / Textes IA historiques : champs à 14 px (zoom forcé sur
 *    téléphone), sélecteur de produit plus large que l'écran à 390 (page à
 *    831 px), libellé non relié au sélecteur.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({
  enregistrer: vi.fn(), relire: vi.fn(), refresh: vi.fn(),
  ecrire: vi.fn(), sauverTextes: vi.fn(), exporter: vi.fn(), injecter: vi.fn(),
  epingler: vi.fn(), associer: vi.fn(), retirer: vi.fn(), lireParcours: vi.fn(),
}));
vi.mock('../app/actions/studios/projets', () => ({ enregistrerDocument: m.enregistrer }));
vi.mock('../lib/studios/editeur/actions', () => ({ relireDocumentEditeur: m.relire }));
vi.mock('../app/actions/studios/textes', () => ({ ecrireTextes: m.ecrire, enregistrerTextes: m.sauverTextes, exporterTextes: m.exporter, injecterTexte: m.injecter }));
vi.mock('../app/actions/studios/produit', () => ({ epinglerProduit: m.epingler, associerReference: m.associer, retirerReference: m.retirer, trancherComposants: vi.fn() }));
vi.mock('../app/actions/studios/image', () => ({
  lireParcoursImage: m.lireParcours, compilerConsigneImage: vi.fn(), retenirConsigneImage: vi.fn(), demanderDevisImage: vi.fn(), approuverEtLancerImage: vi.fn(), controlerMediaImage: vi.fn(),
}));
vi.mock('../app/actions/studios/execution', () => ({ annulerJob: vi.fn() }));
vi.mock('../app/actions/studio', () => ({ generateAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh, push: () => {} }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: unknown }) => <a href={href} {...(r as object)}>{children as never}</a> }));

import { disponibiliteTextes, erreurStudio, LIBELLES_ROLE, type DocumentStudio } from '@tiktrends/core';
import { EditeurCalques, type PropsEditeur } from '../components/studios/editeur/EditeurCalques';
import { PanneauCalques } from '../components/studios/editeur/PanneauCalques';
import { EcranTextes, cleBrouillonTextes } from '../components/studios/textes/EcranTextes';
import { EcranProduit } from '../components/studios/produit/EcranProduit';
import { StudioClient } from '../app/(app)/studio/textes/StudioClient';
import type { VueTextes } from '../lib/studios/textes/textes';
import type { VueProduit } from '../lib/studios/produit/vue';
import { contenuVideo, documentStudio, copie } from '../../../packages/core/test/studios-fixtures';

let offsetOrigine: PropertyDescriptor | undefined;
beforeAll(() => {
  offsetOrigine = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { configurable: true, get(this: HTMLElement) { return this.parentNode as Element | null; } });
});
afterAll(() => { if (offsetOrigine) Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', offsetOrigine); });

let conteneur: HTMLDivElement;
let racine: Root | null = null;
beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.lireParcours.mockResolvedValue({ ok: false, code: 'NOT_FOUND', status: 404, message: 'absent', targetIds: [], recoverable: false, traceId: 't' });
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  if (racine) act(() => racine!.unmount());
  racine = null;
  conteneur?.remove();
  vi.useRealTimers();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

function monter(el: React.ReactElement) {
  conteneur = document.createElement('div');
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
  act(() => racine!.render(el));
}
const demonter = () => { act(() => racine!.unmount()); racine = null; conteneur.remove(); };
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const bouton = (libelle: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === libelle || b.getAttribute('aria-label') === libelle) as HTMLButtonElement;
const cliquer = async (b: HTMLElement) => { await act(async () => { b.focus(); b.click(); }); };
const saisir = (el: HTMLInputElement | HTMLTextAreaElement, valeur: string) => act(() => {
  el.focus();
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const choisir = (el: HTMLSelectElement, valeur: string) => act(() => { el.value = valeur; el.dispatchEvent(new Event('change', { bubbles: true })); });
const telephone = () => {
  (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) => ({
    matches: true, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }) as MediaQueryList;
};

const LONG = 'Halo rose pâle derrière le flacon principal avec dégradé très doux vers le bord du cadre';
function docLong(): DocumentStudio {
  const d = copie(documentStudio());
  (d.layers.l_titre as { name: string }).name = LONG;
  return d;
}
const PROPS = (o: Partial<PropsEditeur> = {}): PropsEditeur => ({
  projet: { id: 'p1', titre: 'Sérum · visuel', marque: 'Marque A1' }, version: { id: 'v1', n: 1 }, contenu: contenuVideo(), document: documentStudio(),
  formatPropose: { format: '4:5', depuisBrief: false, texte: null }, produit: null, medias: [], apercus: {}, peutEnregistrer: true, ...o,
});

/* ───────────────────────────── Éditeur · calques ───────────────────────────── */

describe('UX-01 · calques à noms longs, état lisible sans la couleur', () => {
  it('le nom entier est rendu sur deux lignes au plus, les gestes passent à la ligne au lieu de l’écraser', () => {
    const html = renderToStaticMarkup(
      <PanneauCalques doc={docLong()} selection="l_titre" editable onChoisir={() => {}} onVisibilite={() => {}} onVerrou={() => {}} onAjouterTexte={() => {}} onAjouterForme={() => {}} onAjouterMedia={() => {}} />,
    );
    const d = new DOMParser().parseFromString(html, 'text/html');
    const ligne = d.querySelector('[data-ligne-calque="l_titre"]') as HTMLElement;
    expect(ligne.style.flexWrap, 'la ligne du calque ne passe pas à la ligne · le nom est écrasé par les gestes').toBe('wrap');
    const nom = ligne.querySelector('[data-nom-calque]') as HTMLElement;
    expect(nom.textContent).toBe(LONG);
    expect(nom.style.whiteSpace, 'nom tronqué sur une seule ligne').not.toBe('nowrap');
    expect(nom.getAttribute('style')).toContain('-webkit-line-clamp:2');
  });

  it('choisi, masqué, verrouillé se LISENT dans la ligne (pas seulement en couleur ou en aria-label)', () => {
    const doc = copie(documentStudio());
    (doc.layers.l_titre as { visible: boolean }).visible = false;
    const html = renderToStaticMarkup(
      <PanneauCalques doc={doc} selection="l_titre" editable onChoisir={() => {}} onVisibilite={() => {}} onVerrou={() => {}} onAjouterTexte={() => {}} onAjouterForme={() => {}} onAjouterMedia={() => {}} />,
    );
    const d = new DOMParser().parseFromString(html, 'text/html');
    const vu = (id: string) => (d.querySelector(`[data-choisir-calque="${id}"]`) as HTMLElement).textContent;
    expect(vu('l_titre'), 'le calque choisi ne se lit pas').toContain('choisi');
    expect(vu('l_titre'), 'l’état « masqué » n’est porté que par la couleur').toContain('masqué');
    expect(vu('l_logo'), 'l’état verrouillé n’est porté que par la couleur du cadenas').toContain('verrouillé');
    expect(vu('l_fond')).not.toContain('choisi');
  });
});

describe('UX-02 · le focus ne tombe jamais sur <body> quand son élément disparaît', () => {
  it('390 · « Supprimer » dans le panneau plein écran · le focus passe au calque qui prend la place', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    telephone();
    monter(<EditeurCalques {...PROPS()} />);
    await cliquer(q('[data-choisir-calque="l_titre"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(q('[data-panneau-mobile="proprietes"]')).not.toBeNull();
    await cliquer(bouton('Supprimer'));
    expect(q('[data-panneau-mobile="proprietes"]')).toBeNull();
    expect(q('[data-choisir-calque="l_titre"]')).toBeNull();
    // Affichés du premier plan vers l'arrière : Logo, Titre, Fond · « Fond » prend la place de « Titre ».
    expect(document.activeElement, 'focus perdu après la suppression').toBe(q('[data-choisir-calque="l_fond"]'));
  });

  it('dernier calque supprimé · le focus va sur « ajouter un texte »', async () => {
    const d = copie(documentStudio());
    delete (d.layers as Record<string, unknown>).l_fond;
    delete (d.layers as Record<string, unknown>).l_logo;
    monter(<EditeurCalques {...PROPS({ document: d })} />);
    await cliquer(q('[data-choisir-calque="l_titre"]')!);
    await cliquer(bouton('Supprimer'));
    expect(document.activeElement).toBe(q('[data-ajouter="texte"]'));
  });

  it('conflit · « Recharger la version courante » depuis « Voir le conflit » · le focus revient sur « Enregistrer »', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const courant = copie(documentStudio());
    (courant.layers.l_titre as { x: number }).x = 10;
    m.enregistrer.mockResolvedValueOnce(erreurStudio('VERSION_CONFLICT', { traceId: 't2', conflit: { versionCouranteId: 'v3', differences: [{ chemin: '/document/layers/l_titre/x', base: 60, courant: 10 }] } }));
    m.relire.mockResolvedValue({ ok: true, version: { id: 'v3', n: 3 }, document: courant });
    monter(<EditeurCalques {...PROPS()} />);
    await cliquer(q('[data-choisir-calque="l_titre"]')!);
    const x = [...document.querySelectorAll('label')].find((l) => l.textContent === 'X')!;
    const champX = document.getElementById(x.htmlFor) as HTMLInputElement;
    saisir(champX, '300');
    act(() => { champX.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await cliquer(bouton('Enregistrer'));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await cliquer(bouton('Voir le conflit'));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    await cliquer(bouton('Recharger la version courante'));
    expect(q('[data-dialogue="conflit"]')).toBeNull();
    expect(document.activeElement, 'focus perdu après « Recharger »').toBe(bouton('Enregistrer'));
  });
});

/* ──────────────────────────────── Textes ──────────────────────────────────── */

const DISPO = (o: Partial<Parameters<typeof disponibiliteTextes>[0]> = {}) =>
  disponibiliteTextes({ briefPresent: true, peutProposer: true, releasePubliee: true, fournisseurConfigure: true, plafondAtteint: false, modele: 'claude-sonnet-4-5', ...o });
function vueTextes(o: Partial<VueTextes> = {}): VueTextes {
  return {
    projet: { id: 'p1', title: 'Sérum · visuel', marque: 'Éclat' }, version: { id: 'v1', n: 1 },
    brief: { objectif: 'Tester une accroche', audience: 'Peaux mixtes', hypothese: 'La douleur convertit', variable: 'Accroche', faits: [{ id: 'produit.nom', claim: 'Nom : Sérum Clarté', kind: 'declared' }], invariants: [], exclusions: [] },
    briefIllisible: false,
    textes: [{ id: 't1', type: 'hook', langue: 'fr', texte: 'Fini les boutons au réveil', sources: [] }],
    calques: [{ id: 'l_titre', nom: 'Accroche' }] as VueTextes['calques'],
    limites: [{ type: 'hook', libelle: 'Hook', max: 46, mesuree: true }, { type: 'body', libelle: 'Corps', max: 400, mesuree: false }, { type: 'cta', libelle: 'CTA', max: 30, mesuree: false }, { type: 'script', libelle: 'Script', max: 2000, mesuree: false }] as VueTextes['limites'],
    disponibilite: DISPO(), peutEcrire: true, peutExporter: true, ...o,
  };
}
const zoneManuelle = () => q<HTMLTextAreaElement>('[data-zone="ecrire-main"] textarea')!;

describe('UX-02/03 · textes', () => {
  it('« Écrire à la main » est nommée par son titre, pas par tout son contenu', () => {
    const d = new DOMParser().parseFromString(renderToStaticMarkup(<EcranTextes vue={vueTextes()} />), 'text/html');
    const section = d.querySelector('[data-zone="ecrire-main"]')!;
    const cible = d.getElementById(section.getAttribute('aria-labelledby')!);
    expect(cible, 'aria-labelledby ne désigne aucun élément').not.toBeNull();
    expect(cible!.tagName, 'la section se nomme par elle-même').toBe('H2');
    expect(cible!.textContent).toBe('Écrire à la main');
  });

  it('« Ajouter » inactif dit pourquoi, relié au bouton, et la raison disparaît quand le texte est écrit', () => {
    monter(<EcranTextes vue={vueTextes()} />);
    const ajouter = bouton('Ajouter aux textes retenus');
    expect(ajouter.disabled).toBe(true);
    const raison = document.getElementById(ajouter.getAttribute('aria-describedby') ?? '');
    expect(raison?.textContent, '« Ajouter » inactif sans raison').toBe('Écris un texte pour pouvoir l’ajouter.');
    saisir(zoneManuelle(), 'Ton teint change dès le premier flacon');
    expect(bouton('Ajouter aux textes retenus').disabled).toBe(false);
    expect(q('[data-raison="ajout"]')).toBeNull();
  });

  it('plafond atteint · la raison est dite et l’écriture à la main reste ouverte', () => {
    monter(<EcranTextes vue={vueTextes({ disponibilite: DISPO({ plafondAtteint: true }) })} />);
    expect(q('[data-zone="ecrire-ia"]')!.textContent).toContain('Indisponible · Le plafond de dépense est atteint');
    expect([...document.querySelectorAll('[data-zone="ecrire-ia"] button')].find((b) => b.textContent?.startsWith('Écrire 3'))?.hasAttribute('disabled')).toBe(true);
    expect(zoneManuelle().disabled).toBe(false);
  });

  it('hors ligne · l’export et la proposition disent l’échec (ils étaient muets), le texte saisi reste', async () => {
    m.exporter.mockRejectedValue(new TypeError('Failed to fetch'));
    m.injecter.mockRejectedValue(new TypeError('Failed to fetch'));
    m.sauverTextes.mockRejectedValue(new TypeError('Failed to fetch'));
    monter(<EcranTextes vue={vueTextes()} />);
    saisir(zoneManuelle(), 'Brouillon en cours');
    await cliquer(bouton('Ajouter aux textes retenus'));
    expect(q('[role="alert"]')?.textContent).toContain('Le serveur n’a pas répondu');
    expect(zoneManuelle().value).toBe('Brouillon en cours');
    await cliquer(bouton('Exporter en CSV'));
    expect(q('[role="alert"]')?.textContent, 'export hors ligne muet').toContain('aucun fichier exporté');
    await cliquer(bouton('Proposer dans ce calque'));
    expect(q('[role="alert"]')?.textContent, 'proposition hors ligne muette').toContain('aucune proposition créée');
    expect(zoneManuelle().value).toBe('Brouillon en cours');
  });

  it('conflit · « Recharger la version courante » garde le brouillon et le rend après le rechargement', async () => {
    m.sauverTextes.mockResolvedValue(erreurStudio('VERSION_CONFLICT', { traceId: 't', conflit: { versionCouranteId: 'v2', differences: [] } }));
    const recharge = vi.fn();
    const origine = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...origine, reload: recharge } });
    try {
      monter(<EcranTextes vue={vueTextes()} />);
      saisir(zoneManuelle(), 'Ton teint change dès le premier flacon');
      await cliquer(bouton('Ajouter aux textes retenus'));
      expect(q('[role="alert"]')?.textContent).toContain('Conflit de version');
      await cliquer(bouton('Recharger la version courante'));
      expect(recharge).toHaveBeenCalledTimes(1);
      expect(window.sessionStorage.getItem(cleBrouillonTextes('p1')) ?? '', 'brouillon perdu au rechargement · rien n’est gardé avant de recharger').toContain('Ton teint change');
      demonter();
      monter(<EcranTextes vue={vueTextes({ version: { id: 'v2', n: 2 } })} />);
      expect(zoneManuelle().value, 'brouillon perdu au rechargement').toBe('Ton teint change dès le premier flacon');
      expect(q('[role="status"]')?.textContent).toContain('ton brouillon est remis en place');
      expect(window.sessionStorage.getItem(cleBrouillonTextes('p1')), 'le brouillon est rendu une seule fois').toBeNull();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: origine });
    }
  });
});

/* ──────────────────────────────── Produit ─────────────────────────────────── */

function vueProduit(): VueProduit {
  const prep = { ok: true, violations: [], composantsProteges: [], interditsTransfert: [], avertissements: [] };
  return {
    projet: { id: 'p1', title: 'Sérum', marque: 'Éclat' }, version: { id: 'v1', n: 1 }, briefPresent: true,
    produits: [{ id: 'pr1', nom: 'Sérum Clarté', photos: [{ assetId: 'ph1', assetVersion: 'v', sha256: 'a'.repeat(64), nature: 'contenu', position: 1, apercu: '/x.png' }] }],
    epingle: null, produitSansPhoto: null,
    fichiers: [{ assetId: 'f1', assetVersion: 'v', sha256: 'b'.repeat(64), nature: 'contenu', provenance: 'logo', libelleProvenance: 'Logo de la marque', libelle: 'Logo', apercu: null, productId: null }],
    associations: [], preparation: { faithful_composite: prep, generative_scene: prep }, peutModifier: true,
  } as unknown as VueProduit;
}

describe('UX-03 · produit · la prochaine action est dite', () => {
  it('rôle et portée choisis, fichier absent · « Associer » dit « Choisis un fichier. »', () => {
    monter(<EcranProduit vue={vueProduit()} />);
    const [, fichier, role, portee] = [...document.querySelectorAll('select')] as HTMLSelectElement[];
    expect(fichier!.value).toBe('');
    choisir(role!, 'style');
    choisir(portee!, 'background');
    const associer = bouton('Associer');
    expect(associer.disabled, '« Associer » muet quand seul le fichier manque · le bouton est même actif').toBe(true);
    expect(document.getElementById(associer.getAttribute('aria-describedby') ?? '')?.textContent, '« Associer » muet quand seul le fichier manque').toBe('Choisis un fichier.');
    expect(LIBELLES_ROLE.style).toBeTruthy();
  });

  it('épingler sans photo · la raison est reliée au bouton', () => {
    monter(<EcranProduit vue={vueProduit()} />);
    const b = bouton('Épingler cette photo');
    expect(b.disabled).toBe(true);
    expect(document.getElementById(b.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Choisis d’abord une photo.');
  });
});

/* ───────────────────────── Studios historiques ────────────────────────────── */

describe('UX-01 · champs à 16 px (pas de zoom forcé sur téléphone)', () => {
  it('Textes IA · chaque champ du brief est à 16 px', () => {
    const d = new DOMParser().parseFromString(renderToStaticMarkup(<StudioClient hasKey={false} />), 'text/html');
    const champs = [...d.querySelectorAll('input, select, textarea')] as HTMLElement[];
    expect(champs.length).toBeGreaterThanOrEqual(6);
    for (const c of champs) expect(c.style.fontSize, `${c.id} sous 16 px`).toBe('16px');
  });
});
