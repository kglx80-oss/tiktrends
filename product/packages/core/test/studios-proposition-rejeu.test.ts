import { describe, expect, it } from 'vitest';
import { estRejeuProposition, type PropositionOuverte } from '../src';

const maintenant = new Date('2026-10-28T12:00:00Z');
const changes = [{ op: 'replace', path: '/document/layers/l_titre/text', newValue: 'Titre', reason: 'Texte retenu' }];
const demande = { auteurId: 'u1', baseVersionId: 'v1', cible: 'layer:l_titre', changes };
const ouverte: PropositionOuverte = { createdBy: 'u1', baseVersionId: 'v1', target: 'layer:l_titre', changes, state: 'proposed', origin: 'human', expiresAt: new Date('2026-11-04T12:00:00Z') };

describe('Proposition humaine · relance après une réponse perdue', () => {
  it('la même demande encore ouverte est la même proposition', () => {
    expect(estRejeuProposition(demande, ouverte, maintenant)).toBe(true);
  });
  it('l’ordre des clés des changements ne compte pas (JSON canonique)', () => {
    const reordonnes = [{ reason: 'Texte retenu', newValue: 'Titre', path: '/document/layers/l_titre/text', op: 'replace' }];
    expect(estRejeuProposition({ ...demande, changes: reordonnes }, ouverte, maintenant)).toBe(true);
  });
  it('tout écart en fait une autre demande', () => {
    expect(estRejeuProposition({ ...demande, auteurId: 'u2' }, ouverte, maintenant), 'autre personne').toBe(false);
    expect(estRejeuProposition({ ...demande, baseVersionId: 'v2' }, ouverte, maintenant), 'autre base').toBe(false);
    expect(estRejeuProposition({ ...demande, cible: 'layer:l_sous' }, ouverte, maintenant), 'autre cible').toBe(false);
    expect(estRejeuProposition({ ...demande, changes: [{ ...changes[0], newValue: 'Autre' }] }, ouverte, maintenant), 'autre texte').toBe(false);
  });
  it('une proposition décidée, expirée ou de Jarvis n’est jamais reprise', () => {
    expect(estRejeuProposition(demande, { ...ouverte, state: 'approved' }, maintenant)).toBe(false);
    expect(estRejeuProposition(demande, { ...ouverte, state: 'rejected' }, maintenant)).toBe(false);
    expect(estRejeuProposition(demande, { ...ouverte, expiresAt: new Date('2026-10-28T11:59:59Z') }, maintenant)).toBe(false);
    expect(estRejeuProposition(demande, { ...ouverte, origin: 'jarvis' }, maintenant)).toBe(false);
  });
});
