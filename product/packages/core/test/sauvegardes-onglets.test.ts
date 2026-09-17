import { describe, expect, it } from 'vitest';
import { ONGLETS_SAUVEGARDES, ONGLET_DEFAUT, ongletValide, defOnglet, correspondSauvegarde } from '../src/sauvegardes-onglets';

/**
 * CDC v6 · #3 · Sauvegardes recomposée autour de son usage principal · retrouver
 * ses créas gardées. On tient le modèle d'onglets (Créations d'abord) et la
 * recherche. Test des RÉSULTATS.
 */

describe('le modèle d’onglets de Sauvegardes', () => {
  it('trois espaces nommés · Créations, Marques suivies, Nouveautés', () => {
    expect(ONGLETS_SAUVEGARDES.map((o) => o.cle)).toEqual(['creations', 'marques', 'nouveautes']);
    for (const o of ONGLETS_SAUVEGARDES) {
      expect(o.label, o.cle).toBeTruthy();
      expect(o.description.length, o.cle).toBeGreaterThan(10);
    }
  });

  it('l’usage principal domine · « Créations » ouvre par défaut, en tête', () => {
    expect(ONGLET_DEFAUT).toBe('creations');
    expect(ONGLETS_SAUVEGARDES[0]!.cle).toBe('creations');
  });

  it('un paramètre d’URL valide rouvre le même onglet · sinon le défaut', () => {
    // Le retour depuis un détail ne doit pas perdre l'onglet actif.
    expect(ongletValide('nouveautes')).toBe('nouveautes');
    expect(ongletValide('marques')).toBe('marques');
    expect(ongletValide('inconnu')).toBe('creations');
    expect(ongletValide(null)).toBe('creations');
    expect(ongletValide(undefined)).toBe('creations');
  });

  it('chaque clé a sa définition', () => {
    expect(defOnglet('marques').label).toBe('Marques suivies');
  });
});

describe('la recherche dans les créas gardées', () => {
  const ad = { advertiserName: 'Klorea', body: 'Une eau claire sans effort', callToAction: 'Acheter', landingDomain: 'klorea.fr', folder: 'Été' };

  it('requête vide · tout correspond', () => {
    expect(correspondSauvegarde(ad, '')).toBe(true);
    expect(correspondSauvegarde(ad, '   ')).toBe(true);
  });

  it('trouve par marque, texte, appel à l’action, domaine ou board', () => {
    expect(correspondSauvegarde(ad, 'klorea')).toBe(true);
    expect(correspondSauvegarde(ad, 'eau claire')).toBe(true);
    expect(correspondSauvegarde(ad, 'acheter')).toBe(true);
    expect(correspondSauvegarde(ad, '.fr')).toBe(true);
    expect(correspondSauvegarde(ad, 'été')).toBe(true);
  });

  it('insensible à la casse et aux accents', () => {
    expect(correspondSauvegarde(ad, 'KLOREA')).toBe(true);
    expect(correspondSauvegarde({ ...ad, folder: 'Café' }, 'cafe')).toBe(true);
  });

  it('ne correspond pas quand rien ne matche', () => {
    expect(correspondSauvegarde(ad, 'piscine')).toBe(false);
  });
});
