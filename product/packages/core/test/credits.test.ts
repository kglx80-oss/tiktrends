import { IMAGE_MODELS, imageTimeoutMs, conseilDelai, DELAI_IMAGE_DEFAUT } from '../src/economics';
import { describe, it, expect } from 'vitest';
import { costFor, canAfford, applyLedger, computeRollover } from '../src/credits';
describe('crédits (§F14)', () => {
  it('coût par action (unités)', () => {
    expect(costFor('tag_video')).toBe(2);
    expect(costFor('image', 4)).toBe(16);
    expect(costFor('transcription_min', 2.4)).toBe(3); // arrondi sup
  });
  it('canAfford', () => { expect(canAfford(5, 'brief')).toBe(true); expect(canAfford(4, 'brief')).toBe(false); });
  it('ledger + report 25%', () => {
    expect(applyLedger(100, [{ delta: -20, reason: 'brief' }, { delta: 50, reason: 'topup' }])).toBe(130);
    expect(computeRollover(80)).toBe(20);
  });
});

describe('le délai d’un modèle suit son prix', () => {
  /**
   * Il était fixe · quatre-vingt-dix secondes pour tout le monde. Un modèle qui
   * coûte quatre fois le prix d'un autre fait quatre fois plus de travail :
   * lui donner la même échéance garantit qu'il ne finira jamais.
   *
   * Et un délai trop court ne fait économiser personne · le fournisseur a déjà
   * commencé, il facture, et on abandonne l'image qu'on vient de payer.
   */
  it('un modèle plus cher n’a jamais moins de temps', () => {
    for (const a of IMAGE_MODELS) {
      for (const b of IMAGE_MODELS) {
        if (a.credits > b.credits) {
          expect(imageTimeoutMs(a), `${a.key} coûte plus que ${b.key} et a moins de temps`)
            .toBeGreaterThanOrEqual(imageTimeoutMs(b));
        }
      }
    }
  });

  it('le plus cher a nettement plus que le défaut', () => {
    const cher = [...IMAGE_MODELS].sort((x, y) => y.credits - x.credits)[0]!;
    expect(imageTimeoutMs(cher)).toBeGreaterThan(DELAI_IMAGE_DEFAUT * 2);
  });

  it('un modèle sans délai déclaré prend le défaut', () => {
    expect(imageTimeoutMs({})).toBe(DELAI_IMAGE_DEFAUT);
  });
});

describe('le conseil donné sur un délai dépassé', () => {
  it('ne parle pas de quantité · il propose un modèle plus rapide', () => {
    // « Réduis la quantité demandée » était faux : deux créas en haute qualité
    // échouent parce que CHAQUE visuel met plusieurs minutes.
    const cher = IMAGE_MODELS.find((m) => m.key === 'gpt2_high')!;
    const c = conseilDelai(cher);
    expect(c).toBeTruthy();
    expect(c!).toContain('minutes par visuel');
    expect(c!).not.toMatch(/quantité/i);
  });

  it('se tait pour un modèle rapide · il n’y a rien à conseiller', () => {
    const rapide = IMAGE_MODELS.find((m) => !m.timeoutMs)!;
    expect(conseilDelai(rapide)).toBeNull();
  });

  it('ne propose pas un modèle plus cher que celui qui vient d’échouer', () => {
    const cher = IMAGE_MODELS.find((m) => m.key === 'gpt2_high')!;
    const c = conseilDelai(cher)!;
    for (const m of IMAGE_MODELS.filter((x) => x.credits > cher.credits)) {
      expect(c).not.toContain(m.label);
    }
  });
});
