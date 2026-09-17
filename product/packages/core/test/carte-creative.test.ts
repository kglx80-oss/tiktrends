import { describe, expect, it } from 'vitest';
import { qualiteCarte, type ControleCarte } from '../src/carte-creative';

/**
 * CDC v6 · la carte créative distingue pertinence, QUALITÉ et performance.
 * Ce test tient la règle de synthèse qualité · combien de points à vérifier,
 * ce qui bloque « Prête à diffuser », et le fait qu'un constat automatique est
 * une suspicion, pas un verdict. Test des RÉSULTATS retournés.
 */

describe('qualiteCarte · la synthèse de la relecture', () => {
  it('sans relecture, la qualité est « non vérifiée » · jamais « prête » à tort', () => {
    // Le silence n'est pas une garantie · une création non relue ne se déclare
    // pas prête.
    const q = qualiteCarte(null);
    expect(q.verifie).toBe(false);
    expect(q.libelle).toBe('Qualité non vérifiée');
    expect(q.ton).toBe('inconnu');
    expect(q.pretADiffuser).toBe(false);
    expect(q.points).toEqual([]);
  });

  it('relue et propre → « Prête à diffuser »', () => {
    const q = qualiteCarte({ produitFidele: true, texteLisible: true });
    expect(q.verifie).toBe(true);
    expect(q.niveau).toBe('ok');
    expect(q.libelle).toBe('Prête à diffuser');
    expect(q.pretADiffuser).toBe(true);
    expect(q.automatique).toBe(false);
  });

  it('un défaut bloquant confirmé reste visible ET interdit « Prête à diffuser »', () => {
    // Produit modifié · éliminatoire · la carte ne peut pas la dire prête.
    const q = qualiteCarte({ produitFidele: false, ecarts: ['couleur du flacon'], texteLisible: true });
    expect(q.niveau).toBe('bloquant');
    expect(q.pretADiffuser).toBe(false);
    expect(q.ton).toBe('bloquant');
    expect(q.points[0]).toBe('Produit modifié · couleur du flacon');
    expect(q.libelle).toBe('À revoir · 1 point');
  });

  it('compte les points et les présente comme suspicion automatique', () => {
    // Deux points non éliminatoires · « 2 points à vérifier », présentés comme
    // détectés automatiquement.
    const c: ControleCarte = { produitFidele: true, texteLisible: true, copieResume: 'ton adouci', copieGrave: false };
    const q1 = qualiteCarte(c);
    expect(q1.libelle).toBe('1 point à vérifier');
    expect(q1.automatique).toBe(true);
    expect(q1.pretADiffuser).toBe(false);
    expect(q1.niveau).toBe('suspicion');

    const q2 = qualiteCarte({ produitFidele: false, ecarts: ['forme'], texteLisible: false, problemesLisibilite: ['contraste'] });
    expect(q2.libelle).toBe('À revoir · 2 points');
    expect(q2.points).toHaveLength(2);
  });

  it('une accroche réécrite grave bloque · une simple retouche non', () => {
    const grave = qualiteCarte({ copieResume: 'accroche changée', copieGrave: true, produitFidele: true });
    expect(grave.niveau).toBe('bloquant');
    expect(grave.points[0]).toBe('Accroche réécrite · accroche changée');

    const legere = qualiteCarte({ copieResume: 'virgule ajoutée', copieGrave: false, produitFidele: true });
    expect(legere.niveau).toBe('suspicion');
    expect(legere.points[0]).toBe('Copie retouchée · virgule ajoutée');
  });

  it('l’ordre des points suit la gravité · produit, lisibilité, copie', () => {
    const q = qualiteCarte({ produitFidele: false, ecarts: ['A'], texteLisible: false, problemesLisibilite: ['B'], copieResume: 'C', copieGrave: false });
    expect(q.points).toEqual(['Produit modifié · A', 'Texte peu lisible · B', 'Copie retouchée · C']);
  });
});
