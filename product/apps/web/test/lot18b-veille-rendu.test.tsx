// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 18B · Veille · ce qu'on VOIT (mesures au navigateur · MATRICE-lot18B) ·
 * le lien vers les annonces du même annonceur, le retour à SA recherche depuis
 * la Veille et le Studio, les filtres de « Ce qui scale » dans l'URL.
 */
const { RetourVeille } = await import('../components/RetourVeille');

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };

// Vague 4 · la carte V5 (`AdCard`) est retirée · le lien « Toutes les pubs de l’annonceur » et l’ancre de
// la carte Spatial sont gardés par `spatial-veille-gestes` / `spatial-veille`.

describe('Retour à la recherche (lot 18B)', () => {
  it('dit le terme et vise la carte d’origine', () => {
    const d = dom(renderToStaticMarkup(<RetourVeille rv="q=routine&page=2#ad-meta-mock-044" />));
    const a = d.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('/veille?q=routine&page=2#ad-meta-mock-044');
    expect(a.textContent).toContain('« routine »');
  });
  it('une valeur forgée ne sort jamais de la Veille · sans contexte, rien', () => {
    const d = dom(renderToStaticMarkup(<RetourVeille rv="//evil.example/x" />));
    expect(d.querySelector('a')?.getAttribute('href')).toBe('/veille');
    expect(renderToStaticMarkup(<RetourVeille rv={undefined} />)).toBe('');
  });
});

// Vague 4 · « Retour sur la carte d’origine » est porté sur Pubs du moment (`DefileAncre`, Spatial) ·
// gardé dans `spatial-veille-gestes`.
