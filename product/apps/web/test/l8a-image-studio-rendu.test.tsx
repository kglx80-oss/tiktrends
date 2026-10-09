// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * L8-A · Image IA (route historique `/studio/image`) monté pour de vrai et lu
 * dans le DOM. Mesuré au navigateur à 390 × 720 : un nom de produit long
 * élargissait la page à 831 px (le sélecteur portait `width: auto` et
 * `minWidth: 200`), ses champs étaient à 14 px (zoom forcé sur téléphone),
 * le libellé « Produit de la marque » n'était relié à aucun champ et
 * « ou coller un lien direct » faisait 17 px de haut.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../app/actions/image', () => ({
  generateImageAction: vi.fn(), suggestImageBriefAction: vi.fn(), setProductImageAction: vi.fn(), scoreImageAction: vi.fn(), pageImagesMarque: vi.fn(),
}));
vi.mock('../app/actions/creatives', () => ({ archiveCreativeAction: vi.fn(), rateCreativeAction: vi.fn() }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackGeneratedAdAction: vi.fn() }));
vi.mock('../app/actions/preflight', () => ({ preflightAction: vi.fn(async () => null) }));
vi.mock('../app/actions/presets', () => ({ listPresetsAction: vi.fn(async () => []), savePresetAction: vi.fn() }));

import { ImageStudio } from '../app/(app)/studio/image/ImageStudio';
import { ToastProvider } from '../components/Toast';

let racine: Root | null = null;
let conteneur: HTMLDivElement | null = null;
afterEach(() => { if (racine) act(() => racine!.unmount()); racine = null; conteneur?.remove(); });

const LONG = 'Sérum Clarté intensif anti-imperfections à la niacinamide et au zinc, édition limitée coffret découverte trois flacons';
const VIDE = { items: [], page: 0, pages: 1, de: 0, a: 0, sorties: 0, generations: 0, notes: { up: 0, down: 0 }, jusqua: '2026-10-09T00:00:00Z' };

describe('Image IA · le formulaire tient dans l’écran, au clavier et au doigt', () => {
  it('sélecteur de produit borné au cadre, relié à son libellé, champs à 16 px, « lien direct » à 44 px', () => {
    conteneur = document.createElement('div');
    document.body.appendChild(conteneur);
    racine = createRoot(conteneur);
    act(() => racine!.render(
      <ToastProvider><ImageStudio ready={false} aiReady={false} brandName="Éclat" initial={VIDE as never} products={[{ id: 'p1', name: LONG, hasImage: true }]} brandColors={[]} /></ToastProvider>,
    ));
    const libelle = [...document.querySelectorAll('label')].find((l) => l.textContent === 'Produit de la marque')!;
    const select = document.getElementById(libelle.htmlFor) as HTMLSelectElement | null;
    expect(select?.tagName, '« Produit de la marque » n’est relié à aucun champ').toBe('SELECT');
    expect(select!.style.width, 'largeur libre · un nom long élargit la page').toBe('100%');
    expect(select!.style.maxWidth).toBe('100%');
    expect(select!.style.minWidth, 'largeur minimale imposée').toBe('');
    expect((select!.parentElement as HTMLElement).style.minWidth, 'le cadre du sélecteur ne peut pas rétrécir').toBe('0px');
    for (const c of [select!, document.querySelector<HTMLInputElement>('input[aria-label="Lien direct vers la photo produit"]')!]) {
      expect(c.style.fontSize, `${c.tagName} sous 16 px`).toBe('16px');
    }
    const resume = [...document.querySelectorAll('summary')].find((s) => s.textContent?.includes('lien direct')) as HTMLElement;
    expect(resume.style.minHeight, 'cible « lien direct » sous 44 px').toBe('44px');
  });
});
