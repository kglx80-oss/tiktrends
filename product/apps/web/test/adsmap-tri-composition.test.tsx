import { describe, expect, it } from 'vitest';
import { placementLanceurSupport } from '@tiktrends/core';

/**
 * Lot UI Tri · audit /adsmap/tri. Les actions principales passaient déjà par le
 * helper `btn` (cible 44). Restaient deux défauts de présentation :
 *  - « réinitialiser », le lien du message « Aucun résultat pour … », rendait
 *    20 px (bouton texte nu inline) ;
 *  - le support flottait (il recouvrait le bouton « Valider » au défilement à 390)
 *    au lieu d'être ancré en pied comme sur les autres écrans Adsmap.
 *
 * On cloue la STRUCTURE à la source. Aucun moteur / connecteur / métier touché.
 */

// L'écran V5 est retiré (Spatial le sert) · reste la règle du noyau sur le support ancré.

describe('Tri · le support est ANCRÉ (il ne recouvre plus le contenu)', () => {
  it('/adsmap/tri entre dans la liste des écrans à support ancré', () => {
    expect(placementLanceurSupport('/adsmap/tri'), 'le support de /adsmap/tri flotte encore et recouvre le contenu au défilement').toBe('ancre');
  });
});
