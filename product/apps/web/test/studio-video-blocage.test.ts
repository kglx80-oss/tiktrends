import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le studio Vidéo dit ce qui manque AVANT le clic · comme Pubs IA et Image.
 *
 * La logique (quelle étape manque, sa phrase) est prouvée par mutation dans
 * `assistant-video` (core). Ici on verrouille le CÂBLAGE · le studio calcule le
 * blocage depuis le moteur d'étapes et le transmet au composeur. Fichier
 * serveur/gros client non rendable · on lit la source.
 */
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/video/VideoStudioFull.tsx'), 'utf8');

describe('le bouton du studio Vidéo dit ce qui manque', () => {
  it('le blocage vient du moteur d’étapes pur', () => {
    expect(STUDIO).toContain('premiereVideoIncomplete');
    expect(STUDIO).toContain('manqueVideo');
  });
  it('le blocage est transmis au composeur', () => {
    expect(STUDIO).toMatch(/blocage=\{/);
  });
});
