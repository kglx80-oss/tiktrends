import { describe, expect, it } from 'vitest';
import { etatLancementLot, appliquerSuggestionSeuils } from '../src/adsmap/sous-pages-vue';
import { DEFAULT_VERDICT_CONFIG } from '../src/adsmap/verdict';

describe('Lots · lancer exige les ads prêtes, comme le serveur', () => {
  it('lot non préparé · pas lançable, raison dite', () => {
    const e = etatLancementLot({ statutLot: 'draft', ads: [{ status: 'draft' }, { status: 'ready' }] });
    expect(e.lancable, 'lançable avant « Préparer »').toBe(false);
    expect(e.raison).toContain('1 ad(s) pas encore prête(s)');
  });
  it('toutes prêtes · lançable ; déjà lancé ou vide · non', () => {
    expect(etatLancementLot({ statutLot: 'ready', ads: [{ status: 'ready' }] })).toEqual({ lancable: true, raison: null });
    expect(etatLancementLot({ statutLot: 'testing', ads: [{ status: 'live' }] }).lancable).toBe(false);
    expect(etatLancementLot({ statutLot: 'draft', ads: [] }).lancable).toBe(false);
  });
});

describe('Protocole · « Proposer des seuils » ne touche qu’aux seuils mesurés', () => {
  const actuel = {
    protocol: { structure: 'abo_single_adset', dailyBudgetPerAd: 12, durationDays: 10, audienceRule: 'Large FR 25-45', campaignNamePattern: 'NEVA_{lot}', budgetVarianceTolerance: 0.1 },
    verdict: { ...DEFAULT_VERDICT_CONFIG, targetCpa: 22, minSpendMultiple: 4, leadingIndicators: { hookRate: 0.25, holdRate: 0.08, ctr: 0.01 } },
  };
  it('données réelles · CPA, indicateurs calculés et budget changent, le reste est gardé', () => {
    const s = { fromRealData: true, protocol: { dailyBudgetPerAd: 30 }, verdict: { ...DEFAULT_VERDICT_CONFIG, targetCpa: 27, leadingIndicators: { ...DEFAULT_VERDICT_CONFIG.leadingIndicators, hookRate: 0.36 } } };
    const r = appliquerSuggestionSeuils(actuel, s);
    expect(r.protocol.campaignNamePattern, 'le nom de campagne saisi est écrasé').toBe('NEVA_{lot}');
    expect(r.protocol.audienceRule).toBe('Large FR 25-45');
    expect(r.protocol.structure).toBe('abo_single_adset');
    expect(r.protocol.durationDays).toBe(10);
    expect(r.protocol.dailyBudgetPerAd).toBe(30);
    expect(r.verdict.targetCpa).toBe(27);
    expect(r.verdict.leadingIndicators.hookRate).toBe(0.36);
    expect(r.verdict.leadingIndicators.holdRate, 'un indicateur non mesuré revient au défaut').toBe(0.08);
    expect(r.verdict.minSpendMultiple, 'un réglage manuel hors seuils est écrasé').toBe(4);
  });
  it('sans donnée réelle · rien n’est écrasé', () => {
    const r = appliquerSuggestionSeuils(actuel, { fromRealData: false, protocol: { dailyBudgetPerAd: 20 }, verdict: DEFAULT_VERDICT_CONFIG });
    expect(r, 'les valeurs par défaut écrasent les réglages').toEqual(actuel);
  });
});
