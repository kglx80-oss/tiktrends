import { describe, expect, it } from 'vitest';
import { accrocheNouveauConcept, CHEMIN_NOUVEAU_CONCEPT, etatNouveauProjet } from '../src/studios/ux/nouveau-projet';

/**
 * « Nouveau concept créatif » (vocabulaire CLIENT, mandat Kevin du 20/10) · la
 * règle PURE. Un concept créatif EST un projet studio · seul le mot change.
 * On vérifie des RÉSULTATS (la chaîne rendue, la route), pas des appels.
 */
describe('nouveau concept créatif · règle pure', () => {
  it('le CTA « prêt » porte le libellé « Nouveau concept créatif » (plus « Nouveau projet »)', () => {
    const e = etatNouveauProjet({ peutProposer: true, marqueActive: { id: 'b1', name: 'Neva' } });
    expect(e).toEqual({ etat: 'pret', marque: { id: 'b1', nom: 'Neva' }, libelle: 'Nouveau concept créatif' });
  });

  it('l’accroche nomme la marque active, sans tiret cadratin', () => {
    expect(accrocheNouveauConcept('Neva')).toBe('Que veux-tu créer pour Neva ?');
    expect(accrocheNouveauConcept('Neva')).not.toContain('—');
  });

  it('la route de l’écran de concept est une SOUS-route de la création (URL inchangée en amont)', () => {
    expect(CHEMIN_NOUVEAU_CONCEPT).toBe('/studio/projets/nouveau/concept');
  });

  it('les portes mortes restent dites · sans marque, vers les marques ; sans droit, lecture seule', () => {
    expect(etatNouveauProjet({ peutProposer: true, marqueActive: null }).etat).toBe('sans-marque');
    expect(etatNouveauProjet({ peutProposer: false, marqueActive: { id: 'b1', name: 'Neva' } }).etat).toBe('lecture-seule');
  });
});
