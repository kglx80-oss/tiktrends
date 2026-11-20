import { describe, it, expect } from 'vitest';
import {
  admissibiliteMembre, messageNonAdmissible, vueEquipeAdmin, CONSIGNE_REINSCRIPTION, MESSAGE_GRADE_NON_ADMISSIBLE,
} from '../src/equipe-admissibilite';
import { accesTotalAdmissible, peutEcrireEquipe, privilegesEquipe, roleEffectifAudit } from '../src/studios/securite';
import { peutGererConnaissances } from '../src/connaissances';
import { ROLES_PLATEFORME, accesTotal, type RolePlateforme } from '../src/equipe-plateforme';

/**
 * Suivi de #1117 · ce que DISENT et TRACENT les comptes d'équipe non
 * admissibles (relecture sécurité indépendante).
 *
 *  1. Ce qu'un message dit « fermé » est exactement ce qu'un compte ADMISSIBLE
 *     du même rôle aurait · rien de ce qu'il n'a jamais eu (un gradé n'a
 *     jamais la liste de l'équipe, `vueEquipeAdmin` le renvoie), rien
 *     d'oublié. Chaque mention est confrontée à la règle qui la tranche.
 *  2. L'écran complet de `/admin/equipe` n'est montré qu'à qui peut écrire
 *     l'équipe · le refus `?e=admissible` des actions ne tombe donc jamais
 *     sur un écran qui afficherait sa légende (le texte `ERR.admissible` de
 *     la page était inatteignable, il est retiré).
 *  3. L'audit ne préfixe `equipe:<rôle>` que pour un compte admissible.
 */

// Midi UTC · la date affichée est la même quel que soit le fuseau du serveur.
const jour = (j: number) => new Date(Date.UTC(2026, 9, j, 12));

/** Chaque mention qu'un message peut dire fermée, et la règle qui dit si un ADMISSIBLE de ce rôle l'a. */
const MENTIONS: Record<string, (role: RolePlateforme) => boolean> = {
  'crédits illimités': (role) => accesTotalAdmissible({ role, plateformeAdmissible: true }),
  'formule Business': (role) => privilegesEquipe({ fondateurCode: false, equipe: { role, plateformeAdmissible: true } }).formuleBusiness,
  'accès d’équipe': (role) => privilegesEquipe({ fondateurCode: false, equipe: { role, plateformeAdmissible: true } }).faceEquipe,
  'Connaissances': (role) => peutGererConnaissances({ role, plateformeAdmissible: true }),
  'dépense de la plateforme': (role) => privilegesEquipe({ fondateurCode: false, equipe: { role, plateformeAdmissible: true } }).depensePlateforme,
  'liste de l’équipe': (role) => vueEquipeAdmin({ role, plateformeAdmissible: true }) === 'complete',
};

const GRADES = ROLES_PLATEFORME.filter((r) => !accesTotal(r));

