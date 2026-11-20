import { describe, it, expect } from 'vitest';
import {
  admissibiliteMembre, messageNonAdmissible, refusConnaissances, vueEquipeAdmin,
  MESSAGE_NON_ADMISSIBLE, MESSAGE_GRADE_NON_ADMISSIBLE, MESSAGE_FONDATEUR_HORS_CODE, REFUS_CONNAISSANCES, CONSIGNE_REINSCRIPTION,
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
    expect(a.consigne).toBe(`Compte créé après son inscription · crédits illimités, formule Business, accès d’équipe à toutes les fonctions, Connaissances, dépense de la plateforme et liste de l’équipe fermés. ${CONSIGNE_REINSCRIPTION}`);
  });

  it('aucun compte (invité avant de s’inscrire) · non admissible, la consigne prévient pour la suite', () => {
    const a = admissibiliteMembre({ role: 'admin', fondateurCode: false, compteCreeLe: null, staffInscritLe: jour(5) });
    expect(a.statut).toBe('sans-compte');
    expect(a.admissible).toBe(false);
    expect(a.libelle).toBe('Non admissible');
    expect(a.compte).toBe('aucun compte');
    expect(a.consigne).toBe(`Pas encore de compte · le compte qu’il créera sera postérieur, donc non admissible. Attends que son compte existe. ${CONSIGNE_REINSCRIPTION}`);
  });

  it('fondateur de la liste codée · admissible même sans compte', () => {
    const a = admissibiliteMembre({ role: 'adminplus', fondateurCode: true, compteCreeLe: null, staffInscritLe: jour(5) });
    expect(a).toEqual({ statut: 'fondateur', admissible: true, libelle: 'Admissible · fondateur', compte: 'aucun compte', consigne: null });
  });

  it('rôle gradé, compte postérieur · non admissible, ce qu’il perd et la consigne (« Fermer aussi »)', () => {
    const a = admissibiliteMembre({ role: 'dev', fondateurCode: false, compteCreeLe: jour(10), staffInscritLe: jour(5) });
    expect(a.statut).toBe('compte-posterieur');
    expect(a.admissible).toBe(false);
    expect(a.libelle).toBe('Non admissible');
    expect(a.consigne).toBe(`Compte créé après son inscription · accès d’équipe (les rubriques de son rôle, sans verrou de formule) fermé, la réinscription le lui rend. ${CONSIGNE_REINSCRIPTION}`);
  });

  it('rôle gradé, compte antérieur · admissible, sans consigne', () => {
    expect(admissibiliteMembre({ role: 'manager', fondateurCode: false, compteCreeLe: jour(1), staffInscritLe: jour(5) }))
      .toEqual({ statut: 'admissible', admissible: true, libelle: 'Admissible', compte: 'compte créé le 1 oct. 2026', consigne: null });
  });

  it('la consigne exige une preuve portant sur le COMPTE · « Mot de passe oublié » puis reconnexion, demandés hors du produit', () => {
    // Relecture de #1108 · « vérifie que la personne détient l’adresse » ne protège pas : le produit ne
    // vérifie jamais l’e-mail à la création d’un compte. La vraie personne confirme détenir l’adresse,
    // on réinscrit, et c’est le compte du CAPTEUR qui devient admissible. « Mot de passe oublié » envoie
    // le lien sur l’adresse et `resetPasswordAction` incrémente `sessionEpoch` (sessions du capteur coupées).
    expect(CONSIGNE_REINSCRIPTION, 'la consigne n’exige pas « Mot de passe oublié »').toContain('de faire « Mot de passe oublié » sur cette adresse puis de se reconnecter');
    expect(CONSIGNE_REINSCRIPTION).toContain('hors du produit');
    expect(CONSIGNE_REINSCRIPTION).toContain('ferme toute autre session ouverte dessus');
    expect(CONSIGNE_REINSCRIPTION).not.toContain('détient bien cette adresse');
  });

  it('même verdict que plateformeAdmissible (la règle de la session) sur toute la grille', () => {
    const dates = [null, jour(1), jour(5), jour(10), 'pas une date'] as const;
    for (const fondateurCode of [false, true]) for (const c of dates) for (const st of dates) {
      const attendu = plateformeAdmissible({ fondateurCode, emailVerifie: null, compteCreeLe: c, staffInscritLe: st });
      expect(admissibiliteMembre({ role: 'admin', fondateurCode, compteCreeLe: c, staffInscritLe: st }).admissible, `${fondateurCode} ${String(c)} ${String(st)}`).toBe(attendu);
    }
  });

  it('jamais de tiret cadratin ni de marque tierce dans les libellés', () => {
    const textes = [MESSAGE_NON_ADMISSIBLE, MESSAGE_GRADE_NON_ADMISSIBLE, MESSAGE_FONDATEUR_HORS_CODE, REFUS_CONNAISSANCES, CONSIGNE_REINSCRIPTION,
      ...(['admin', 'dev'] as const).flatMap((role) => [null, jour(1), jour(10)].map((c) => admissibiliteMembre({ role, fondateurCode: false, compteCreeLe: c, staffInscritLe: jour(5) })))
        .flatMap((a) => [a.libelle, a.compte, a.consigne ?? ''])];
    for (const t of textes) { expect(t).not.toContain('—'); expect(t.toLowerCase()).not.toContain('trendtrack'); }
  });
});

