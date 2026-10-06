import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'écran Analytics n'affiche plus d'emoji d'interface · rollout icônes (retour
 * proprio #2). Le 📊 passe à <Icon chart>.
 */
const SRC = readFileSync(join(process.cwd(), 'components/accueil/VueAnalytics.tsx'), 'utf8');
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Analytics · plus aucun emoji d’interface', () => {
  it('le fichier ne porte aucun pictogramme', () => {
    const trouves = [...new Set(SRC.match(PICTO) ?? [])];
    expect(trouves, `pictogramme(s) encore dans accueil/VueAnalytics.tsx : ${trouves.join(' ')}`).toEqual([]);
  });
  it('rend le vrai logo de l’outil proposé', () => {
    // Lot A (#120) · l'encart « Branche Meta Ads » porte la pastille Meta
    // officielle (garde de rendu · logos-pages-proprietaire-rendu).
    expect(SRC).toMatch(/<BrandTile name="Meta Ads"/);
  });
});
