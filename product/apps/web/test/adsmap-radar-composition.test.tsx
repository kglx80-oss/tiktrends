import { describe, expect, it } from 'vitest';
import { placementLanceurSupport } from '@tiktrends/core';

/**
 * Lot UI Radar · audit /adsmap/radar. Les actions du fil observer→itérer étaient
 * sous la cible tactile de 44 px · « Demander le concept à Jarvis » (35), le lien
 * « Ouvrir la veille » de l'état vide (14), et dans le brouillon « Poser sur la
 * carte » / « Réécrire ». Et le support flottait (il recouvrait le titre
 * « Aucune trouvaille » à 390) au lieu d'être ancré en pied comme sur les autres
 * écrans Adsmap.
 *
 * On cloue la STRUCTURE à la source · chaque action porte minHeight 44, et le
 * support est ancré sur la route. Aucun moteur / connecteur / métier touché.
 */

// L'écran V5 est retiré (Spatial le sert) · reste la règle du noyau sur le support ancré.

describe('Radar · le support est ANCRÉ (il ne recouvre plus le contenu)', () => {
  it('/adsmap/radar entre dans la liste des écrans à support ancré', () => {
    expect(placementLanceurSupport('/adsmap/radar'), 'le support de /adsmap/radar flotte encore et recouvre le contenu').toBe('ancre');
  });
});
