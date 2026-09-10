import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VignetteDepart } from '../components/VignetteDepart';

/**
 * Ce que la vignette AFFICHE dans ses deux états · on lit le HTML.
 *
 * Le défaut : un asset dont l'image ne charge plus montrait l'icône « image
 * cassée » du navigateur, et restait sélectionnable. En état cassé, la vignette
 * doit montrer un repli lisible ET refuser le clic (pas d'animation sur une
 * image fantôme).
 */
const base = { url: 'https://cdn.exemple/a.jpg', label: 'Mon asset', kind: 'asset' as const, selected: false, onError: () => {}, onPick: () => {} };

describe('la vignette d’image de départ gère l’image absente', () => {
  it('chargeable · elle montre l’image, elle est cliquable', () => {
    const html = renderToStaticMarkup(<VignetteDepart {...base} cassee={false} />);
    expect(html).toContain('src="https://cdn.exemple/a.jpg"');
    expect(html, 'la vignette saine ne doit pas être désactivée').not.toContain('disabled');
    expect(html).toContain('ASSET');
  });

  it('cassée · repli « indispo », aucune image cassée, non cliquable', () => {
    const html = renderToStaticMarkup(<VignetteDepart {...base} cassee />);
    expect(html, 'une image cassée reste affichée').not.toContain('<img');
    expect(html).toContain('indispo');
    expect(html, 'une vignette cassée reste cliquable').toContain('disabled');
  });
});
