import { describe, expect, it } from 'vitest';
import {
  grammaireLayout, briefLayout, resumeGrammaire, MIN_MARCHE, SEUIL_DOMINANT,
  type ObservationLayout, type GrammaireLayout,
} from '../src/adsmap/grammaire-layout';

/**
 * La grammaire de layout ne conclut que sur un motif net.
 *
 * La discipline est celle du reste de la carte · un minimum d'effectif, et une
 * part majoritaire plutôt que « le plus fréquent ». Le silence est la réponse
 * la plus fréquente, et la plus honnête quand une catégorie n'a pas de grammaire
 * à imposer.
 */

const obs = (o: Partial<ObservationLayout>): ObservationLayout => ({
  headlinePosition: o.headlinePosition ?? null,
  composition: o.composition ?? null,
  textDensity: o.textDensity ?? null,
  background: o.background ?? null,
  typoRegister: o.typoRegister ?? null,
  palette: o.palette ?? null,
});

const vide: GrammaireLayout = {
  headlinePosition: null, composition: null, textDensity: null, background: null,
  typoRegister: null, palette: null, n: 0,
};

describe('on ne conclut que sur un motif net', () => {
  it('sous le minimum d’effectif, aucune dimension ne parle', () => {
    // Onze créas toutes « produit héros » ne font pas une catégorie · une de
    // moins que le minimum, et le silence tient.
    const g = grammaireLayout(Array.from({ length: MIN_MARCHE - 1 }, () => obs({ composition: 'product_hero' })));
    expect(g.composition).toBeNull();
  });

  it('au minimum et en majorité, la dominante se détache', () => {
    const g = grammaireLayout(Array.from({ length: MIN_MARCHE }, () => obs({ composition: 'product_hero' })));
    expect(g.composition).toBe('product_hero');
  });

  it('sans majorité franche, rien ne tranche', () => {
    // Une catégorie où deux compositions se partagent le marché à parts égales
    // n'a pas de grammaire à imposer · sous le seuil, on se tait.
    const moitie = MIN_MARCHE;
    const lot = [
      ...Array.from({ length: moitie }, () => obs({ composition: 'product_hero' })),
      ...Array.from({ length: moitie }, () => obs({ composition: 'lifestyle' })),
    ];
    expect(grammaireLayout(lot).composition).toBeNull();
  });

  it('les valeurs nulles n’entrent pas au dénominateur', () => {
    // Comme le produit ne se compte que sur les pubs avec référence · une
    // dimension non décrite ne dilue pas la part de la dominante.
    const lot = [
      ...Array.from({ length: MIN_MARCHE }, () => obs({ headlinePosition: 'top' })),
      ...Array.from({ length: 50 }, () => obs({ headlinePosition: null })),
    ];
    expect(grammaireLayout(lot).headlinePosition).toBe('top');
  });

  it('le seuil est une majorité, pas « le plus fréquent »', () => {
    expect(SEUIL_DOMINANT).toBeGreaterThanOrEqual(0.5);
  });
});

describe('la distillation en consignes', () => {
  it('une grammaire vide ne dit rien', () => {
    expect(briefLayout(vide)).toEqual([]);
  });

  it('une grammaire nette produit une consigne de tendance', () => {
    const cs = briefLayout({ ...vide, headlinePosition: 'top', composition: 'product_hero', n: 40 });
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatch(/TOP/);
    expect(cs[0]).toMatch(/product-hero/);
    // Une tendance à suivre, pas une règle rigide · le modèle garde la main.
    expect(cs[0]).toMatch(/unless the product demands otherwise/i);
  });

  it('« pas d’accroche » et « texte dense » ne se prescrivent jamais', () => {
    // L'entière porte toujours des mots · prescrire « pas d'accroche » serait
    // absurde. Et charger de texte dégrade la lisibilité qu'on défend ailleurs.
    expect(briefLayout({ ...vide, headlinePosition: 'none', n: 40 })).toEqual([]);
    expect(briefLayout({ ...vide, textDensity: 'heavy', n: 40 })).toEqual([]);
  });

  it('la charte remonte aussi · typographie et palette', () => {
    // La grammaire ne s'arrête pas au layout · « meilleure gestion des typo,
    // charte graphique » demande d'agréger la typographie et la palette.
    const g = grammaireLayout(Array.from({ length: MIN_MARCHE }, () => obs({ typoRegister: 'serif', palette: 'pastel' })));
    expect(g.typoRegister).toBe('serif');
    expect(g.palette).toBe('pastel');
    const cs = briefLayout(g);
    expect(cs[0]).toMatch(/SERIF/);
    expect(cs[0]).toMatch(/PASTEL/i);
  });
});

describe('la carte d’identité · rendre la grammaire lisible', () => {
  it('une grammaire vide ne montre rien', () => {
    // On ne montre pas une carte d'identité à moitié devinée.
    expect(resumeGrammaire(vide)).toEqual([]);
  });

  it('une grammaire nette se lit en lignes françaises', () => {
    const lignes = resumeGrammaire({
      ...vide, headlinePosition: 'top', composition: 'product_hero',
      typoRegister: 'serif', palette: 'pastel', n: 40,
    });
    const parAxe = Object.fromEntries(lignes.map((l) => [l.axe, l.valeur]));
    expect(parAxe['Accroche']).toBe('Accroche en haut');
    expect(parAxe['Composition']).toBe('Produit héros');
    expect(parAxe['Typo']).toBe('Serif');
    expect(parAxe['Palette']).toBe('Pastel');
  });

  it('ne montre pas les valeurs qui ne se prescrivent pas', () => {
    // « pas d'accroche » et « typo mixte » n'apprennent rien à afficher.
    expect(resumeGrammaire({ ...vide, headlinePosition: 'none', typoRegister: 'mixed', n: 40 })).toEqual([]);
  });
});
