import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'invariant, désormais pour TOUT l'app · plus un seul style EN LIGNE ne fige
 * un nombre de colonnes à trois ou plus (`gridTemplateColumns:'repeat(N,1fr)'`).
 * Ces grilles ne s'effondraient jamais et débordaient le téléphone (#PR B, D, ce
 * scanner ferme la classe). Le remède maison : `repeat(auto-fit, minmax(min(N,
 * 100%), 1fr))` (empile seul, jamais de débordement), ou un cadre `overflowX`
 * pour un tableau.
 *
 * Ne vise QUE la clé inline camelCase `gridTemplateColumns` · les CSS en
 * `<style>` (kebab `grid-template-columns`) portent, elles, des `@media` et
 * restent hors périmètre. `repeat(2,1fr)` (deux colonnes) tient sur un
 * téléphone · on ne l'interdit pas.
 */
function tsx(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...tsx(p));
    else if (e.endsWith('.tsx')) out.push(p);
  }
  return out;
}

// gridTemplateColumns: 'repeat(<N>, 1fr)' avec N de 3 à 99 · le point-virgule
// des <style> (grid-template-columns) ne matche pas (clé kebab différente).
const FIGE = /gridTemplateColumns:\s*'repeat\(\s*([3-9]|[1-9]\d), ?1fr\)'/;

describe('aucun style inline ne fige 3+ colonnes égales', () => {
  it('les grilles de colonnes fixes sont fluides ou scrollables partout', () => {
    const racine = process.cwd();
    const fautifs: string[] = [];
    for (const dossier of ['app', 'components']) {
      for (const f of tsx(join(racine, dossier))) {
        if (FIGE.test(readFileSync(f, 'utf8'))) fautifs.push(f.replace(racine + '/', ''));
      }
    }
    expect(fautifs, `colonnes figées à 3+ (utilise auto-fit minmax(min(N,100%),1fr) ou un cadre overflowX) : ${fautifs.join(', ')}`).toEqual([]);
  });
});
