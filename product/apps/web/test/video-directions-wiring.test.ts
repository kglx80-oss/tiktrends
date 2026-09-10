import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les directions de mouvement sont branchées · logique pure prouvée par mutation
 * dans `video-directions` (core). Ici on verrouille le CÂBLAGE · le studio offre
 * le choix et le transmet, l'action le compose dans le prompt final. Fichiers
 * serveur/gros client non rendables · on lit la source.
 */
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/video/VideoStudioFull.tsx'), 'utf8');
const ACTION = readFileSync(join(process.cwd(), 'app/actions/video.ts'), 'utf8');

describe('les directions de mouvement sont branchées au studio Vidéo', () => {
  it('le studio propose le catalogue et transmet la direction', () => {
    expect(STUDIO).toContain('VIDEO_DIRECTIONS');
    expect(STUDIO).toMatch(/directionKey: direction/);
  });
  it('l’action compose la direction dans le prompt (t2v et i2v)', () => {
    expect(ACTION).toContain('promptVideo(');
    const n = ACTION.split('promptVideo(').length - 1;
    expect(n, 'les deux chemins (texte et image) doivent composer la direction').toBeGreaterThanOrEqual(2);
  });
});
