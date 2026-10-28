import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthShell } from '../components/AuthShell';

/**
 * Des écrans en SPLIT 2 colonnes ne s'effondraient jamais · connexion/inscription
 * (50/50), onboarding, assistant de marque (barre d'étapes + contenu), lots
 * Adsmap (contenu + rail 320px). Sur téléphone une colonne mangeait l'écran.
 * On empile : AuthShell (composant serveur pur) via l'astuce auto-fit bornée ;
 * les trois autres (clients) basculent en 1 colonne via useIsMobile.
 */

describe('Splits 2 colonnes · ils s’empilent en mobile', () => {
  it('AuthShell (connexion) · la grille s’effondre sans jamais déborder (rendu)', () => {
    const out = renderToStaticMarkup(<AuthShell title="Connexion" subtitle="s">c</AuthShell>);
    expect(out, 'le 50/50 figé subsiste · il ne s’empile pas').not.toContain('minmax(0,1fr) minmax(0,1fr)');
    expect(out, 'la grille n’adopte pas l’astuce auto-fit bornée')
      .toContain('grid-template-columns:repeat(auto-fit, minmax(min(440px, 100%), 1fr))');
  });

  // L'accueil V5 (`OnboardingWizard`) est retiré · le parcours Spatial suit la feuille de la maquette.
  // Vague 3 · `BrandWizard` (parcours V5 de création) est retiré avec la liste V5 des marques.
});
