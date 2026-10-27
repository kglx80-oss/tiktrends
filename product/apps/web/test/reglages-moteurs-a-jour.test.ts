import { describe, it, expect } from 'vitest';
import { IMAGE_MODELS, servicesEspace } from '@tiktrends/core';

/**
 * Réglages · la description de ce que débloque la clé image ne doit pas se
 * périmer en silence.
 *
 * Elle nommait « Studio Image (Flux/Ideogram) » · deux moteurs absents du
 * catalogue actuel (Nano Banana 2, GPT Image). Un opérateur y lisait un
 * inventaire faux de ce qu'il active en posant la clé.
 *
 * Le garde dérive les FAMILLES de moteurs du catalogue lui-même · la
 * description doit en nommer au moins une. Impossible dès lors de laisser la
 * copie citer un moteur retiré, ou d'oublier de la mettre à jour quand le
 * catalogue change · le test tombe.
 */
function famillesCatalogue(): string[] {
  // « Nano Banana 2 · Haute » -> « Nano Banana » · « GPT Image 1 » -> « GPT Image ».
  return [...new Set(IMAGE_MODELS.map((m) => m.label.replace(/\s*·.*$/, '').replace(/\s+\d+$/, '').trim()))];
}

describe('Réglages · la clé image nomme les moteurs réels', () => {
  it('la description Fal.ai cite un moteur présent au catalogue', () => {
    // Vague 2 · les services de l'espace viennent de la règle du noyau (écran Spatial Espace).
    const ligne = servicesEspace({}).find((x) => x.cle === 'image-video')?.debloque;
    expect(ligne, 'service image et vidéo introuvable dans Réglages').toBeTruthy();
    const fams = famillesCatalogue();
    expect(
      fams.some((f) => ligne!.includes(f)),
      `la description de la clé image ne nomme aucun moteur réel du catalogue (${fams.join(', ')})`,
    ).toBe(true);
  });
});
