import { describe, expect, it } from 'vitest';
import { CIBLE_MINIMALE_PX, CIBLE_TACTILE_PX, PRIMITIVES_TACTILES, SELECTEUR_INTERACTIF, ZOOM_VUE_SECTION, cibleSousZoom, debordTactile, styleCibleTactile } from '../src';

describe('Spatial · cibles tactiles (règles)', () => {
  it('les seuils · 44 px (WCAG 2.5.5, Apple), plancher 24 px (WCAG 2.5.8)', () => {
    expect(CIBLE_TACTILE_PX).toBe(44);
    expect(CIBLE_MINIMALE_PX).toBe(24);
  });

  it('une primitive `agrandir` atteint 44 px dans les deux sens, sans rien d’autre que ce qu’elle déclare', () => {
    for (const p of PRIMITIVES_TACTILES.filter((x) => x.mode === 'agrandir')) {
      const s = styleCibleTactile(p);
      expect(s.minHeight, p.selecteur).toBe('44px');
      expect(s.minWidth, p.selecteur).toBe('44px');
      expect(Object.keys(s).sort()).toEqual(['minHeight', 'minWidth', ...Object.keys(p.style ?? {})].sort());
    }
  });

  it('une primitive `deborder` · bordure transparente, fond rogné, marge négative de même largeur, rayon intérieur conservé, taille de bordure incluse (`border-box`)', () => {
    expect(styleCibleTactile({ selecteur: '.x', mode: 'deborder', largeur: 44, hauteur: 26, rayon: 20, motif: 't' })).toEqual({
      width: '62px', height: '44px', borderWidth: '9px', borderStyle: 'solid', borderColor: 'transparent', backgroundClip: 'padding-box', margin: '-9px', borderRadius: '29px',
    });
  });

  it('sous le zoom d’une vue, la valeur posée est divisée d’autant · 44 px À L’ÉCRAN, jamais moins', () => {
    expect(cibleSousZoom()).toBe(44);
    expect(cibleSousZoom(0.9)).toBe(49);
    expect(cibleSousZoom(0.95)).toBe(47);
    expect(cibleSousZoom(0)).toBe(44);
    for (const z of Object.values(ZOOM_VUE_SECTION)) expect(cibleSousZoom(z) * z).toBeGreaterThanOrEqual(44);
    const btn = PRIMITIVES_TACTILES.find((p) => p.selecteur === '.btn')!;
    expect(styleCibleTactile(btn, 0.9)).toMatchObject({ minHeight: '49px', minWidth: '49px' });
    const sw2 = PRIMITIVES_TACTILES.find((p) => p.selecteur === '.sw2')!;
    expect(styleCibleTactile(sw2, 0.9)).toMatchObject({ width: '68px', height: '50px', borderWidth: '12px', margin: '-12px' });
  });

  it('le débord · la moitié de ce qui manque, arrondie au-dessus, jamais négatif', () => {
    expect(debordTactile(26)).toBe(9);
    expect(debordTactile(28)).toBe(8);
    expect(debordTactile(27)).toBe(9);
    expect(debordTactile(44)).toBe(0);
    expect(debordTactile(60)).toBe(0);
    for (const h of [10, 21, 26, 33, 43]) expect(h + 2 * debordTactile(h)).toBeGreaterThanOrEqual(44);
  });

  it('chaque primitive est unique et dit pourquoi elle est là ; une primitive `deborder` déclare sa hauteur et son rayon', () => {
    const sels = PRIMITIVES_TACTILES.map((p) => p.selecteur);
    expect(new Set(sels).size).toBe(sels.length);
    for (const p of PRIMITIVES_TACTILES) {
      expect(p.motif.length, p.selecteur).toBeGreaterThan(5);
      if (p.mode === 'deborder') { expect(p.largeur).toBeGreaterThan(0); expect(p.hauteur).toBeGreaterThan(0); expect(p.rayon).toBeGreaterThanOrEqual(0); }
    }
  });

  it('les primitives partagées de la planche sont couvertes · bouton, puce, onglets, cloche, avatar, crédits, interrupteurs', () => {
    expect(PRIMITIVES_TACTILES.map((p) => p.selecteur)).toEqual(expect.arrayContaining(['.btn', '.chip', '.seg a', '.seg button', '.bell', '.me', '.credit', '.sw2', '.tg']));
  });

  it('les contrôles sous 24 px de la planche sont couverts · champs, liste, résumé, liens-texte, flèche de l’arbre', () => {
    const sels = PRIMITIVES_TACTILES.map((p) => p.selecteur);
    expect(sels).toEqual(expect.arrayContaining(['select', 'summary', '.cfgm', '.more', '.dmore', '.tnc']));
    const champs = sels.find((s) => s.includes('input[type=search]'))!;
    expect(champs, 'champ de recherche absent').toBeDefined();
    expect(champs).toContain('input:not([type])');
    expect(champs, 'une case à cocher ne grandit pas').not.toMatch(/checkbox|radio|range|file/);
    expect(styleCibleTactile(PRIMITIVES_TACTILES.find((p) => p.selecteur === 'summary')!)).toMatchObject({ minHeight: '44px', alignContent: 'center' });
  });

  it('le filtre interactif · liens, boutons, champs, résumés et rôles ARIA de contrôle', () => {
    for (const s of ['a[href]', 'button', 'select', 'textarea', 'summary', '[role=switch]', '[role=tab]']) expect(SELECTEUR_INTERACTIF.split(',')).toContain(s);
  });
});
