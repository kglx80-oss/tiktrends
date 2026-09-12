import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les barres de Jarvis passent par le composant partagé `BarreValeur`
 * (progressbar + filet minimal), plus jamais par un `<div style={{ width: N% }}>`
 * écrit à la main · un petit taux de réussite (2 %) se rendait à ~1 px, invisible.
 *
 * Ces deux écrans ne sont pas rendables en test isolé — la page Jarvis est un
 * composant serveur, MarketPanel un client qui charge son état via une action.
 * On éprouve donc l'ADOPTION par la source (même approche que empty-adoption) ;
 * le RÉSULTAT rendu de BarreValeur est garanti par barre-valeur.test.tsx.
 */

const lit = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

// La largeur d'une barre écrite à la main · un gabarit `…%` sur une propriété
// `width`. Le repère de moyenne (`left: `${…}%``) n'est PAS visé : ce n'est pas
// une barre, c'est une position.
const LARGEUR_MAIN = /width:\s*`[^`]*%[^`]*`/;

const CAS = [
  'app/(app)/jarvis/page.tsx',
  'app/(app)/jarvis/MarketPanel.tsx',
];

describe('les barres de Jarvis ont adopté BarreValeur', () => {
  for (const fichier of CAS) {
    const src = lit(fichier);
    it(`${fichier} · importe et utilise BarreValeur`, () => {
      expect(src).toContain("import { BarreValeur }");
      expect(src).toContain('<BarreValeur');
    });
    it(`${fichier} · ne calcule plus aucune largeur de barre à la main`, () => {
      expect(src, `${fichier} · largeur de barre écrite à la main`).not.toMatch(LARGEUR_MAIN);
    });
  }

  it('la couleur conditionnelle « au-dessus de la moyenne » est préservée sur la barre', () => {
    // Le vert d'un taux au-dessus de la moyenne doit rester porté par la barre
    // (prop couleur de BarreValeur), pas perdu dans la migration.
    const src = lit('app/(app)/jarvis/page.tsx');
    const bloc = src.slice(src.indexOf('<BarreValeur'), src.indexOf('<BarreValeur') + 400);
    expect(bloc).toContain('couleur=');
    expect(bloc).toContain('au_dessus');
  });
});
