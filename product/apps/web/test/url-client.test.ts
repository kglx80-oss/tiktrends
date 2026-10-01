import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recette #106 · une écriture d'URL qui passe `window.history.state` porte la
 * marque interne de Next (`__NA`) et contourne la synchronisation du routeur ·
 * le paramètre écrit disparaît à la réécriture suivante. Aucune écriture de
 * l'application ne doit la passer.
 */
const fichiers = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? (f === 'node_modules' || f === '.next' ? [] : fichiers(p)) : /\.tsx?$/.test(f) ? [p] : [];
});

describe('Écritures d’URL · jamais l’état interne de Next', () => {
  it('aucun replaceState/pushState ne repasse window.history.state', () => {
    const fautifs = ['app', 'components', 'lib'].flatMap((d) => fichiers(join(process.cwd(), d)))
      .filter((p) => /history\.(replace|push)State\(\s*window\.history\.state/.test(readFileSync(p, 'utf8')));
    expect(fautifs, 'une écriture contourne la synchronisation du routeur').toEqual([]);
  });
});
