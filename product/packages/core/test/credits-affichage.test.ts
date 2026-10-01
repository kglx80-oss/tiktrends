import { describe, expect, it } from 'vitest';
import { afficherCredits, texteCredits, LIBELLE_CREDITS, caseCreditsFormule, videHistoriqueCredits, PIED_FACTURATION_SANS_PAIEMENT } from '../src/credits-affichage';

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

describe('lot 11 · /billing et /credits', () => {
  const f = (n: number) => n.toLocaleString('fr-FR');
  it('case Crédits · illimité = « Illimité », l’allocation à part, jamais « ◈ 0 / … »', () => {
    expect(caseCreditsFormule({ balance: 0, unlimited: true, allocation: 24000 }, f)).toEqual({ valeur: 'Illimité', detail: ` · formule ${f(24000)} / mois` });
    expect(caseCreditsFormule({ balance: 120, unlimited: false, allocation: 24000 }, f)).toEqual({ valeur: '◈ 120', detail: ` / ${f(24000)}` });
  });
  it('historique vide · aucune dépense promise à un compte illimité', () => {
    expect(videHistoriqueCredits(true).pourquoi).not.toMatch(/se dépensent/);
    expect(videHistoriqueCredits(false).pourquoi).toMatch(/se dépensent à chaque génération/);
  });
  it('pied sans paiement · aucun contact promis', () => {
    expect(PIED_FACTURATION_SANS_PAIEMENT.texte).not.toMatch(/écris-nous|notre équipe/i);
  });
});
