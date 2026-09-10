import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { veilleSeedDefaut, NICHE_DEFAUT } from '@tiktrends/core';

/**
 * En arrivant sur la Veille SANS requête, l'écran ne doit plus être vide · on
 * amorce les gagnants installés, cadrés sur la catégorie de la marque active.
 */

describe('veilleSeedDefaut · le mot-clé d’amorçage', () => {
  it('extrait un mot-clé cherchable de la catégorie · pas le libellé brut', () => {
    // Le libellé entier ne se trouve pas dans le copy des pubs · on en garde le
    // nom produit (le dernier mot significatif).
    expect(veilleSeedDefaut({ category: 'compléments alimentaires' })).toEqual({ seed: 'alimentaires', parCategorie: true });
  });

  it('retombe sur la niche par défaut sans catégorie', () => {
    expect(veilleSeedDefaut({ category: null })).toEqual({ seed: NICHE_DEFAUT, parCategorie: false });
    expect(veilleSeedDefaut({ category: '   ' })).toEqual({ seed: NICHE_DEFAUT, parCategorie: false });
    expect(veilleSeedDefaut({})).toEqual({ seed: NICHE_DEFAUT, parCategorie: false });
  });
});

const PAGE = readFileSync(join(process.cwd(), 'app/(app)/veille/page.tsx'), 'utf8');

describe('la page Veille peuple l’écran par défaut', () => {
  it('sans requête, elle amorce un browse gagnants au lieu de rester vide', () => {
    // On amorce depuis la catégorie de la marque active.
    expect(PAGE).toMatch(/veilleSeedDefaut\(\{ category: brand\?\.category \}\)/);
    // Le browse par défaut trie « plus anciennes » + actives + ancienneté min ·
    // le filtre gagnant, pas un browse au hasard.
    const bloc = PAGE.slice(PAGE.indexOf('} else if (platform === \'meta\')'), PAGE.indexOf('// État sauvegardé'));
    expect(bloc, 'le tri gagnant a disparu du browse par défaut').toMatch(/sortBy: 'longestRunning'/);
    expect(bloc, 'le statut actif a disparu du browse par défaut').toMatch(/status: 'active'/);
    expect(bloc, 'l’ancienneté minimale a disparu du browse par défaut').toMatch(/minDaysRunning: 30/);
  });

  it('si la catégorie ne rend rien, elle se rabat sur le marché large · jamais vide', () => {
    const bloc = PAGE.slice(PAGE.indexOf('} else if (platform === \'meta\')'), PAGE.indexOf('// État sauvegardé'));
    expect(bloc, 'pas de détection d’un résultat vide').toMatch(/ads\.length === 0/);
    expect(bloc, 'pas de repli sur la niche large · la Veille resterait vide').toMatch(/NICHE_DEFAUT/);
  });
});
