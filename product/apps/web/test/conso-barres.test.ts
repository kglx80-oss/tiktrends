import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les barres de consommation de crédits (page Consommation · répartition par type
 * d'action ; page Crédits · consommé ce cycle) étaient des `<div style={{ width:
 * N% }}>` nus · muets pour l'assistive, et menteurs sur les petites parts (une
 * famille d'action minuscule se rendait à ~1 px). On les passe sur BarreValeur
 * (progressbar + aria + filet minimal) et partDeMax (part bornée, sûre).
 *
 * Ces pages sont des composants serveur · non rendables en test. Adoption par la
 * source, par élément. Le RÉSULTAT de BarreValeur est prouvé par barre-valeur.test.tsx.
 */
const lit = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const usage = lit('app/(app)/usage/page.tsx');
const credits = lit('app/(app)/credits/page.tsx');

// Une largeur de barre écrite à la main · un gabarit `…%` sur `width`.
const LARGEUR_MAIN = /width:\s*`[^`]*%[^`]*`/;

describe('Consommation · la répartition par type d’action passe par BarreValeur', () => {
  it('importe et utilise BarreValeur + partDeMax', () => {
    expect(usage).toContain("import { BarreValeur }");
    expect(usage).toMatch(/import \{ partDeMax \} from '@tiktrends\/core'/);
    expect(usage).toContain('<BarreValeur part={partDeMax(total, maxFamily)}');
  });
  it('ne calcule plus aucune largeur de barre à la main', () => {
    expect(usage, 'largeur de barre écrite à la main').not.toMatch(LARGEUR_MAIN);
  });
});

describe('Crédits · la barre « consommé ce cycle » passe par BarreValeur', () => {
  it('importe et utilise BarreValeur + partDeMax', () => {
    expect(credits).toContain("import { BarreValeur }");
    expect(credits).toContain('partDeMax');
    expect(credits).toContain('<BarreValeur part={partDeMax(usedPct, 100)}');
  });
  it('ne calcule plus aucune largeur de barre à la main', () => {
    expect(credits, 'largeur de barre écrite à la main').not.toMatch(LARGEUR_MAIN);
  });
});
