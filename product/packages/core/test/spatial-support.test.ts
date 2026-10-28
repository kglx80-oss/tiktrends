import { describe, expect, it } from 'vitest';
import { TYPES_TICKET, filTicket, pastilleStatutTicket, pastilleTypeTicket, peutLireTicket } from '../src';

describe('Spatial · Support · règles', () => {
  it('types dans l’ordre V5, « Question » d’abord', () => {
    expect(TYPES_TICKET.map((t) => t.cle)).toEqual(['question', 'bug', 'suggestion']);
  });
  it('pastilles · statut et type, inconnus tolérés', () => {
    expect(['open', 'in_progress', 'resolved', 'x'].map((s) => pastilleStatutTicket(s).classe)).toEqual(['w', 'c', 'g', 'w']);
    expect(pastilleStatutTicket('resolved').libelle).toBe('Résolu');
    expect(pastilleTypeTicket('bug')).toEqual({ libelle: 'Bug', classe: 'r' });
    expect(pastilleTypeTicket('autre')).toEqual({ libelle: 'autre', classe: '' });
  });
  it('lecture · l’administrateur tout l’espace, le membre les siens', () => {
    expect(peutLireTicket({ admin: true, auteurId: 'a', utilisateurId: 'b' })).toBe(true);
    expect(peutLireTicket({ admin: false, auteurId: 'a', utilisateurId: 'a' })).toBe(true);
    expect(peutLireTicket({ admin: false, auteurId: 'a', utilisateurId: 'b' })).toBe(false);
    expect(peutLireTicket({ admin: false, auteurId: null, utilisateurId: 'b' })).toBe(false);
  });
  it('fil · les messages, sinon le corps d’ouverture, sinon rien', () => {
    const le = new Date(0);
    expect(filTicket({ auteur: 'A', corps: 'c', creeLe: le }, [{ id: '1', auteur: null, corps: 'm', equipe: true, le }]))
      .toEqual([{ id: '1', auteur: 'Utilisateur', corps: 'm', equipe: true, le }]);
    expect(filTicket({ auteur: null, corps: 'c', creeLe: le }, [])).toEqual([{ id: 'ouverture', auteur: 'Utilisateur', corps: 'c', equipe: false, le }]);
    expect(filTicket({ auteur: 'A', corps: null, creeLe: le }, [])).toEqual([]);
  });
});
