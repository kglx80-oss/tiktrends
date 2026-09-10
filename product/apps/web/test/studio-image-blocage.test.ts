import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le studio Image dit ce qui manque AVANT le clic · comme Pubs IA.
 *
 * La logique (quelle étape manque, et sa phrase) est prouvée par mutation dans
 * `assistant-image` (core). Ici on verrouille que le studio la BRANCHE · il
 * calcule le blocage depuis le moteur d'étapes et le transmet au composeur, qui
 * désactive le bouton et affiche la raison. Sans ce câblage, le refus
 * reviendrait au clic, ailleurs sur l'écran. Fichier serveur/gros client non
 * rendable · on lit la source.
 */
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/image/ImageStudio.tsx'), 'utf8');

describe('le bouton du studio Image dit ce qui manque', () => {
  it('le blocage vient du moteur d’étapes pur', () => {
    expect(STUDIO).toContain('premiereImageIncomplete');
    expect(STUDIO).toContain('manqueImage');
  });

  it('le blocage est transmis au composeur', () => {
    expect(STUDIO, 'le composeur ne reçoit pas le blocage').toMatch(/blocage=\{/);
  });
});
