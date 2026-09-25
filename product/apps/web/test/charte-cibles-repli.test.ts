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
  it('ui.btn et ui.btnGhost portent minHeight CIBLE_TACTILE_MIN', () => {
    expect(ui).toContain("CIBLE_TACTILE_MIN } from '@tiktrends/core'");
    expect(near(ui, 'export const btn:'), 'ui.btn sous la cible').toContain('minHeight: CIBLE_TACTILE_MIN');
    expect(near(ui, 'export const btnGhost:'), 'ui.btnGhost sous la cible').toContain('minHeight: CIBLE_TACTILE_MIN');
  });
});

describe('cibles tactiles · contrôles partagés et de contenu', () => {
  const cas: Array<{ f: string; ancre: string }> = [
    { f: 'components/Empty.tsx', ancre: "marginTop: 16, padding: '9px 18px'" },
    { f: 'components/NewBrandButton.tsx', ancre: 'const base =' },
    { f: 'app/(app)/connections/DataConnections.tsx', ancre: 'const tapBase' },
    { f: 'app/(app)/brands/page.tsx', ancre: '>Voir détails<' },
    { f: 'app/(app)/brands/page.tsx', ancre: '>Supprimer<' },
    { f: 'app/(app)/usage/page.tsx', ancre: 'Abonnement &amp; factures' },
  ];
  for (const { f, ancre } of cas) {
    it(`${f} · « ${ancre} » atteint la cible`, () => {
      const src = read(f);
      expect(src, `${f} n'importe pas CIBLE_TACTILE_MIN`).toContain('CIBLE_TACTILE_MIN');
      // La ligne (ou le bloc de style local) qui porte le libellé doit poser la cible.
      const ligne = src.split('\n').find((l) => l.includes(ancre)) ?? near(src, ancre, 320);
      expect(ligne, `${ancre} sous la cible dans ${f}`).toContain('minHeight: CIBLE_TACTILE_MIN');
    });
  }
});

describe('cibles tactiles · chrome partagé (rail, recherche, logo)', () => {
  const shell = read('components/AppShell.tsx');
  it('le bouton « Replier la barre » atteint la cible', () => {
    expect(near(shell, 'const collapseBtn')).toContain('width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN');
  });
  it('la recherche dépliée et le logo d’accueil portent la cible', () => {
    expect(shell).toContain("aria-label=\"Accueil\" style={{ display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN");
    // Le bouton de recherche déplié (pleine largeur) porte la cible en hauteur.
    expect(shell).toContain("marginTop: 8, width: '100%', minHeight: CIBLE_TACTILE_MIN");
  });
});

describe('grilles ordinaires · l’équipe se replie, pas de défilement forcé', () => {
  const team = read('app/(app)/team/page.tsx');
  it('la liste des membres se replie (flexWrap) au lieu d’une grille figée', () => {
    // Plus de colonnes fixes ni de largeur mini qui force le scroll horizontal.
    expect(team, 'la grille figée subsiste').not.toContain("gridTemplateColumns: '1fr 1fr 160px'");
    expect(team, 'la largeur mini force encore le scroll').not.toContain('minWidth: 480');
    expect(team, 'la liste ne se replie pas').toContain("flexWrap: 'wrap'");
  });
});
