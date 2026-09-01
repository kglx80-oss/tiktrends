import { describe, it, expect } from 'vitest';
import {
  AD_LAYOUTS, LAYOUT_CLAIR, LAYOUT_HINT, LAYOUT_LABEL,
  layoutFor, layoutsFor, layoutsForBatch, type AdLayout,
} from '../src/ad-layouts';

describe('un lot ne répète pas la même mise en page', () => {
  it('quatre créas donnent quatre mises en page différentes', () => {
    // C'est LA règle qui répond au constat « on obtient toujours le même
    // résultat ». Un tirage au hasard donnerait deux fois la même une fois sur
    // deux, et l'impression survivrait au travail fait pour la dissiper.
    const l = layoutsForBatch(4);
    expect(new Set(l).size).toBe(4);
  });

  it('huit créas donnent chaque mise en page exactement deux fois', () => {
    const compte = new Map<AdLayout, number>();
    for (const l of layoutsForBatch(8)) compte.set(l, (compte.get(l) ?? 0) + 1);
    for (const l of AD_LAYOUTS) expect(compte.get(l)).toBe(2);
  });

  it('vaut pour toutes les tailles de lot jusqu’à huit', () => {
    for (let n = 1; n <= AD_LAYOUTS.length; n++) {
      expect(new Set(layoutsForBatch(n)).size, `lot de ${n}`).toBe(n);
    }
  });

  it('deux lots successifs ne s’ouvrent pas sur la même', () => {
    expect(layoutsForBatch(2, 0)[0]).not.toBe(layoutsForBatch(2, 1)[0]);
  });

  it('une graine négative ou énorme reste dans le catalogue', () => {
    for (const seed of [-7, -1, 0, 3, 1_000_003]) {
      for (const l of layoutsForBatch(4, seed)) expect(AD_LAYOUTS).toContain(l);
    }
  });

  it('un lot vide ne rend rien, sans planter', () => {
    expect(layoutsForBatch(0)).toEqual([]);
    expect(layoutsForBatch(-3)).toEqual([]);
  });
});

describe('les restrictions par gabarit sont réelles, pas décoratives', () => {
  it('before_after garde l’image entière', () => {
    // Deux états côte à côte demandent l'image entière · réduite à une carte,
    // la comparaison n'est plus montrée mais suggérée.
    const ok = layoutsFor('before_after');
    expect(ok).not.toContain('champ');
    expect(ok).not.toContain('affiche');
    expect(ok).toContain('immersif');
  });

  it('ugc ne devient pas une affiche typographique', () => {
    // Une affiche ne ressemble à rien de ce qu'un créateur publie · elle
    // trahirait ce que le gabarit cherche à emprunter.
    expect(layoutsFor('ugc')).not.toContain('affiche');
  });

  it('aucun gabarit ne se retrouve sans mise en page', () => {
    for (const t of ['problem_solution', 'before_after', 'testimonial', 'benefits', 'ugc', 'stat', 'offer', 'inconnu']) {
      expect(layoutsFor(t).length, t).toBeGreaterThan(0);
    }
  });

  it('la plupart des gabarits gardent les quatre', () => {
    // Une restriction inventée réduirait la variété qu'on essaie de créer.
    for (const t of ['problem_solution', 'testimonial', 'benefits', 'stat', 'offer']) {
      expect(layoutsFor(t), t).toHaveLength(AD_LAYOUTS.length);
    }
  });

  it('une mise en page interdite est rabattue, jamais rendue telle quelle', () => {
    expect(layoutFor('before_after', 'affiche')).not.toBe('affiche');
    expect(layoutsFor('before_after')).toContain(layoutFor('before_after', 'affiche'));
    expect(layoutFor('testimonial', 'affiche')).toBe('affiche');
  });
});

describe('chaque mise en page est nommée, décrite et typée en clair/sombre', () => {
  it('a un nom et une phrase', () => {
    for (const l of AD_LAYOUTS) {
      expect(LAYOUT_LABEL[l]?.length, l).toBeGreaterThan(2);
      expect(LAYOUT_HINT[l]?.length, l).toBeGreaterThan(15);
    }
  });

  it('sait si le texte se lit sur clair', () => {
    for (const l of AD_LAYOUTS) expect(typeof LAYOUT_CLAIR[l], l).toBe('boolean');
  });

  it('le catalogue n’est pas uniformément sombre', () => {
    // Tout le catalogue était sombre · c'est à soi seul une raison pour laquelle
    // toutes les créas se ressemblaient.
    const clairs = AD_LAYOUTS.filter((l) => LAYOUT_CLAIR[l]);
    expect(clairs.length).toBeGreaterThan(0);
    expect(clairs.length).toBeLessThan(AD_LAYOUTS.length);
  });
});
