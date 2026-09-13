import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le verdict le plus fréquent d'un test n'est pas une gagnante. Pour une
 * perdante / non concluante / sous-diffusée, le panneau d'arbitrage disait
 * « Reprends l'angle dans le Studio » SANS y mener · la boucle analyser→créer
 * s'arrêtait sur une phrase. On exige désormais un vrai lien vers /studio/ads
 * dans cette branche, l'angle du test passé en amorce.
 *
 * AdDrawer est un client qui charge son détail via une action serveur (effet) ·
 * `renderToStaticMarkup` n'exécute pas l'effet, donc la branche « perdante » ne
 * se rend pas seule. Adoption par la source, bornée à la branche `!gagnante`.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/adsmap/AdDrawer.tsx'), 'utf8');
const iStart = src.indexOf('{!gagnante ? (');
const iEnd = src.indexOf(') : !ouvrirIteration ? (', iStart);
const branche = src.slice(iStart, iEnd > iStart ? iEnd : undefined);

describe('AdDrawer · une perdante mène au Studio, pas à une impasse', () => {
  it('la branche « perdante » a bien été trouvée', () => {
    expect(iStart, 'branche !gagnante introuvable').toBeGreaterThan(-1);
    expect(iEnd, 'fin de la branche !gagnante introuvable').toBeGreaterThan(iStart);
  });

  it('un vrai lien vers /studio/ads, avec l’angle en amorce', () => {
    expect(branche, 'la sortie vers le Studio manque · la boucle s’arrête sur une phrase')
      .toContain('/studio/ads?angle=');
    // L'angle du test passé en amorce · pas un lien nu vers le studio vide.
    expect(branche, 'l’angle du test n’est pas transmis au Studio')
      .toContain('encodeURIComponent(d.angle');
  });
});
