// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * L8-A · écrans image, produit et textes (l'éditeur, retiré de la V5, est gardé
 * sur sa vue Spatial) · RÉSULTATS lus dans le DOM
 * (jsdom) ou le HTML rendu, jamais la présence d'un appel. Chaque bloc répare
 * un défaut MESURÉ au navigateur (inventaire L8-A, base locale semée,
 * 1280/1440/390 × 720) :
 *
 *  · calques à noms longs : à 1280, la colonne de 270 px réduisait le nom à
 *    une lettre (« I » pour « Bandeau masqué ») ; l'état « verrouillé » et le
 *    calque choisi n'étaient portés que par la couleur ;
 *  · focus perdu sur <body> après « Supprimer » (panneau plein écran 390) et
 *    après « Recharger la version courante » d'un conflit ;
 *  · textes : gardés sur l'atelier Spatial (`spatial-textes-atelier`) depuis
 *    le retrait de l'écran V5 `EcranTextes` ;
 *  · produit : « Associer » muet quand seul le fichier manque.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({
  enregistrer: vi.fn(), relire: vi.fn(), refresh: vi.fn(),
  epingler: vi.fn(), associer: vi.fn(), retirer: vi.fn(), lireParcours: vi.fn(),
}));
vi.mock('../app/actions/studios/projets', () => ({ enregistrerDocument: m.enregistrer }));
vi.mock('../lib/studios/editeur/actions', () => ({ relireDocumentEditeur: m.relire }));
vi.mock('../app/actions/studios/produit', () => ({ epinglerProduit: m.epingler, associerReference: m.associer, retirerReference: m.retirer, trancherComposants: vi.fn() }));
vi.mock('../app/actions/studios/image', () => ({
  lireParcoursImage: m.lireParcours, compilerConsigneImage: vi.fn(), retenirConsigneImage: vi.fn(), demanderDevisImage: vi.fn(), approuverEtLancerImage: vi.fn(), controlerMediaImage: vi.fn(),
}));
vi.mock('../app/actions/studios/execution', () => ({ annulerJob: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1', useRouter: () => ({ refresh: m.refresh, push: () => {} }) }));
vi.mock('../lib/studios/produit/compression-photo', () => ({ compresserPhoto: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: unknown }) => <a href={href} {...(r as object)}>{children as never}</a> }));

import { LIBELLES_ROLE } from '@tiktrends/core';
import { Produit } from '../spatial/vues/projet/Produit';
import { avecSpatial } from './spatial/fournisseur';
import type { VueProduit } from '../lib/studios/produit/vue';

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
const bouton = (libelle: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === libelle || b.getAttribute('aria-label') === libelle) as HTMLButtonElement;
const choisir = (el: HTMLSelectElement, valeur: string) => act(() => { el.value = valeur; el.dispatchEvent(new Event('change', { bubbles: true })); });
/* L'éditeur d'image est gardé sur sa vue Spatial (`spatial-editeur-gestes`, `spatial-editeur-zoom`) · ses cas ont quitté ce fichier avec l'éditeur V5. */

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

/** Produit · porté sur l'atelier Spatial (`spatial/vues/projet/Produit.tsx`) quand la page V5 a été retirée (vague 2). */
describe('UX-03 · produit · la prochaine action est dite', () => {
  it('photo unique sélectionnée sans écriture et génération masquée avant confirmation', () => {
    monter(avecSpatial(<Produit vue={vueProduit()} atelier={[]} />));
    expect(document.querySelector('[role=radio]')?.getAttribute('aria-checked')).toBe('true');
    expect(bouton('Utiliser cette photo et continuer').disabled).toBe(false);
    expect(document.querySelector('[data-zone=parcours-image]')).toBeNull();
  });
  it('rôle et portée choisis, fichier absent · « Associer » dit « Choisis un fichier. »', () => {
    monter(avecSpatial(<Produit vue={vueProduit()} atelier={[]} />));
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
    const v = vueProduit(); v.produits[0]!.photos = [];
    monter(avecSpatial(<Produit vue={v} atelier={[]} />));
    const b = bouton('Utiliser cette photo et continuer');
    expect(b.disabled).toBe(true);
    expect(document.getElementById(b.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Choisis d’abord une photo.');
  });
});
