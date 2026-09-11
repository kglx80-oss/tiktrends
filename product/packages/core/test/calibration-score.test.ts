import { describe, expect, it } from 'vitest';
import { calibrationScore, MIN_PAR_MOITIE, type PaireScoreVerdict } from '../src/adsmap/calibration-score';
import type { VerdictValue } from '../src/adsmap/types';

const p = (score: number, verdict: VerdictValue | null): PaireScoreVerdict => ({ score, verdict });

describe('calibrationScore · le score prédit-il le marché', () => {
  it('muet sans aucune paire mesurée', () => {
    const c = calibrationScore([]);
    expect(c.predictif).toBeNull();
    expect(c.conclusifs).toBe(0);
  });

  it('ignore les verdicts non conclusifs (inconclusive, insufficient_delivery, en cours)', () => {
    const c = calibrationScore([p(80, 'inconclusive'), p(40, 'insufficient_delivery'), p(50, null)]);
    expect(c.conclusifs).toBe(0);
    expect(c.predictif).toBeNull();
  });

  it('attend tant qu’une moitié est sous le plancher', () => {
    // 6 conclusives mais toutes en HAUT (scores identiques) · la moitié basse est vide.
    const paires = Array.from({ length: 6 }, () => p(80, 'winner'));
    const c = calibrationScore(paires);
    expect(c.predictif, 'ne devrait pas trancher sous le plancher par moitié').toBeNull();
  });

  it('déclare le score prédictif quand la moitié haute gagne nettement plus', () => {
    // Haut (score 90) : 6 gagnantes / 6. Bas (score 10) : 0 / 6. Écart total.
    const paires: PaireScoreVerdict[] = [
      ...Array.from({ length: 6 }, () => p(90, 'winner' as VerdictValue)),
      ...Array.from({ length: 6 }, () => p(10, 'loser' as VerdictValue)),
    ];
    const c = calibrationScore(paires);
    expect(c.nHaut).toBeGreaterThanOrEqual(MIN_PAR_MOITIE);
    expect(c.nBas).toBeGreaterThanOrEqual(MIN_PAR_MOITIE);
    expect(c.predictif).toBe(true);
    expect(c.tauxHaut).toBe(1);
    expect(c.tauxBas).toBe(0);
    expect(c.resume.toLowerCase()).toContain('prédit');
  });

  it('ne déclare rien quand les deux moitiés gagnent pareil · l’écart peut être du hasard', () => {
    // Haut et bas au même taux (50 %) · le score ne discrimine pas.
    const demi = (s: number) => [p(s, 'winner' as VerdictValue), p(s, 'loser' as VerdictValue), p(s, 'winner' as VerdictValue), p(s, 'loser' as VerdictValue), p(s, 'winner' as VerdictValue), p(s, 'loser' as VerdictValue)];
    const c = calibrationScore([...demi(80), ...demi(20)]);
    expect(c.predictif).toBe(false);
  });
});
