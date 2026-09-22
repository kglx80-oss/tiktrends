// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePiegeFocus } from '../components/use-piege-focus';

/**
 * Le piège à focus, PROUVÉ au comportement · on monte un dialogue dans un DOM
 * (jsdom), on avance le minuteur d'ouverture, et on lit `document.activeElement`
 * après chaque geste clavier. Ce que `renderToStaticMarkup` ne peut pas voir :
 * un effet, un focus, un Tab. C'est la garde qui manquait à cette famille.
 *
 * jsdom ne fait aucune mise en page · `offsetParent` y est toujours `null`, ce
 * qui masquerait tous les focusables au filtre du hook. On le rétablit sur les
 * éléments attachés (leur parent), pour refléter la visibilité réelle.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

/** Un dialogue minimal qui utilise le hook · deux boutons focusables. */
function Dialogue({ actif, onFermer }: { actif: boolean; onFermer: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  usePiegeFocus(ref, { actif, onFermer });
  return (
    <div>
      <button id="dehors" type="button">dehors</button>
      {actif && (
        <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
          <button id="a" type="button">A</button>
          <button id="b" type="button">B</button>
        </div>
      )}
    </div>
  );
}

/** Enveloppe pilotable · expose un bouton qui ouvre/ferme le dialogue. */
function Pilote({ onFermer }: { onFermer: () => void }) {
  const [actif, setActif] = useState(false);
  return (
    <div>
      <button id="declencheur" type="button" onClick={() => setActif((v) => !v)}>ouvrir</button>
      <Dialogue actif={actif} onFermer={() => { setActif(false); onFermer(); }} />
    </div>
  );
}

const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const touche = (init: KeyboardEventInit) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })); });

describe('usePiegeFocus · le clavier ne quitte pas la fenêtre', () => {
  it('à l’ouverture, le focus entre dans la fenêtre (premier focusable)', () => {
    vi.useFakeTimers();
    monter(<Dialogue actif onFermer={() => {}} />);
    act(() => { vi.advanceTimersByTime(30); });
    expect(document.activeElement, 'le focus doit être sur le premier bouton du dialogue').toBe(q('#a'));
  });

  it('Échap ferme', () => {
    vi.useFakeTimers();
    const onFermer = vi.fn();
    monter(<Dialogue actif onFermer={onFermer} />);
    act(() => { vi.advanceTimersByTime(30); });
    touche({ key: 'Escape' });
    expect(onFermer).toHaveBeenCalledTimes(1);
  });

  it('Tab sur le dernier revient au premier ; Shift+Tab sur le premier va au dernier', () => {
    vi.useFakeTimers();
    monter(<Dialogue actif onFermer={() => {}} />);
    act(() => { vi.advanceTimersByTime(30); });

    q('#b').focus();
    touche({ key: 'Tab' });
    expect(document.activeElement, 'Tab depuis le dernier doit revenir au premier').toBe(q('#a'));

    q('#a').focus();
    touche({ key: 'Tab', shiftKey: true });
    expect(document.activeElement, 'Shift+Tab depuis le premier doit aller au dernier').toBe(q('#b'));
  });

  // CDC v8 · F04 · dans un écran lourd, le parent d'une fenêtre modale se re-rend
  // souvent. Avec un `onFermer` INLINE, l'effet ne doit PAS se réabonner à chaque
  // rendu (centaines de cycles addEventListener/removeEventListener · la
  // fragilité qui pouvait faire manquer Échap). On prouve : un seul abonnement
  // « keydown » par ouverture MALGRÉ les re-rendus, et Échap ferme toujours.
  it('un onFermer inline ne réabonne pas l’écouteur à chaque rendu (stable), et Échap ferme', () => {
    vi.useFakeTimers();
    let ajoutsKeydown = 0;
    const origAdd = window.addEventListener.bind(window);
    const spy = vi.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        if (type === 'keydown') ajoutsKeydown += 1;
        origAdd(type as keyof WindowEventMap, listener, options);
      },
    );

    const ferme = vi.fn();
    // Parent qui SE RE-REND en boucle bornée pendant que la fenêtre est ouverte,
    // avec un onFermer recréé à chaque rendu.
    function Parent() {
      const [n, setN] = useState(0);
      useEffect(() => { if (n < 5) setN((v) => v + 1); }, [n]);
      const ref = useRef<HTMLDivElement>(null);
      usePiegeFocus(ref, { actif: true, onFermer: () => ferme(n) });
      return <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}><button id="a" type="button">A</button></div>;
    }
    monter(<Parent />);
    act(() => { vi.advanceTimersByTime(30); });

    expect(ajoutsKeydown, 'un seul abonnement keydown malgré 5 re-rendus').toBe(1);
    touche({ key: 'Escape' });
    expect(ferme, 'Échap ferme, avec le onFermer le plus récent').toHaveBeenCalled();
    spy.mockRestore();
  });

  it('à la fermeture, le focus revient au déclencheur', () => {
    vi.useFakeTimers();
    monter(<Pilote onFermer={() => {}} />);
    // Focus le déclencheur, puis ouvre · le hook mémorise ce déclencheur.
    q('#declencheur').focus();
    act(() => { q<HTMLButtonElement>('#declencheur').click(); });
    act(() => { vi.advanceTimersByTime(30); });
    expect(document.activeElement, 'le focus doit être entré dans le dialogue').toBe(q('#a'));
    // Ferme · le focus doit revenir au déclencheur.
    touche({ key: 'Escape' });
    expect(document.activeElement, 'à la fermeture, le focus revient au déclencheur').toBe(q('#declencheur'));
  });
});
