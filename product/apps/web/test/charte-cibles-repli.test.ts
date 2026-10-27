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
    expect(ui).toMatch(/import \{[^}]*\bCIBLE_TACTILE_MIN\b[^}]*\} from '@tiktrends\/core'/);
    expect(near(ui, 'export const btn:'), 'ui.btn sous la cible').toContain('minHeight: CIBLE_TACTILE_MIN');
    expect(near(ui, 'export const btnGhost:'), 'ui.btnGhost sous la cible').toContain('minHeight: CIBLE_TACTILE_MIN');
  });
});

describe('cibles tactiles · contrôles partagés et de contenu', () => {
  const cas: Array<{ f: string; ancre: string }> = [
    { f: 'components/Empty.tsx', ancre: "marginTop: 16, padding: '9px 18px'" },
    { f: 'components/NewBrandButton.tsx', ancre: 'const base =' },
    { f: 'app/(app)/brands/page.tsx', ancre: '>Voir détails<' },
    { f: 'app/(app)/brands/page.tsx', ancre: '>Supprimer<' },
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
  it('la recherche globale (barre commune) et le logo d’accueil portent la cible', () => {
    // Lot V5 · B · la barre mobile pose le mot-symbole via LogoHome, dont la
    // cible (minHeight + minWidth CIBLE_TACTILE_MIN) est gardée ailleurs.
    expect(shell).toContain('<LogoHome collapsed={false} />');
    expect(read('components/LogoHome.tsx')).toContain('minHeight: CIBLE_TACTILE_MIN, minWidth: CIBLE_TACTILE_MIN');
    // Kevin 29/09 · la recherche globale a quitté le rail pour la barre
    // supérieure commune · son lanceur porte la cible en hauteur.
    const iSearch = shell.indexOf('aria-label="Rechercher"');
    expect(iSearch, 'le lanceur de recherche globale est introuvable').toBeGreaterThan(-1);
    expect(shell.slice(iSearch, iSearch + 400), 'le lanceur de recherche sous la cible').toContain('minHeight: CIBLE_TACTILE_MIN');
  });
});

// Vague 2 · l'écran V5 Équipe est retiré · la liste Spatial (`.team .member`) se replie par la feuille de la maquette.
