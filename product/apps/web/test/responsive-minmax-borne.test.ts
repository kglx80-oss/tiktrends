import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les grilles `repeat(auto-fit, minmax(Npx, 1fr))` avec N ≥ 300 forcent une
 * piste plus large que l'écran sous ~320-360px · un filet de débordement
 * horizontal. Le remède, sans coût : `minmax(min(Npx, 100%), 1fr)` · la piste ne
 * dépasse jamais la largeur dispo. Ce scanner ferme la classe pour tout l'app.
 *
 * Ne vise QUE la forme auto-fit `minmax(Npx, 1fr)` · un `minmax(300px, 380px)`
 * (min/max d'un split, empilé par ailleurs via useIsMobile) reste permis.
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

// minmax(<N>px, 1fr) avec N ≥ 300 · non borné à 100%.
const NONBORNE = /minmax\(\s*(?:3\d\d|[4-9]\d\d|\d{4,})px\s*,\s*1fr\s*\)/;

describe('aucune piste auto-fit ≥300px n’est laissée non bornée', () => {
  it('les grilles auto-fit bornent leur piste à la largeur dispo', () => {
    const racine = process.cwd();
    const fautifs: string[] = [];
    for (const dossier of ['app', 'components']) {
      for (const f of tsx(join(racine, dossier))) {
        if (NONBORNE.test(readFileSync(f, 'utf8'))) fautifs.push(f.replace(racine + '/', ''));
      }
    }
    expect(fautifs, `piste auto-fit ≥300px non bornée (utilise minmax(min(Npx, 100%), 1fr)) : ${fautifs.join(', ')}`).toEqual([]);
  });

  it('la coquille ADMIN+ a une marge latérale fluide (clamp)', () => {
    const admin = readFileSync(join(process.cwd(), 'app/(app)/admin/page.tsx'), 'utf8');
    expect(admin, 'la marge admin est figée · elle colle aux bords du téléphone').not.toMatch(/padding: '\d+px 32px/);
    expect(admin).toContain("clamp(16px, 4vw, 32px)");
  });
});
