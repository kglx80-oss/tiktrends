import { describe, it, expect } from 'vitest';
import {
  AD_LAYOUTS, LAYOUT_CLAIR, LAYOUT_HINT, LAYOUT_LABEL,
  layoutFor, layoutsFor, layoutsForBatch, layoutsToDrop, shellShowsBadge, type AdLayout,
} from '../src/ad-layouts';
import { HEADLINE_CHARS, HEADLINE_WORDS, HEADLINE_FLOOR, copyBudgetLine, layoutFitsCopy, layoutForCopy } from '../src/copy-budget';

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

describe('la rotation apprend de la marque', () => {
  const rates = (o: Record<string, [number, number | null]>) =>
    Object.entries(o).map(([layout, [n, r]]) => ({ layout, nConclusive: n, hitRate: r }));

  it('retire une mise en page nettement perdante', () => {
    const drop = layoutsToDrop({
      rates: rates({ affiche: [8, 0.05], immersif: [8, 0.5] }),
      globalRate: 0.4,
    });
    expect(drop).toEqual(['affiche']);
  });

  it('ne retire pas sur une anecdote', () => {
    // Une exclue ne produit plus de tests, donc ne peut plus se racheter · le
    // seuil doit être sévère.
    expect(layoutsToDrop({ rates: rates({ affiche: [2, 0] }), globalRate: 0.4 })).toEqual([]);
  });

  it('ne retire pas « un peu moins bien »', () => {
    expect(layoutsToDrop({ rates: rates({ affiche: [10, 0.3] }), globalRate: 0.4 })).toEqual([]);
  });

  it('ne retire rien sans taux de marque', () => {
    expect(layoutsToDrop({ rates: rates({ affiche: [10, 0] }), globalRate: null })).toEqual([]);
    expect(layoutsToDrop({ rates: rates({ affiche: [10, 0] }), globalRate: 0 })).toEqual([]);
  });

  it('garde toujours au moins deux mises en page en lice', () => {
    // Sinon le lot redevient quatre fois la même image · ce que toute cette
    // mécanique existe pour éviter.
    const drop = layoutsToDrop({
      rates: rates({ affiche: [9, 0], immersif: [9, 0], champ: [9, 0], split: [9, 0] }),
      globalRate: 0.5,
    });
    expect(AD_LAYOUTS.length - drop.length).toBeGreaterThanOrEqual(2);
  });

  it('une clé inconnue est ignorée', () => {
    expect(layoutsToDrop({ rates: rates({ inexistante: [20, 0] }), globalRate: 0.4 })).toEqual([]);
  });

  it('le vivier réduit sert de rotation', () => {
    const l = layoutsForBatch(4, 0, ['immersif', 'champ']);
    expect(new Set(l)).toEqual(new Set(['immersif', 'champ']));
    expect(l).toHaveLength(4);
  });

  it('un vivier vide revient au catalogue complet', () => {
    // Ne rien produire serait pire · une pub sans mise en page ne se compose pas.
    expect(new Set(layoutsForBatch(4, 0, []))).toEqual(new Set(AD_LAYOUTS));
  });
});

describe('la place disponible dépend de la mise en page', () => {
  it('l’affiche est la plus stricte · son titre EST le visuel', () => {
    expect(HEADLINE_CHARS.affiche).toBeLessThan(HEADLINE_CHARS.immersif);
    expect(HEADLINE_WORDS.affiche).toBeLessThan(HEADLINE_WORDS.immersif);
  });

  it('aucun budget ne dépasse le plancher de fitHeadline', () => {
    // Au-delà, la police est déjà au minimum · promettre plus de place serait
    // promettre une taille qu'on ne rendra pas.
    for (const l of AD_LAYOUTS) expect(HEADLINE_CHARS[l], l).toBeLessThanOrEqual(HEADLINE_FLOOR);
  });

  it('chaque mise en page a une consigne, et l’affiche s’explique', () => {
    for (const l of AD_LAYOUTS) expect(copyBudgetLine(l).length, l).toBeGreaterThan(30);
    expect(copyBudgetLine('affiche')).toMatch(/AFFICHE/);
  });
});

describe('une accroche trop longue change de mise en page, elle ne se coupe pas', () => {
  const court = 'Dors mieux ce soir';                       // 18
  const long = 'Ton garage est encore plein le dimanche';   // 39

  it('une accroche courte garde l’affiche', () => {
    expect(layoutForCopy(court, 'affiche')).toBe('affiche');
  });

  it('une accroche longue quitte l’affiche', () => {
    // Couper amputerait la phrase au milieu · le résultat le plus visiblement
    // raté qu'on puisse produire. Une accroche longue n'est pas fautive, elle
    // n'est simplement pas une affiche.
    expect(layoutForCopy(long, 'affiche')).toBe('immersif');
  });

  it('l’immersive accepte ce que les autres refusent', () => {
    expect(layoutFitsCopy(long, 'immersif')).toBe(true);
    expect(layoutFitsCopy(long, 'affiche')).toBe(false);
    expect(layoutForCopy(long, 'immersif')).toBe('immersif');
  });

  it('le repli ne se replie pas sur lui-même', () => {
    // Rabattre vers l'immersive doit toujours aboutir · sinon une accroche
    // très longue n'aurait aucune mise en page.
    const enorme = 'x'.repeat(400);
    expect(layoutForCopy(enorme, 'affiche')).toBe('immersif');
    expect(AD_LAYOUTS).toContain(layoutForCopy(enorme, 'champ'));
  });

  it('une accroche vide ne bloque rien', () => {
    expect(layoutForCopy('', 'affiche')).toBe('affiche');
  });
});

describe('la pastille ne se dessine pas deux fois', () => {
  /**
   * La coquille pose une pastille en haut à droite, à côté du logo. Deux
   * gabarits en posent une AUSSI dans leur contenu · `offer` son sticker
   * incliné, `before_after` ses étiquettes AVANT et APRÈS aux deux coins hauts.
   *
   * Les deux se dessinaient en même temps : la pastille recouvrait le nom de la
   * marque. Une pub qui masque son propre logo est ratée avant qu'on lise
   * l'accroche.
   */
  it('la coquille se tait quand le contenu a la sienne', () => {
    expect(shellShowsBadge('offer')).toBe(false);
    expect(shellShowsBadge('before_after')).toBe(false);
  });

  it('elle la dessine partout ailleurs', () => {
    for (const t of ['problem_solution', 'testimonial', 'benefits', 'ugc', 'stat']) {
      expect(shellShowsBadge(t), t).toBe(true);
    }
  });
});
