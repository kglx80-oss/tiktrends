import { describe, expect, it } from 'vitest';
import { evenementsConcurrent, EVENEMENT_LABEL, EVENEMENT_RAISON, JOURS_CROISSANCE_MIN } from '../src/evenement-concurrent';
import { PROVEN_DAYS } from '../src/adsmap/market-stats';

/**
 * CDC v7 · N10 · une pub de veille ne se résume pas à « NOUVEAU ». On la classe
 * en événements DÉRIVABLES de l'instantané · une nouveauté fraîchement détectée,
 * une diffusion durable (elle tient), une croissance (sa portée monte).
 */
describe('evenementsConcurrent', () => {
  it('une pub juste détectée, jeune, sans montée = seulement une nouveauté', () => {
    expect(evenementsConcurrent({ daysRunning: 2, reachDelta30d: 0 }, { nouveau: true })).toEqual(['nouveaute']);
  });

  it('une pub installée au-delà du seuil éprouvé porte « diffusion durable »', () => {
    const ev = evenementsConcurrent({ daysRunning: PROVEN_DAYS, reachDelta30d: 0 }, { nouveau: false });
    expect(ev).toContain('diffusion_durable');
    // Juste EN DESSOUS du seuil · pas encore durable.
    expect(evenementsConcurrent({ daysRunning: PROVEN_DAYS - 1, reachDelta30d: 0 }, { nouveau: false })).not.toContain('diffusion_durable');
  });

  it('une portée qui monte après le plancher d\'observation porte « croissance »', () => {
    expect(evenementsConcurrent({ daysRunning: JOURS_CROISSANCE_MIN, reachDelta30d: 5 }, { nouveau: false })).toContain('croissance');
    // Même montée, mais trop tôt · rien.
    expect(evenementsConcurrent({ daysRunning: JOURS_CROISSANCE_MIN - 1, reachDelta30d: 5 }, { nouveau: false })).not.toContain('croissance');
    // Après le plancher mais portée STABLE · pas une croissance.
    expect(evenementsConcurrent({ daysRunning: JOURS_CROISSANCE_MIN + 3, reachDelta30d: 0 }, { nouveau: false })).not.toContain('croissance');
  });

  it('cumule les natures, du plus fort au plus faible', () => {
    // Fraîchement détectée, installée depuis des semaines ET encore en montée.
    const ev = evenementsConcurrent({ daysRunning: PROVEN_DAYS + 10, reachDelta30d: 12 }, { nouveau: true });
    expect(ev).toEqual(['diffusion_durable', 'croissance', 'nouveaute']);
  });

  it('champs manquants = aucun événement invente une durée ou une montée', () => {
    expect(evenementsConcurrent({}, { nouveau: false })).toEqual([]);
    expect(evenementsConcurrent({ daysRunning: null, reachDelta30d: null }, { nouveau: false })).toEqual([]);
  });

  it('chaque nature a un libellé et une raison lisibles', () => {
    for (const e of ['diffusion_durable', 'croissance', 'nouveaute'] as const) {
      expect(EVENEMENT_LABEL[e].length).toBeGreaterThan(3);
      expect(EVENEMENT_RAISON[e].length).toBeGreaterThan(10);
    }
  });
});
