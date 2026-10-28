import { describe, it, expect } from 'vitest';
import { estGagnantVeille } from '@tiktrends/core';

/**
 * La veille pousse les GAGNANTS vers la création.
 *
 * ── Ce que ça change ─────────────────────────────────────────────────────────
 *
 * « Nouveau » n'est pas « gagnant » · un concurrent lance dix pubs, celles qui
 * comptent sont celles qui TIENNENT. La veille montrait chaque pub à l'identique,
 * un lancement de deux jours comme une pub éprouvée depuis deux mois. On flague
 * désormais les gagnants (même signal qu'`isProven` · tient ≥ 21 j, ou portée qui
 * monte), on les remonte en tête du fil auto, et on met en avant le clone · c'est
 * la pub PROUVÉE qu'on veut refaire.
 */

describe('estGagnantVeille · le signal, pas l’opinion', () => {
  it('trop jeune sans croissance · pas un gagnant', () => {
    expect(estGagnantVeille({ daysRunning: 5 })).toBe(false);
  });
  it('tient depuis le seuil (21 j) · gagnant', () => {
    expect(estGagnantVeille({ daysRunning: 21 })).toBe(true);
    expect(estGagnantVeille({ daysRunning: 40 })).toBe(true);
  });
  it('portée qui monte et déjà ≥ 7 j · gagnant plus tôt', () => {
    expect(estGagnantVeille({ daysRunning: 10, reachDelta30d: 500 })).toBe(true);
  });
  it('monte mais trop jeune (< 7 j) · pas encore', () => {
    expect(estGagnantVeille({ daysRunning: 5, reachDelta30d: 500 })).toBe(false);
  });
  it('installée mais portée en baisse · reste un gagnant (elle tient)', () => {
    expect(estGagnantVeille({ daysRunning: 30, reachDelta30d: -100 })).toBe(true);
  });
  it('aucune donnée · pas un gagnant, jamais par défaut', () => {
    expect(estGagnantVeille({})).toBe(false);
    expect(estGagnantVeille({ daysRunning: null, reachDelta30d: null })).toBe(false);
  });
});

// Vague 4 · la carte V5 (`AdCard`) et le fil `TrackerFeed` sont retirés · la règle reste au noyau,
// les cartes Spatial disent la tendance (`estTendanceVeille`) et les signaux (`signauxVeille`).
