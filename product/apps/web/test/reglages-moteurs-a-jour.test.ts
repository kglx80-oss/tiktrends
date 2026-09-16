import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IMAGE_MODELS } from '@tiktrends/core';

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
    const src = readFileSync(join(process.cwd(), 'app/(app)/settings/page.tsx'), 'utf8');
    const ligne = src.split('\n').find((l) => l.includes("env: 'FAL_KEY'"));
    expect(ligne, 'intégration FAL_KEY introuvable dans Réglages').toBeTruthy();
    const fams = famillesCatalogue();
    expect(
      fams.some((f) => ligne!.includes(f)),
      `la description de la clé image ne nomme aucun moteur réel du catalogue (${fams.join(', ')})`,
    ).toBe(true);
  });
});
