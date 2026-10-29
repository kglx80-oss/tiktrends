import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BORDURES } from '@tiktrends/core';

/**
 * B2 (#118) · TOUS les écrans de l'application posent le même cadre extérieur.
 *
 * Mesuré avant B2 (build de production, 1440) · neuf largeurs de cadre et le
 * titre de page de x=60 à x=234. Le cadre vit dans `cadrePage` (valeurs au
 * noyau) · ce garde parcourt chaque `page.tsx` et refuse une largeur extérieure
 * posée à la main, ou une lecture resserrée hors de la liste nommée au noyau.
 * La mesure en navigateur (recette B2) prouve le rendu ; ce garde empêche la
 * dérive de revenir.
 *
 * Retrait de la coquille V5 · le parcours des pages de `app/(app)` disparaît
 * avec le groupe (mesuré : 5 pages au départ de ce retrait, toutes des filets
 * de redirection sans <main>, déplacés hors coquille sous `app/studio`). Les
 * écrans Spatial posent le cadre de la maquette (`spatial.css`), gardé par
 * `spatial-fondation`. Le cadre partagé de `components/ui` (`cadrePage`,
 * `colonneLecture`, `pageWrap`) n'avait plus aucun appelant · retiré avec son
 * rendu. Restent ici les jetons de bordure.
 */
describe('B2 · les bordures de la charte · jetons', () => {
  const css = readFileSync(join(process.cwd(), '..', '..', 'packages', 'ui', 'tokens.css'), 'utf8');
  const alpha = (nom: string) => Number(new RegExp(`--${nom}:\\s*rgba\\(255,255,255,([0-9.]+)\\)`).exec(css)?.[1]);
  it('--line = cadre 12 %, --line-2 = contrôle 20 %', () => {
    expect(alpha('line')).toBe(BORDURES.cadre);
    expect(alpha('line-2')).toBe(BORDURES.controle);
  });
});
