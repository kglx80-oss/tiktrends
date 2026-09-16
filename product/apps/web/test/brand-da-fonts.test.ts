import { describe, it, expect } from 'vitest';
import { findFonts } from '../lib/brand-da';

/**
 * S04 · l'extraction des polices d'un site lit ses `font-family`. Les sites
 * chargent souvent des fontes d'ICÔNES (Font Awesome, Material Icons…) déclarées
 * comme n'importe quelle famille · elles remontaient parmi les polices proposées,
 * et une créa pouvait hériter d'« icon font » comme police de titre.
 *
 * On vérifie le RÉSULTAT, sur un CSS mêlant vraie police et fonte d'icônes ·
 * la vraie police est retenue, la fonte d'icônes est écartée.
 */
describe('S04 · findFonts écarte les fontes d’icônes', () => {
  it('retient la police de texte, jette Font Awesome et Material Icons', () => {
    const css = `
      @font-face { font-family: "FontAwesome"; src: url(fa.woff2); }
      @font-face { font-family: "Material Icons"; src: url(mi.woff2); }
      body { font-family: "Inter", sans-serif; }
      h1 { font-family: 'Playfair Display', serif; }
    `;
    const fonts = findFonts(css);
    expect(fonts).toContain('Inter');
    expect(fonts).toContain('Playfair Display');
    expect(fonts).not.toContain('FontAwesome');
    expect(fonts).not.toContain('Material Icons');
  });

  it('écarte aussi les exports d’icônes en -webfont', () => {
    const css = `@font-face { font-family: "shop-icons-webfont"; } body { font-family: "Poppins"; }`;
    const fonts = findFonts(css);
    expect(fonts).toEqual(['Poppins']);
  });
});
