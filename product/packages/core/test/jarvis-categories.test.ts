import { describe, it, expect } from 'vitest';
import {
  CATEGORIES_JARVIS, CATEGORIE_JARVIS_DEFAUT, amorcesCategorie, categorieOuDefaut,
} from '../src/index';

/**
 * UX V5 · pastilles de catégories et « Prompts <Catégorie> » · un RÉSULTAT.
 *
 * On lit ce que la règle REND · toujours trois amorces par catégorie (une rangée
 * trouée se lit comme un bug), un prompt non vide par carte, et la prudence de
 * « Résultats » réglée sur ce qui est mesuré. Une pastille inconnue retombe sur
 * le défaut, jamais sur un vide.
 */

describe('les sept catégories de la maquette', () => {
  it('sont présentes, dans l’ordre, la première active par défaut', () => {
    expect(CATEGORIES_JARVIS.map((c) => c.cle)).toEqual(
      ['strategie', 'angles', 'accroches', 'concurrents', 'resultats', 'creatif', 'inspiration'],
    );
    expect(CATEGORIE_JARVIS_DEFAUT).toBe(CATEGORIES_JARVIS[0]!.cle);
    for (const c of CATEGORIES_JARVIS) { expect(c.libelle.trim()).not.toBe(''); expect(c.icone.trim()).not.toBe(''); }
  });
});

describe('les amorces d’une catégorie', () => {
  it('toujours exactement trois, titre/sous/prompt non vides', () => {
    for (const c of CATEGORIES_JARVIS) {
      const a = amorcesCategorie(c.cle, { measuredAds: 7 });
      expect(a, c.cle).toHaveLength(3);
      for (const x of a) { expect(x.titre.trim()).not.toBe(''); expect(x.sous.trim()).not.toBe(''); expect(x.prompt.trim().length).toBeGreaterThan(5); }
    }
  });

  it('« Résultats » sans aucun test mesuré propose de MESURER, pas de lire des performances absentes', () => {
    const sans = amorcesCategorie('resultats', { measuredAds: 0 });
    const avec = amorcesCategorie('resultats', { measuredAds: 12 });
    expect(sans.map((x) => x.prompt)).not.toEqual(avec.map((x) => x.prompt));
    // Sans mesure, aucune amorce ne prétend lire « ce qui marche le mieux ».
    expect(sans.some((x) => /marche le mieux/i.test(x.prompt))).toBe(false);
    expect(avec.some((x) => /marche le mieux/i.test(x.prompt))).toBe(true);
  });
});

describe('catégorie demandée ou défaut', () => {
  it('garde une catégorie connue, retombe sur le défaut sinon', () => {
    expect(categorieOuDefaut('angles')).toBe('angles');
    expect(categorieOuDefaut('inconnue')).toBe(CATEGORIE_JARVIS_DEFAUT);
    expect(categorieOuDefaut(null)).toBe(CATEGORIE_JARVIS_DEFAUT);
    expect(categorieOuDefaut(undefined)).toBe(CATEGORIE_JARVIS_DEFAUT);
  });
});
