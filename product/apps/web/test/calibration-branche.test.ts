import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le Score Jarvis est confronté au marché · la calibration est câblée et affichée.
 *
 * La règle pure (médiane, plancher par moitié, Wilson) est éprouvée côté noyau.
 * Ici on vérifie le CÂBLAGE : l'action relie le score (pronostic) au verdict
 * (résultat) via le lien forward, passe par le noyau, et la page Jarvis rend le
 * résultat. `bilanNotes` reste, lui, SANS verdicts (avis ≠ résultat) · on
 * vérifie donc que la confrontation vit dans SA propre action, pas dans le cumul.
 */
const ACTIONS = readFileSync(join(process.cwd(), 'app/actions/adsmap-attribution.ts'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'app/(app)/jarvis/page.tsx'), 'utf8');

describe('la calibration du score est câblée', () => {
  it('une action dédiée relie score et verdict et passe par le noyau', () => {
    expect(ACTIONS).toMatch(/export async function calibrationScoreAction\(/);
    expect(ACTIONS, 'la calibration ne passe plus par le noyau').toMatch(/calibrationScore\(paires\)/);
    // Le lien forward (le même que la carte) · score porté par la génération,
    // verdict par l'ad rattachée.
    expect(ACTIONS).toMatch(/jarvisScore\?\.score/);
    expect(ACTIONS).toMatch(/schema\.verdicts/);
  });

  it('le cumul des notes reste SANS verdict · la confrontation est ailleurs', () => {
    const bloc = ACTIONS.slice(ACTIONS.indexOf('function bilanNotesAction'), ACTIONS.indexOf('function calibrationScoreAction'));
    expect(bloc, 'bilanNotesAction ne doit pas lire les verdicts').not.toMatch(/schema\.verdicts/);
  });

  it('la page Jarvis rend la calibration sous sa condition d’affichage', () => {
    expect(PAGE).toMatch(/calibrationScoreAction\(\)/);
    // La porte de rendu · muette tant que la calibration ne tranche pas.
    expect(PAGE, 'la calibration n’est plus rendue sous sa condition').toMatch(/calib && calib\.predictif !== null/);
  });
});
