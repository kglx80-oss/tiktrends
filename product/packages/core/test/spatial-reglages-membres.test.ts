import { describe, expect, it } from 'vitest';
import {
  RAISON_REFUS_MEMBRE, confirmationRetraitMembre, estCleRole, revocationInvitationsAuRetrait, messagesRetourEquipe, refusChangementRole, refusRetraitMembre, optionsRoleMembre,
  type CleRole,
} from '../src';

/**
 * Équipe · retirer un membre, changer son rôle. On lit la DÉCISION rendue pour
 * chaque couple (acteur, cible), pas la présence d'un appel.
 */
const p = (id: string, role: CleRole) => ({ id, role });

describe('Équipe · retrait d’un membre', () => {
  it('un admin retire un membre, un admin, un client', () => {
    for (const r of ['member', 'admin', 'client_viewer'] as const) {
      expect(refusRetraitMembre({ acteur: p('a', 'admin'), cible: p('b', r), proprietaires: 1 })).toBeNull();
    }
  });
  it('un membre ou un client en lecture n’en retire aucun', () => {
    expect(refusRetraitMembre({ acteur: p('a', 'member'), cible: p('b', 'client_viewer'), proprietaires: 1 })).toBe('forbidden');
    expect(refusRetraitMembre({ acteur: p('a', 'client_viewer'), cible: p('b', 'member'), proprietaires: 1 })).toBe('forbidden');
  });
  it('jamais soi-même, même propriétaire avec un second propriétaire', () => {
    expect(refusRetraitMembre({ acteur: p('a', 'owner'), cible: p('a', 'owner'), proprietaires: 2 })).toBe('soi');
  });
  it('un admin ne touche pas un propriétaire', () => {
    expect(refusRetraitMembre({ acteur: p('a', 'admin'), cible: p('o', 'owner'), proprietaires: 2 })).toBe('proprietaire');
  });
  it('le dernier propriétaire ne part pas · un second propriétaire le peut', () => {
    expect(refusRetraitMembre({ acteur: p('a', 'owner'), cible: p('o', 'owner'), proprietaires: 1 })).toBe('dernier_proprietaire');
    expect(refusRetraitMembre({ acteur: p('a', 'owner'), cible: p('o', 'owner'), proprietaires: 2 })).toBeNull();
  });
  it('une personne hors de l’espace · refusée, sans rien écrire', () => {
    expect(refusRetraitMembre({ acteur: p('a', 'owner'), cible: null, proprietaires: 1 })).toBe('membre_absent');
  });
});

describe('Équipe · changement de rôle', () => {
  it('les rôles invitables seulement · jamais un second propriétaire', () => {
    const c = { acteur: p('a', 'owner'), cible: p('b', 'member'), proprietaires: 1 };
    expect(refusChangementRole({ ...c, nouveau: 'admin' })).toBeNull();
    expect(refusChangementRole({ ...c, nouveau: 'client_viewer' })).toBeNull();
    expect(refusChangementRole({ ...c, nouveau: 'owner' })).toBe('role');
    expect(refusChangementRole({ ...c, nouveau: 'superadmin' })).toBe('role');
  });
  it('le seul propriétaire n’est pas rétrogradé ; avec deux, un propriétaire le peut, un admin jamais', () => {
    expect(refusChangementRole({ acteur: p('a', 'owner'), cible: p('o', 'owner'), proprietaires: 1, nouveau: 'admin' })).toBe('dernier_proprietaire');
    expect(refusChangementRole({ acteur: p('a', 'owner'), cible: p('o', 'owner'), proprietaires: 2, nouveau: 'admin' })).toBeNull();
    expect(refusChangementRole({ acteur: p('a', 'admin'), cible: p('o', 'owner'), proprietaires: 2, nouveau: 'member' })).toBe('proprietaire');
  });
  it('soi-même · refusé, avant tout examen du rôle', () => {
    expect(refusChangementRole({ acteur: p('a', 'admin'), cible: p('a', 'admin'), proprietaires: 1, nouveau: 'member' })).toBe('soi');
  });
  it('le menu montre les quatre rôles, « Propriétaire » jamais choisissable', () => {
    expect(optionsRoleMembre()).toEqual([
      { cle: 'owner', choisissable: false }, { cle: 'admin', choisissable: true },
      { cle: 'member', choisissable: true }, { cle: 'client_viewer', choisissable: true },
    ]);
  });
});

describe('Équipe · textes', () => {
  it('chaque refus a son message au retour de l’action, et la réussite dit ce qui reste', () => {
    const m = messagesRetourEquipe();
    for (const [k, v] of Object.entries(RAISON_REFUS_MEMBRE)) expect(m[`e:${k}`]).toBe(v);
    expect(m['ok:membre_retire']).toContain('ce qu’il a créé y reste');
    expect(m['ok:role_change']).toBe('Rôle mis à jour.');
    expect(m['e:forbidden']).toBe('Action réservée aux administrateurs.');
  });
  it('la confirmation dit ce qui part et ce qui reste, sans tiret cadratin', () => {
    const t = confirmationRetraitMembre('Marine D.');
    expect(t).toContain('Retirer Marine D. de l’espace ?');
    expect(t).toContain('Ce qu’il a créé reste dans l’espace.');
    expect(t).not.toContain('—');
  });
});

describe('Équipe · invitations annulées au retrait', () => {
  it('un admin ou un propriétaire voyait tous les liens · toutes les invitations de l’espace ; sinon les siennes', () => {
    expect(revocationInvitationsAuRetrait('owner')).toBe('espace');
    expect(revocationInvitationsAuRetrait('admin')).toBe('espace');
    expect(revocationInvitationsAuRetrait('member')).toBe('les_siennes');
    expect(revocationInvitationsAuRetrait('client_viewer')).toBe('les_siennes');
  });
  it('la confirmation d’un admin annonce l’annulation des invitations, pas celle d’un membre', () => {
    expect(confirmationRetraitMembre('Paul', 'admin')).toContain('Les invitations en attente de l’espace sont annulées');
    expect(confirmationRetraitMembre('Paul', 'member')).not.toContain('invitations en attente');
  });
  it('une clé héritée d’Object n’est pas un rôle', () => {
    for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(estCleRole(k), k).toBe(false);
    expect(estCleRole('admin')).toBe(true);
  });
});
