import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURES } from '../lib/rbac';
import { routeLabel } from '../lib/navigation';

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
  it('menu, fil d’Ariane, titre, lien Veille et carte Accueil disent « Radar créatif »', () => {
    expect(FEATURES.find((f) => f.key === 'radar')!.label).toBe('Radar créatif');
    expect(routeLabel('/radar')).toBe('Radar créatif');
    const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
    expect(src('app/(app)/radar/page.tsx')).toContain('<h1 style={h1}>Radar créatif</h1>');
    // UX V2 · lot 4a · le lien Veille → Radar est l'ONGLET de section (libellé
    // FEATURES, vérifié ci-dessus) · la page ne porte plus de raccourci doublon.
    expect(src('app/(app)/veille/page.tsx')).not.toContain('href="/radar"');
    expect(src('components/AssistantHome.tsx')).toContain("titre: 'Radar créatif', sous: 'Repérer les créas à retravailler'");
  });
  it('plus aucun « Radar produits » ni « produits qui montent » affiché nulle part', () => {
    const fautifs = ['app', 'components', 'lib'].flatMap((d) => fichiers(join(process.cwd(), d)))
      .filter((p) => /['">`]Radar produits|produits qui montent/.test(readFileSync(p, 'utf8')));
    expect(fautifs, 'la promesse « produits » survit').toEqual([]);
  });
});

// Vague 4 · la garde « Tagging » (aucune promesse de branchement, limite dite)
// est portée sur l'écran Spatial · `spatial-profil-tagging.test.tsx`.
