import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Toute suppression destructive demande confirmation.
 *
 * ── Ce que ça empêche ────────────────────────────────────────────────────────
 *
 * Les suppressions étaient des `<form action={serverAction}>` où un simple clic
 * agissait · supprimer une marque efface EN CASCADE personas, produits et créas.
 * Un misclic = perte de données irréversible, sans garde-fou. `ConfirmButton`
 * insère une confirmation avant la soumission.
 *
 * On garde l'invariant de câblage : chaque form de suppression passe par
 * `ConfirmButton`, aucune n'a de `<button ...>Supprimer/Retirer` nu.
 */

const BRANDS = readFileSync(join(process.cwd(), 'app/(app)/brands/page.tsx'), 'utf8');
const BRAND = readFileSync(join(process.cwd(), 'app/(app)/brands/[id]/page.tsx'), 'utf8');
const ASSETS = readFileSync(join(process.cwd(), 'app/(app)/assets/AssetsLibrary.tsx'), 'utf8');

describe('les suppressions destructives sont confirmées', () => {
  it('la liste des marques confirme la suppression', () => {
    expect(BRANDS).toMatch(/deleteBrandAction[\s\S]*?ConfirmButton/);
    // Plus de bouton de soumission nu dans la form de suppression de marque.
    expect(BRANDS, 'un bouton nu subsiste dans la suppression de marque')
      .not.toMatch(/deleteBrandAction[\s\S]{0,220}?<button[^>]*>Supprimer/);
  });

  it('personas, scénarios et produits confirment leur suppression', () => {
    for (const action of ['deletePersonaAction', 'deleteScenarioAction', 'deleteProductAction']) {
      const re = new RegExp(`${action}[\\s\\S]{0,220}?ConfirmButton`);
      expect(BRAND, `${action} ne passe pas par ConfirmButton`).toMatch(re);
    }
  });

  it('la suppression d’un asset demande confirmation', () => {
    // Suppression côté client (onClick) · le garde-fou est un window.confirm avant
    // l'appel destructif.
    expect(ASSETS, 'supprimer un asset sans confirmation · perte de données sur un clic')
      .toMatch(/window\.confirm[\s\S]{0,160}?deleteAssetAction/);
  });
});
