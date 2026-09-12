import { describe, expect, it } from 'vitest';
import { domaineConcurrent, initialesConcurrent, tinteConcurrent } from '../src/concurrent-carte';

describe('le domaine ne sort que d’une vraie saisie de domaine', () => {
  it('un nom sans point n’est jamais promu en domaine', () => {
    // Le piège à éviter · « nike » → « nike.com » inventé mènerait vers un site
    // qui n'est pas forcément celui du concurrent.
    expect(domaineConcurrent('HVMN')).toBeNull();
    expect(domaineConcurrent('Neva')).toBeNull();
    expect(domaineConcurrent('Marque X')).toBeNull();
    expect(domaineConcurrent('')).toBeNull();
    expect(domaineConcurrent('   ')).toBeNull();
  });

  it('un domaine ou une URL est réduit à son hôte', () => {
    expect(domaineConcurrent('hvmn.com')).toBe('hvmn.com');
    expect(domaineConcurrent('www.neva.fr')).toBe('neva.fr');
    expect(domaineConcurrent('https://www.nike.com/fr/running')).toBe('nike.com');
    expect(domaineConcurrent('HTTP://Example.COM')).toBe('example.com');
    expect(domaineConcurrent('  spaced.io  ')).toBe('spaced.io');
    expect(domaineConcurrent('sub.brand.co.uk?x=1')).toBe('sub.brand.co.uk');
  });

  it('une entrée hostile ne produit jamais un domaine · c’est la barrière du lien', () => {
    // Le domaine part dans href={`https://${d}`} et dans l'URL de favicon · la
    // seule chose qui empêche un `javascript:` ou un détournement d'hôte
    // (userinfo, port, guillemet) d'y arriver, c'est cette liste blanche. On
    // l'éprouve directement · un refactor qui l'affaiblirait rougirait ici.
    for (const mauvais of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'evil.com@good.com',
      'http://user:pass@h.co',
      'a.co"onerror=alert(1)',
      'a.co)',
      'a.co b.co',
      'a.co\\@b.co',
      'data:text/html,x',
      '//evil.com',
      'localhost',
      '127.0.0.1',
    ]) {
      expect(domaineConcurrent(mauvais), `${mauvais} ne doit pas devenir un domaine`).toBeNull();
    }
  });
});

describe('les initiales sont toujours lisibles', () => {
  it('l’initiale des deux premiers mots, ou les deux premières lettres', () => {
    expect(initialesConcurrent('HVMN')).toBe('HV');
    expect(initialesConcurrent('Nike Air')).toBe('NA');
    expect(initialesConcurrent('a')).toBe('A');
  });

  it('une saisie vide ne casse pas · un repli visible', () => {
    expect(initialesConcurrent('')).toBe('?');
    expect(initialesConcurrent('   ')).toBe('?');
  });
});

describe('la teinte fait une grille distincte, pas un mur gris', () => {
  it('elle est déterministe · le même nom garde sa couleur', () => {
    expect(tinteConcurrent('HVMN')).toEqual(tinteConcurrent('HVMN'));
  });

  it('deux marques n’ont pas la même couleur', () => {
    // Sinon la grille perd tout son intérêt · chaque carte doit se distinguer.
    expect(tinteConcurrent('HVMN')).not.toEqual(tinteConcurrent('Neva'));
    expect(tinteConcurrent('Alpha')).not.toEqual(tinteConcurrent('Beta'));
  });

  it('le dégradé est bien deux teintes HSL distinctes', () => {
    const t = tinteConcurrent('Klorea');
    expect(t.de).toMatch(/^hsl\(/);
    expect(t.vers).toMatch(/^hsl\(/);
    expect(t.de).not.toBe(t.vers);
  });
});
