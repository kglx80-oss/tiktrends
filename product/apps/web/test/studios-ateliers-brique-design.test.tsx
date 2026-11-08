// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Les quatre derniers ateliers de la rubrique projet passés sur la brique
 * « bouton d'action serveur » · parcours image, Textes, Produit,
 * rattachement Adsmap. On MONTE la vraie vue (jsdom) avec les actions
 * serveur simulées (le simulacre des tests de chaque atelier) et on LIT le
 * DOM, ce que rencontrent un clavier, un lecteur d'écran et un doigt :
 *
 *  · fermé · le bouton dit pourquoi, à côté de lui, relié par `aria-describedby` ;
 *  · pendant l'action · le bouton pressé GARDE le focus (jamais `disabled`),
 *    dit qu'il travaille (`aria-busy`), et un second clic ne repart pas ;
 *  · après · le focus rejoint la cible logique quand le bouton disparaît,
 *    jamais `<body>` ;
 *  · échec réseau · le message porte la pastille « Hors ligne » ;
 *  · navigateur hors ligne · rien ne part, la raison est écrite.
 * 0 $ · aucune action réelle, aucun modèle appelé.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({
  lire: vi.fn(), compiler: vi.fn(), retenir: vi.fn(), devis: vi.fn(), lancer: vi.fn(), controler: vi.fn(), annuler: vi.fn(), trancher: vi.fn(),
  epingler: vi.fn(), associer: vi.fn(), retirer: vi.fn(), importer: vi.fn(),
  ecrireTextes: vi.fn(), enregistrerTextes: vi.fn(), exporterTextes: vi.fn(), injecterTexte: vi.fn(),
  preparer: vi.fn(), rattacher: vi.fn(), relire: vi.fn(), creerVariante: vi.fn(), iterer: vi.fn(), refresh: vi.fn(),
}));
vi.mock('../app/actions/studios/image', () => ({ lireParcoursImage: m.lire, compilerConsigneImage: m.compiler, retenirConsigneImage: m.retenir, demanderDevisImage: m.devis, approuverEtLancerImage: m.lancer, controlerMediaImage: m.controler }));
vi.mock('../app/actions/studios/execution', () => ({ annulerJob: m.annuler }));
vi.mock('../app/actions/studios/produit', () => ({ trancherComposants: m.trancher, epinglerProduit: m.epingler, associerReference: m.associer, retirerReference: m.retirer, importerPhotoProduit: m.importer }));
vi.mock('../app/actions/studios/textes', () => ({ ecrireTextes: m.ecrireTextes, enregistrerTextes: m.enregistrerTextes, exporterTextes: m.exporterTextes, injecterTexte: m.injecterTexte }));
vi.mock('../app/actions/studios/tests', () => ({ preparerLotEssai: m.preparer, rattacherVarianteAuTest: m.rattacher, relireApprentissage: m.relire }));
vi.mock('../app/actions/studios/variantes', () => ({ creerVariante: m.creerVariante, iterer: m.iterer }));
vi.mock('../lib/studios/produit/compression-photo', () => ({ compresserPhoto: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1', useRouter: () => ({ refresh: m.refresh, push: () => {} }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: unknown }) => <a href={href} {...(r as object)}>{children as never}</a> }));

import { TEXTES_HORS_LIGNE, disponibiliteImage, disponibiliteTextes } from '@tiktrends/core';
import type { ConsigneVue, VueParcoursImage } from '../lib/studios/image/parcours';
import type { VueProduit } from '../lib/studios/produit/vue';
import type { VueTextes } from '../lib/studios/textes/textes';
import { ParcoursImage } from '../spatial/vues/projet/ParcoursImage';
import { Produit } from '../spatial/vues/projet/Produit';
import { Textes } from '../spatial/vues/projet/Textes';
import { LotEssai } from '../spatial/vues/projet/Rattachement';
import { OngletCreations } from '../spatial/vues/projet/OngletCreations';
import type { PropsCreationsProjet, VarianteSpatiale } from '../spatial/vues/projet/types';
import { avecSpatial } from './spatial/fournisseur';

// ── Montage, lecture ──────────────────────────────────────────────────────────
let hote: HTMLDivElement; let racine: Root;
beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  window.sessionStorage.clear();
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true }); });
const monter = (n: ReactNode) => act(() => { racine.render(avecSpatial(n)); });
const q = <T extends HTMLElement = HTMLButtonElement>(s: string) => hote.querySelector<T>(s);
/** Laisse passer le `setTimeout` 0 de `replacerFocus` et les promesses. */
const laisser = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const cliquer = async (b: HTMLElement | null) => { expect(b, 'bouton introuvable').toBeTruthy(); await act(async () => { b!.click(); }); };
const actif = () => document.activeElement;
/** [disabled natif, aria-disabled, aria-busy] */
const etat = (b: HTMLButtonElement | null) => [b!.disabled, b!.getAttribute('aria-disabled'), b!.getAttribute('aria-busy')];
/** La raison écrite à côté d'un bouton fermé · le texte de l'élément que cite `aria-describedby`. */
const raison = (b: HTMLButtonElement | null) => document.getElementById(b?.getAttribute('aria-describedby') ?? '')?.textContent ?? null;
/** Une promesse tenue en main · l'action reste « en cours » tant qu'on ne la résout pas. */
function differe<T>() { let resoudre!: (v: T) => void; let rejeter!: (e: unknown) => void; const p = new Promise<T>((a, b) => { resoudre = a; rejeter = b; }); return { p, resoudre, rejeter }; }
const horsLigne = () => act(() => { Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true }); window.dispatchEvent(new Event('offline')); });
/** La pastille de l'alerte · « Hors ligne » quand le serveur n'a pas répondu. */
const pastilleAlerte = () => q<HTMLElement>('[role="alert"] .pill')?.textContent ?? null;

