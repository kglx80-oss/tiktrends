import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuthShell } from '../components/AuthShell';

/**
 * Des écrans en SPLIT 2 colonnes ne s'effondraient jamais · connexion/inscription
 * (50/50), onboarding, assistant de marque (barre d'étapes + contenu), lots
 * Adsmap (contenu + rail 320px). Sur téléphone une colonne mangeait l'écran.
 * On empile : AuthShell (composant serveur pur) via l'astuce auto-fit bornée ;
 * les trois autres (clients) basculent en 1 colonne via useIsMobile.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Splits 2 colonnes · ils s’empilent en mobile', () => {
  it('AuthShell (connexion) · la grille s’effondre sans jamais déborder (rendu)', () => {
    const out = renderToStaticMarkup(<AuthShell title="Connexion" subtitle="s">c</AuthShell>);
    expect(out, 'le 50/50 figé subsiste · il ne s’empile pas').not.toContain('minmax(0,1fr) minmax(0,1fr)');
    expect(out, 'la grille n’adopte pas l’astuce auto-fit bornée')
      .toContain('grid-template-columns:repeat(auto-fit, minmax(min(440px, 100%), 1fr))');
  });

  it('Onboarding · le split bascule en 1 colonne en mobile', () => {
    const s = read('app/onboarding/OnboardingWizard.tsx');
    expect(s).toContain("import { useIsMobile }");
    expect(s, 'le split onboarding ne s’empile pas').toContain("mobile ? '1fr' : 'minmax(0,1fr) minmax(0,520px)'");
  });

  it('BrandWizard · les deux dispositions basculent en 1 colonne', () => {
    const s = read('components/BrandWizard.tsx');
    expect(s).toContain("import { useIsMobile }");
    expect(s.split("mobile ? '1fr' : 'minmax(").length - 1, 'les deux grilles doivent s’empiler').toBe(2);
  });

  it('Lots Adsmap · contenu + rail 320px s’empilent', () => {
    const s = read('app/(app)/adsmap/lots/Lots.tsx');
    expect(s).toContain("import { useIsMobile }");
    expect(s, 'le rail 320px ne s’empile pas').toContain("mobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 320px)'");
  });
});
