import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Après génération, le regard défile vers la grille des créas (bas de page). Le
 * message de nuance d'un lot arrivé (partiel, essai rompu) s'affichait EN HAUT
 * près du composeur · il pouvait rester hors du champ de vision au moment où on
 * regarde la grille. On exige qu'il soit rendu PRÈS de la grille (le point
 * d'atterrissage du défilement), pas dans le bloc du composeur.
 *
 * `busy` et `error` restent en haut · la génération et son échec ne défilent
 * pas. Composant client volumineux à actions serveur · non rendable · adoption
 * par la source.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('AdsStudio · la nuance du lot est visible là où on atterrit', () => {
  it('le notice ne vit plus dans le bloc du composeur (busy/error)', () => {
    expect(src, 'le notice est encore rendu dans le bloc haut, hors champ après défilement')
      .not.toContain('busy || notice || error');
  });

  it('le notice est rendu après l’ancre de la grille (le point d’atterrissage)', () => {
    const iGrille = src.indexOf('ref={grille}');
    const iNotice = src.indexOf('{notice &&');
    expect(iGrille, 'ancre de grille introuvable').toBeGreaterThan(-1);
    expect(iNotice, 'le notice n’est plus rendu du tout').toBeGreaterThan(-1);
    expect(iNotice, 'le notice n’est pas rendu près de la grille').toBeGreaterThan(iGrille);
  });
});
