import { describe, it, expect } from 'vitest';
import {
  rateFor, costOfTokens, estimateCallCost, checkBudget, summarizeBudget,
  UNKNOWN_MODEL_RATE, FIXED_COSTS,
} from '../src/spend-guard';

describe('tarifs', () => {
  it('connaît les modèles utilisés', () => {
    expect(rateFor('claude-sonnet-5').inputPerMTok).toBe(3);
    expect(rateFor('claude-opus-5').outputPerMTok).toBe(75);
  });

  it('reconnaît un identifiant daté par son préfixe', () => {
    expect(rateFor('claude-haiku-4-5-20251001').inputPerMTok).toBe(1);
  });

  it('présume cher un modèle inconnu', () => {
    // Sous-estimer un tarif perce le plafond ; le surestimer refuse un appel un
    // peu tôt. Le déséquilibre entre les deux erreurs commande le choix.
    expect(rateFor('un-modele-jamais-vu')).toEqual(UNKNOWN_MODEL_RATE);
  });
});

describe('coût', () => {
  it('calcule à partir des jetons réels', () => {
    // 1 M d'entrée + 1 M de sortie sur Sonnet = 3 + 15.
    expect(costOfTokens('claude-sonnet-5', 1_000_000, 1_000_000)).toBeCloseTo(18, 6);
  });

  it('ignore les valeurs négatives', () => {
    expect(costOfTokens('claude-sonnet-5', -100, -100)).toBe(0);
  });

  it('estime au pire avant l’appel', () => {
    // La sortie est supposée atteindre max_tokens en entier.
    const c = estimateCallCost({ model: 'claude-sonnet-5', promptChars: 3500, maxTokens: 1000 });
    expect(c).toBeCloseTo(0.003 + 0.015, 4);
  });

  it('donne un coût fixe aux appels qui ne se comptent pas en jetons', () => {
    expect(FIXED_COSTS.fal_video).toBeGreaterThan(FIXED_COSTS.fal_image);
  });
});

describe('checkBudget', () => {
  it('autorise sous le plafond', () => {
    const d = checkBudget({ spentUsd: 2, capUsd: 10 }, 1);
    expect(d.allowed).toBe(true);
    expect(d.remainingUsd).toBeCloseTo(7, 6);
  });

  it('refuse dès que l’appel ferait dépasser', () => {
    const d = checkBudget({ spentUsd: 9.5, capUsd: 10 }, 1);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('10.00 $');
    expect(d.reason).toContain('Rien n’est envoyé');
  });

  it('refuse tout quand le plafond est à zéro', () => {
    expect(checkBudget({ spentUsd: 0, capUsd: 0 }, 0.001).allowed).toBe(false);
  });

  it('avertit au-delà de 80 % sans bloquer', () => {
    const d = checkBudget({ spentUsd: 8, capUsd: 10 }, 0.5);
    expect(d.allowed).toBe(true);
    expect(d.warning).toBe(true);
  });

  it('autorise un appel qui atteint exactement le plafond', () => {
    expect(checkBudget({ spentUsd: 9, capUsd: 10 }, 1).allowed).toBe(true);
    expect(checkBudget({ spentUsd: 9, capUsd: 10 }, 1.01).allowed).toBe(false);
  });
});

describe('summarizeBudget', () => {
  it('dit toujours le plafond, jamais un pourcentage seul', () => {
    expect(summarizeBudget({ spentUsd: 2, capUsd: 10 })).toContain('10.00 $');
  });

  it('annonce clairement le blocage', () => {
    expect(summarizeBudget({ spentUsd: 10, capUsd: 10 })).toContain('Plus aucune requête payante');
    expect(summarizeBudget({ spentUsd: 0, capUsd: 0 })).toContain('bloquée');
  });
});
