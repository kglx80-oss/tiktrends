import { describe, expect, it } from 'vitest';
import { lireVueAccueil, hrefVueAccueil, redirectionAnalytics, resoudreAccueil, VUES_ACCUEIL } from '../src/accueil-vue';
import { roleVoitRubrique } from '../src/equipe-plateforme';
import { placementLanceurSupport } from '../src/lanceur-support';

/**
 * Lot 19A · l'Accueil réunit le Pilotage. La règle « quelle vue, à partir de
 * quels paramètres, pour quel rôle » est pure · on éprouve ses SORTIES.
 */

const toutOuvert = () => true;
// La matrice réelle de l'équipe plateforme · « membre » n'a pas la rubrique
// analytics par défaut, « lecture » l'a.
const voit = (role: 'membre' | 'lecture') => (href: string) => href !== '/analytics' || roleVoitRubrique(role, 'analytics');

describe('accueil · quelle vue, à partir de quels paramètres', () => {
  it('sans paramètre, l’Accueil d’aujourd’hui', () => {
    expect(lireVueAccueil({})).toBe('accueil');
  });
  it('seule la valeur exacte `analytics` ouvre l’Analytics', () => {
    expect(lireVueAccueil({ vue: 'analytics' })).toBe('analytics');
    for (const v of ['Analytics', 'analytic', '', 'pilotage', 'accueil']) expect(lireVueAccueil({ vue: v }), v).toBe('accueil');
  });
  it('une `vue` répétée · la première tranche', () => {
    expect(lireVueAccueil({ vue: ['analytics', 'accueil'] })).toBe('analytics');
    expect(lireVueAccueil({ vue: ['x', 'analytics'] })).toBe('accueil');
  });
});

describe('accueil · les adresses ne perdent aucun paramètre', () => {
  it('l’Accueil garde son URL nue', () => {
    expect(hrefVueAccueil('accueil')).toBe('/dashboard');
    expect(hrefVueAccueil('accueil', { vue: 'analytics' })).toBe('/dashboard');
  });
  it('la vue Analytics · `vue` en tête, puis le reste dans l’ordre', () => {
    expect(hrefVueAccueil('analytics', { periode: '7j', marque: 'b1' })).toBe('/dashboard?vue=analytics&periode=7j&marque=b1');
  });
  it('valeurs répétées, caractères à échapper, clé vide · tout traverse', () => {
    const p = { tag: ['été', 'a&b'], q: 'un mot', vide: '' };
    const href = hrefVueAccueil('analytics', p);
    const lu = new URLSearchParams(href.split('?')[1]);
    expect(lu.getAll('tag')).toEqual(['été', 'a&b']);
    expect(lu.get('q')).toBe('un mot');
    expect(lu.get('vide')).toBe('');
    expect(lu.getAll('vue')).toEqual(['analytics']);
  });
  it('basculer d’une vue à l’autre ne change que `vue`', () => {
    const p = { vue: 'analytics', periode: '30j' };
    expect(hrefVueAccueil('accueil', p)).toBe('/dashboard?periode=30j');
    expect(hrefVueAccueil('analytics', { periode: '30j' })).toBe('/dashboard?vue=analytics&periode=30j');
  });
});

describe('accueil · la redirection de l’ancienne route /analytics', () => {
  it('sans paramètre', () => {
    expect(redirectionAnalytics({})).toBe('/dashboard?vue=analytics');
    expect(redirectionAnalytics()).toBe('/dashboard?vue=analytics');
  });
  it('chaque paramètre est préservé, une `vue` étrangère ne détourne pas la cible', () => {
    expect(redirectionAnalytics({ a: '1', b: ['2', '3'] })).toBe('/dashboard?vue=analytics&a=1&b=2&b=3');
    expect(redirectionAnalytics({ vue: 'accueil', a: '1' })).toBe('/dashboard?vue=analytics&a=1');
  });
  it('une chaîne brute garde son ordre EXACT (une clé numérique ne remonte pas en tête)', () => {
    expect(redirectionAnalytics('?b=1&2=x&a=3&a=4')).toBe('/dashboard?vue=analytics&b=1&2=x&a=3&a=4');
    expect(redirectionAnalytics('b=1')).toBe('/dashboard?vue=analytics&b=1');
    expect(redirectionAnalytics('')).toBe('/dashboard?vue=analytics');
  });
  it('le lanceur de support reste ancré sur la nouvelle route (comme sur /analytics)', () => {
    expect(placementLanceurSupport('/analytics')).toBe('ancre');
    expect(placementLanceurSupport('/dashboard')).toBe('ancre');
  });
});

describe('accueil · pour quel rôle', () => {
  it('rôle qui ouvre Analytics · deux onglets, l’actif suit la vue', () => {
    const r = resoudreAccueil({ params: { vue: 'analytics', periode: '7j' }, ouvert: toutOuvert });
    expect(r.vue).toBe('analytics');
    expect(r.onglets).toEqual([
      { vue: 'accueil', libelle: 'Accueil', href: '/dashboard?periode=7j', actif: false },
      { vue: 'analytics', libelle: 'Analytics', href: '/dashboard?vue=analytics&periode=7j', actif: true },
    ]);
    expect(resoudreAccueil({ params: {}, ouvert: toutOuvert }).onglets.map((o) => o.actif)).toEqual([true, false]);
  });
  it('rôle qui n’ouvre pas Analytics · aucun sélecteur', () => {
    expect(roleVoitRubrique('membre', 'analytics'), 'préalable · la matrice réelle').toBe(false);
    expect(resoudreAccueil({ params: {}, ouvert: voit('membre') }).onglets).toEqual([]);
    expect(resoudreAccueil({ params: {}, ouvert: voit('lecture') }).onglets).toHaveLength(VUES_ACCUEIL.length);
  });
  it('rôle qui n’ouvre pas Analytics · `?vue=analytics` rend ce que /analytics rendait (aucun refus inventé)', () => {
    const r = resoudreAccueil({ params: { vue: 'analytics' }, ouvert: voit('membre') });
    expect(r.vue).toBe('analytics');
    expect(r.onglets).toEqual([]);
  });
});
