import { describe, expect, it } from 'vitest';
import { ATTRIBUT_ZONE_TACTILE, CIBLE_MINIMALE_PX, CIBLE_TACTILE_PX, PRIMITIVES_TACTILES, SELECTEUR_INTERACTIF, ZOOM_VUE_SECTION, cibleSousZoom, debordTactile, margeLigneTactile, styleCibleTactile, styleHoteZone, styleZoneTactile } from '../src';

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
      if (p.mode === 'zone') expect(p.hauteur, `${p.selecteur} · une case \`zone\` déclare sa hauteur dessinée`).toBeGreaterThan(0);
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

  it('les contrôles propres à un écran relevés au banc sont couverts', () => {
    expect(PRIMITIVES_TACTILES.map((p) => p.selecteur)).toEqual(expect.arrayContaining([
      '.pacts a', '.pacts button', '.pill', '.xtabs button', '.xfc', '.xi', '.play', '.colls nav button', '.btabs button', '.dsec button', '.crumb button', '.tnb', '.facts button', '.astrip-b',
    ]));
  });

  it('une case dessinée (`zone`) ne reçoit ni taille, ni bordure, ni fond · seule une ligne trop serrée lui donne une marge verticale', () => {
    const zones = PRIMITIVES_TACTILES.filter((p) => p.mode === 'zone');
    expect(zones.map((p) => p.selecteur)).toEqual(['.dchk', '.dtr .dchk']);
    for (const z of [1, ...Object.values(ZOOM_VUE_SECTION)]) {
      for (const p of zones) expect(Object.keys(styleCibleTactile(p, z)).filter((k) => !/^margin(Top|Bottom)$/.test(k)), `${p.selecteur} · le dessin changerait`).toEqual([]);
    }
    const grille = zones.find((p) => p.selecteur === '.dchk')!;
    expect(styleCibleTactile(grille, 0.95), 'la carte de la grille n’est pas une ligne').toEqual({});
    const liste = zones.find((p) => p.selecteur === '.dtr .dchk')!;
    expect(styleCibleTactile(liste, 0.95), 'Bibliothèque (0,95) · lignes de 42 + 4 · 47 voulus').toEqual({ marginTop: '4.5px', marginBottom: '4.5px' });
  });

  it('le pas d’une ligne (2 rembourrages + boîte de marge de la case + écart) atteint la cible À L’ÉCRAN sous chaque zoom', () => {
    const liste = PRIMITIVES_TACTILES.find((p) => p.selecteur === '.dtr .dchk')!;
    expect(liste.ligne).toEqual({ rembourrage: 6, ecart: 4 });
    for (const z of [1, ...Object.values(ZOOM_VUE_SECTION)]) {
      const m = margeLigneTactile(liste.hauteur!, liste.ligne!, cibleSousZoom(z));
      const pas = 2 * liste.ligne!.rembourrage + liste.hauteur! + 2 * m + liste.ligne!.ecart;
      expect(pas * z, `zoom ${z} · deux zones voisines se recouvriraient`).toBeGreaterThanOrEqual(CIBLE_TACTILE_PX);
    }
    expect(margeLigneTactile(22, { rembourrage: 6, ecart: 4 }, 47)).toBe(4.5);
    expect(margeLigneTactile(40, { rembourrage: 6, ecart: 4 }, 47), 'une ligne assez haute ne bouge pas').toBe(0);
  });

  it('la zone · une boîte transparente de la cible, centrée sur la case quelle que soit sa taille ; l’hôte statique devient relatif sans glisser', () => {
    expect(ATTRIBUT_ZONE_TACTILE).toBe('data-zone-tactile');
    expect(styleZoneTactile(0.95)).toEqual({ position: 'absolute', left: '50%', top: '50%', width: '47px', height: '47px', marginLeft: '-23.5px', marginTop: '-23.5px' });
    for (const z of [1, ...Object.values(ZOOM_VUE_SECTION)]) {
      const s = styleZoneTactile(z);
      expect(parseFloat(s.width!) * z).toBeGreaterThanOrEqual(CIBLE_TACTILE_PX);
      expect(-parseFloat(s.marginLeft!) * 2, 'zone décentrée').toBe(parseFloat(s.width!));
      expect(Object.keys(s).some((k) => /color|background|border|shadow|outline/i.test(k)), 'la zone ne doit rien dessiner').toBe(false);
    }
    expect(styleHoteZone('absolute'), 'la case de la grille garde sa place absolue').toEqual({});
    for (const p of ['relative', 'fixed', 'sticky']) expect(styleHoteZone(p)).toEqual({});
    expect(styleHoteZone('static')).toEqual({ position: 'relative', top: 'auto', right: 'auto', bottom: 'auto', left: 'auto' });
    expect(styleHoteZone(''), 'position inconnue · traitée comme statique').toMatchObject({ position: 'relative', left: 'auto' });
  });

  it('le filtre interactif · liens, boutons, champs, résumés et rôles ARIA de contrôle', () => {
    for (const s of ['a[href]', 'button', 'select', 'textarea', 'summary', '[role=switch]', '[role=tab]']) expect(SELECTEUR_INTERACTIF.split(',')).toContain(s);
  });
});
