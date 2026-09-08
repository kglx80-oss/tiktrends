import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le cumul des relectures est lu, et affiché.
 *
 * ── Le défaut que ça répare, et que je viens de commettre ────────────────────
 *
 * Les constats de relecture étaient rangés en base, publicité par publicité. La
 * carte montrait le sien, la grille montrait le sien, et personne ne faisait la
 * somme · alors que « quel moteur se trompe le plus » est exactement ce que
 * cette matière peut dire.
 *
 * C'est le même défaut, un cran plus haut, que celui qu'on vient de corriger
 * pour la relecture elle-même : une mesure existe, et rien ne la lit. La
 * différence entre une mesure et une archive tient à ça.
 */

const ACTIONS = readFileSync(join(process.cwd(), 'app/actions/adsmap-attribution.ts'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'app/(app)/jarvis/page.tsx'), 'utf8');

/** Le corps de l'action de cumul · c'est là que la lecture doit vivre. */
const CUMUL = ACTIONS.slice(ACTIONS.indexOf('export async function bilanCopieAction('));

describe('les relectures sont additionnées', () => {
  it('l’action existe et appelle la règle du noyau', () => {
    expect(CUMUL, 'le cumul ne passe plus par le noyau').toMatch(/return \{ bilan: bilanCopie\(relectures\), temoin \}/);
  });

  it('une pub jamais relue n’entre pas dans les taux', () => {
    // La compter comme conforme diluerait les taux avec les lots antérieurs à
    // la relecture · tous les moteurs paraîtraient meilleurs à mesure qu'on
    // remonte le temps.
    expect(CUMUL).toMatch(/if \(!relue\) continue;/);
  });

  it('« pas de référence » ne devient pas « conforme »', () => {
    // C'est le mensonge le plus facile à écrire · `null` veut dire « on n'a pas
    // pu regarder », et les deux ne se comptent pas de la même façon.
    expect(CUMUL).toMatch(/typeof rec\.produitFidele === 'boolean' \? rec\.produitFidele : null/);
  });

  it('ça ne relance aucune génération ni aucun modèle', () => {
    // Le cumul additionne ce qui est déjà payé · un bilan qui coûte se consulte
    // une fois, puis plus jamais.
    expect(CUMUL, 'le cumul appelle un modèle').not.toMatch(/guardedAnthropic|sousPlafond|messages\.create/);
  });
});

describe('le cumul s’affiche', () => {
  it('la page le charge', () => {
    expect(PAGE).toMatch(/bilanCopieAction\(\)/);
  });

  it('et le rend', () => {
    // Écrire l'action sans afficher son résultat referait exactement le défaut
    // qu'elle corrige.
    expect(PAGE, 'le bilan est chargé sans jamais être rendu').toMatch(/\{relectures\.resume\}/);
    expect(PAGE).toMatch(/id="bilan-copie"/);
  });

  it('il dit quoi faire quand il n’y a rien à dire', () => {
    // Un bloc vide laisse croire qu'il est cassé · celui-ci explique d'où
    // viendront les données.
    expect(PAGE).toMatch(/Aucune publicité relue pour l’instant/);
  });

  it('il n’affiche que les dimensions qui tranchent', () => {
    // Les autres diraient « rien à signaler » deux fois, et on apprendrait à ne
    // plus lire le bloc.
    expect(PAGE).toMatch(/relectures\.dimensions\.filter\(\(d\) => d\.conclusif\)/);
  });
});
