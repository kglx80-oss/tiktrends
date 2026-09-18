import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v8 · N06 · le détail d'une créa doit rester lisible en mobile. À 360 px il
 * gardait deux colonnes et réduisait l'image à 52 × 65 px. La règle S23 · média
 * lisible en largeur utile, actions réorganisées sans écraser l'aperçu, défilement
 * accessible. En styles en ligne, cela s'obtient par `flexWrap` + une largeur
 * minimale d'aperçu `min(320px, 100%)` qui force l'empilement quand c'est étroit.
 */
describe('N06 · le détail de créa empile en mobile', () => {
  const studio = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
  // On isole le bloc du dialogue de détail pour ne pas confondre avec d'autres flex.
  const i = studio.indexOf('aria-label={`Détail de la pub');
  const bloc = studio.slice(i, i + 1200);

  it('le dialogue de détail autorise l’empilement (flexWrap)', () => {
    expect(bloc).toMatch(/flexWrap: 'wrap'/);
  });

  it('l’aperçu réclame une largeur utile · min(320px, 100%), plus minWidth 0', () => {
    expect(bloc).toContain("minWidth: 'min(320px, 100%)'");
    expect(bloc, 'l’ancien minWidth: 0 laissait l’image s’écraser').not.toMatch(/flex: 1, minWidth: 0,/);
  });

  it('le dialogue défile en vertical pour garder outils et fermeture atteignables', () => {
    expect(bloc).toMatch(/overflowY: 'auto'/);
  });
});
