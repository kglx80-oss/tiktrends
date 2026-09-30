// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JarvisContexte } from '../app/(app)/jarvis/JarvisContexte';

/**
 * Le contexte de marque, au clavier · PROUVÉ au comportement (jsdom).
 *
 * Défaut relevé à la recette (Codex, 30/09) : Échap refermait bien le panneau,
 * mais le focus retombait sur <body> · au clavier on repartait en haut de page.
 * Le correctif branche `usePiegeFocus` (le piège partagé, éprouvé une fois) ·
 * on vérifie ici le RÉSULTAT sur le VRAI composant : à l'ouverture le focus
 * entre dans le panneau, à la fermeture il REVIENT au déclencheur.
 *
 * On simule `next/link` par une ancre simple · ce test ne monte pas de routeur
 * et ne clique aucun lien, il ne regarde que le focus.
 */
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: unknown; children: ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...p}>{children}</a>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom ne fait aucune mise en page · `offsetParent` y est toujours `null`, ce
// qui masquerait tous les focusables au filtre du hook. On le rétablit.
let offsetDescripteurOrigine: PropertyDescriptor | undefined;
beforeAll(() => {
  offsetDescripteurOrigine = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) { return this.parentNode as Element | null; },
  });
});
afterAll(() => {
  if (offsetDescripteurOrigine) Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', offsetDescripteurOrigine);
});

let container: HTMLDivElement;
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});
function monter(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const touche = (init: KeyboardEventInit) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })); });

/** Le bouton « Ajouter du contexte » et le panneau qu'il ouvre. */
function Pilote() {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button id="declencheur" type="button" onClick={() => setOuvert(true)}>Ajouter du contexte</button>
      {ouvert && (
        <JarvisContexte
          contexte={{ brandId: 'b-1', identity: 'X', rules: 'Y', hooks: null }}
          brandName="Neva"
          measuredAds={3}
          onClose={() => setOuvert(false)}
        />
      )}
    </div>
  );
}

describe('JarvisContexte · le clavier ne se perd pas à la fermeture', () => {
  it('à l’ouverture le focus entre dans le panneau, à la fermeture (Échap) il revient au déclencheur', () => {
    vi.useFakeTimers();
    monter(<Pilote />);
    q('#declencheur').focus();
    act(() => { q<HTMLButtonElement>('#declencheur').click(); });
    act(() => { vi.advanceTimersByTime(30); });
    const dialog = q('[role="dialog"]');
    expect(dialog.contains(document.activeElement), 'le focus doit entrer dans le contexte').toBe(true);
    // Échap ferme · onClose démonte le panneau · le piège rend le focus.
    touche({ key: 'Escape' });
    expect(document.activeElement, 'à la fermeture, le focus revient au bouton « Ajouter du contexte »').toBe(q('#declencheur'));
  });
});
