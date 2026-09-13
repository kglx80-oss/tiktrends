import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un visuel généré peut désormais être poussé en test dans Adsmap (le pont
 * accepte l'image en format static). Le studio Image doit exposer « Suivre dans
 * Adsmap » sur chaque visuel, à qui a l'atelier de test · comme le studio Pubs.
 *
 * Page serveur + client à actions serveur · non rendables seuls. Adoption par
 * la source.
 */
const page = readFileSync(join(process.cwd(), 'app/(app)/studio/image/page.tsx'), 'utf8');
const comp = readFileSync(join(process.cwd(), 'app/(app)/studio/image/ImageStudio.tsx'), 'utf8');

describe('Studio Image · un visuel peut être suivi dans Adsmap', () => {
  it('la page calcule l’accès à l’atelier de test et le transmet', () => {
    expect(page, 'l’accès Adsmap n’est pas calculé').toMatch(/adsmapOpen\s*=.*canAccess\(effectiveAccess\(s\).*key === 'adsmap'/s);
    expect(page, 'l’accès n’est pas transmis au studio image').toContain('adsmap={adsmapOpen}');
  });

  it('le studio passe « trackable » à la barre d’actions de chaque visuel', () => {
    expect(comp, 'le bouton « Suivre dans Adsmap » n’est pas exposé').toContain('trackable={adsmap}');
  });
});
