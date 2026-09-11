import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le studio Image relit un visuel · le « score Jarvis » appliqué à l'image. La
 * DÉCISION (note plafonnée par les ratés) est prouvée par mutation dans
 * `note-image` (core). Ici on verrouille le CÂBLAGE · l'action réutilise le
 * scoring + noteImage, et le studio l'appelle et rend la note. Fichiers
 * serveur/gros client non rendables · lecture source ; l'appel vision et le fetch
 * de l'image tournent côté serveur (à valider par le proprio après déploiement).
 */
const ACTION = readFileSync(join(process.cwd(), 'app/actions/image.ts'), 'utf8');
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/image/ImageStudio.tsx'), 'utf8');

describe('la relecture IA d’un visuel est branchée', () => {
  it('l’action réutilise le scoring de créa et le lit via noteImage', () => {
    expect(ACTION).toContain('export async function scoreImageAction');
    expect(ACTION).toContain('scoreCreative(');
    expect(ACTION).toContain('noteImage(');
  });

  it('le studio appelle la relecture et rend la note', () => {
    expect(STUDIO).toContain('scoreImageAction(');
    expect(STUDIO).toMatch(/notes\[im\.id\]/);
    expect(STUDIO).toContain('Noter (IA)');
  });
});