// ── Parcours image ────────────────────────────────────────────────────────────
const TOUT = { peutGenerer: true, peutProposer: true, briefPresent: true, preparationOk: true, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true };
const CONSIGNE: ConsigneVue = {
  runId: '11111111-1111-4111-8111-111111111111', mode: 'generative_scene', libelleMode: 'Mise en scène générée',
  generationInstruction: 'Coureur portant les lunettes, piste au lever du jour.', negativeConstraints: [], protectedComponents: ['lunettes'], liaisons: [],
  format: { largeur: 1080, hauteur: 1350 }, compileeLe: '2026-10-08T10:00:00Z',
};
const DEVIS = { id: 'q1', credits: 4, inputHash: 'h', expiresAt: '2026-10-08T11:00:00Z', lignes: [] };
function vueImage(o: Partial<VueParcoursImage> = {}, dispo = TOUT): VueParcoursImage {
  return {
    projet: { id: 'p1' }, version: { id: 'v3', n: 3 },
    modes: [{ mode: 'faithful_composite', libelle: 'Produit fidèle', pret: false }, { mode: 'generative_scene', libelle: 'Mise en scène générée', pret: true }],
    format: { largeur: 1080, hauteur: 1350, libelle: 'Portrait · 4:5', depuisBrief: false },
    disponibilite: disponibiliteImage(dispo), coutCompilationUsd: 0.14, prix: { credits: 4, usdMicros: 80_000 },
    enAttente: null, retenue: null, devis: null, jobs: [], composantsObligatoires: ['lunettes'], peutRelire: true,
    controleVision: { disponible: false, borneParImageUsdMicros: 0 }, ...o,
  } as VueParcoursImage;
}
const RETENUE = { ...CONSIGNE, verdict: { ok: true } } as VueParcoursImage['retenue'];

