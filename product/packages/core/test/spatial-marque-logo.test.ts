import { describe, expect, it } from 'vitest';
import { POIDS_MAX_LOGO, charteAvecLogoImporte, refusFichierLogo } from '../src';

describe('Marque · importer un fichier de logo · ce qui est accepté', () => {
  it('png, jpg, webp acceptés ; svg, gif, pdf refusés', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) expect(refusFichierLogo({ type, taille: 20_000 }), type).toBeNull();
    for (const type of ['image/svg+xml', 'image/gif', 'application/pdf', '']) expect(refusFichierLogo({ type, taille: 20_000 }), type).toBe('Formats acceptés pour un logo : png, jpg, webp.');
  });
  it('vide refusé ; le plafond de la Bibliothèque (4 Mo) tient, un octet de plus non', () => {
    expect(refusFichierLogo({ type: 'image/png', taille: 0 })).toBe('Ce fichier est vide.');
    expect(refusFichierLogo({ type: 'image/png', taille: POIDS_MAX_LOGO })).toBeNull();
    expect(refusFichierLogo({ type: 'image/png', taille: POIDS_MAX_LOGO + 1 })).toBe('Logo trop lourd (4 Mo au plus).');
  });
});

describe('Marque · la charte après l’import', () => {
  it('le logo importé devient le logo par défaut, les logos déjà là restent en variantes', () => {
    expect(charteAvecLogoImporte({ logos: ['https://a/1.png', 'https://a/2.png'], defaut: 'https://a/1.png' }, 'https://b/neuf.png'))
      .toEqual({ logoUrl: 'https://b/neuf.png', logos: ['https://a/1.png', 'https://a/2.png', 'https://b/neuf.png'] });
  });
  it('charte vide · le logo importé seul ; aucun doublon si le même fichier revient', () => {
    expect(charteAvecLogoImporte({ logos: [], defaut: null }, 'https://b/neuf.png')).toEqual({ logoUrl: 'https://b/neuf.png', logos: ['https://b/neuf.png'] });
    expect(charteAvecLogoImporte({ logos: ['https://b/neuf.png'], defaut: 'https://b/neuf.png' }, 'https://b/neuf.png').logos).toEqual(['https://b/neuf.png']);
  });
  it('un logo par défaut absent de la liste (ancienne fiche) n’est pas perdu', () => {
    expect(charteAvecLogoImporte({ logos: ['https://a/2.png'], defaut: 'https://a/1.png' }, 'https://b/neuf.png').logos)
      .toEqual(['https://a/1.png', 'https://a/2.png', 'https://b/neuf.png']);
  });
});
