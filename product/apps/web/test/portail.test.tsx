// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Portail } from '../components/Portail';

/**
 * `Portail` doit sortir ses enfants de l'ancêtre transformé qui, sinon, piège un
 * descendant `position: fixed` (le défaut « premier clic » de la fenêtre
 * « Nouvelle marque »). On monte le contenu DANS un piège transformé et on lit
 * l'arbre : l'enfant ne doit PAS y rester, il doit être rattaché à `<body>`.
 *
 * Mutation-preuve : faire rendre `Portail` ses enfants en place (`return
 * <>{children}</>`) remet l'enfant SOUS le piège · `piege.contains(cible)`
 * repasse à `true` et ce test échoue.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let piege: HTMLDivElement;
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  piege.remove();
});

describe('Portail · monte ses enfants sur <body>, hors du piège d’empilement', () => {
  it('rendu sous un ancêtre transformé, l’enfant atterrit sur <body>', () => {
    piege = document.createElement('div');
    piege.style.transform = 'translateZ(0)';
    document.body.appendChild(piege);
    root = createRoot(piege);
    act(() => root.render(<Portail><div data-cible>x</div></Portail>));

    const cible = document.querySelector('[data-cible]');
    expect(cible, 'l’enfant doit être rendu').not.toBeNull();
    expect(piege.contains(cible), 'l’enfant ne doit PAS rester sous l’ancêtre transformé').toBe(false);
    expect(cible!.parentElement, 'l’enfant doit être monté sur <body>').toBe(document.body);
  });
});