describe('ce qu’un non admissible lit fermé · exactement ce qu’un admissible du même rôle a', () => {
  it('la grille couvre des gradés et l’accès total (sinon elle ne départage rien)', () => {
    expect(GRADES.length).toBeGreaterThan(0);
    expect(ROLES_PLATEFORME.length).toBeGreaterThan(GRADES.length);
  });

  for (const role of ROLES_PLATEFORME) {
    it(`${role} · le message au membre`, () => {
      const m = messageNonAdmissible({ role, plateformeAdmissible: false, inscritEquipe: true })!;
      for (const [mention, aLAdmissible] of Object.entries(MENTIONS)) {
        expect(m.includes(mention), `« ${mention} » · ${aLAdmissible(role) ? 'perdu mais passé sous silence dans le' : 'jamais eu par un admissible mais dit fermé dans le'} message de ${role}`).toBe(aLAdmissible(role));
      }
    });

    it(`${role} · la consigne lue sur /admin/equipe`, () => {
      const c = admissibiliteMembre({ role, fondateurCode: false, compteCreeLe: jour(10), staffInscritLe: jour(5) }).consigne!.replace(CONSIGNE_REINSCRIPTION, '');
      for (const [mention, aLAdmissible] of Object.entries(MENTIONS)) {
        expect(c.includes(mention), `« ${mention} » · ${aLAdmissible(role) ? 'perdu mais passé sous silence dans la' : 'jamais eu par un admissible mais dit fermé dans la'} consigne de ${role}`).toBe(aLAdmissible(role));
      }
    });
  }

  it('gradé · la réinscription lui rend son accès d’équipe, dit au membre comme à celui qui réinscrit', () => {
    expect(MESSAGE_GRADE_NON_ADMISSIBLE).toBe('Ton compte a été créé après ton inscription à l’équipe · ton accès d’équipe (les rubriques de ton rôle, sans verrou de formule) est fermé, tu as le rôle et la formule de ton espace. Fais « Mot de passe oublié » sur ton adresse et reconnecte-toi, puis demande à un fondateur de te réinscrire · la réinscription te rend cet accès d’équipe.');
    expect(admissibiliteMembre({ role: 'manager', fondateurCode: false, compteCreeLe: jour(10), staffInscritLe: jour(5) }).consigne)
      .toBe(`Compte créé après son inscription · accès d’équipe (les rubriques de son rôle, sans verrou de formule) fermé, la réinscription le lui rend. ${CONSIGNE_REINSCRIPTION}`);
  });
});

/** Toutes les formes d'équipe qu'une session peut porter. */
const EQUIPES = [null, undefined, ...ROLES_PLATEFORME.flatMap((role) =>
  [true, false, undefined].flatMap((plateformeAdmissible) => [true, false, undefined].map((inscritEquipe) => ({ role, plateformeAdmissible, inscritEquipe }))))];

describe('/admin/equipe · l’écran complet seulement pour qui peut écrire l’équipe', () => {
  it('vueEquipeAdmin = complete ⇔ peutEcrireEquipe, sur toute la grille · le refus « ?e=admissible » ne tombe jamais sur la légende', () => {
    for (const e of EQUIPES) {
      expect(vueEquipeAdmin(e) === 'complete', JSON.stringify(e)).toBe(peutEcrireEquipe(e, (r) => accesTotal(r as RolePlateforme)));
    }
  });
});

describe('roleEffectifAudit · « equipe: » seulement pour un compte admissible', () => {
  it('adresse de FOUNDER_EMAILS (Admin+ sans inscription, aucun droit) · tracée par son rôle d’espace', () => {
    // L'équipe telle que la session la porte (`equipeDeSession`) · rôle Admin+, sans inscription, non admissible.
    const equipeEnv = { role: 'adminplus', plateformeAdmissible: false, inscritEquipe: false };
    expect(roleEffectifAudit({ roleEspace: 'owner', equipe: equipeEnv })).toBe('espace:owner');
  });

  it('accès total et gradé non admissibles · rôle d’espace seul', () => {
    expect(roleEffectifAudit({ roleEspace: 'owner', equipe: { role: 'admin', plateformeAdmissible: false } })).toBe('espace:owner');
    expect(roleEffectifAudit({ roleEspace: 'member', equipe: { role: 'manager' } })).toBe('espace:member');
  });

  it('admissible (fondateur codé compris) · rôle d’équipe puis rôle d’espace, comme avant', () => {
    expect(roleEffectifAudit({ roleEspace: 'owner', equipe: { role: 'adminplus', plateformeAdmissible: true } })).toBe('equipe:adminplus/espace:owner');
    expect(roleEffectifAudit({ roleEspace: 'member', equipe: { role: 'manager', plateformeAdmissible: true } })).toBe('equipe:manager/espace:member');
  });

  it('client · rôle d’espace', () => {
    expect(roleEffectifAudit({ roleEspace: 'client_viewer', equipe: null })).toBe('espace:client_viewer');
  });

  it('sur toute la grille · « equipe: » ⇔ plateformeAdmissible === true', () => {
    for (const e of EQUIPES) {
      expect(roleEffectifAudit({ roleEspace: 'member', equipe: e }).startsWith('equipe:'), JSON.stringify(e)).toBe(e?.plateformeAdmissible === true);
    }
  });
});
