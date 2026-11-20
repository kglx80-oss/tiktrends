import { describe, it, expect } from 'vitest';
import { checkProtocol, summarizeProtocol, resolveCampaignName, protocoleSeulementInconnu, type ProtocolAd, type ProtocolRules } from '../src/adsmap/protocol';

/**
 * Le contrôle de protocole décide si les verdicts d'un lot valent quelque chose.
 * C'est la garde qui empêche le produit de dire « gagnante » d'une ad que Meta
 * a simplement choisi de servir.
 */

const rules: ProtocolRules = {
  structure: 'abo_one_adset_per_ad',
  campaignNamePattern: '[ADSMAP] TEST {brand} B{batch}',
  budgetVarianceTolerance: 0.2,
  minSpendShare: 0.35,
};
const ctx = { brandName: 'TrueFords', batchNumber: 4 };

const ad = (i: number, o: Partial<ProtocolAd> = {}): ProtocolAd => ({
  adId: `ad${i}`, adName: `TF_B04_concept_v${i}_HOOK`,
  adsetId: `set${i}`, campaignId: 'c1', campaignName: '[ADSMAP] TEST TrueFords B4',
  adsetDailyBudget: 20, spend: 140, ...o,
});

describe('lot conforme', () => {
  it('quatre annonces, un ad set chacune, même budget → comparable', () => {
    const c = checkProtocol([ad(1), ad(2), ad(3), ad(4)], rules, ctx);
    expect(c.compliant).toBe(true);
    expect(c.violations).toHaveLength(0);
    expect(summarizeProtocol(c)).toMatch(/comparables/);
  });

  it('la part de dépense vaut 1 quand tout est égal', () => {
    const c = checkProtocol([ad(1), ad(2)], rules, ctx);
    expect(c.spendShare.ad1).toBeCloseTo(1, 3);
  });
});

describe('CBO · la violation qui coûte le plus cher', () => {
  const cbo = [ad(1, { campaignBudgetOptimization: true }), ad(2, { campaignBudgetOptimization: true })];

  it('est détecté et disqualifie le lot', () => {
    const c = checkProtocol(cbo, rules, ctx);
    expect(c.compliant).toBe(false);
    expect(c.violations.some((v) => v.code === 'cbo')).toBe(true);
  });

  it('le message explique le biais, pas la règle', () => {
    const v = checkProtocol(cbo, rules, ctx).violations.find((x) => x.code === 'cbo')!;
    expect(v.message).toMatch(/concentre/);
    expect(v.message).toMatch(/relatifs/);
  });

  it('accepté quand la marque a choisi le CBO · on ne signale plus', () => {
    const c = checkProtocol(cbo, { ...rules, structure: 'cbo_tolerated' }, ctx);
    expect(c.violations.some((x) => x.code === 'cbo')).toBe(false);
  });
});

describe('CBO INCONNU · ensembles non lus · le lot ne se compare pas', () => {
  const RESUME = 'CBO non établi · les verdicts de ce lot ne seront que relatifs tant qu’il ne l’est pas.';

  it('une annonce qui a dépensé, CBO inconnu (`null`) · lot NON comparable, résumé qui le dit', () => {
    const c = checkProtocol([ad(1, { campaignBudgetOptimization: null }), ad(2, { campaignBudgetOptimization: false })], rules, ctx);
    expect(c.compliant, 'CBO inconnu · le lot reste comparable').toBe(false);
    const v = c.violations.find((x) => x.code === 'cbo_inconnu')!;
    expect(v.adIds).toEqual(['ad1']);
    expect(v.message).toMatch(/ensemble archivé, annonce terminée/);
    expect(v.message, 'le message promet un rétablissement par la seule « prochaine lecture »').toMatch(/export Ads Manager/);
    expect(summarizeProtocol(c)).toBe(RESUME);
    expect(RESUME).not.toMatch(/prochaine lecture/);
    expect(RESUME, 'le résumé dit « ensembles non lus » alors qu’une lecture réussie peut ne pas rendre un ensemble').not.toMatch(/non lus/);
    expect(protocoleSeulementInconnu(c.violations)).toBe(true);
  });

  it('`false` lu, ou non fourni (`undefined`) · rien d’inconnu, lot comparable', () => {
    expect(checkProtocol([ad(1, { campaignBudgetOptimization: false }), ad(2)], rules, ctx).compliant).toBe(true);
  });

  it('inconnu SANS dépense · ne biaise rien, ne bloque pas (sa sous-diffusion est dite à part)', () => {
    const c = checkProtocol([ad(1, { campaignBudgetOptimization: null, spend: 0 }), ad(2), ad(3)], rules, ctx);
    expect(c.violations.some((x) => x.code === 'cbo_inconnu')).toBe(false);
    expect(c.compliant).toBe(true);
  });

  it('CBO toléré par la marque · l’inconnu ne bloque pas non plus', () => {
    expect(checkProtocol([ad(1, { campaignBudgetOptimization: null }), ad(2)], { ...rules, structure: 'cbo_tolerated' }, ctx).compliant).toBe(true);
  });

  it('CBO connu ET inconnu · le résumé dit le CBO, la structure est à corriger (pas seulement inconnu)', () => {
    const c = checkProtocol([ad(1, { campaignBudgetOptimization: null }), ad(2, { campaignBudgetOptimization: true })], rules, ctx);
    expect(summarizeProtocol(c)).toMatch(/piloté par la campagne/);
    expect(protocoleSeulementInconnu(c.violations)).toBe(false);
  });
});

