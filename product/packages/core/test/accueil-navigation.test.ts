import { describe, expect, it } from 'vitest';
import { railEntreeActive } from '../src/rail-marque';
import { cheminOuvert, bandeauAccueil, BANDEAU_LECTURE } from '../src/accueil-acces';
import { RUBRIQUE_ANALYTICS, lireVueAccueil } from '../src/accueil-vue';

/**
 * Lot 19A · le Pilotage regroupé sous l'Accueil · règles pures de navigation.
 * « Analytics » est une sous-entrée de l'Accueil, `/dashboard?vue=analytics` ·
 * même chemin que l'Accueil, la recherche choisit l'écran.
 */

const ENTREES = ['/dashboard', '/dashboard?vue=analytics', '/veille', '/adsmap', '/brands/b1', '/brands/b1?tab=audience'];
const ctx = (pathname: string, recherche = '', tab = 'overview') => ({ pathname, tab, hash: '', ancres: new Set<string>(), recherche, entrees: ENTREES });
const allumees = (pathname: string, recherche = '', tab = 'overview') => ENTREES.filter((h) => railEntreeActive(h, ctx(pathname, recherche, tab)));

describe('rail · une seule entrée allumée, la vue départage', () => {
  it('Accueil par défaut · « Accueil » seul', () => {
    expect(allumees('/dashboard')).toEqual(['/dashboard']);
  });
  it('vue Analytics · « Analytics » seul, l’Accueil cède la sélection', () => {
    expect(allumees('/dashboard', '?vue=analytics')).toEqual(['/dashboard?vue=analytics']);
    expect(allumees('/dashboard', 'vue=analytics&periode=7j')).toEqual(['/dashboard?vue=analytics']);
  });
  it('une vue inconnue reste l’Accueil', () => {
    expect(allumees('/dashboard', '?vue=pilotage')).toEqual(['/dashboard']);
  });
  it('ailleurs, rien ne change · une recherche sans sœur déclarée ne retire pas la sélection', () => {
    expect(allumees('/adsmap', '?vue=table')).toEqual(['/adsmap']);
    expect(allumees('/veille', '?q=routine')).toEqual(['/veille']);
  });
  it('les onglets `?tab=` gardent leur règle d’avant (la tête nue n’est pas retirée par un onglet)', () => {
    expect(allumees('/brands/b1', '?tab=audience', 'audience')).toEqual(['/brands/b1', '/brands/b1?tab=audience']);
  });
  it('sans recherche ni entrées fournies (appelants d’avant), le comportement d’avant tient', () => {
    expect(railEntreeActive('/dashboard', { pathname: '/dashboard', tab: 'overview', hash: '', ancres: new Set() })).toBe(true);
    expect(railEntreeActive('/dashboard?vue=analytics', { pathname: '/dashboard', tab: 'overview', hash: '', ancres: new Set() })).toBe(false);
  });
});

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
