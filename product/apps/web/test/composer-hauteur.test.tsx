// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Composer } from '../components/Composer';

/**
 * Recette I2 (390) · le champ d'angle des réglages repliés se réduisait à ~10 px
 * une fois déplié · texte rogné par son cadre. Cause · l'auto-hauteur mesurait
 * la zone MASQUÉE (scrollHeight 0) et figeait « 0px ». On monte le vrai
 * Composer et on lit la hauteur qu'il pose · jsdom mesure 0 comme une zone
 * masquée ; on simule la zone visible en donnant une hauteur de contenu.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });

function monter(value: string) {
  el = document.createElement('div'); el.hidden = true; document.body.appendChild(el); root = createRoot(el);
  act(() => { root!.render(<Composer value={value} onChange={() => {}} onGenerate={() => {}} />); });
  return el.querySelector('textarea')!;
}
const contenu = (ta: HTMLTextAreaElement, h: number) => Object.defineProperty(ta, 'scrollHeight', { configurable: true, get: () => h });

describe('Composer · la zone de texte reste lisible quand on la déplie', () => {
  it('masquée au montage · aucune hauteur figée (jamais « 0px »)', () => {
    const ta = monter('Angle 1');
    expect(ta.style.height, 'hauteur figée sur une zone masquée').toBe('');
  });
  it('plancher de deux lignes, quel que soit le calcul', () => {
    expect(monter('Angle 1').style.minHeight).toBe('calc(3.1em + 10px)');
  });
  it('dépliée puis focalisée · la hauteur suit le contenu', () => {
    const ta = monter('Angle 1');
    el!.hidden = false; contenu(ta, 72);
    act(() => { ta.focus(); });
    expect(ta.style.height).toBe('72px');
  });
  it('texte long · la zone grandit jusqu’à 220 px puis défile (pas au-delà)', () => {
    const ta = monter('Angle 1');
    el!.hidden = false; contenu(ta, 400);
    act(() => { ta.focus(); });
    expect(ta.style.height).toBe('220px');
  });
});