describe('Parcours image · brique d’action serveur', () => {
  it('fermé · « Préparer » dit pourquoi, à côté de lui (plafond atteint)', () => {
    monter(<ParcoursImage projectId="p1" versionId="v3" initial={vueImage({}, { ...TOUT, plafondAtteint: true })} />);
    const b = q('[data-bouton="compiler"]');
    expect(b!.disabled).toBe(true);
    expect(raison(b), '« Préparer » fermé sans raison reliée').toMatch(/^Indisponible · /);
  });

  it('pendant · « Valider et voir le prix » garde le focus, dit qu’il travaille, ignore un second clic ; après · le focus rejoint « Générer »', async () => {
    const d = differe<unknown>();
    m.retenir.mockReturnValue(d.p);
    m.devis.mockResolvedValue({ ok: true });
    m.lire.mockResolvedValue({ ok: true, vue: vueImage({ retenue: RETENUE, devis: DEVIS as never }) });
    monter(<ParcoursImage projectId="p1" versionId="v3" initial={vueImage({ enAttente: CONSIGNE })} />);
    const b = q('[data-bouton="retenir"]')!;
    b.focus();
    await cliquer(b);
    expect(etat(b), 'le bouton pressé ne dit pas qu’il travaille, ou rend le focus').toEqual([false, 'true', 'true']);
    expect(b.textContent).toBe('Enregistrement…');
    expect(actif(), 'le focus a quitté le bouton pressé').toBe(b);
    await cliquer(b);
    expect(m.retenir, 'un second clic est reparti').toHaveBeenCalledTimes(1);
    await act(async () => { d.resoudre({ ok: true }); await d.p; });
    await laisser();
    expect(q('[data-bouton="retenir"]'), 'la proposition retenue devait disparaître').toBeNull();
    expect(actif(), 'le focus est tombé sur <body> après « Valider »').toBe(q('[data-bouton="lancer"]'));
  });

  it('geste payant · le premier clic porte le focus sur la confirmation, le second rend le focus au bouton pressé, puis à « Valider »', async () => {
    const d = differe<unknown>();
    m.compiler.mockReturnValue(d.p);
    m.lire.mockResolvedValue({ ok: true, vue: vueImage({ enAttente: CONSIGNE }) });
    monter(<ParcoursImage projectId="p1" versionId="v3" initial={vueImage()} />);
    q('[data-bouton="compiler"]')!.focus();
    await cliquer(q('[data-bouton="compiler"]'));
    await laisser();
    expect(actif(), 'la confirmation n’a pas reçu le focus').toBe(q('[data-bouton="confirmer-compiler"]'));
    await cliquer(q('[data-bouton="confirmer-compiler"]'));
    await laisser();
    const presse = q('[data-bouton="compiler"]')!;
    expect(etat(presse), 'le bouton pressé est `disabled` ou ne dit pas qu’il travaille').toEqual([false, 'true', 'true']);
    expect(actif(), 'la confirmation disparue a laissé le focus sur <body>').toBe(presse);
    await act(async () => { d.resoudre({ ok: true, statut: 'compilee' }); await d.p; });
    await laisser();
    expect(actif(), 'la direction proposée n’a pas reçu le focus').toBe(q('[data-bouton="retenir"]'));
  });

  it('échec réseau · la pastille dit « Hors ligne »', async () => {
    m.devis.mockRejectedValue(new TypeError('Failed to fetch'));
    m.lire.mockResolvedValue({ ok: true, vue: vueImage({ retenue: RETENUE }) });
    monter(<ParcoursImage projectId="p1" versionId="v3" initial={vueImage({ retenue: RETENUE })} />);
    await cliquer(q('[data-bouton="devis"]'));
    expect(pastilleAlerte(), 'l’échec réseau ne porte pas la pastille « Hors ligne »').toBe(TEXTES_HORS_LIGNE.pastille);
  });

  it('navigateur hors ligne · rien ne part, la raison est écrite', async () => {
    monter(<ParcoursImage projectId="p1" versionId="v3" initial={vueImage({ retenue: RETENUE })} />);
    horsLigne();
    const b = q('[data-bouton="devis"]');
    expect(b!.disabled).toBe(true);
    expect(raison(b)).toBe(TEXTES_HORS_LIGNE.bouton);
    await cliquer(b);
    expect(m.devis).not.toHaveBeenCalled();
  });
});

