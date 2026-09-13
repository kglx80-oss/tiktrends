import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Une recherche Veille sans résultat rendait une grille VIDE, sans un mot · ça
 * se lit comme un écran cassé. On exige un état vide qui DIT ce qui s'est passé
 * et OFFRE une sortie (repartir des gagnants installés · efface la recherche).
 *
 * Page serveur (session, source de données) · non rendable. Adoption par la
 * source, bornée au bloc « aucune annonce ».
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/veille/page.tsx'), 'utf8');
// Le bloc d'état vide est le DERNIER `ads.length === 0` du fichier · un autre,
// antérieur, sert au choix du message de comptage.
const i = src.lastIndexOf('ads.length === 0');
const bloc = src.slice(i, i > -1 ? i + 700 : undefined);

describe('Veille · une recherche sans résultat n’est pas une grille muette', () => {
  it('le bloc « aucune annonce » existe', () => {
    expect(i, 'aucun état vide pour ads.length === 0').toBeGreaterThan(-1);
  });

  it('un état vide avec un geste de sortie, pas une grille muette', () => {
    expect(bloc, 'l’état vide n’adopte pas le composant Empty').toContain('<Empty');
    expect(bloc, 'l’état vide n’offre aucune sortie').toContain("href: '/veille'");
    expect(bloc, 'un « todo » sans geste serait une impasse').toContain('tone="todo"');
  });
});
