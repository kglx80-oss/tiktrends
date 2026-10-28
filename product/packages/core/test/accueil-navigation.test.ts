import { describe, expect, it } from 'vitest';
import { cheminOuvert, bandeauAccueil, BANDEAU_LECTURE } from '../src/accueil-acces';
import { RUBRIQUE_ANALYTICS, lireVueAccueil } from '../src/accueil-vue';

/**
 * Lot 19A · le Pilotage regroupé sous l'Accueil · règles pures de navigation.
 * « Analytics » est une sous-entrée de l'Accueil, `/dashboard?vue=analytics` ·
 * même chemin que l'Accueil, la recherche choisit l'écran.
 */

describe('droits · la rubrique Analytics porte une requête', () => {
  const regles = (analytics: boolean) => [{ href: '/dashboard', ouvert: true }, { href: RUBRIQUE_ANALYTICS, ouvert: analytics }, { href: '/adsmap', ouvert: false }];
  it('la vue suit SA rubrique, l’Accueil la sienne', () => {
    expect(cheminOuvert('/dashboard?vue=analytics', regles(false))).toBe(false);
    expect(cheminOuvert('/dashboard?vue=analytics&periode=7j', regles(false))).toBe(false);
    expect(cheminOuvert('/dashboard', regles(false))).toBe(true);
    expect(cheminOuvert('/dashboard?vue=analytics', regles(true))).toBe(true);
  });
  it('l’ancienne route /analytics se lit comme la vue (droits compris)', () => {
    expect(cheminOuvert('/analytics', regles(false))).toBe(false);
    expect(cheminOuvert('/analytics?x=1', regles(true))).toBe(true);
  });
  it('les règles sans requête n’ont pas bougé', () => {
    expect(cheminOuvert('/adsmap/suites', regles(true))).toBe(false);
    expect(cheminOuvert('/support', regles(true))).toBe(true);
  });
  it('le bandeau de lecture suit le droit Analytics, via son lien historique', () => {
    const ouvert = (r: boolean) => (h: string) => cheminOuvert(h, [...regles(r), { href: '/studio/projets', ouvert: false }, { href: '/brands', ouvert: false }, { href: '/veille', ouvert: false }]);
    expect(bandeauAccueil({ aMarque: true, nbMarques: 1, ouvert: ouvert(true) })).toEqual(BANDEAU_LECTURE);
    expect(bandeauAccueil({ aMarque: true, nbMarques: 1, ouvert: ouvert(false) })).toBeNull();
  });
});

describe('la vue se lit aussi depuis une recherche brute (coquille, fil)', () => {
  it('chaîne ou objet, même verdict', () => {
    expect(lireVueAccueil('?vue=analytics')).toBe('analytics');
    expect(lireVueAccueil('vue=analytics&vue=accueil')).toBe('analytics');
    expect(lireVueAccueil('?vue=x&vue=analytics')).toBe('accueil');
    expect(lireVueAccueil('')).toBe('accueil');
  });
});