// ── Textes ────────────────────────────────────────────────────────────────────
const vueTextes = (o: Partial<VueTextes> = {}): VueTextes => ({
  projet: { id: 'p1', title: 'Sérum', marque: 'Éclat' }, version: { id: 'v1', n: 1 },
  brief: { objectif: 'Tester une accroche', audience: 'Peaux mixtes', hypothese: 'La douleur convertit', variable: 'Accroche', faits: [], invariants: [], exclusions: [] },
  briefIllisible: false,
  textes: [{ id: 't1', type: 'hook', langue: 'fr', texte: 'Fini les boutons au réveil', sources: [] }, { id: 't2', type: 'cta', langue: 'fr', texte: 'Je teste le sérum', sources: [] }],
  calques: [{ id: 'l_titre', nom: 'Accroche' }],
  limites: [{ type: 'hook', libelle: 'Hook', max: 46, mesuree: true }, { type: 'body', libelle: 'Corps', max: 400, mesuree: false }, { type: 'cta', libelle: 'CTA', max: 30, mesuree: false }, { type: 'script', libelle: 'Script', max: 2000, mesuree: false }],
  disponibilite: disponibiliteTextes({ briefPresent: true, peutProposer: true, releasePubliee: true, fournisseurConfigure: true, plafondAtteint: false, modele: 'claude-sonnet-4-5' }),
  peutEcrire: true, peutExporter: true, ...o,
} as unknown as VueTextes);
const ATELIER = [{ segment: 'textes', href: '/studio/projets/p1/textes' }];
const saisir = (el: HTMLTextAreaElement, valeur: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, valeur);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('Textes · brique d’action serveur', () => {
  it('fermé · « Ajouter » dit pourquoi, à côté de lui', () => {
    monter(<Textes vue={vueTextes()} atelier={ATELIER} />);
    const b = q('[data-geste="ajouter"]');
    expect(b!.disabled).toBe(true);
    expect(raison(b)).toBe('Écris un texte pour pouvoir l’ajouter.');
  });

  it('pendant · « Retirer » garde le focus, dit qu’il travaille, ignore un second clic, ferme les autres gestes ; après · le focus va au texte suivant', async () => {
    const d = differe<unknown>();
    m.enregistrerTextes.mockReturnValue(d.p);
    monter(<Textes vue={vueTextes()} atelier={ATELIER} />);
    const b = q('[data-texte-id="t1"] [data-geste="retirer"]')!;
    b.focus();
    await cliquer(b);
    expect(etat(b), 'le bouton pressé est `disabled` ou ne dit pas qu’il travaille').toEqual([false, 'true', 'true']);
    expect(actif()).toBe(b);
    expect(q('[data-export="csv"]')!.disabled, 'un autre geste reste ouvert pendant l’enregistrement').toBe(true);
    await cliquer(b);
    expect(m.enregistrerTextes).toHaveBeenCalledTimes(1);
    await act(async () => { d.resoudre({ ok: true, version: { id: 'v2', n: 2 }, textes: [{ id: 't2', type: 'cta', langue: 'fr', texte: 'Je teste le sérum', sources: [] }], inchange: false }); await d.p; });
    await laisser();
    expect(q('[data-texte-id="t1"]')).toBeNull();
    expect(actif(), 'le focus est tombé sur <body> après « Retirer »').toBe(q('[data-texte-id="t2"] [data-geste="retirer"]'));
  });

  it('après « Ajouter » · le champ vidé ferme le bouton, le focus revient au champ', async () => {
    m.enregistrerTextes.mockResolvedValue({ ok: true, version: { id: 'v2', n: 2 }, textes: [], inchange: false });
    monter(<Textes vue={vueTextes()} atelier={ATELIER} />);
    const champ = q<HTMLTextAreaElement>('[data-zone="ecrire-main"] textarea')!;
    saisir(champ, 'Ton teint change dès le premier flacon');
    await cliquer(q('[data-geste="ajouter"]'));
    await laisser();
    expect(actif(), 'le focus est resté sur un bouton fermé').toBe(champ);
  });

  it('échec réseau · la pastille dit « Hors ligne »', async () => {
    m.exporterTextes.mockRejectedValue(new TypeError('Failed to fetch'));
    monter(<Textes vue={vueTextes()} atelier={ATELIER} />);
    await cliquer(q('[data-export="json"]'));
    expect(pastilleAlerte(), 'l’échec réseau ne porte pas la pastille « Hors ligne »').toBe(TEXTES_HORS_LIGNE.pastille);
  });

  it('navigateur hors ligne · exporter, proposer, retirer et écrire sont fermés avec leur raison, rien ne part', async () => {
    monter(<Textes vue={vueTextes()} atelier={ATELIER} />);
    horsLigne();
    for (const s of ['[data-export="markdown"]', '[data-texte-id="t1"] [data-geste="proposer"]', '[data-texte-id="t1"] [data-geste="retirer"]', '[data-bouton="ecrire"]']) {
      const b = q(s);
      expect(b!.disabled, `${s} · reste ouvert hors ligne`).toBe(true);
      expect(raison(b), `${s} · hors ligne sans raison écrite`).toBe(TEXTES_HORS_LIGNE.bouton);
      await cliquer(b);
    }
    expect([m.exporterTextes, m.injecterTexte, m.enregistrerTextes, m.ecrireTextes].map((f) => f.mock.calls.length)).toEqual([0, 0, 0, 0]);
  });
});

