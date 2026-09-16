import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le panneau détail d'une pub est une vraie modale · fond, Échap, bouton fermer
 * nommé, titre. Il manquait sa DÉCLARATION à l'assistance · sans `role="dialog"`
 * ni nom, un lecteur d'écran ne l'annonce pas comme un dialogue, et rien ne le
 * relie à son titre.
 *
 * Composant à actions serveur (il charge la pub) · non rendable · garde par
 * adoption de la source, qui lit les attributs portés par le panneau et son titre.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/adsmap/AdDrawer.tsx'), 'utf8');

describe('AdDrawer · le panneau détail est une modale nommée', () => {
  it('le panneau se déclare dialogue modal, lié à son titre', () => {
    expect(src).toContain('<aside role="dialog" aria-modal="true" aria-labelledby="addrawer-titre"');
  });
  it('le titre porte l’id auquel le dialogue renvoie', () => {
    expect(src).toContain('<h2 id="addrawer-titre"');
  });
});
