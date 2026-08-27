import { describe, it, expect } from 'vitest';
import { IMAGE_MODELS, imageModelByKey, CREDIT_EUR, analyzeCosts } from '../src/economics';

describe('catalogue de modèles image', () => {
  /**
   * Garde-fou anti-« variante fantôme » : « Nano Banana 2 · Haute » a longtemps
   * envoyé une requête strictement identique à la variante standard tout en
   * facturant le double. Deux entrées qui produisent le MÊME appel doivent coûter
   * le même prix · si l'une est plus chère, elle doit demander autre chose.
   */
  it('deux variantes au tarif différent doivent envoyer un appel différent', () => {
    const signature = (m: (typeof IMAGE_MODELS)[number]) =>
      `${m.falModel}|${JSON.stringify(m.params ?? {})}`;
    const parSignature = new Map<string, number[]>();
    for (const m of IMAGE_MODELS) {
      const list = parSignature.get(signature(m)) ?? [];
      list.push(m.credits);
      parSignature.set(signature(m), list);
    }
    for (const [sig, credits] of parSignature) {
      expect(new Set(credits).size, `appel identique facturé à des tarifs différents : ${sig}`).toBe(1);
    }
  });

  it('chaque modèle garde une marge d’au moins 2x sur son coût réel', () => {
    for (const m of IMAGE_MODELS) {
      const marge = (m.credits * CREDIT_EUR) / m.realEur;
      expect(marge, `${m.key} vendu à perte ou presque`).toBeGreaterThanOrEqual(2);
    }
  });

  it('les clés sont uniques et le modèle par défaut est recommandé', () => {
    const keys = IMAGE_MODELS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(IMAGE_MODELS[0]?.recommended).toBe(true);
  });

  it('une clé inconnue retombe sur le modèle par défaut', () => {
    expect(imageModelByKey('nawak').key).toBe(IMAGE_MODELS[0]!.key);
    expect(imageModelByKey(null).key).toBe(IMAGE_MODELS[0]!.key);
    expect(imageModelByKey('gpt_image').key).toBe('gpt_image');
  });
});

describe('barème de crédits', () => {
  it('aucune action n’est vendue en dessous de son coût réel', () => {
    for (const c of analyzeCosts()) {
      expect(c.resaleEur, `${c.action} vendu à perte`).toBeGreaterThan(c.realEur);
    }
  });
});
