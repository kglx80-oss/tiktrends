import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Une vidéo générée peut désormais être poussée en test dans Adsmap (le pont
 * accepte le format vidéo). Le studio Vidéo doit donc exposer « Suivre dans
 * Adsmap » sur chaque vidéo, à qui a l'atelier de test · comme le studio Pubs.
 *
 * Page serveur + client à actions serveur · non rendables seuls. Adoption par
 * la source.
 */
const page = readFileSync(join(process.cwd(), 'app/(app)/studio/video/page.tsx'), 'utf8');
const comp = readFileSync(join(process.cwd(), 'app/(app)/studio/video/VideoStudioFull.tsx'), 'utf8');

describe('Studio Vidéo · une vidéo peut être suivie dans Adsmap', () => {
  it('la page calcule l’accès à l’atelier de test et le transmet', () => {
    expect(page, 'l’accès Adsmap n’est pas calculé').toMatch(/adsmapOpen\s*=.*canAccess\(effectiveAccess\(s\).*key === 'adsmap'/s);
    expect(page, 'l’accès n’est pas transmis au studio vidéo').toContain('adsmap={adsmapOpen}');
  });

  it('le studio passe « trackable » à la barre d’actions de chaque vidéo', () => {
    expect(comp, 'le bouton « Suivre dans Adsmap » n’est pas exposé').toContain('trackable={adsmap}');
  });
});
