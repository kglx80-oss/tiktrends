import { describe, expect, it } from 'vitest';
import { afficherCredits, texteCredits, LIBELLE_CREDITS } from '../src/credits-affichage';

/**
 * CDC v7 · N09 · un compte illimité ou exempté n'a pas un solde de zéro · on ne
 * montre jamais « 0 » là où il n'y a pas de solde à opposer.
 */
describe('afficherCredits · la même vérité, quel que soit l’écran', () => {
  it('illimité → « Illimité », jamais un chiffre (même balance 0)', () => {
    expect(afficherCredits({ balance: 0, unlimited: true })).toEqual({ mode: 'illimite' });
    expect(texteCredits(afficherCredits({ balance: 0, unlimited: true }), (n) => String(n))).toBe('Illimité');
  });

  it('exempté → « Exempté »', () => {
    expect(afficherCredits({ balance: 0, unlimited: false, exempt: true })).toEqual({ mode: 'exempte' });
    expect(texteCredits({ mode: 'exempte' }, (n) => String(n))).toBe(LIBELLE_CREDITS.exempte);
  });

  it('sinon → le solde réel (jamais négatif)', () => {
    expect(afficherCredits({ balance: 1234, unlimited: false })).toEqual({ mode: 'solde', valeur: 1234 });
    expect(afficherCredits({ balance: -5, unlimited: false })).toEqual({ mode: 'solde', valeur: 0 });
    expect(texteCredits({ mode: 'solde', valeur: 1234 }, (n) => n.toLocaleString('fr-FR'))).toContain('234');
  });

  it('l’illimité prime sur un solde présent · pas de chiffre contradictoire', () => {
    expect(afficherCredits({ balance: 999, unlimited: true }).mode).toBe('illimite');
  });
});
