import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le parcours de création a UN seul chemin.
 *
 * ── L'usine à gaz qu'on interdit de revenir ──────────────────────────────────
 *
 * L'écran de création a porté jusqu'à TROIS surfaces qui pilotaient le même
 * état · un « démarrage rapide » (un mur de réglages en fenêtre), l'assistant
 * (une décision par écran), et le composeur à plat. Le CTA principal ouvrait le
 * pire des trois. Trois blocs d'information s'empilaient avant la moindre pub.
 *
 * Le chemin est désormais unique · le bouton principal ouvre l'assistant, le
 * composeur à plat est le seul repli « avancé », et le démarrage rapide n'existe
 * plus. Le contexte tient sur une ligne. Ces gardes tombent si l'une de ces
 * consolidations est défaite.
 */

const web = process.cwd();
const STUDIO = readFileSync(join(web, 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
const PAGE = readFileSync(join(web, 'app/(app)/studio/ads/page.tsx'), 'utf8');
const CTX = readFileSync(join(web, 'components/ContexteCreation.tsx'), 'utf8');

describe('un seul chemin de création', () => {
  it('le démarrage rapide (surface redondante) a disparu', () => {
    // Il doublait l'assistant avec une UX en mur de réglages · le rouvrir
    // recréerait deux points d'entrée pour le même geste.
    expect(STUDIO, 'quickOpen ne doit plus exister').not.toMatch(/quickOpen/);
    expect(STUDIO, 'quickGenerate ne doit plus exister').not.toMatch(/quickGenerate/);
  });

  it('le CTA principal ouvre l’assistant, une décision par écran', () => {
    expect(STUDIO).toMatch(/✨ Créer des pubs/);
    expect(STUDIO).toMatch(/setAssistant\(true\)/);
  });

  it('le composeur à plat est le repli « avancé », clairement secondaire', () => {
    expect(STUDIO).toMatch(/Réglages avancés/);
  });
});

describe('le contexte tient sur une ligne, il n’interrompt pas', () => {
  it('la page monte la ligne de contexte, plus les blocs empilés', () => {
    expect(PAGE).toMatch(/<ContexteCreation/);
    // Les trois blocs empilés d'avant ne reviennent pas.
    expect(PAGE, 'l’encart PageInfo ne s’empile plus ici').not.toMatch(/<PageInfo/);
    expect(PAGE, 'le panneau catégorie ne revient pas').not.toMatch(/CategorieCreation/);
  });

  it('la ligne informe et lie · elle ne porte AUCUN geste payant', () => {
    // L'enrichissement (le lot market-learn, payant) est un geste d'analyse ·
    // il vit sur la Veille / Jarvis, jamais sur le chemin de création.
    expect(CTX).toMatch(/marketCoverageAction/);
    expect(CTX, 'aucun enrichissement payant sur le chemin de création').not.toMatch(/learnFromFollowedAction/);
  });

  it('coût léger · seul le COMPTE se lit au montage, pas la grammaire', () => {
    expect(CTX, 'la grammaire lourde n’est pas lue au montage').not.toMatch(/grammaireCategorieAction/);
  });
});
