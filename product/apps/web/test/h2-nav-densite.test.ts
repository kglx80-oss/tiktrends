import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * H2 · le rail façon Flora · Accueil autonome en tête + densité par pointeur.
 *
 * La densité DÉCIDÉE (32-36 à la souris, 44 au doigt) est vérifiée au RÉSULTAT
 * dans le noyau (`packages/core` · rail-densite.test). Ici on garde le CÂBLAGE
 * dans la coquille, qui dépend du routeur et ne se rend pas en test · même
 * raison que les gardes de source du rail (rail-actif, N08).
 */

const SHELL = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');
const LAYOUT = readFileSync(join(process.cwd(), 'app/(app)/layout.tsx'), 'utf8');
const GLOBALS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

describe('H2 · densité du rail câblée par pointeur', () => {
  it('les rangées tirent leur hauteur du noyau (hauteurRangeeRail), pas d’un 44 figé', () => {
    expect(SHELL, 'la densité n’est pas branchée sur le noyau').toContain('hauteurRangeeRail(tactile)');
    // Le rail expansé passe la densité selon le pointeur (mobile → tactile).
    expect(SHELL, 'la densité n’est pas alimentée par l’état mobile').toContain('tactile={mobile}');
  });
});

describe('H2 · « Accueil » mène en entrée autonome', () => {
  it('le groupe sans libellé (Accueil) ne rend AUCUN en-tête de section', () => {
    // L'en-tête de section n'est rendu que si le groupe a un libellé · l'Accueil
    // autonome (libellé vide) reste une tête seule, sans rubrique au-dessus.
    expect(SHELL).toContain('{grp.group && <div');
  });
});

describe('H2 · la section marque du rail s’appelle « Marque »', () => {
  it('le rail nomme le groupe « Marque » (ex-« TA MARQUE »)', () => {
    expect(LAYOUT, 'le groupe marque n’est pas nommé « Marque »').toContain("group: 'Marque'");
    expect(LAYOUT, 'l’ancien libellé « Ta marque » subsiste').not.toContain("group: 'Ta marque'");
  });
});

describe('H2 · l’anneau de focus du rail n’est pas rogné par le défilement', () => {
  it('les entrées du rail portent un anneau INSET (offset négatif), jamais coupé', () => {
    // La nav coupe l'horizontale (overflowX: hidden) · un anneau EN DEHORS se
    // ferait rogner à droite. Le rail passe l'anneau en inset · entier sur les 4
    // côtés. (Prouvé au rendu par la recette CDP · focus 720.)
    expect(SHELL, 'la nav ne coupe plus l’horizontale (le contexte du fix change)').toContain("overflowX: 'hidden'");
    expect(GLOBALS, 'le rail ne force pas un anneau inset').toMatch(/#nav-rail a:focus-visible[\s\S]*outline-offset: -2px/);
  });

  it('le lien de rail est en BLOC · l’anneau entoure toute la rangée (tête comme feuille)', () => {
    // Une tête de branche, logée dans un conteneur flex, reste sinon `inline` ·
    // son anneau ne se dessinait pas en boîte pleine (Aperçu sans contour). En
    // bloc, le lien épouse la rangée · l'anneau entoure toute l'entrée.
    expect(SHELL, 'le lien de rail n’est pas forcé en bloc').toContain("display: 'block', textDecoration: 'none'");
  });
});
