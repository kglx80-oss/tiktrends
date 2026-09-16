import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le tracker promet le best-effort · « une marque en échec n'arrête pas les
 * autres ». Une écriture DB qui jette (contrainte, snapshot JSON invalide,
 * erreur transitoire) ne doit donc interrompre ni les marques suivantes de
 * l'espace, ni les espaces suivants du cron · sinon un seul échec ferait rater
 * tout le reste et renverrait 500.
 *
 * Le job utilise le singleton `db` (non injectable) · comme les autres gardes
 * de ce code serveur, on vérifie la propriété sur la source · chaque boucle
 * isole sa propre unité dans un catch. Le test tombe si l'isolation disparaît.
 */
const SRC = readFileSync(join(process.cwd(), 'lib/tracker.ts'), 'utf8');

describe('tracker · best-effort tenu, pas seulement promis', () => {
  it('une marque en échec est attrapée et n’arrête pas les autres', () => {
    expect(SRC, 'la boucle par marque doit isoler chaque itération dans un catch')
      .toMatch(/catch[\s\S]{0,80}console\.error\('\[tracker\] brand'/);
  });

  it('un espace en échec est attrapé et n’arrête pas les autres', () => {
    expect(SRC, 'scanAllTracker doit isoler chaque espace dans un catch')
      .toMatch(/catch[\s\S]{0,80}console\.error\('\[tracker\] workspace'/);
  });
});
