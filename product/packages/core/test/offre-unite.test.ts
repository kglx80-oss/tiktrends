import { describe, expect, it } from 'vitest';
import {
  CREDIT_COSTS, CREDIT_EUR, FACTEUR_UNITE, FORFAITS_ACTUELS, IMAGE_MODELS, MOTIF_CONVERSION_UNITE, RECHARGES_ACTUELLES, GRILLE_STUDIO,
  convertirSoldes, deltaUniteCourante, facteurRendu, type CreditAction,
} from '../src';

/**
 * Unité ÷ 10 (décision du 29/10, point 3) · SANS interrupteur, parce qu'elle ne
 * change ni prix ni droits effectifs. La preuve : l'ancienne offre est écrite
 * ici, figée, telle que `main` la servait avant cette PR ; tout ce qui se
 * compte en crédits vaut exactement ×10, tout ce qui se paie en euros est
 * identique. Le pouvoir d'achat d'un espace (soldes ×10, conversion) est donc
 * inchangé, action par action.
 */
const ANCIEN_BAREME: Record<CreditAction, number> = {
  tag_video: 2, tag_image: 1, transcription_min: 1, script: 3, brief: 5, image: 4, review_mining: 20, report: 6, clone_image: 5,
  chat: 1, video: 20, suggest: 1, score: 2, asset_analysis: 2, map_proposal: 5,
};
const ANCIENS_FORFAITS = { starter: [0, 200], core: [99, 2000], plus: [299, 7000], business: [990, 24000] } as const;
const ANCIENNES_RECHARGES = [['pack_1k', 1000, 19], ['pack_5k', 5000, 79], ['pack_20k', 20000, 279]] as const;
const ANCIENNES_IMAGES = { nano: 4, nano_high: 8, gpt2: 5, gpt2_high: 20, gpt_image: 8 } as const;

describe('unité ÷ 10 · ni prix ni droits effectifs ne changent', () => {
  it('chaque action coûte exactement ×10', () => {
    const ecarts = (Object.keys(ANCIEN_BAREME) as CreditAction[]).filter((a) => CREDIT_COSTS[a] !== ANCIEN_BAREME[a] * FACTEUR_UNITE)
      .map((a) => `${a} : ${CREDIT_COSTS[a]} au lieu de ${ANCIEN_BAREME[a] * FACTEUR_UNITE}`);
    expect(ecarts).toEqual([]);
    expect(Object.keys(CREDIT_COSTS).sort()).toEqual(Object.keys(ANCIEN_BAREME).sort());
    for (const m of IMAGE_MODELS) expect(m.credits, m.key).toBe(ANCIENNES_IMAGES[m.key as keyof typeof ANCIENNES_IMAGES] * FACTEUR_UNITE);
    expect(GRILLE_STUDIO.image_generation.credits).toBe(40);
    expect(GRILLE_STUDIO.animation.credits).toBe(200);
  });

  it('chaque forfait · même prix, allocation ×10 · chaque recharge · même prix, crédits ×10', () => {
    for (const [k, [eur, credits]] of Object.entries(ANCIENS_FORFAITS)) {
      expect([FORFAITS_ACTUELS[k as keyof typeof FORFAITS_ACTUELS].prixMensuelEur, FORFAITS_ACTUELS[k as keyof typeof FORFAITS_ACTUELS].creditsMois]).toEqual([eur, credits * FACTEUR_UNITE]);
    }
    expect(RECHARGES_ACTUELLES.map((r) => [r.key, r.credits, r.eur])).toEqual(ANCIENNES_RECHARGES.map(([k, c, e]) => [k, c * FACTEUR_UNITE, e]));
    expect(CREDIT_EUR * FACTEUR_UNITE).toBeCloseTo(0.05, 10);
  });

  it('pouvoir d’achat · pour chaque forfait et chaque action, le nombre d’actions permises ne bouge pas', () => {
    for (const [k, [, credits]] of Object.entries(ANCIENS_FORFAITS)) {
      for (const a of Object.keys(ANCIEN_BAREME) as CreditAction[]) {
        expect(Math.floor(FORFAITS_ACTUELS[k as keyof typeof FORFAITS_ACTUELS].creditsMois / CREDIT_COSTS[a])).toBe(Math.floor(credits / ANCIEN_BAREME[a]));
      }
    }
  });
});

describe('conversion des soldes', () => {
  it('chaque compteur ×10, la poche jamais suivie reste null', () => {
    expect(convertirSoldes({ solde: 2500, derniereAllocation: 2000, creditsEssai: 300, abonnementRestant: 1500, horsAbonnementConsommes: 0 }))
      .toEqual({ solde: 25000, derniereAllocation: 20000, creditsEssai: 3000, abonnementRestant: 15000, horsAbonnementConsommes: 0, delta: 22500 });
    expect(convertirSoldes({ solde: 7, derniereAllocation: 0, creditsEssai: 0, abonnementRestant: null, horsAbonnementConsommes: 3 }).abonnementRestant).toBeNull();
  });

  it('une réservation antérieure à la conversion rend ×10, une postérieure rend tel quel', () => {
    const conv = new Date('2026-11-01T10:00:00Z');
    expect(facteurRendu(new Date('2026-11-01T09:59:59Z'), conv)).toBe(10);
    expect(facteurRendu(new Date('2026-11-01T10:00:00Z'), conv)).toBe(1);
    expect(facteurRendu(new Date('2026-10-01T00:00:00Z'), null)).toBe(1);
  });

  it('le journal se lit dans l’unité courante, sans compter la conversion', () => {
    const conv = new Date('2026-11-01T10:00:00Z');
    expect(deltaUniteCourante({ delta: -4, createdAt: new Date('2026-10-30T00:00:00Z') }, conv)).toBe(-40);
    expect(deltaUniteCourante({ delta: -40, createdAt: new Date('2026-11-02T00:00:00Z') }, conv)).toBe(-40);
    expect(deltaUniteCourante({ delta: 22500, createdAt: conv, reason: MOTIF_CONVERSION_UNITE }, conv)).toBe(0);
  });
});
