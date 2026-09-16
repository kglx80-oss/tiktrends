import { describe, it, expect } from 'vitest';
import { ageActifLabel, buildLiveAnalysis } from '../lib/analysis';
import type { MetaAdPerf } from '@tiktrends/integrations';

/**
 * L'écran Radar affiche l'ancienneté d'une créa. Sur données Meta live, l'âge
 * réel n'est pas connu (l'agrégat 30 j ne le porte pas) · l'afficher comme
 * « 0 j » (ou « 30 j ») serait une valeur fabriquée que le reste de l'écran
 * croirait. On dit « âge inconnu », et surtout on ne coalesce pas l'inconnu en 0
 * dans les données · sinon le libellé ne peut plus faire la différence.
 */
const perf = (o: Partial<MetaAdPerf> = {}): MetaAdPerf => ({
  adId: 'a', name: 'Créa', spend: 120, impressions: 5000, clicks: 80, ctr: 1.6,
  roas: 1.2, purchases: 4, cpa: 30, hookRate: 20, holdRate: 40, ...o,
});

describe('ageActifLabel', () => {
  it('rend le nombre de jours quand il est connu', () => {
    expect(ageActifLabel(12)).toBe('12 j');
    expect(ageActifLabel(0)).toBe('0 j');
  });
  it('dit « âge inconnu » quand il ne l’est pas · jamais un chiffre inventé', () => {
    expect(ageActifLabel(undefined)).toBe('âge inconnu');
  });
});

describe('buildLiveAnalysis · l’âge inconnu reste inconnu', () => {
  it('ne coalesce pas un âge absent en 0', () => {
    const [row] = buildLiveAnalysis([perf({ daysActive: undefined })]);
    expect(row).toBeTruthy();
    expect(row!.daysActive, 'un âge inconnu coalescé en 0 se lirait « 0 j »').toBeUndefined();
  });
  it('préserve un âge connu', () => {
    const [row] = buildLiveAnalysis([perf({ daysActive: 9 })]);
    expect(row!.daysActive).toBe(9);
  });
});
