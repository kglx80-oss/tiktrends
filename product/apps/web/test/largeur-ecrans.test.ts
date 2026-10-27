import { describe, it, expect } from 'vitest';
import { LARGEURS } from '../components/ui';

/**
 * « Exploiter tout l'espace » · les écrans à données tiennent la largeur standard.
 *
 * Les largeurs avaient dérivé (940, 1000, 1040… au hasard) et certains écrans
 * paraissaient tassés à côté de leurs voisins à 1180. On fixe le palier `data`
 * et on cloue au RÉSULTAT que les écrans précédemment étroits l'ont adopté · un
 * retour en arrière (un écran qui reglisse sous la largeur standard) fait
 * échouer ce garde, en nommant le fichier.
 */


describe('largeurs de contenu · le standard', () => {
  it('les quatre paliers sont fixes et ordonnés', () => {
    expect(LARGEURS).toEqual({ table: 1320, data: 1180, detail: 1040, prose: 760 });
    expect(LARGEURS.data).toBe(1180);
  });
});

// Vague 3 · le dernier cas de « écrans data élargis » était la page V5 `/jarvis`,
// retirée (Spatial exclusif) · les cadres V5 restants sont gardés par `b2-cadre-routes`.
