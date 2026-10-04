// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Pager } from '../components/Pager';

/**
 * Lot 12 · pagination de la galerie Image (47 visuels, 2 pages), mesurée au
 * navigateur · « › » vers la dernière page devenait désactivé et le focus
 * tombait sur <body> ; « ‹ » et « › » n'avaient pas de nom ; la page courante
 * n'était annoncée que par la couleur.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });
function Hote() { const [p, setP] = useState(0); return <Pager page={p} total={47} onPage={setP} />; }

describe('Pagination · nommée, page courante annoncée, focus gardé', () => {
  it('noms et page courante', () => {
    const h = renderToStaticMarkup(<Pager page={0} total={47} onPage={() => {}} />);
    expect(h).toContain('aria-label="Pagination"');
    expect(h).toContain('aria-label="Page précédente"');
    expect(h).toContain('aria-label="Page suivante"');
    expect(h).toMatch(/aria-label="Page 1" aria-current="page"/);
  });
  it('« › » vers la dernière page · le focus passe au numéro courant, jamais sur body', () => {
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    act(() => { root!.render(<Hote />); });
    const suiv = el.querySelector<HTMLButtonElement>('[aria-label="Page suivante"]')!;
    suiv.focus();
    act(() => { suiv.click(); });
    expect(suiv.disabled).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label'), 'focus perdu').toBe('Page 2');
  });
});
