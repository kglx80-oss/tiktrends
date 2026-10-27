import { describe, it, expect } from 'vitest';
import { etapesConfigurationMarque } from '@tiktrends/core';

/**
 * CDC v8 · F08 · l'étape de démarrage des concurrents ne prétend pas un suivi
 * actif. Saisir un nom dans le profil RENSEIGNE un concurrent (situer la
 * catégorie) · le suivi ACTIF se met en place depuis la Veille. « Suivre les
 * concurrents · Fait » prétendait un suivi actif que le Radar contredisait.
 *
 * Vague 2 · la fiche V5 est retirée · l'étape vit dans la règle du noyau de la
 * carte « Finis de configurer » (`etapesConfigurationMarque`, écran Spatial).
 */
const etat = { manquesFiche: 0, metaConnecte: true, concurrentsSuivis: 0, concurrentsRenseignes: 0, sauvegardes: 0, lotsLances: 0, personnes: 1 };
const etape = (e: Partial<typeof etat>) => etapesConfigurationMarque({ ...etat, ...e }, 'b1').find((x) => x.cle === 'concurrents')!;

describe('F08 · l’étape de démarrage « concurrents » ne prétend pas un suivi actif', () => {
  it('des concurrents seulement RENSEIGNÉS ne valent pas « fait »', () => {
    const e = etape({ concurrentsRenseignes: 5, concurrentsSuivis: 0 });
    expect(e.faite).toBe(false);
    expect(e.detail).toContain('5 concurrents renseignés dans la fiche · 0 suivi');
  });
  it('l’étape n’est faite qu’avec des concurrents RÉELLEMENT suivis', () => {
    expect(etape({ concurrentsRenseignes: 0, concurrentsSuivis: 3 }).faite).toBe(true);
  });
});
