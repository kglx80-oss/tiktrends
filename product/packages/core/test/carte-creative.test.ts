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

/**
 * CDC v7 · N04 · le badge doit être explicable · trois natures distinctes.
 * Une relecture technique propre ne suffit pas à dire « Prête à diffuser » quand
 * la pub porte un fait qu'aucune source n'a vérifié · le silence de la relecture
 * n'est pas une validation de ce fait (le témoignage « piscine »).
 */
describe('qualiteCarte · N04 · validation factuelle et approbation, distinctes du technique', () => {
  const citation: ControleCarte = {
    produitFidele: true, texteLisible: true,
    faits: [{ cle: 'temoignage', label: 'Témoignage', etat: 'a_verifier' }],
  };

  it('technique propre MAIS fait à vérifier → PAS « Prête à diffuser »', () => {
    // Le cœur du constat · absence de défaut détecté ≠ preuve vérifiée.
    const q = qualiteCarte(citation);
    expect(q.technique.niveau, 'la relecture technique doit rester propre').toBe('ok');
    expect(q.pretADiffuser, 'un fait non vérifié laisse pourtant passer « prête »').toBe(false);
    expect(q.libelle).toBe('1 point à vérifier');
    expect(q.ton).toBe('attention');
    expect(q.factuel.aVerifier).toBe(1);
    expect(q.reserves).toContain('Témoignage · à vérifier');
  });

  it('le même fait, une fois VÉRIFIÉ avec sa source → « Prête à diffuser »', () => {
    const q = qualiteCarte({ ...citation, faits: [{ cle: 'temoignage', label: 'Témoignage', etat: 'verifiee', source: 'avis client vérifié' }] });
    expect(q.pretADiffuser).toBe(true);
    expect(q.libelle).toBe('Prête à diffuser');
    expect(q.factuel.verifies).toBe(1);
    expect(q.pointsApprouves).toContain('Témoignage · vérifié · avis client vérifié');
  });

  it('une validation devenue caduque (prix/citation changés) BLOQUE', () => {
    // « Changer prix, citation, référence ou composition invalide les validations. »
    const q = qualiteCarte({ produitFidele: true, texteLisible: true, faits: [{ cle: 'offre', label: 'Offre / prix', etat: 'invalidee' }] });
    expect(q.niveau).toBe('bloquant');
    expect(q.pretADiffuser).toBe(false);
    expect(q.libelle).toBe('À revoir · 1 point');
    expect(q.reserves).toContain('Offre / prix · validation caduque');
  });

  it('les trois natures sont exposées séparément', () => {
    const q = qualiteCarte({
      produitFidele: true, texteLisible: true,
      faits: [{ cle: 'stat', label: 'Chiffre avancé', etat: 'a_verifier' }],
      approbation: { par: 'Camille', le: '2026-09-17' },
      provenance: { auteur: 'Studio', date: '2026-09-16', version: 'v2' },
    });
    expect(q.technique.fait).toBe(true);
    expect(q.factuel.faits).toHaveLength(1);
    expect(q.humain.approuve).toBe(true);
    expect(q.humain.par).toBe('Camille');
    expect(q.provenance).toEqual({ auteur: 'Studio', date: '2026-09-16', version: 'v2' });
    expect(q.pointsApprouves).toContain('Approuvée par Camille · 2026-09-17');
    // Une approbation humaine ne couvre pas un fait resté à vérifier.
    expect(q.pretADiffuser).toBe(false);
  });

  it('sans aucun fait ni relecture, la provenance seule ne déclare pas « vérifiée »', () => {
    const q = qualiteCarte({ provenance: { date: '2026-09-16' } });
    expect(q.verifie).toBe(false);
    expect(q.libelle).toBe('Qualité non vérifiée');
    expect(q.provenance).toEqual({ auteur: null, date: '2026-09-16', version: null });
  });

  it('une pub sans fait porté reste « Prête à diffuser » quand la relecture est propre', () => {
    // On ne pénalise pas une création qui n'affirme rien à prouver.
    const q = qualiteCarte({ produitFidele: true, texteLisible: true, faits: [] });
    expect(q.pretADiffuser).toBe(true);
    expect(q.factuel.faits).toHaveLength(0);
  });
});
