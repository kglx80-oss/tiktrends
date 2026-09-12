import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le détail d'une créa (l'écran qu'on ouvre juste après une génération, pour
 * relire et itérer) se pilote au doigt · fermer, naviguer entre les créas,
 * changer de ratio. Ces contrôles étaient sous la cible tactile (28 px pour la
 * croix, ~24 px pour le ratio, 38 px pour les flèches).
 *
 * AdsStudio importe des actions serveur · non rendable en test. On éprouve
 * l'ADOPTION par la source, ÉLÉMENT PAR ÉLÉMENT (jamais « au moins un » · les
 * relectures ont relevé ce trou). Le seuil lui-même est prouvé dans le noyau
 * (cible-tactile.test.ts).
 */
const src = readFileSync(
  join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'),
  'utf8',
);

/** La déclaration de style d'un bouton, à partir d'un ancre unique dans son onClick/aria. */
function styleApres(ancre: string): string {
  const i = src.indexOf(ancre);
  expect(i, `ancre introuvable · ${ancre}`).toBeGreaterThan(-1);
  const styleDebut = src.indexOf('style={{', i);
  return src.slice(styleDebut, styleDebut + 320);
}

describe('AdsStudio · cibles tactiles du détail créa', () => {
  it('adopte le seuil du noyau', () => {
    expect(src).toMatch(/CIBLE_TACTILE_MIN\b[^;]*from '@tiktrends\/core'|CIBLE_TACTILE_MIN } from '@tiktrends\/core'/);
    expect(src).toContain('CIBLE_TACTILE_MIN');
  });

  it('plus aucune croix / flèche sous la cible en dur (38 ou 28 px carrés)', () => {
    expect(src).not.toContain('width: 38, height: 38');
    expect(src).not.toContain('width: 28, height: 28');
  });

  it('la croix du détail atteint la cible', () => {
    const style = styleApres('onClick={() => setDetailIdx(null)} aria-label="Fermer"');
    expect(style).toContain('width: CIBLE_TACTILE_MIN');
    expect(style).toContain('height: CIBLE_TACTILE_MIN');
  });

  it('la croix du plein écran atteint la cible', () => {
    const style = styleApres('onClick={() => setPreview(null)} aria-label="Fermer"');
    expect(style).toContain('width: CIBLE_TACTILE_MIN');
    expect(style).toContain('height: CIBLE_TACTILE_MIN');
  });

  it('les flèches de navigation atteignent la cible', () => {
    // navArrow est une fabrique de style (objet), pas un attribut `style={{` JSX ·
    // on lit la déclaration elle-même.
    const i = src.indexOf('const navArrow =');
    expect(i, 'navArrow introuvable').toBeGreaterThan(-1);
    const decl = src.slice(i, i + 320);
    expect(decl).toContain('width: CIBLE_TACTILE_MIN');
    expect(decl).toContain('height: CIBLE_TACTILE_MIN');
  });

  it('chaque pastille de ratio atteint la hauteur de cible', () => {
    const style = styleApres('onClick={() => setRatio(r)}');
    expect(style).toContain(`minHeight: CIBLE_TACTILE_MIN`);
  });
});
