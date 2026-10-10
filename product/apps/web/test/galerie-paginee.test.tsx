// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { focusApresRetrait } from '../components/focusApresRetrait';
describe('Retrait d’une carte · le focus reste dans la galerie (lot 13)', () => {
  const grille = (n: number) => { const g = document.createElement('div'); for (let i = 0; i < n; i++) { const c = document.createElement('div'); const b = document.createElement('button'); b.textContent = `c${i}`; c.appendChild(b); g.appendChild(c); } document.body.appendChild(g); return g; };
  const titre = () => { const h = document.createElement('h2'); h.tabIndex = -1; h.textContent = 'Tes visuels'; document.body.appendChild(h); return h; };
  it('même rang, sinon la dernière carte, sinon le titre · jamais body', () => {
    const raf = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as typeof requestAnimationFrame;
    try {
      const g = grille(3); const h = titre();
      focusApresRetrait(g, 1, h); expect(document.activeElement?.textContent).toBe('c1');
      focusApresRetrait(g, 9, h); expect(document.activeElement?.textContent, 'au-delà · la dernière carte').toBe('c2');
      const vide = grille(0); focusApresRetrait(vide, 0, h); expect(document.activeElement, 'grille vide · le titre').toBe(h);
    } finally { globalThis.requestAnimationFrame = raf; document.body.innerHTML = ''; }
  });
});
