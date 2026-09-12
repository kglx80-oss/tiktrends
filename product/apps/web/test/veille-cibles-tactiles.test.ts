import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La Veille est l'écran le plus cliqué du parcours de découverte · champ de
 * recherche, filtres, chips, pagination. Ses contrôles primaires se rataient au
 * doigt (recherche ~39 px, filtres ~32 px, pagination ~34 px). On les porte à la
 * cible tactile du noyau.
 *
 * La page tire des actions serveur (recherche) · non rendable en test. On éprouve
 * l'ADOPTION par la source, contrôle par contrôle. Le seuil de 40 px est prouvé
 * par résultat dans le noyau (cible-tactile.test.ts). Les chips thématiques
 * restent hors périmètre · secondaires et nombreuses, comme des étiquettes.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/veille/page.tsx'), 'utf8');

function decl(nom: string): string {
  const i = src.indexOf(`const ${nom} =`);
  expect(i, `déclaration ${nom} introuvable`).toBeGreaterThan(-1);
  // On coupe à la fin de CETTE déclaration · sinon la fenêtre déborde sur la
  // suivante, qui porte aussi la cible, et le garde ne prouverait plus rien.
  const fin = src.indexOf('as const;', i);
  expect(fin, `fin de ${nom} introuvable`).toBeGreaterThan(-1);
  return src.slice(i, fin);
}

describe('Veille · les contrôles primaires atteignent la cible tactile', () => {
  it('adopte le seuil du noyau', () => {
    expect(src).toMatch(/import \{ CIBLE_TACTILE_MIN \} from '@tiktrends\/core'/);
  });

  it('le champ de recherche et les filtres <Select> partagent la cible (inputBase)', () => {
    // Le <Select> spread `...inputBase` · corriger inputBase couvre les deux.
    expect(decl('inputBase')).toContain('minHeight: CIBLE_TACTILE_MIN');
  });

  it('le bouton Rechercher porte la hauteur de cible', () => {
    expect(decl('searchBtn')).toContain('minHeight: CIBLE_TACTILE_MIN');
  });

  it('les boutons de pagination portent la hauteur de cible', () => {
    expect(decl('pageBtn')).toContain('minHeight: CIBLE_TACTILE_MIN');
  });
});
