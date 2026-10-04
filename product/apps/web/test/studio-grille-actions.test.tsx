// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';

vi.mock('../app/actions/creatives', () => ({ rateCreativeAction: vi.fn() }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackGeneratedAdAction: vi.fn() }));
import { CreativeActions } from '../components/CreativeActions';
import { Composer } from '../components/Composer';

/**
 * Lot 11 · cartes Image et Vidéo en desktop. Mesuré au lot 10 · les six
 * actions passaient à la ligne en vrac (espaceur flexible, pouces poussés à
 * droite) ; dans les menus du composeur, la coche ✓ tombait AU-DESSUS du ratio
 * (ligne de menu en colonne flex, coche et libellé en deux enfants).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });
function monter(n: React.ReactNode) {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  act(() => { root!.render(n); });
  return el;
}
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Cartes Image et Vidéo · actions en grille', () => {
  it('grille de cases ≥ 44 px, pouces sur deux cases, ordre clavier inchangé', () => {
    const h = monter(<CreativeActions genId="f1700000-0000-4000-8000-0000000000a1:https://exemple.test/a.png" onOpen={() => {}} downloadUrl="https://exemple.test/a.png" onArchive={() => {}} trackable />);
    const g = h.firstElementChild as HTMLElement;
    expect(g.style.display, 'la barre n’est pas une grille').toBe('grid');
    expect(g.style.gridTemplateColumns).toBe(`repeat(auto-fill, minmax(${CIBLE_TACTILE_MIN}px, 1fr))`);
    const noms = [...h.querySelectorAll('button, a')].map((x) => x.getAttribute('aria-label'));
    expect(noms, 'une action a disparu ou changé de place au clavier').toEqual(['Ouvrir', 'Télécharger', 'Pertinent', 'Pas pertinent', 'Suivre dans Adsmap', 'Archiver']);
    const enfants = [...g.children] as HTMLElement[];
    expect(enfants.length, 'un espaceur ou une case en trop subsiste').toBe(5);
    const pouces = enfants.find((x) => x.querySelector('[aria-label="Pertinent"]'))!;
    expect(pouces.style.gridColumn, 'la paire de pouces doit occuper deux cases').toBe('span 2');
  });
  for (const p of ['app/(app)/studio/image/ImageStudio.tsx', 'app/(app)/studio/video/VideoStudioFull.tsx']) {
    it(`${p.split('/').pop()} · la carte loge quatre cases sur une ligne`, () => {
      const s = src(p);
      const min = Number(/repeat\(auto-fill, minmax\((\d+)px, 1fr\)\)', gap: 14[ ,]/.exec(s)?.[1]);
      // Bord 2 × 1 px, marge intérieure 2 × 12 px au plus (Image 11, Vidéo 12).
      const interieur = min - 2 - 24;
      expect(interieur, `carte de ${min} px · ${interieur} px utiles, il en faut ${4 * CIBLE_TACTILE_MIN + 18}`).toBeGreaterThanOrEqual(4 * CIBLE_TACTILE_MIN + 3 * 6);
    });
  }
});

describe('Menus du composeur · coche et valeur sur une ligne', () => {
  it('la coche et le ratio partagent la même ligne', () => {
    const h = monter(<Composer value="" onChange={() => {}} onGenerate={() => {}}
      controls={[{ key: 'format', title: 'Format', value: '1:1', onChange: () => {}, options: [{ value: '1:1', label: '1:1' }, { value: '4:5', label: '4:5' }] }]} />);
    const b = [...h.querySelectorAll('button')].find((x) => x.textContent?.startsWith('1:1'))!;
    act(() => { b.click(); });
    const panneau = document.getElementById(b.getAttribute('aria-controls')!)!;
    const choisie = panneau.querySelector('[aria-pressed="true"]') as HTMLElement;
    // L'option est une colonne flex · chaque enfant DIRECT est une ligne.
    expect(choisie.style.flexDirection).toBe('column');
    const lignes = [...choisie.children] as HTMLElement[];
    expect(lignes.length, 'coche et valeur sont deux lignes empilées').toBe(1);
    expect(lignes[0]!.textContent).toBe('✓1:1');
    expect(lignes[0]!.style.display).toBe('inline-flex');
    const autre = panneau.querySelector('[aria-pressed="false"]') as HTMLElement;
    expect(autre.textContent, 'la valeur non choisie porte une coche').toBe('4:5');
  });
});
