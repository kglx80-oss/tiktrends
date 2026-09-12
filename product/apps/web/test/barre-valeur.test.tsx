import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BarreValeur } from '../components/BarreValeur';

/**
 * La barre rend un chiffre nu visible · on vérifie que sa largeur EST
 * proportionnée à la part (le résultat rendu), pas juste qu'elle existe.
 */
function largeur(part: number): string {
  const html = renderToStaticMarkup(<BarreValeur part={part} />);
  return html.match(/width:(\d+)%/)?.[1] ?? '';
}

describe('BarreValeur · la largeur reflète la part', () => {
  it('une part haute rend une barre plus large qu’une part basse', () => {
    expect(largeur(0.9)).toBe('90');
    expect(largeur(0.1)).toBe('10');
    expect(Number(largeur(0.9))).toBeGreaterThan(Number(largeur(0.1)));
  });

  it('borne l’affichage à [0, 100] %', () => {
    expect(largeur(2)).toBe('100');   // part > 1 → pleine, jamais au-delà
    expect(largeur(-1)).toBe('0');    // part < 0 → vide
  });

  it('expose une valeur d’accessibilité cohérente', () => {
    const html = renderToStaticMarkup(<BarreValeur part={0.42} />);
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('role="progressbar"');
  });
});
