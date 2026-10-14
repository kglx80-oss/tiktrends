import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Menu compact pour portable 14 pouces (capture Kevin · le rail 184 px tassait
 * l'identité sous le bouton Réduire, l'espace se rognait en « Ag… », et le groupe
 * « Observer » démarrait trop bas). La coquille tire le graphe serveur · elle
 * n'est pas rendable en test. On cloue donc les RÉSULTATS de source qui, mesurés
 * à l'écran (Playwright · 1280×800, 1440×900, zoom 125, h720, replié, tiroir
 * mobile), tiennent : identité compacte, sélecteur d'espace DISTINCT, bascule
 * Réduire/Développer AU PIED, et cibles de nav à 44 px. Chaque assertion tombe
 * si on remet le défaut · la mutation est notée en regard.
 */
const SRC = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');

describe('menu compact · en-tête du rail', () => {
  // Lot V5 · B (R01) · l'identité devient le mot-symbole V5 « tiktrends. »
  // (LogoHome, le nom du produit), toujours un lien d'accueil compact · le carré
  // dégradé disparaît.
  it('l’identité est un mot-symbole COMPACT, pas un sélecteur ni un gros carré', () => {
    // Mutation : refusionner l'identité dans un sélecteur (retirer LogoHome de
    // la tête du rail) fait tomber la première.
    const tete = SRC.slice(SRC.indexOf('data-zone="tete-rail"'), SRC.indexOf('data-zone="espace-rail"'));
    expect(tete, 'le mot-symbole a disparu de la tête du rail').toContain('<LogoHome collapsed={false} />');
    const logo = readFileSync(join(process.cwd(), 'components/LogoHome.tsx'), 'utf8');
    expect(logo, 'le symbole reste un gros carré 30 px').not.toContain('width: 30, height: 30');
    expect(logo, 'le mot-symbole V5 manque').toContain("'tiktrends'");
  });

  // Lot V5 · B (R06) · l'espace se lit en clair (libellé complet en infobulle),
  // DISTINCT de la marque, qui garde son sélecteur réel · les entrées de l'ancien
  // menu d'espace sont dans la pop-up profil (gardé dans uxv5-coquille-rendu).
  it('l’ESPACE est distinct de la marque · sa propre ligne, libellé complet en infobulle', () => {
    expect(SRC).toContain('title={`Espace · ${workspaceName}`}');
    const espace = SRC.slice(SRC.indexOf('data-zone="espace-rail"'), SRC.indexOf('<nav aria-label="Navigation principale"'));
    expect(espace, 'le sélecteur de marque n’est plus distinct, sous l’espace').toContain('<BrandSwitcher');
  });

  it('la bascule Réduire vit en TÊTE, à côté de l’identité-accueil · plus au pied', () => {
    // Kevin, 29/09 · l'ancien bouton de PIED « Réduire le menu » éloignait la
    // commande du logo · elle redevient une petite icône EN TÊTE, à côté de
    // l'identité, qui elle-même ramène à l'accueil.
    //
    // Mutation 1 : rendre l'identité muette (retirer le lien /dashboard de
    // l'en-tête) fait tomber la 1re. Mutation 2 : remettre le bouton de pied
    // « Réduire le menu » fait tomber les deux dernières.
    // Lot V5 · B · l'identité est LogoHome (lien /dashboard « Accueil », gardé
    // par logo-accueil) · on lit la tête du rail, qui doit le poser.
    const iLink = SRC.indexOf('data-zone="tete-rail"');
    expect(iLink, 'la tête du rail est introuvable').toBeGreaterThan(-1);
    const enTete = SRC.slice(iLink, iLink + 900);
    expect(enTete, 'l’identité-accueil n’est pas en tête').toContain('<LogoHome collapsed={false} />');
    // La bascule Réduire est là, en tête, juste à côté de l'identité.
    expect(enTete, 'la bascule Réduire n’est pas en tête').toContain('aria-label="Réduire la barre"');
    // L'ancien bouton de PIED a disparu.
    expect(SRC, 'le bouton de pied « Réduire le menu » subsiste').not.toContain('Réduire le menu');
    expect(SRC, 'le libellé à deux états du bouton de pied subsiste').not.toContain("collapsed ? 'Développer la barre' : 'Réduire la barre'");
  });
});

describe('menu compact · cibles et discrétion', () => {
  it('les rangées de nav tirent leur hauteur du noyau · 44 au doigt (H2 · densité par pointeur)', () => {
    // La rangée ne pose plus un 44 figé · elle prend la hauteur DÉCIDÉE par le
    // noyau selon le pointeur (44 au doigt, dense à la souris · voir
    // packages/core · rail-densite). Le doigt reste à 44, garanti par le noyau.
    // Mutation : remettre `minHeight: CIBLE_TACTILE_MIN` figé (sans densité) fait
    // tomber cette paire ; retirer le branchement `hauteurRangeeRail(tactile)`
    // aussi.
    const i = SRC.indexOf('const hRangee = hauteurRangeeRail(tactile);');
    expect(i, 'la rangée ne tire pas sa hauteur du noyau').toBeGreaterThan(-1);
    expect(SRC, 'la rangée ne pose pas la hauteur décidée').toContain('minHeight: hRangee');
  });

  it('le groupe « Observer » (et ses voisins) reste discret · 11 px', () => {
    // Le libellé de groupe est en 11 px (charte : 11–12), pas ré-agrandi.
    expect(SRC).toContain("fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase'");
  });
});

/**
 * Kevin, 29/09 · la recherche GLOBALE sort du rail vers une barre supérieure
 * COMMUNE (loupe/commande + ⌘/Ctrl K conservé), et le logo ramène à l'accueil
 * dans TOUS les états · en replié, l'expansion est une icône séparée.
 */
describe('shell · recherche globale hors rail + logo accueil tous états', () => {
  // Le corps du rail, entre l'ouverture de l'<aside> et sa fermeture.
  const aside = SRC.slice(SRC.indexOf('<aside'), SRC.indexOf('</aside>'));

  it('la recherche globale a QUITTÉ le rail · plus d’ouverture de palette dans l’aside', () => {
    // Mutation : remettre un lanceur de recherche (openCommandPalette) dans le
    // rail fait tomber cette assertion.
    expect(aside, 'la recherche est restée dans le rail').not.toContain('openCommandPalette');
  });

  it('la recherche globale vit dans la barre commune · lanceur + raccourci ⌘/Ctrl K', () => {
    expect(SRC, 'aucun lanceur de recherche').toContain('aria-label="Rechercher"');
    expect(SRC, 'le raccourci clavier n’est plus annoncé').toContain('aria-keyshortcuts="Meta+K Control+K"');
    expect(SRC, 'le lanceur n’ouvre pas la palette').toContain('openCommandPalette');
  });

  it('replié · logo = lien accueil + icône d’expansion SÉPARÉE (deux cibles distinctes)', () => {
    // Mutation : retirer le bouton « Développer la barre » (refusionner les deux
    // gestes sur le logo) fait tomber la seconde.
    expect(SRC, 'le logo replié n’est pas le lien accueil dédié').toContain('<LogoHome collapsed />');
    expect(SRC, 'l’icône d’expansion séparée manque en replié').toContain('aria-label="Développer la barre"');
  });
});