describe('messageNonAdmissible · le membre concerné sait pourquoi', () => {
  it('accès total non admissible · le message dédié', () => {
    expect(messageNonAdmissible({ role: 'admin', plateformeAdmissible: false })).toBe(MESSAGE_NON_ADMISSIBLE);
    expect(messageNonAdmissible({ role: 'adminplus' })).toBe(MESSAGE_NON_ADMISSIBLE);
    expect(MESSAGE_NON_ADMISSIBLE).toBe('Ton compte a été créé après ton inscription à l’équipe · tes crédits illimités, la formule Business, l’accès d’équipe à toutes les fonctions, les Connaissances, la dépense de la plateforme et la liste de l’équipe sont fermés, tu as le rôle et la formule de ton espace. Fais « Mot de passe oublié » sur ton adresse et reconnecte-toi, puis demande à un fondateur de te réinscrire.');
  });
  it('fondateur venu de l’environnement, sans inscription dans l’équipe · message dédié, jamais « créé après ton inscription »', () => {
    expect(messageNonAdmissible({ role: 'adminplus', plateformeAdmissible: false, inscritEquipe: false })).toBe(MESSAGE_FONDATEUR_HORS_CODE);
    expect(MESSAGE_FONDATEUR_HORS_CODE).not.toContain('créé après');
    expect(MESSAGE_FONDATEUR_HORS_CODE).toContain('Mot de passe oublié');
    // « Codé seul » · la variable n'ouvre plus rien · le message ne promet aucun pouvoir fondateur et dit lesquels sont fermés.
    for (const ferme of ['Tour de contrôle', 'dépenses IA', 'formules et les dons de crédits', 'crédits illimités', 'formule Business', 'accès d’équipe', 'Connaissances', 'liste de l’équipe']) expect(MESSAGE_FONDATEUR_HORS_CODE, ferme).toContain(ferme);
    expect(MESSAGE_FONDATEUR_HORS_CODE).toContain('Les pouvoirs fondateur sont réservés aux fondateurs inscrits dans le code.');
    expect(refusConnaissances({ role: 'adminplus', plateformeAdmissible: false, inscritEquipe: false })).toBe(MESSAGE_FONDATEUR_HORS_CODE);
    expect(messageNonAdmissible({ role: 'adminplus', plateformeAdmissible: false, inscritEquipe: true })).toBe(MESSAGE_NON_ADMISSIBLE);
  });
  it('rôle gradé non admissible · son propre message (face équipe fermée)', () => {
    expect(messageNonAdmissible({ role: 'dev', plateformeAdmissible: false })).toBe(MESSAGE_GRADE_NON_ADMISSIBLE);
    expect(messageNonAdmissible({ role: 'manager' })).toBe(MESSAGE_GRADE_NON_ADMISSIBLE);
    expect(MESSAGE_GRADE_NON_ADMISSIBLE).toContain('Fais « Mot de passe oublié » sur ton adresse et reconnecte-toi, puis demande à un fondateur de te réinscrire');
  });

  it('admissible, client · rien à dire', () => {
    expect(messageNonAdmissible({ role: 'admin', plateformeAdmissible: true })).toBeNull();
    expect(messageNonAdmissible({ role: 'dev', plateformeAdmissible: true })).toBeNull();
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
    expect(refusConnaissances({ role: 'manager', plateformeAdmissible: false }), 'un gradé n’a jamais eu les Connaissances · la raison reste le rôle').toBe(REFUS_CONNAISSANCES);
  });
  it('accès total admissible · aucun refus', () => {
    expect(refusConnaissances({ role: 'adminplus', plateformeAdmissible: true })).toBeNull();
  });
});

describe('vueEquipeAdmin · ce que /admin/equipe montre à la session', () => {
  it('accès total ADMISSIBLE · l’écran complet', () => {
    expect(vueEquipeAdmin({ role: 'adminplus', plateformeAdmissible: true })).toBe('complete');
    expect(vueEquipeAdmin({ role: 'admin', plateformeAdmissible: true })).toBe('complete');
  });

  it('tout compte d’équipe NON admissible · le message seul (ni liste, ni audit)', () => {
    for (const role of ['adminplus', 'admin', 'manager', 'dev']) {
      expect(vueEquipeAdmin({ role, plateformeAdmissible: false }), role).toBe('message');
      expect(vueEquipeAdmin({ role }), `${role} · admissibilité absente`).toBe('message');
    }
    expect(vueEquipeAdmin({ role: 'adminplus', plateformeAdmissible: false, inscritEquipe: false }), 'adresse de FOUNDER_EMAILS').toBe('message');
  });

  it('client, rôle gradé admissible · refus (la page ne les a jamais concernés)', () => {
    expect(vueEquipeAdmin(null)).toBe('refus');
    expect(vueEquipeAdmin(undefined)).toBe('refus');
    expect(vueEquipeAdmin({ role: 'manager', plateformeAdmissible: true })).toBe('refus');
  });
});
