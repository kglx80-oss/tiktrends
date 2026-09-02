import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La scène et la recette parlent de la même coquille.
 *
 * ── L'invariant ──────────────────────────────────────────────────────────────
 *
 * Une créa passe par deux étapes qui doivent s'accorder :
 *
 * 1. la **scène** est demandée au modèle avec une consigne de cadrage — « seule
 *    la moitié haute sera visible », « l'image sera recadrée en carte » ;
 * 2. la **recette** est composée dans une coquille, qui applique ce recadrage.
 *
 * Si les deux ne désignent pas la même coquille, on paie une image cadrée pour
 * une page qu'elle n'occupe pas · le sujet se retrouve dans la moitié coupée, et
 * la créa est perdue sans que rien ne le signale.
 *
 * ── Pourquoi ce test regarde la source ───────────────────────────────────────
 *
 * `composeBatch` n'est pas exportée, et l'exercer demanderait une base et le
 * fournisseur d'images. Ce qui est vérifiable sans les deux, c'est la propriété
 * de structure qui rend l'accord impossible à rater : **une seule expression
 * calcule la coquille**, tout le reste la lit.
 *
 * Un second appel à `layoutFor` dans ce fichier serait une seconde source de
 * vérité · le test échoue pour qu'on y réfléchisse plutôt que pour interdire.
 */

const FICHIER = 'app/actions/ads.ts';

describe('une seule source décide de la coquille', () => {
  const src = readFileSync(join(process.cwd(), FICHIER), 'utf8');

  it('la coquille n’est calculée qu’à un seul endroit', () => {
    const appels = src.match(/layoutFor\(/g) ?? [];
    expect(
      appels.length,
      'Deux calculs de coquille finiraient par diverger · la scène serait cadrée '
      + 'pour une page, la recette composée dans une autre. Passe par `coquille(c, i)`.',
    ).toBe(1);
  });

  it('la scène ET la recette la lisent toutes les deux', () => {
    // Si la recette la lit mais pas la scène, on retombe sur le défaut d'avant :
    // un cadrage écrit pour l'immersive, appliqué à quatre coquilles.
    expect(src, 'la recette ne consigne pas la coquille').toMatch(/layout:\s*coquille\(/);
    expect((src.match(/scenePrompt\w*\([^;]*coquille\(/g) ?? []).length,
      'au moins un prompt de scène ignore la coquille').toBeGreaterThanOrEqual(3);
  });
});
