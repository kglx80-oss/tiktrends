import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURES } from '../lib/rbac';

/**
 * Recette #106 · deux promesses que l'outil ne tient pas.
 *  · « Radar produits · Les produits qui montent » · /radar note des CRÉAS
 *    (Hook/Hold/CTR/Conv), il ne repère aucun produit → « Radar créatif ».
 *  · Tagging · porté sur l'écran Spatial (vague 4) · `spatial-profil-tagging`.
 */
const fichiers = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? (f === 'node_modules' || f === '.next' ? [] : fichiers(p)) : /\.tsx?$/.test(f) ? [p] : [];
});

describe('Radar créatif · un seul nom, fidèle à ce que fait la page', () => {
  it('menu, titre, lien Veille et carte Accueil disent « Radar créatif »', () => {
    expect(FEATURES.find((f) => f.key === 'radar')!.label).toBe('Radar créatif');
    const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
    // Vague 4 · les pages V5 `/radar` et `/veille` sont retirées · le Radar créatif est la section
    // « Tes créas notées » du Radar Spatial.
    expect(src('spatial/vues/veille/Radar.tsx')).toContain('<h2>Radar créatif · tes créas notées</h2>');
  });
  it('plus aucun « Radar produits » ni « produits qui montent » affiché nulle part', () => {
    const fautifs = ['app', 'components', 'lib'].flatMap((d) => fichiers(join(process.cwd(), d)))
      .filter((p) => /['">`]Radar produits|produits qui montent/.test(readFileSync(p, 'utf8')));
    expect(fautifs, 'la promesse « produits » survit').toEqual([]);
  });
});

// Vague 4 · la garde « Tagging » (aucune promesse de branchement, limite dite)
// est portée sur l'écran Spatial · `spatial-profil-tagging.test.tsx`.
