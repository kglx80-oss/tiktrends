import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le studio Image reçoit la MÊME direction artistique que Pubs IA.
 *
 * La logique d'assemblage (`promptImage`) est prouvée par mutation dans
 * packages/core. Ici on verrouille le CÂBLAGE · le studio offre le choix et le
 * transmet, et l'action serveur le compose dans le prompt final · sans quoi le
 * contrôle serait décoratif. Ces deux fichiers tirent des dépendances serveur /
 * client lourdes, non rendables ici · on lit la source.
 */
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/image/ImageStudio.tsx'), 'utf8');
const ACTION = readFileSync(join(process.cwd(), 'app/actions/image.ts'), 'utf8');

describe('la direction artistique est branchée au studio Image', () => {
  it('le studio propose le catalogue et transmet la direction', () => {
    expect(STUDIO).toContain('AD_DIRECTIONS');
    expect(STUDIO, 'la direction choisie n’est pas envoyée à l’action').toMatch(/directionKey: direction/);
  });

  it('l’action compose la direction dans le prompt FINAL', () => {
    expect(ACTION).toContain('promptImage(');
    // Elle nourrit le prompt final, pas la légende · promptImage doit alimenter finalPrompt.
    expect(ACTION).toMatch(/avecDirection[\s\S]{0,200}finalPrompt|finalPrompt[\s\S]{0,200}avecDirection/);
  });
});
