import { describe, expect, it } from 'vitest';
import {
  grammaireLayout, briefLayout, MIN_MARCHE, SEUIL_DOMINANT,
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
});

const vide: GrammaireLayout = { headlinePosition: null, composition: null, textDensity: null, background: null, n: 0 };

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
});