describe('ad set partagé', () => {
  it('deux annonces dans le même ad set cassent la comparaison', () => {
    const c = checkProtocol([ad(1, { adsetId: 'set1' }), ad(2, { adsetId: 'set1' }), ad(3)], rules, ctx);
    expect(c.compliant).toBe(false);
    const v = c.violations.find((x) => x.code === 'shared_adset')!;
    expect(v.adIds.sort()).toEqual(['ad1', 'ad2']);
  });

  it('toléré quand la marque a choisi un ad set unique', () => {
    const c = checkProtocol([ad(1, { adsetId: 's' }), ad(2, { adsetId: 's' })], { ...rules, structure: 'abo_single_adset' }, ctx);
    expect(c.violations.some((x) => x.code === 'shared_adset')).toBe(false);
  });
});

describe('budgets dispersés', () => {
  it('20 € contre 50 € dépasse la tolérance', () => {
    const c = checkProtocol([ad(1, { adsetDailyBudget: 20 }), ad(2, { adsetDailyBudget: 50 })], rules, ctx);
    expect(c.compliant).toBe(false);
    expect(c.violations.find((v) => v.code === 'budget_variance')!.message).toMatch(/20 € à 50 €/);
  });

  it('un écart dans la tolérance passe', () => {
    const c = checkProtocol([ad(1, { adsetDailyBudget: 20 }), ad(2, { adsetDailyBudget: 23 })], rules, ctx);
    expect(c.violations.some((v) => v.code === 'budget_variance')).toBe(false);
  });

  it('sans budget connu, on ne conclut rien', () => {
    const c = checkProtocol([ad(1, { adsetDailyBudget: null }), ad(2, { adsetDailyBudget: null })], rules, ctx);
    expect(c.violations.some((v) => v.code === 'budget_variance')).toBe(false);
  });
});

describe('sous-diffusion', () => {
  it('une annonce à 10 % de la dépense attendue est signalée', () => {
    // 3 annonces à 140 € et une à 20 € : la part attendue est ~110 €.
    const c = checkProtocol([ad(1), ad(2), ad(3), ad(4, { spend: 20 })], rules, ctx);
    expect(c.underDelivered).toEqual(['ad4']);
    expect(c.violations.find((v) => v.code === 'spend_share')!.message).toMatch(/pas été testées/);
  });

  it('n’empêche PAS le lot d’être comparable · c’est un verdict par ad', () => {
    // Le lot reste bien construit ; c'est cette annonce-là qui n'a pas eu sa chance.
    const c = checkProtocol([ad(1), ad(2), ad(3), ad(4, { spend: 20 })], rules, ctx);
    expect(c.compliant).toBe(true);
  });
});

describe('nom de campagne', () => {
  it('résout le motif', () => {
    expect(resolveCampaignName('[ADSMAP] TEST {brand} B{batch}', 'TrueFords', 4)).toBe('[ADSMAP] TEST TrueFords B4');
  });

  it('un lot hors campagne attendue est signalé sans être disqualifié', () => {
    // C'est une gêne de rattachement, pas un biais de mesure.
    const c = checkProtocol([ad(1, { campaignName: 'Campagne perso' }), ad(2, { campaignName: 'Campagne perso' })], rules, ctx);
    expect(c.violations.some((v) => v.code === 'campaign_name')).toBe(true);
    expect(c.compliant).toBe(true);
  });
});

describe('lot vide', () => {
  it('le dit au lieu de conclure à la conformité', () => {
    const c = checkProtocol([], rules, ctx);
    expect(c.compliant).toBe(false);
    expect(summarizeProtocol(c)).toMatch(/non rattaché/);
  });
});

describe('messages', () => {
  it('aucun ne laisse fuiter de jargon', () => {
    const c = checkProtocol([ad(1, { campaignBudgetOptimization: true, adsetId: 's', adsetDailyBudget: 10 }), ad(2, { adsetId: 's', adsetDailyBudget: 90, spend: 5 })], rules, ctx);
    for (const v of c.violations) {
      expect(v.message).not.toMatch(/null|undefined|NaN|Infinity|_id\b/);
      expect(v.message.length).toBeGreaterThan(40);
    }
    expect(summarizeProtocol(c)).not.toMatch(/null|undefined/);
  });
});
