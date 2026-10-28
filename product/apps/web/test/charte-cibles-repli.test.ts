import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cibles tactiles mesurées + grilles ordinaires qui se replient.
 *
 * ── Ce que ça corrige ────────────────────────────────────────────────────────
 *
 * Un padding de 8px ne PROUVE pas la taille d'une cible · mesuré à l'écran, un
 * bouton « Voir détails » à 8px de padding tombait à 37px, sous la cible de 40
 * (CIBLE_TACTILE_MIN). On porte les CONTRÔLES PARTAGÉS et les principaux
 * contrôles de contenu à la cible via `minHeight` réel, pas via le padding.
 *
 * Et une liste ORDINAIRE (l'équipe : nom, e-mail, rôle) qui défilait à
 * l'horizontale sur mobile (`minWidth: 480` + `overflowX`) se REPLIE désormais ·
 * le défilement horizontal reste réservé aux vrais tableaux denses.
 *
 * Source-guards (composants clients/serveur tirant le graphe) · on vérifie que
 * la cible est POSÉE, contrôle par contrôle · retirer un `minHeight` fait tomber.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const near = (src: string, ancre: string, fenetre = 260) => {
  const i = src.indexOf(ancre);
  return i < 0 ? '' : src.slice(i, i + fenetre);
};

describe('cibles tactiles · jetons de bouton partagés à la cible', () => {
  const ui = read('components/ui.tsx');
  // `btnGhost` est retiré avec ses derniers appelants (préparation V5 des Studios).
  it('ui.btn porte minHeight CIBLE_TACTILE_MIN', () => {
    expect(ui).toMatch(/import \{[^}]*\bCIBLE_TACTILE_MIN\b[^}]*\} from '@tiktrends\/core'/);
    expect(near(ui, 'export const btn:'), 'ui.btn sous la cible').toContain('minHeight: CIBLE_TACTILE_MIN');
  });
});

// `Empty` et la coquille V5 (`AppShell`, `LogoHome` · rail, recherche, logo) sont retirés · la coquille
// Spatial pose ses cibles par la feuille de la maquette (`spatial-coquille-mobile`).

// Vague 2 · l'écran V5 Équipe est retiré · la liste Spatial (`.team .member`) se replie par la feuille de la maquette.
