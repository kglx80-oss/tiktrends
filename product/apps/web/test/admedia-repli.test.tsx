// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AdMedia } from '../components/AdMedia';

/**
 * Recette I1 #2 · une vignette qui ne charge pas montrait l'icône d'image cassée
 * du navigateur et son grand cadre natif. On monte le vrai composant (jsdom) et
 * on provoque l'échec · le repli doit remplacer l'image.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function monter() {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  await act(async () => { racine.render(<AdMedia mediaUrl="/api/ad/x?t=1" aspect="4 / 5" fit="contain" interactive={false} />); });
  return { hote, racine };
}

describe('AdMedia · une image qui ne charge pas laisse place au repli', () => {
  it('une image qui charge reste affichée', async () => {
    const { hote, racine } = await monter();
    expect(hote.querySelector('img')).not.toBeNull();
    expect(hote.textContent).not.toContain('Aperçu indisponible');
    await act(async () => { racine.unmount(); });
  });

  it('erreur de chargement → « Aperçu indisponible », plus d’image cassée', async () => {
    const { hote, racine } = await monter();
    await act(async () => { hote.querySelector('img')!.dispatchEvent(new Event('error')); });
    expect(hote.querySelector('img'), 'l’image cassée reste affichée après son échec').toBeNull();
    expect(hote.textContent).toContain('Aperçu indisponible');
    await act(async () => { racine.unmount(); });
  });

  it('échec survenu AVANT l’hydratation (complete, largeur 0) · repli aussi', async () => {
    const c = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');
    const w = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'naturalWidth');
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 0 });
    try {
      const { hote, racine } = await monter();
      expect(hote.querySelector('img'), 'un échec antérieur à l’hydratation n’est pas rattrapé').toBeNull();
      expect(hote.textContent).toContain('Aperçu indisponible');
      await act(async () => { racine.unmount(); });
    } finally {
      if (c) Object.defineProperty(HTMLImageElement.prototype, 'complete', c);
      if (w) Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', w);
    }
  });
});
