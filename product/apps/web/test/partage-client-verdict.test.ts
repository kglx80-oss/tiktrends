import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v6 · R01 · « le partage ne renforce pas le statut ». La page de partage
 * client affichait une gagnante RELATIVE comme « Gagnante » en vert, et la
 * comptait dans le taux de réussite. La règle honnête (taux évaluable, Non
 * calculable, prometteuses à part) est prouvée au noyau (`verdict-libelle`).
 * Ici on vérifie que le calcul serveur et la page en tirent · `server-only` et
 * composant serveur, non exécutables ici · adoption source.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('Partage client · le verdict ne gonfle plus', () => {
  it('client-view calcule un taux honnête via le noyau, la relative à part', () => {
    const s = read('lib/client-view.ts');
    expect(s, 'ne passe pas par le taux honnête du noyau').toContain('tauxReussite(');
    expect(s, 'garde un ensemble de gagnantes incluant la relative')
      .not.toContain("new Set(['winner', 'baby_winner', 'relative_winner'])");
    expect(s, 'ne compte pas les prometteuses à part').toContain('promising: tr.prometteuses');
    expect(s, 'le taux ne vient pas du dénominateur évaluable').toContain('hitRate: tr.taux');
  });

  it('la page affiche prometteuse, sépare le groupe, et dit « Non calculable »', () => {
    const s = read('app/c/[token]/page.tsx');
    expect(s, 'affiche encore la relative comme « Gagnante »').not.toContain("relative_winner: 'Gagnante'");
    // Les gagnantes sont bornées à la source absolue du noyau (relative exclue).
    expect(s, 'les gagnantes ne s’appuient pas sur GAGNANTES_ABSOLUES')
      .toMatch(/gagnantes = vue\.ads\.filter\(\(a\) => GAGNANTES_ABSOLUES\.has/);
    expect(s, 'les prometteuses ne sont pas isolées')
      .toMatch(/prometteuses = vue\.ads\.filter\(\(a\) => a\.verdict === 'relative_winner'\)/);
    expect(s, 'ne sépare pas le groupe des prometteuses').toContain("titre=\"Prometteuses · comparaison relative\"");
    expect(s, 'affiche 0 % au lieu de « Non calculable »').toContain('Non calculable');
  });
});
