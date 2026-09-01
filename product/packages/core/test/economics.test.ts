import { describe, it, expect } from 'vitest';
import { IMAGE_MODELS, imageModelByKey, CREDIT_EUR, analyzeCosts, VIDEO_DURATIONS, safeVideoDuration, videoUnits, falModelFor } from '../src/economics';
import { costFor } from '../src/credits';

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

describe('la durée d’une vidéo se paie à la tranche', () => {
  it('cinq secondes valent une unité, dix en valent deux', () => {
    expect(videoUnits(5)).toBe(1);
    expect(videoUnits(10)).toBe(2);
  });

  it('une durée inconnue retombe sur cinq · rien d’inattendu n’est facturé', () => {
    expect(safeVideoDuration(7)).toBe(5);
    expect(safeVideoDuration(0)).toBe(5);
    expect(safeVideoDuration(-10)).toBe(5);
    expect(safeVideoDuration(undefined)).toBe(5);
    expect(safeVideoDuration(null)).toBe(5);
  });

  it('les durées proposées sont toutes des multiples de la tranche', () => {
    // Sinon `videoUnits` rendrait une fraction, et le débit crédits aussi.
    for (const d of VIDEO_DURATIONS) expect(Number.isInteger(videoUnits(d))).toBe(true);
  });

  it('dix secondes coûtent bien le double de cinq', () => {
    expect(costFor('video') * videoUnits(10)).toBe(costFor('video') * 2);
  });
});

describe('GPT Image 2 et le choix d’endpoint', () => {
  it('GPT Image 2 est proposé, en deux qualités', () => {
    const cles = IMAGE_MODELS.map((m) => m.key);
    expect(cles).toContain('gpt2');
    expect(cles).toContain('gpt2_high');
  });

  /**
   * La qualité est un PARAMÈTRE, pas un endpoint · c'est elle qui fait varier le
   * prix d'un facteur quatre. Deux entrées qui partagent l'adresse doivent donc
   * différer par leurs paramètres, sinon on facture quatre fois plus cher le
   * même appel (c'est exactement ce qu'avait fait « Nano Banana 2 · Haute »).
   */
  it('deux qualités du même modèle envoient des paramètres différents', () => {
    const a = imageModelByKey('gpt2');
    const b = imageModelByKey('gpt2_high');
    expect(a.falModel).toBe(b.falModel);
    expect(JSON.stringify(a.params)).not.toBe(JSON.stringify(b.params));
    expect(b.credits).toBeGreaterThan(a.credits);
  });

  /**
   * Appeler `.../edit` sans image renvoie une erreur du fournisseur · le modèle
   * a l'air cassé alors qu'on s'est trompé de porte.
   */
  it('l’endpoint sans référence n’est pas celui d’édition', () => {
    for (const m of IMAGE_MODELS) {
      if (!m.falModelNoRef) continue;
      expect(falModelFor(m, true), `${m.key} avec référence`).toBe(m.falModel);
      expect(falModelFor(m, false), `${m.key} sans référence`).toBe(m.falModelNoRef);
      expect(m.falModelNoRef, `${m.key} · l’adresse sans référence est identique`).not.toBe(m.falModel);
    }
  });

  it('sans adresse alternative, on garde la même · pas de silence', () => {
    const sans = IMAGE_MODELS.find((m) => !m.falModelNoRef);
    if (sans) expect(falModelFor(sans, false)).toBe(sans.falModel);
  });

  it('un modèle cher reste rentable · le prix suit le coût réel', () => {
    const haut = imageModelByKey('gpt2_high');
    expect((haut.credits * CREDIT_EUR) / haut.realEur).toBeGreaterThanOrEqual(2);
  });
});
