import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Des grilles de CARTES figeaient leur nombre de colonnes (`repeat(4,1fr)`,
 * `repeat(3,1fr)`) · elles ne s'effondraient jamais et débordaient le téléphone.
 * On les passe à `repeat(auto-fit, minmax(min(N, 100%), 1fr))` · le `min(N,100%)`
 * garantit qu'une piste ne dépasse jamais la largeur dispo (aucun débordement),
 * et l'auto-fit empile tout seul, sans JS ni @media (contrainte maison).
 *
 * Le shipped `gridTemplateColumns` EST le résultat · on l'éprouve par la source.
 */
const swipe = readFileSync(join(process.cwd(), 'app/(app)/veille/scale/SwipeFile.tsx'), 'utf8');
const conn = readFileSync(join(process.cwd(), 'app/(app)/connections/DataConnections.tsx'), 'utf8');

describe('Grilles de cartes · elles s’effondrent et ne débordent pas', () => {
  it('la bande de stats (Scale) n’a plus 4 colonnes figées', () => {
    expect(swipe, 'la bande garde repeat(4,1fr) · elle déborde le téléphone').not.toContain('repeat(4, 1fr)');
    expect(swipe, 'la bande n’adopte pas le trick anti-débordement').toContain('minmax(min(130px, 100%), 1fr)');
  });

  it('les trios de KPI (Connexions) ne figent plus 3 colonnes', () => {
    expect(conn, 'un trio de KPI garde repeat(3,1fr)').not.toContain('repeat(3, 1fr)');
    expect(conn, 'les KPI n’adoptent pas le trick anti-débordement').toContain('minmax(min(100px, 100%), 1fr)');
  });

  it('la grille des cartes de connexion ne peut plus déborder (piste bornée à 100%)', () => {
    expect(conn, 'la piste de 340px peut dépasser un petit écran').not.toContain('minmax(340px, 1fr)');
    expect(conn, 'la piste n’est pas bornée à la largeur dispo').toContain('minmax(min(340px, 100%), 1fr)');
  });

  it('les requêtes de veille (Scale) sont bornées elles aussi', () => {
    expect(swipe).toContain('minmax(min(300px, 100%), 1fr)');
  });
});
