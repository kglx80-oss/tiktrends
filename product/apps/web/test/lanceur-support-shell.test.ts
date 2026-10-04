import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le shell lit la règle du noyau (`placementLanceurSupport`) · c'est elle que
 * les tests de composition vérifient au résultat, route par route. Ici on
 * s'assure seulement que le shell n'a pas réintroduit sa propre liste. Le
 * non-recouvrement lui-même est mesuré au navigateur (recette A #120, 390).
 */
const shell = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');

describe('AppShell · lanceur de support', () => {
  it('décide par la règle du noyau, sans liste locale de routes', () => {
    expect(shell).toMatch(/placementLanceurSupport\(pathname\)/);
    expect(shell, 'liste de routes ancrées réécrite dans le shell').not.toMatch(/pathname === '\/(dashboard|veille|analytics|connections)'/);
  });
});
