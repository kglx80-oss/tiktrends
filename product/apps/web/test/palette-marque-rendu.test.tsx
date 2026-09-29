// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PaletteMarque } from '../app/(app)/brands/[id]/PaletteMarque';

/**
 * La palette, PROUVÉE au comportement · pas la présence d'un appel.
 *
 * On monte le composant dans un DOM (jsdom) et on lit ce qui s'affiche :
 *  · au repos, N CERCLES et AUCUN code hex en vrac ;
 *  · au clic (et à Entrée), la pastille OUVRE son hex + un bouton Copier ;
 *  · le focus clavier atteint CHAQUE pastille (pas de dépendance au survol).
 *
 * Ce sont les comportements que la refonte promet · un rendu statique ne les
 * verrait pas (ni le clic, ni le focus, ni l'état ouvert).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COULEURS = ['#ff0044', '#00c4cc', '#ffe01b'];

let container: HTMLDivElement;
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function monter(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

const pastilles = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[data-pastille]'));
const boutonCopier = () => Array.from(container.querySelectorAll('button')).find((b) => /Copier|Copié/.test(b.textContent ?? ''));

describe('PaletteMarque · les cercles au repos, le hex au clic', () => {
  it('rend un cercle par couleur, et AUCUN hex en vrac au repos', () => {
    monter(<PaletteMarque colors={COULEURS} />);
    expect(pastilles(), 'une pastille par couleur').toHaveLength(COULEURS.length);
    // Le hex ne doit PAS être écrit sous les cercles · c'est le mur qu'on retire.
    for (const c of COULEURS) {
      expect(container.textContent ?? '', `le hex ${c} est affiché au repos`).not.toContain(c);
    }
    expect(boutonCopier(), 'aucun bouton Copier ne doit apparaître au repos').toBeUndefined();
  });

  it('au clic, la pastille ouvre son HEX et un bouton Copier', () => {
    monter(<PaletteMarque colors={COULEURS} />);
    act(() => { pastilles()[1]!.click(); });
    const code = container.querySelector('code');
    expect(code?.textContent, 'le HEX de la couleur cliquée n’est pas affiché').toBe(COULEURS[1]);
    expect(boutonCopier(), 'le bouton Copier n’apparaît pas').toBeTruthy();
    expect(pastilles()[1]!.getAttribute('aria-expanded'), 'la pastille n’est pas marquée ouverte').toBe('true');
  });

  it('Entrée ouvre le détail au clavier (pas seulement le pointeur)', () => {
    monter(<PaletteMarque colors={COULEURS} />);
    const p = pastilles()[0]!;
    act(() => { p.focus(); });
    act(() => { p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(container.querySelector('code')?.textContent, 'Entrée n’ouvre pas le HEX').toBe(COULEURS[0]);
  });

  it('le focus clavier atteint chaque pastille', () => {
    monter(<PaletteMarque colors={COULEURS} />);
    for (const p of pastilles()) {
      act(() => { p.focus(); });
      expect(document.activeElement, 'une pastille n’est pas atteignable au clavier').toBe(p);
    }
  });

  it('cliquer Copier confirme (Copié) sans jeter', () => {
    monter(<PaletteMarque colors={COULEURS} />);
    act(() => { pastilles()[0]!.click(); });
    const copier = boutonCopier()!;
    expect(() => act(() => { copier.click(); })).not.toThrow();
    expect(boutonCopier()?.textContent, 'la copie n’est pas confirmée').toContain('Copié');
  });

  it('sans couleur, la palette ne montre pas de cercle', () => {
    monter(<PaletteMarque colors={[]} />);
    expect(pastilles(), 'des pastilles apparaissent sans couleur').toHaveLength(0);
  });
});
