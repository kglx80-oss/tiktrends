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

// Vague 3 · la liste des marques est servie par Spatial · la suppression passe par `SupprimerConfirme`.
const BRANDS = readFileSync(join(process.cwd(), 'spatial/vues/marque/ListeMarques.tsx'), 'utf8') + readFileSync(join(process.cwd(), 'app/(spatial)/sp/brands/page.tsx'), 'utf8');
// Vague 2 · la fiche est servie par Spatial · le retrait passe par `SupprimerConfirme` (window.confirm).
const VUES = ['Personas.tsx', 'personas-client.tsx', 'Offre.tsx', 'Identite.tsx'].map((f) => readFileSync(join(process.cwd(), 'spatial/vues/marque', f), 'utf8')).join('\n');
const PAGES = ['personas', 'offre', 'identite'].map((d) => readFileSync(join(process.cwd(), 'app/(spatial)/sp/brands/[id]', d, 'page.tsx'), 'utf8')).join('\n');
const INTERACTIFS = readFileSync(join(process.cwd(), 'spatial/vues/marque/interactifs.tsx'), 'utf8');
// Vague 2 · la bibliothèque est servie par Spatial.
const ASSETS = readFileSync(join(process.cwd(), 'spatial/vues/bibliotheque/Bibliotheque.tsx'), 'utf8');

describe('les suppressions destructives sont confirmées', () => {
  it('la liste des marques confirme la suppression', () => {
    expect(BRANDS).toMatch(/<SupprimerConfirme action=\{p\.supprimer\}[\s\S]*?confirmation=/);
    expect(BRANDS).toContain('supprimer={deleteBrandAction}');
    // Aucun formulaire nu vers l'action de suppression.
    expect(BRANDS, 'un formulaire nu subsiste dans la suppression de marque').not.toMatch(/<form[^>]*action=\{deleteBrandAction\}/);
  });

  it('marque, personas, scénarios et produits confirment leur suppression', () => {
    for (const action of ['deleteBrandAction', 'deletePersonaAction', 'deleteScenarioAction', 'deleteProductAction']) expect(PAGES, `${action} n’est plus passée à l’écran`).toContain(action);
    for (const prop of ['g.supprimer', 'retirerPersona', 'g.retirerScenario', 'p.gestion.retirer']) {
      expect(VUES, `${prop} ne passe pas par SupprimerConfirme`).toMatch(new RegExp(`<SupprimerConfirme action=\\{${prop.replace('.', '\\.')}\\}`));
    }
    // Le bouton confirme AVANT l'envoi · un refus n'envoie rien.
    expect(INTERACTIFS).toMatch(/!window\.confirm\(confirmation\)\) return;[\s\S]{0,200}?await action\(fd\)/);
  });

  it('la suppression d’un asset demande confirmation', () => {
    // Suppression côté client (onClick) · le garde-fou est un window.confirm avant
    // l'appel destructif.
    expect(ASSETS, 'supprimer un asset sans confirmation · perte de données sur un clic')
      .toMatch(/window\.confirm[\s\S]{0,160}?deleteAssetAction/);
  });
});
