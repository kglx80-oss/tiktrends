import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le STYLE que l'agent déduit du site doit se VOIR en mots · sinon c'est une
 * boîte noire : l'utilisateur dépense, ça contraint la génération, mais il ne
 * peut ni vérifier ni corriger ce que l'agent a compris. On rend le composant
 * et on lit le HTML · un champ oublié ou un rendu vide se verrait ici.
 *
 * On ne teste PAS la présence d'un appel · on lit ce qui s'affiche.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
// Les actions serveur tirent tout le graphe serveur (auth, db, ai) · hors sujet
// pour un test de RENDU. On les remplace par des stubs · on lit ce qui s'affiche.
vi.mock('../app/actions/brand-detail', () => ({
  importBrandDAAction: async () => ({}),
  saveBrandDAAction: async () => ({}),
  extractBrandVisualDaAction: async () => {},
  saveBrandVisualDaAction: async () => {},
}));

import { BrandDA } from '../app/(app)/brands/[id]/BrandDA';

const da = {
  style: 'éditorial minimaliste, beaucoup de blanc',
  photo: 'macro produit sur fond crème',
  ambiance: 'premium et rassurant',
  lumiere: 'lumière naturelle douce',
  couleurs: 'tons crème et vert sauge',
  aEviter: ['rendu stock', 'dégradés criards'],
};

function html(over: { daVisuelle?: typeof da | null } = {}): string {
  return renderToStaticMarkup(
    <BrandDA brandId="b1" logoUrl={null} logos={[]} colors={[]} fonts={[]} daVisuelle={da} {...over} />,
  );
}

describe('Le style déduit du site se voit et se corrige', () => {
  it('rend chaque facette du style déduit, en mots', () => {
    const out = html();
    expect(out, 'l’en-tête du style déduit manque').toContain('Style déduit du site');
    for (const bout of [da.style, da.photo, da.ambiance, da.lumiere, da.couleurs]) {
      expect(out, `facette absente du rendu : ${bout}`).toContain(bout);
    }
    expect(out, 'les éléments « à éviter » ne sont pas rendus').toContain('rendu stock');
    expect(out, 'les éléments « à éviter » ne sont pas rendus').toContain('dégradés criards');
  });

  it('une DA vide n’affiche aucun bloc de style (rien à montrer)', () => {
    const out = html({ daVisuelle: null });
    expect(out, 'un bloc de style s’affiche alors qu’il n’y a rien').not.toContain('Style déduit du site');
  });

  it('la correction du style ne dépense pas · action gardée, écrit brandKit', () => {
    const src = readFileSync(join(process.cwd(), 'app/actions/brand-detail.ts'), 'utf8');
    const i = src.indexOf('export async function saveBrandVisualDaAction');
    expect(i, 'l’action de correction du style est introuvable').toBeGreaterThan(-1);
    const j = src.indexOf('\nexport ', i + 10);
    const fn = src.slice(i, j > i ? j : i + 900);
    expect(fn, 'la marque n’est pas gardée (guardBrand)').toContain('guardBrand(brandId)');
    expect(fn, 'la correction n’écrit pas dans brandKit').toContain('brandKit: da');
    // Levier GRATUIT · aucune dépense ne doit se glisser dans cette action.
    expect(fn, 'la correction ne doit pas réserver de crédits').not.toContain('reserveCredits(');
    expect(fn, 'la correction ne doit pas appeler l’IA').not.toContain('guardedAnthropic(');
  });

  it('une DA malformée (aEviter en chaîne) ne fait PAS tomber le rendu', () => {
    // C'est la forme qui crashait la page marque côté client après l'analyse ·
    // renderToStaticMarkup lève si le composant lève. On rend, on ne casse pas.
    const casse = { style: 'net et lumineux', aEviter: 'surcharge, stock' } as unknown as typeof da;
    let out = '';
    expect(() => { out = html({ daVisuelle: casse }); }, 'le rendu a levé sur une DA malformée').not.toThrow();
    expect(out, 'le style tient malgré la DA malformée').toContain('net et lumineux');
  });

  it('l’écran de marque passe la DA visuelle au composant', () => {
    const page = readFileSync(join(process.cwd(), 'app/(app)/brands/[id]/page.tsx'), 'utf8');
    expect(page, 'brandKit n’est pas transmis à BrandDA').toMatch(/<BrandDA[^>]*daVisuelle=\{[^}]*brandKit/);
  });
});
