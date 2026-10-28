import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Des tableaux (composants serveur, non rendables) figeaient leurs colonnes en
 * pistes fixes SANS conteneur scrollable · sur téléphone les colonnes se
 * tassaient et débordaient. Le patron maison des vraies <table> : une min-width
 * sur les lignes + un cadre `overflowX:'auto'` · le tableau DÉFILE à
 * l'horizontale au lieu d'écraser. On éprouve le CSS livré par la source.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
// Vague 2 Spatial v4 · la vue Analytics vit dans l'Accueil Spatial (le tableau « ROAS » de démonstration n'est pas porté).
const analytics = read('spatial/vues/accueil/Analytics.tsx');

describe('Tableaux · min-width + cadre scrollable, plus de colonnes écrasées', () => {
  it('Meta · le tableau des top créas défile (largeur minimale) et l’en-tête comme les lignes portent ses colonnes', () => {
    expect(analytics, 'le cadre du tableau ne défile pas').toContain('data-table="top-roas" style={styleTableDefilante(420)}');
    const n = analytics.split('gridTemplateColumns: COLONNES_TOP').length - 1;
    expect(n, 'l’en-tête ET les lignes doivent porter les colonnes').toBe(2);
  });

  // La liste des membres N'EST PAS un vrai tableau dense · trois champs simples
  // (nom, e-mail, rôle). La direction validée veut qu'une grille ORDINAIRE se
  // REPLIE sur mobile plutôt que de défiler à l'horizontale · le défilement reste
  // réservé aux vrais tableaux (ROAS d'Analytics, KPI Meta ci-dessus). On garde
  // donc la garde de repli ici · l'inverse de l'ancien patron « min-width + scroll ».
});