// ── Produit ───────────────────────────────────────────────────────────────────
function vueProduit(associations = 2): VueProduit {
  const prep = { ok: true, violations: [], composantsProteges: [], interditsTransfert: [], avertissements: [] };
  const assoc = (i: number) => ({ assetId: `f${i}`, role: 'style', libelle: `Fichier ${i}`, libelleRole: 'Style', libellePortee: 'Décor', provenance: 'logo', requiredComponents: [], epinglee: false });
  return {
    projet: { id: 'p1', title: 'Sérum', marque: 'Éclat' }, version: { id: 'v1', n: 1 }, briefPresent: true,
    produits: [{ id: 'pr1', nom: 'Sérum Clarté', photos: [{ assetId: 'ph1', assetVersion: 'v', sha256: 'a'.repeat(64), nature: 'contenu', position: 1, apercu: '/x.png' }] }],
    epingle: null, produitSansPhoto: null,
    fichiers: [{ assetId: 'f1', assetVersion: 'v', sha256: 'b'.repeat(64), nature: 'contenu', provenance: 'logo', libelleProvenance: 'Logo de la marque', libelle: 'Logo', apercu: null, productId: null }],
    associations: Array.from({ length: associations }, (_, i) => assoc(i + 1)),
    preparation: { faithful_composite: prep, generative_scene: prep }, peutModifier: true,
  } as unknown as VueProduit;
}

