import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le menu Crédits porte les gestes les plus SENSIBLES : ouvrir le solde, et
 * ACHETER une recharge (un paiement). Le bouton « Acheter » (~28 px) et la puce
 * d'ouverture (~33 px) se rataient au doigt. On les porte à la cible tactile du
 * noyau · rater un bouton de paiement est le pire endroit où le faire.
 *
 * Le composant tire une action serveur (Stripe) · non rendable en test. On
 * éprouve l'ADOPTION par la source, élément par élément (sous-chaîne unique). Le
 * seuil de 40 px est prouvé par résultat dans le noyau (cible-tactile.test.ts).
 */
const src = readFileSync(join(process.cwd(), 'components/CreditsMenu.tsx'), 'utf8');

describe('Menu Crédits · les gestes sensibles atteignent la cible tactile', () => {
  it('adopte le seuil du noyau', () => {
    expect(src).toMatch(/import \{ CIBLE_TACTILE_MIN \} from '@tiktrends\/core'/);
  });

  it('le bouton Acheter (paiement) porte la hauteur de cible', () => {
    // Sous-chaîne unique au bouton Acheter · sa disparition fait tomber le garde.
    expect(src).toContain("minHeight: CIBLE_TACTILE_MIN, fontSize: 11.5, fontWeight: 800, padding: '5px 14px'");
  });

  it('la puce d’ouverture du menu porte la hauteur de cible', () => {
    expect(src).toContain('gap: 8, minHeight: CIBLE_TACTILE_MIN, padding: collapsed ? 6');
  });
});
