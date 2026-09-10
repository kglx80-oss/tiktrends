import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'invariant, désormais pour TOUTE l'app · plus une seule page ne fige sa marge
 * latérale à 36px (le contenu se collait aux bords du téléphone). #325 (Veille),
 * #329 (Studio/Adsmap) puis cette passe (le reste) l'ont rendue fluide via
 * clamp(16px, 4vw, 36px). Le garde scanne app/ · une régression future ressort.
 */
function pagesTsx(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...pagesTsx(p));
    else if (e.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('aucune page ne fige sa marge latérale à 36px', () => {
  it('la marge latérale est fluide partout dans app/', () => {
    const racine = process.cwd();
    const fautifs = pagesTsx(join(racine, 'app'))
      .filter((f) => /padding: '\d+px 36px/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(racine + '/', ''));
    expect(fautifs, `marge latérale figée à 36px (utilise clamp) : ${fautifs.join(', ')}`).toEqual([]);
  });
});