describe('Produit · brique d’action serveur', () => {
  it('fermé · « Associer ce fichier » dit tout ce qui manque, à côté de lui', () => {
    monter(<Produit vue={vueProduit()} atelier={[]} />);
    const b = q('[data-geste="associer"]');
    expect(b!.disabled).toBe(true);
    expect(raison(b), '« Associer ce fichier » fermé sans raison reliée').toBe('Choisis un fichier, un rôle et une portée.');
  });

  it('pendant · « Retirer » garde le focus, dit qu’il travaille, ferme « Utiliser cette photo » ; après · le focus va au rôle suivant', async () => {
    const d = differe<unknown>();
    m.retirer.mockReturnValue(d.p);
    monter(<Produit vue={vueProduit()} atelier={[]} />);
    const b = q('[data-association="f1|style"] [data-geste="retirer"]')!;
    b.focus();
    await cliquer(b);
    expect(etat(b), 'le bouton pressé est `disabled` ou ne dit pas qu’il travaille').toEqual([false, 'true', 'true']);
    expect(actif()).toBe(b);
    expect(q('[data-geste="epingler"]')!.disabled, 'épingler reste ouvert pendant le retrait').toBe(true);
    await cliquer(b);
    expect(m.retirer).toHaveBeenCalledTimes(1);
    await act(async () => { d.resoudre({ ok: true }); await d.p; });
    // Le serveur a répondu · `router.refresh()` ramène la vue sans le rôle retiré.
    monter(<Produit vue={{ ...vueProduit(), associations: vueProduit().associations.slice(1) }} atelier={[]} />);
    await laisser();
    expect(actif(), 'le focus est tombé sur <body> après « Retirer »').toBe(q('[data-association="f2|style"] [data-geste="retirer"]'));
  });

  it('échec réseau · la pastille dit « Hors ligne »', async () => {
    m.epingler.mockRejectedValue(new TypeError('Failed to fetch'));
    monter(<Produit vue={vueProduit()} atelier={[]} />);
    await cliquer(q('[data-geste="epingler"]'));
    expect(pastilleAlerte(), 'l’échec réseau ne porte pas la pastille « Hors ligne »').toBe(TEXTES_HORS_LIGNE.pastille);
  });

  it('navigateur hors ligne · épingler, importer et retirer sont fermés avec leur raison, rien ne part', async () => {
    monter(<Produit vue={vueProduit()} atelier={[]} />);
    horsLigne();
    for (const s of ['[data-geste="epingler"]', '[data-geste="importer"]', '[data-association="f1|style"] [data-geste="retirer"]']) {
      const b = q(s);
      expect(b!.disabled, `${s} · reste ouvert hors ligne`).toBe(true);
      expect(raison(b), `${s} · hors ligne sans raison écrite`).toBe(TEXTES_HORS_LIGNE.bouton);
      await cliquer(b);
    }
    expect([m.epingler, m.retirer, m.importer].map((f) => f.mock.calls.length)).toEqual([0, 0, 0]);
  });
});

// ── Rattachement Adsmap ───────────────────────────────────────────────────────
const variante = (id: string): VarianteSpatiale => ({
  id, libelle: `Variante ${id}`, apercu: null, version: 'V1', statut: 'Retenue', hypothese: 'Le prix en gros accroche', variable: 'accroche', comparaison: '—',
  test: null, lienTest: `lien-${id}`, lecture: null, gestes: { iterer: true, relire: true, rattacher: true }, rattachement: { hypothese: 'Le prix en gros accroche', variable: 'hook', aUnParent: false },
});
const props = (): PropsCreationsProjet => ({
  projectId: 'p1', versionCouranteId: 'v1', messageVide: 'Aucune création.', editeurHref: null, preparerHref: null, videoHref: null, lots: [],
  variantes: [variante('x'), variante('y')], erreurVariantes: null, relecture: { disponible: true, mention: '0,02 $ au plus', raison: null, coutMaxUsd: 0.02 },
  taches: [], erreurTaches: null, peutProposer: true, relire: false, adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] },
} as unknown as PropsCreationsProjet);
const LOT = [{ id: 'x', libelle: 'Variante x', version: 'V1' }, { id: 'y', libelle: 'Variante y', version: 'V1' }];
function choisirLot() {
  act(() => {
    q('[data-essai-variable]')!.click();
    q('[data-essai-variante="x"]')!.click();
    q('[data-essai-variante="y"]')!.click();
  });
}
/** Le lot monté seul, rendu par l'onglet comme ici · `LotEssai` porte ses propres états. */
function Lot({ hl = false }: { hl?: boolean }) { const [k] = useState(0); return <LotEssai key={k} projectId="p1" horsLigne={hl} variantes={LOT} ouvrirRattachement={() => {}} />; }

