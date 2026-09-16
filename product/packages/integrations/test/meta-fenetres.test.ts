import { describe, it, expect } from 'vitest';
import { fenetresMeta } from '../src/meta-insights';

/**
 * Les deux fenêtres qui servent à comparer « période vs période précédente »
 * doivent avoir la MÊME durée. `time_range` de Meta est inclusif de ses bornes ·
 * l'ancienne paire [now−30 … now] (31 jours) contre [now−60 … now−31] (30 jours)
 * comparait 31 jours à 30, et gonflait toute variation d'un jour de données.
 */
const JOUR = 86_400_000;
const joursInclus = (f: { since: string; until: string }) =>
  Math.round((Date.parse(f.until) - Date.parse(f.since)) / JOUR) + 1;

describe('fenêtres de comparaison Meta', () => {
  const now = new Date('2026-03-15T09:30:00Z');
  const { courante, precedente } = fenetresMeta(now);

  it('couvrent chacune 30 jours', () => {
    expect(joursInclus(courante)).toBe(30);
    expect(joursInclus(precedente)).toBe(30);
  });

  it('sont de MÊME durée · le cœur du défaut', () => {
    expect(joursInclus(courante)).toBe(joursInclus(precedente));
  });

  it('sont adjacentes, sans chevauchement ni trou', () => {
    // La courante démarre le lendemain de la fin de la précédente.
    expect(Date.parse(courante.since) - Date.parse(precedente.until)).toBe(JOUR);
  });

  it('la fenêtre courante se termine aujourd’hui', () => {
    expect(courante.until).toBe('2026-03-15');
  });

  it('tient sur une année bissextile (bornes de février)', () => {
    const f = fenetresMeta(new Date('2024-03-05T00:00:00Z'));
    expect(joursInclus(f.courante)).toBe(30);
    expect(joursInclus(f.precedente)).toBe(30);
  });
});
