import { describe, it, expect } from 'vitest';
import { reussiteEstimee, RESERVE_ESTIMATION } from '../src/adsmap/verdict-libelle';
import { prelaunchBrief } from '../src/adsmap/prelaunch';
import { summarizePrelaunch, type PrelaunchScore, type StatRow, type StatDimension } from '../src/adsmap/brand-stats';

/**
 * CDC v8 · R04 · un pré-score n'est pas une promesse.
 *
 * « X % de réussite ATTENDUE » posait un chiffre calculé sur l'historique comme
 * un engagement sur la créa qu'on s'apprête à lancer. Le pré-score est une
 * ESTIMATION lue sur les tests passés · c'est le test à venir qui la tranche. Le
 * libellé doit le dire de lui-même, dans les deux générateurs de synthèse (avis
 * de pré-lancement `prelaunchBrief`, mémoire Jarvis `summarizePrelaunch`), sans
 * jamais employer « attendue » qui la faisait passer pour une prédiction.
 *
 * On vérifie le RÉSULTAT · la phrase produite, pas la présence d'un appel.
 */

const stat = (dimension: string, key: string, hitRate: number, n = 8): StatRow => ({
  dimension: dimension as StatDimension, key,
  nAds: n, nConclusive: n, nWinners: Math.round(hitRate * n), nBaby: 0, hitRate,
  hookRateMedian: null, holdRateMedian: null, ctrMedian: null, cpaMedian: null,
});

const score = (band: PrelaunchScore['band'], p: number): PrelaunchScore => ({
  band, pHookOk: p, pConclusiveWin: p, drivers: [], thin: false,
});

describe('R04 · le fragment de pré-score se dit comme une estimation', () => {
  it('nomme son statut (estimée) et son ancrage (les tests passés)', () => {
    expect(reussiteEstimee(0.05)).toBe('5 % de réussite estimée au vu des tests passés');
    expect(reussiteEstimee(0.3)).toBe('30 % de réussite estimée au vu des tests passés');
  });

  it('borne la fraction à 0..1 avant de l’écrire', () => {
    expect(reussiteEstimee(1.4)).toContain('100 %');
    expect(reussiteEstimee(-0.2)).toContain('0 %');
  });

  it('n’emploie jamais le mot d’engagement « attendue »', () => {
    expect(reussiteEstimee(0.3)).not.toContain('attendue');
  });

  it('porte une réserve qui dit ce qui confirme le chiffre', () => {
    expect(RESERVE_ESTIMATION).toBe('estimation à confirmer par le test');
  });
});

describe('R04 · avis de pré-lancement · aucun chiffre posé comme une promesse', () => {
  const favorable = prelaunchBrief(
    { mechanism: 'listicle' },
    { stats: [stat('mechanism', 'listicle', 0.9), stat('format', 'video_ugc', 0.9)], globalRate: 0.3 },
  );
  const defavorable = prelaunchBrief(
    { mechanism: 'listicle' },
    { stats: [stat('mechanism', 'listicle', 0.05), stat('format', 'static', 0.05)], globalRate: 0.5 },
  );
  const moyen = prelaunchBrief(
    { mechanism: 'listicle' },
    { stats: [stat('mechanism', 'listicle', 0.45), stat('format', 'static', 0.45)], globalRate: 0.45 },
  );

  it('le profil favorable annonce une estimation, pas un dû', () => {
    expect(favorable.recommendation).toBe('go');
    expect(favorable.summary).toContain('de réussite estimée au vu des tests passés');
    expect(favorable.summary).toContain(RESERVE_ESTIMATION);
    expect(favorable.summary, 'l’ancien « attendue » se lisait comme une promesse').not.toContain('attendue');
  });

  it('le profil défavorable estime aussi, sans promettre l’échec', () => {
    expect(defavorable.recommendation).toBe('rework');
    expect(defavorable.summary).toContain('de réussite estimée au vu des tests passés');
    expect(defavorable.summary).toContain(RESERVE_ESTIMATION);
    expect(defavorable.summary).not.toContain('attendue');
  });

  it('le profil dans la moyenne porte la même réserve', () => {
    expect(moyen.recommendation).toBe('go');
    expect(moyen.summary).toContain('de réussite estimée au vu des tests passés');
    expect(moyen.summary).toContain(RESERVE_ESTIMATION);
    expect(moyen.summary).not.toContain('attendue');
  });
});

describe('R04 · mémoire Jarvis · même langage que l’avis', () => {
  it('favorable, défavorable et moyen disent tous « estimée » et portent la réserve', () => {
    for (const b of ['high', 'low', 'med'] as const) {
      const phrase = summarizePrelaunch(score(b, b === 'low' ? 0.05 : 0.3));
      expect(phrase, `bande ${b}`).toContain('de réussite estimée au vu des tests passés');
      expect(phrase, `bande ${b}`).toContain(RESERVE_ESTIMATION);
      expect(phrase, `bande ${b}`).not.toContain('attendue');
    }
  });

  it('un profil sans historique reste muet sur le chiffre', () => {
    // Un pré-score « thin » n'a rien mesuré · il ne doit annoncer aucune estimation.
    const muet = summarizePrelaunch({ band: 'med', pHookOk: 0, pConclusiveWin: 0, drivers: [], thin: true });
    expect(muet).toContain('Pas assez d’historique');
    expect(muet).not.toContain('de réussite estimée');
  });
});
