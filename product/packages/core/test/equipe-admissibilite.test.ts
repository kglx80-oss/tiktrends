import { describe, it, expect } from 'vitest';
import {
  admissibiliteMembre, messageNonAdmissible, refusConnaissances,
  MESSAGE_NON_ADMISSIBLE, REFUS_CONNAISSANCES, CONSIGNE_REINSCRIPTION,
} from '../src/equipe-admissibilite';
import { plateformeAdmissible } from '../src/studios/securite';

/**
 * Suivi de la PR #1106 (SEC-10 / E5) · un membre invité AVANT d'avoir un
 * compte n'est plus admissible, et le perd en silence. Ce module dit, au
 * RÉSULTAT, ce que `/admin/equipe` montre par membre et ce que le membre
 * concerné lit quand on lui refuse quelque chose.
 */

// Midi UTC · la date affichée est la même quel que soit le fuseau du serveur.
const jour = (j: number) => new Date(Date.UTC(2026, 9, j, 12));

describe('admissibiliteMembre · ce que /admin/equipe montre par membre', () => {
  it('compte créé AVANT l’inscription · admissible, date du compte, aucune consigne', () => {
    const a = admissibiliteMembre({ role: 'admin', fondateurCode: false, compteCreeLe: jour(1), staffInscritLe: jour(5) });
    expect(a).toEqual({ statut: 'admissible', admissible: true, libelle: 'Admissible', compte: 'compte créé le 1 oct. 2026', consigne: null });
  });

  it('compte créé APRÈS l’inscription · non admissible, consigne de vérification hors produit', () => {
    const a = admissibiliteMembre({ role: 'adminplus', fondateurCode: false, compteCreeLe: jour(10), staffInscritLe: jour(5) });
    expect(a.statut).toBe('compte-posterieur');
    expect(a.admissible).toBe(false);
    expect(a.libelle).toBe('Non admissible');
    expect(a.compte).toBe('compte créé le 10 oct. 2026');
    expect(a.consigne).toBe(`Compte créé après son inscription · crédits illimités et Connaissances fermés. ${CONSIGNE_REINSCRIPTION}`);
  });

  it('aucun compte (invité avant de s’inscrire) · non admissible, la consigne prévient pour la suite', () => {
    const a = admissibiliteMembre({ role: 'admin', fondateurCode: false, compteCreeLe: null, staffInscritLe: jour(5) });
    expect(a.statut).toBe('sans-compte');
    expect(a.admissible).toBe(false);
    expect(a.libelle).toBe('Non admissible');
    expect(a.compte).toBe('aucun compte');
    expect(a.consigne).toBe(`Pas encore de compte · le compte qu’il créera sera postérieur, donc non admissible. ${CONSIGNE_REINSCRIPTION}`);
  });

  it('fondateur de la liste codée · admissible même sans compte', () => {
    const a = admissibiliteMembre({ role: 'adminplus', fondateurCode: true, compteCreeLe: null, staffInscritLe: jour(5) });
    expect(a).toEqual({ statut: 'fondateur', admissible: true, libelle: 'Admissible · fondateur', compte: 'aucun compte', consigne: null });
  });

  it('rôle sans accès total · l’admissibilité est dite, sans consigne (elle n’ouvre rien pour ce rôle)', () => {
    const a = admissibiliteMembre({ role: 'dev', fondateurCode: false, compteCreeLe: jour(10), staffInscritLe: jour(5) });
    expect(a.admissible).toBe(false);
    expect(a.libelle).toBe('Non admissible · sans effet pour ce rôle');
    expect(a.consigne).toBeNull();
  });

  it('la consigne exige de vérifier HORS du produit que la personne détient l’adresse', () => {
    expect(CONSIGNE_REINSCRIPTION).toContain('vérifie hors du produit');
    expect(CONSIGNE_REINSCRIPTION).toContain('détient bien cette adresse');
    expect(CONSIGNE_REINSCRIPTION).toContain('blanchit');
  });

  it('même verdict que plateformeAdmissible (la règle de la session) sur toute la grille', () => {
    const dates = [null, jour(1), jour(5), jour(10), 'pas une date'] as const;
    for (const fondateurCode of [false, true]) for (const c of dates) for (const st of dates) {
      const attendu = plateformeAdmissible({ fondateurCode, emailVerifie: null, compteCreeLe: c, staffInscritLe: st });
      expect(admissibiliteMembre({ role: 'admin', fondateurCode, compteCreeLe: c, staffInscritLe: st }).admissible, `${fondateurCode} ${String(c)} ${String(st)}`).toBe(attendu);
    }
  });

  it('jamais de tiret cadratin ni de marque tierce dans les libellés', () => {
    const textes = [MESSAGE_NON_ADMISSIBLE, REFUS_CONNAISSANCES, CONSIGNE_REINSCRIPTION,
      ...(['admin', 'dev'] as const).flatMap((role) => [null, jour(1), jour(10)].map((c) => admissibiliteMembre({ role, fondateurCode: false, compteCreeLe: c, staffInscritLe: jour(5) })))
        .flatMap((a) => [a.libelle, a.compte, a.consigne ?? ''])];
    for (const t of textes) { expect(t).not.toContain('—'); expect(t.toLowerCase()).not.toContain('trendtrack'); }
  });
});

describe('messageNonAdmissible · le membre concerné sait pourquoi', () => {
  it('accès total non admissible · le message dédié', () => {
    expect(messageNonAdmissible({ role: 'admin', plateformeAdmissible: false })).toBe(MESSAGE_NON_ADMISSIBLE);
    expect(messageNonAdmissible({ role: 'adminplus' })).toBe(MESSAGE_NON_ADMISSIBLE);
    expect(MESSAGE_NON_ADMISSIBLE).toBe('Ton compte a été créé après ton inscription à l’équipe · tes crédits illimités et les Connaissances sont fermés. Demande à un fondateur de te réinscrire.');
  });
  it('admissible, rôle gradé, client · rien à dire', () => {
    expect(messageNonAdmissible({ role: 'admin', plateformeAdmissible: true })).toBeNull();
    expect(messageNonAdmissible({ role: 'dev', plateformeAdmissible: false })).toBeNull();
    expect(messageNonAdmissible(null)).toBeNull();
    expect(messageNonAdmissible(undefined)).toBeNull();
  });
});

describe('refusConnaissances · la vraie raison du refus', () => {
  it('Admin non admissible · le message dédié, pas « réservé aux Admin »', () => {
    expect(refusConnaissances({ role: 'admin', plateformeAdmissible: false })).toBe(MESSAGE_NON_ADMISSIBLE);
  });
  it('client, rôle gradé · le refus général', () => {
    expect(refusConnaissances(null)).toBe(REFUS_CONNAISSANCES);
    expect(refusConnaissances({ role: 'manager', plateformeAdmissible: true })).toBe(REFUS_CONNAISSANCES);
  });
  it('accès total admissible · aucun refus', () => {
    expect(refusConnaissances({ role: 'adminplus', plateformeAdmissible: true })).toBeNull();
  });
});
