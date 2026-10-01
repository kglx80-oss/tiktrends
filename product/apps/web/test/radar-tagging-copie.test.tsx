import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { FEATURES } from '../lib/rbac';
import { routeLabel } from '../lib/navigation';
import Tags from '../app/(app)/tags/page';

/**
 * Recette #106 · deux promesses que l'outil ne tient pas.
 *  · « Radar produits · Les produits qui montent » · /radar note des CRÉAS
 *    (Hook/Hold/CTR/Conv), il ne repère aucun produit → « Radar créatif ».
 *  · Tagging · « Branche un compte pour analyser tes vraies créas » · la page ne
 *    lit qu'un échantillon fixe, aucun compte ne l'alimente.
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
    expect(src('app/(app)/veille/page.tsx')).toContain('<LienSec href="/radar" icon="radar">Radar créatif</LienSec>');
    expect(src('components/AssistantHome.tsx')).toContain("titre: 'Radar créatif', sous: 'Repérer les créas à retravailler'");
  });
  it('plus aucun « Radar produits » ni « produits qui montent » affiché nulle part', () => {
    const fautifs = ['app', 'components', 'lib'].flatMap((d) => fichiers(join(process.cwd(), d)))
      .filter((p) => /['">`]Radar produits|produits qui montent/.test(readFileSync(p, 'utf8')));
    expect(fautifs, 'la promesse « produits » survit').toEqual([]);
  });
});

describe('Tagging · échantillon fixe, aucune promesse de branchement', () => {
  it('le rendu ne propose pas de brancher un compte pour une analyse qui n’existe pas', () => {
    const html = renderToStaticMarkup(<Tags />);
    expect(html, 'promesse de connexion').not.toMatch(/Branche un compte|Brancher un compte/);
    expect(html).not.toContain('href="/connections"');
    expect(html).toContain('échantillon d’exemple');
    expect(html).toContain('pas encore disponible');
  });
});