describe('Rattachement · brique d’action serveur', () => {
  it('fermé · « Préparer le lot d’essai » dit ce qui manque, à côté de lui', () => {
    monter(<Lot />);
    const b = q('[data-geste="preparer-lot"]');
    expect(b!.disabled).toBe(true);
    expect(raison(b)).toBe('Choisis ce qui varie et au moins deux variantes.');
  });

  it('pendant · « Préparer » garde le focus, dit qu’il travaille, ignore un second clic', async () => {
    const d = differe<unknown>();
    m.preparer.mockReturnValue(d.p);
    monter(<Lot />);
    choisirLot();
    const b = q('[data-geste="preparer-lot"]')!;
    b.focus();
    await cliquer(b);
    expect(etat(b), 'le bouton pressé est `disabled` ou ne dit pas qu’il travaille').toEqual([false, 'true', 'true']);
    expect(b.textContent).toBe('Préparation…');
    expect(actif()).toBe(b);
    await cliquer(b);
    expect(m.preparer).toHaveBeenCalledTimes(1);
    await act(async () => { d.resoudre({ ok: false, code: 'FORBIDDEN', status: 403, message: 'Refusé.', targetIds: [], recoverable: false, traceId: 't' }); await d.p; });
    expect(etat(b)).toEqual([false, null, null]);
    expect(actif()).toBe(b);
  });

  it('échec réseau · le lot · la pastille dit « Hors ligne », les choix restent', async () => {
    m.preparer.mockRejectedValue(new TypeError('Failed to fetch'));
    monter(<Lot />);
    choisirLot();
    await cliquer(q('[data-geste="preparer-lot"]'));
    expect(pastilleAlerte(), 'l’échec réseau ne porte pas la pastille « Hors ligne »').toBe(TEXTES_HORS_LIGNE.pastille);
    expect(q('[data-essai-variante="x"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('formulaire · pendant l’envoi le bouton garde le focus ; envoyé, le formulaire se ferme et le focus revient à « Rattacher au test » de la variante', async () => {
    const d = differe<unknown>();
    m.rattacher.mockReturnValue(d.p);
    monter(<OngletCreations {...props()} />);
    await cliquer(q('[data-variante="x"] [data-geste="rattacher"]'));
    const envoi = q('[data-formulaire-test="x"] [data-geste="envoyer-rattachement"]')!;
    envoi.focus();
    await act(async () => { q<HTMLFormElement>('[data-formulaire-test="x"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(etat(envoi), 'le bouton pressé est `disabled` ou ne dit pas qu’il travaille').toEqual([false, 'true', 'true']);
    expect(actif()).toBe(envoi);
    await act(async () => { d.resoudre({ ok: true }); await d.p; });
    await laisser();
    expect(q('[data-formulaire-test="x"]')).toBeNull();
    expect(actif(), 'le formulaire fermé a laissé le focus sur <body>').toBe(q('[data-variante="x"] [data-geste="rattacher"]'));
  });

  it('formulaire · échec réseau · la pastille dit « Hors ligne », « Fermer le formulaire » rend le focus à la variante', async () => {
    m.rattacher.mockRejectedValue(new TypeError('Failed to fetch'));
    monter(<OngletCreations {...props()} />);
    await cliquer(q('[data-variante="x"] [data-geste="rattacher"]'));
    await act(async () => { q<HTMLFormElement>('[data-formulaire-test="x"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(pastilleAlerte(), 'l’échec réseau ne porte pas la pastille « Hors ligne »').toBe(TEXTES_HORS_LIGNE.pastille);
    const fermer = [...hote.querySelectorAll<HTMLButtonElement>('[data-formulaire-test="x"] button')].find((b) => b.textContent === 'Fermer le formulaire')!;
    fermer.focus();
    await cliquer(fermer);
    await laisser();
    expect(actif(), '« Fermer le formulaire » a laissé le focus sur <body>').toBe(q('[data-variante="x"] [data-geste="rattacher"]'));
  });

  it('navigateur hors ligne · « Préparer » fermé avec la raison, rien ne part', async () => {
    monter(<Lot hl />);
    choisirLot();
    const b = q('[data-geste="preparer-lot"]');
    expect(b!.disabled).toBe(true);
    expect(raison(b)).toBe(TEXTES_HORS_LIGNE.bouton);
    await cliquer(b);
    expect(m.preparer).not.toHaveBeenCalled();
  });
});
