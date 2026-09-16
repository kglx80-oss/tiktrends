import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S21 · la barre de coût du studio doit annoncer le prix RÉELLEMENT prélevé.
 *
 * Le défaut · la barre affichait `modelSpec.credits * count` quel que soit
 * l'essai, alors qu'un essai d'accroches ou de mises en page ne produit qu'UNE
 * image (le serveur réserve `prixEssai`). Elle sur-annonçait donc le prix, et
 * contredisait le pavé d'essai juste au-dessus (« une seule image produite »).
 *
 * Le noyau prouve la RÈGLE par résultat (`creditsAnnoncesLot` == `prixEssai`
 * pour tout essai). Ici on vérifie le CÂBLAGE : la barre passe par cette
 * fonction, elle ne recalcule plus le plein tarif à la main.
 *
 * Composant client volumineux à actions serveur · non rendable · garde par
 * adoption de la source, comme les autres gardes d'AdsStudio.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('AdsStudio · la barre de coût suit le débit réel de l’essai', () => {
  it('le champ credits de la barre passe par creditsAnnoncesLot', () => {
    const iCost = src.indexOf('cost={{');
    expect(iCost, 'bloc cost de la barre introuvable').toBeGreaterThan(-1);
    const bloc = src.slice(iCost, iCost + 400);
    expect(bloc, 'la barre doit annoncer creditsAnnoncesLot(essai, …), pas un tarif recalculé')
      .toContain('credits: creditsAnnoncesLot(essai || null, count, modelSpec.credits)');
    expect(bloc, 'la barre ne doit plus afficher le plein tarif d’un lot en dur')
      .not.toContain('credits: modelSpec.credits * count');
  });
});
