import { describe, expect, it } from 'vitest';
import { moteurParDefaut, moteurRecommande, MOTEUR_RECOMMANDE_CATALOGUE } from '../src/economics';

/**
 * Le moteur par défaut retenu ne suit la mesure de marque QU'EN ENTIÈRE · la
 * relecture ne tourne que là, et en composée c'est nous qui écrivons le texte
 * (le bon défaut reste celui, conscient du mode, du catalogue mesuré : Nano).
 *
 * On vérifie le RÉSULTAT, pas la présence d'un `if` · les quatre croisements
 * mode × mesure.
 */
describe('moteurParDefaut · la mesure de marque ne pilote le défaut qu’en entière', () => {
  it('en entière, une mesure qui a tranché prime sur le défaut éditorial', () => {
    // gpt2 est le défaut d'entière · la marque a mesuré que Nano tient mieux ICI.
    expect(moteurParDefaut('entiere', MOTEUR_RECOMMANDE_CATALOGUE)).toBe(MOTEUR_RECOMMANDE_CATALOGUE);
    expect(moteurParDefaut('entiere', MOTEUR_RECOMMANDE_CATALOGUE)).not.toBe(moteurRecommande('entiere'));
  });

  it('en composée, la mesure (mesurée en entière) NE pilote PAS · on garde le défaut du mode', () => {
    // Même si la mesure nomme gpt2, en composée on rend le défaut conscient du mode.
    expect(moteurParDefaut('composee', 'gpt2')).toBe(moteurRecommande('composee'));
    expect(moteurParDefaut('composee', 'gpt2')).not.toBe('gpt2');
  });

  it('sans mesure qui tranche (null / undefined), c’est le défaut conscient du mode', () => {
    expect(moteurParDefaut('entiere', null)).toBe(moteurRecommande('entiere'));
    expect(moteurParDefaut('composee', null)).toBe(moteurRecommande('composee'));
    expect(moteurParDefaut('entiere', undefined)).toBe(moteurRecommande('entiere'));
  });
});
