import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La grille « Tes pubs » rognait les créas · elle forçait un cadre `4:5` en
 * `object-fit: cover`. Or seules les pubs COMPOSÉE sont en 4:5 (1080×1350) ·
 * une ENTIÈRE sort du modèle en 3:4 (GPT Image 2) ou 2:3 (GPT Image 1), plus
 * haute · le cadre 4:5 lui coupait le haut et le bas, alors que le plein écran
 * (`contain`) la montre entière. La vignette doit suivre le ratio réel.
 *
 * Composant client volumineux à actions serveur · non rendable · garde par
 * adoption de la source · la valeur du style EST le résultat · une vignette dont
 * le style porte `objectFit: 'cover'` sur un cadre fixe rogne, quel que soit le
 * rendu.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('AdsStudio · la grille ne rogne plus les pubs', () => {
  it('la vignette de la grille suit le ratio réel (height auto, pas de cover)', () => {
    const i = src.indexOf('src={vignette(a.url)}');
    expect(i, 'vignette de la grille introuvable').toBeGreaterThan(-1);
    const ligne = src.slice(i, i + 220);
    expect(ligne, 'la vignette doit se dimensionner à son ratio réel').toContain("height: 'auto'");
    expect(ligne, 'un cadre en cover rogne la pub').not.toContain("objectFit: 'cover'");
    expect(ligne, 'un cadre fixe 4:5 rogne les entières (3:4 / 2:3)').not.toContain("aspectRatio: '4/5'");
  });
});
