// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Modal } from '../components/Modal';

/**
 * Raccord vague 8 · cahier Studios §153 : à 390 × 720, « panneau plein écran
 * refermable ». La recette L8-B a mesuré la fenêtre « Préparer une création »
 * et les confirmations ADMIN à 80 vh, sous 10 vh de marge, sur téléphone.
 *
 * On lit le RÉSULTAT dans le DOM : la fenêtre qui le DEMANDE passe en plein
 * écran sur téléphone, et SEULEMENT elle (les autres écrans gardent leur
 * fenêtre centrée), et jamais sur un écran large.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let hote: HTMLDivElement;
let root: Root;
afterEach(() => { act(() => root.unmount()); hote.remove(); });

function monter(largeur: number, plein: boolean): HTMLElement {
  window.matchMedia = ((q: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(q)?.[1] ?? 0);
    return { matches: largeur <= max, media: q, addEventListener: () => {}, removeEventListener: () => {}, onchange: null, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false };
  }) as typeof window.matchMedia;
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  act(() => root.render(<Modal open onClose={() => {}} title="Préparer une création" pleinEcranTelephone={plein}><p>contenu</p></Modal>));
  return document.querySelector('[role="dialog"]') as HTMLElement;
}

describe('Modal · plein écran sur téléphone quand l’écran le demande', () => {
  it('390 px et demandé ⇒ plein écran, sans marge', () => {
    const d = monter(390, true);
    expect(d.getAttribute('data-plein-ecran'), 'fenêtre Studios pas en plein écran à 390').toBe('oui');
    expect(d.style.height).toBe('100dvh');
    expect((d.parentElement as HTMLElement).style.padding).toBe('0px');
  });
  it('390 px sans le demander ⇒ fenêtre centrée inchangée (les autres écrans ne bougent pas)', () => {
    const d = monter(390, false);
    expect(d.getAttribute('data-plein-ecran')).toBeNull();
    expect(d.style.maxHeight).toBe('80vh');
  });
  it('1280 px et demandé ⇒ fenêtre centrée', () => {
    const d = monter(1280, true);
    expect(d.getAttribute('data-plein-ecran')).toBeNull();
    expect(d.style.maxHeight).toBe('80vh');
  });
});
