// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { contenuVide, libelleZoom, zoomAjuste, type DocumentStudio } from '@tiktrends/core';

/**
 * Spatial · Éditeur (`/studio/projets/[id]/image`) · le zoom de la zone de
 * travail et les panneaux plein écran du téléphone, portés de l'éditeur V5.
 * On monte la VRAIE vue (jsdom), on clique et on presse des touches comme un
 * humain, et on LIT ce qui sort : la largeur affichée du document, la valeur
 * du zoom, les panneaux ouverts, et le patch reçu par `enregistrerDocument`.
 *
 * jsdom ne fait aucune mise en page · la zone reçoit la taille mesurée sur le
 * banc (497 × 516) et `matchMedia` dit « ordinateur » ou « téléphone ».
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1/image', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const actions = vi.hoisted(() => ({
  enregistrerDocument: vi.fn(async () => ({ ok: true, version: { id: 'v4', n: 4 }, inchange: false })),
  relireDocumentEditeur: vi.fn(), listerVersionsDocument: vi.fn(), restaurerVersionDocument: vi.fn(), apercuVersionDocument: vi.fn(),
}));
vi.mock('../app/actions/studios/projets', () => actions);
vi.mock('../lib/studios/editeur/actions', () => actions);

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { Editeur } = await import('../spatial/vues/projet/Editeur');
type PropsEditeur = import('../spatial/vues/projet/Editeur').PropsEditeur;
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const DOC: DocumentStudio = {
  width: 1080, height: 1350, colorSpace: 'sRGB', fonts: { sans: { family: 'Liberation Sans', assetId: null } },
  layers: {
    produit: { id: 'produit', kind: 'image', name: 'Produit', visible: true, locked: true, x: 200, y: 300, width: 600, height: 600, rotationDeg: 0, opacity: 1, z: 0, assetId: 'a-prod', sourceWidth: 600, sourceHeight: 600, mask: null },
    accroche: { id: 'accroche', kind: 'text', name: 'Accroche', visible: true, locked: false, x: 60, y: 1100, width: 960, height: 200, rotationDeg: 0, opacity: 1, z: 1, text: 'Une accroche réelle', fontId: 'sans', fontSizePx: 64, color: '#ffffff', align: 'center', lineHeight: 1.2 },
  },
} as DocumentStudio;
const props = (o: Partial<PropsEditeur> = {}): PropsEditeur => ({
  projet: { id: 'p1', titre: 'Titre', marque: 'Marque' }, version: { id: 'v3', n: 3 }, contenu: { ...contenuVide(), document: DOC },
  document: DOC, formatPropose: { format: '4:5', depuisBrief: false, texte: null }, produit: null, medias: [], apercus: {},
  peutEnregistrer: true, couleursMarque: [], exporterHref: null, variantesHref: '/studio/projets/p1#variantes', ...o,
});

const ZONE = { largeur: 497, hauteur: 516 };
let telephone = false;
const restaurer: Array<() => void> = [];
beforeAll(() => {
  const proto = window.HTMLElement.prototype;
  for (const k of ['clientWidth', 'clientHeight']) {
    const d = Object.getOwnPropertyDescriptor(proto, k) ?? Object.getOwnPropertyDescriptor(window.Element.prototype, k);
    restaurer.push(() => { if (d) Object.defineProperty(proto, k, d); });
  }
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-zone-travail') ? ZONE.largeur : 0; } });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-zone-travail') ? ZONE.hauteur : 0; } });
  const mm = window.matchMedia;
  window.matchMedia = ((q: string) => ({ matches: telephone && q.includes('760'), media: q, addEventListener: () => {}, removeEventListener: () => {}, onchange: null, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
  restaurer.push(() => { window.matchMedia = mm; });
});
afterAll(() => { for (const r of restaurer) r(); });

let hote: HTMLDivElement;
let racine: Root | null = null;
beforeEach(() => { telephone = false; hote = document.createElement('div'); document.body.appendChild(hote); vi.clearAllMocks(); window.localStorage.clear(); });
afterEach(() => { act(() => racine?.unmount()); racine = null; document.body.innerHTML = ''; });
const monter = async (p: PropsEditeur) => { await act(async () => { racine = createRoot(hote); racine.render(<FournisseurSpatial value={CTX}>{<Editeur {...p} />}</FournisseurSpatial>); }); };
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T | null;
const cliquer = async (b: Element | null) => { expect(b, 'élément introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const touche = async (key: string, o: Partial<KeyboardEventInit> = {}, cible: EventTarget = window) => { await act(async () => { cible.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...o })); }); };
const largeurAffichee = () => parseFloat($('[data-zone-travail] > div > div')?.style.width ?? '');
const valeur = () => $('[data-zoom-valeur]')!.textContent;

describe('Spatial · Éditeur · zoom de la zone de travail', () => {
  it('ajusté à l’ouverture · la largeur affichée est celle que calcule le noyau, et « Ajuster » est actif', async () => {
    await monter(props());
    const z = zoomAjuste({ width: 1080, height: 1350 }, ZONE);
    expect(largeurAffichee()).toBeCloseTo(1080 * z, 5);
    expect(valeur()).toBe(libelleZoom(z));
    expect($('[data-zoom-action="ajuster"]')!.getAttribute('aria-pressed')).toBe('true');
    expect($('#art [data-barre="zoom"]')).not.toBeNull();
    // Le cadre du document remplit la largeur que le zoom lui donne · la largeur plafonnée de la maquette (380 px) ne s'applique plus.
    expect($('#art .ad')!.style.width).toBe('100%');
    expect($('#art .ad')!.style.maxWidth).toBe('none');
  });

  it('+ et − avancent par paliers, la valeur ramène à 100 %, « Ajuster » recadre', async () => {
    await monter(props());
    const ajuste = largeurAffichee();
    await cliquer($('[data-zoom-action="plus"]'));
    expect(largeurAffichee()).toBeGreaterThan(ajuste);
    expect($('[data-zoom-action="ajuster"]')!.getAttribute('aria-pressed')).toBe('false');
    await cliquer($('[data-zoom-action="reelle"]'));
    expect(valeur()).toBe(libelleZoom(1));
    expect(largeurAffichee()).toBe(1080);
    await cliquer($('[data-zoom-action="moins"]'));
    expect(largeurAffichee()).toBeLessThan(1080);
    await cliquer($('[data-zoom-action="ajuster"]'));
    expect(largeurAffichee()).toBeCloseTo(ajuste, 5);
  });

  it('raccourcis Ctrl+ · Ctrl− · Ctrl+0 · jamais pendant une saisie', async () => {
    await monter(props({ selectionInitiale: 'accroche' }));
    const ajuste = largeurAffichee();
    await touche('=');
    const apresPlus = largeurAffichee();
    expect(apresPlus).toBeGreaterThan(ajuste);
    await touche('0');
    expect(largeurAffichee()).toBeCloseTo(ajuste, 5);
    await touche('-');
    expect(largeurAffichee()).toBeLessThan(ajuste);
    await touche('0');
    // Dans le champ de texte, la touche reste au navigateur · le zoom ne bouge pas.
    const champ = $('#stext')!;
    champ.focus();
    await touche('=', {}, champ);
    expect(largeurAffichee()).toBeCloseTo(ajuste, 5);
  });

  it('zoomer ne touche ni le document ni l’historique · rien à enregistrer', async () => {
    await monter(props());
    await cliquer($('[data-zoom-action="plus"]'));
    await touche('-');
    expect((document.querySelector('.wshead .btn.pri') as HTMLButtonElement).disabled).toBe(true);
    expect(actions.enregistrerDocument).not.toHaveBeenCalled();
  });
});

describe('Spatial · Éditeur · panneaux plein écran au téléphone', () => {
  it('sur ordinateur, calques et inspecteur restent dans la page · aucun bouton de panneau', async () => {
    await monter(props());
    expect($('aside.layers')).not.toBeNull();
    expect($('aside.insp')).not.toBeNull();
    expect($('[data-ouvrir-panneau]')).toBeNull();
  });

  it('au téléphone, « Calques » ouvre un panneau plein écran · choisir un calque ouvre ses propriétés', async () => {
    telephone = true;
    await monter(props());
    expect($('aside.layers')).toBeNull();
    expect($('aside.insp')).toBeNull();
    expect(($('[data-ouvrir-panneau="proprietes"]') as HTMLButtonElement).disabled).toBe(true);
    await cliquer($('[data-ouvrir-panneau="calques"]'));
    const p = $('[data-panneau-mobile="calques"]')!;
    expect(p.getAttribute('role')).toBe('dialog');
    expect(p.getAttribute('aria-modal')).toBe('true');
    expect(p.style.height).toBe('100dvh');
    await cliquer(p.querySelector('[data-layer="accroche"]'));
    expect($('[data-panneau-mobile="calques"]')).toBeNull();
    const prop = $('[data-panneau-mobile="proprietes"]')!;
    expect(prop.textContent).toMatch(/Propriétés de « Accroche »/);
    expect(prop.querySelector('#stext')).not.toBeNull();
  });

  it('les propriétés au téléphone modifient vraiment le calque, Échap referme, et l’enregistrement envoie le patch', async () => {
    telephone = true;
    await monter(props({ selectionInitiale: 'accroche' }));
    await cliquer($('[data-ouvrir-panneau="proprietes"]'));
    const ta = $('[data-panneau-mobile="proprietes"] #stext') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(ta, 'Accroche du téléphone'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { ta.focus(); ta.blur(); });
    await act(async () => { $('[data-panneau-mobile="proprietes"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect($('[data-panneau-mobile]')).toBeNull();
    expect($('[data-calque="accroche"]')!.textContent).toBe('Accroche du téléphone');
    await cliquer(document.querySelector('.wshead .btn.pri'));
    expect(actions.enregistrerDocument).toHaveBeenCalledWith(expect.objectContaining({ baseVersionId: 'v3', changes: [expect.objectContaining({ path: '/document/layers/accroche/text', newValue: 'Accroche du téléphone' })] }));
  });
});
