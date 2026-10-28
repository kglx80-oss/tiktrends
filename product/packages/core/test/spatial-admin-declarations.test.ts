import { describe, expect, it } from 'vitest';
import { LIMITE_DECLARATIONS, VALEUR_ABSENTE, dateDeclaration, declarationOnboarding } from '../src';

describe('Spatial · Admin · déclarations d’onboarding (portées de /admin/signups)', () => {
  it('traduit profil, expérience pub, objectifs et site avec les libellés de l’ancienne page', () => {
    expect(declarationOnboarding({ profile: 'agency', adLevel: 'teste', goals: ['ads', 'multi', 'inconnu'], siteUrl: 'exemple.fr' })).toEqual({
      profil: 'Agence',
      experience: { texte: 'Teste', herite: false },
      objectifs: ['Pubs', 'Multi-marques', 'inconnu'],
      site: { texte: 'exemple.fr', href: 'https://exemple.fr' },
    });
  });

  it('une ancienne réponse « niveau IA » se dit héritée, jamais comme une expérience pub', () => {
    expect(declarationOnboarding({ aiLevel: 'comfortable' }).experience).toEqual({ texte: 'À l’aise · IA hérité', herite: true });
    // L'expérience pub, quand elle existe, l'emporte sur l'ancienne réponse.
    expect(declarationOnboarding({ adLevel: 'metier', aiLevel: 'advanced' }).experience).toEqual({ texte: 'Métier', herite: false });
  });

  it('une réponse absente ou malformée reste absente · rien n’est déduit', () => {
    for (const brut of [null, undefined, 'x', {}, { profile: '', goals: 'ads', siteUrl: 3 }]) {
      expect(declarationOnboarding(brut)).toEqual({ profil: VALEUR_ABSENTE, experience: null, objectifs: [], site: null });
    }
  });

  it('les dates portent l’année (inscriptions sur plusieurs années) · une date absente ou illisible se dit absente', () => {
    expect(dateDeclaration(new Date(2026, 9, 3))).toMatch(/^03 oct\.? 26$/);
    expect(dateDeclaration(null)).toBe(VALEUR_ABSENTE);
    expect(dateDeclaration('pas une date')).toBe(VALEUR_ABSENTE);
  });

  it('le plafond de la liste est celui de l’ancienne page', () => {
    expect(LIMITE_DECLARATIONS).toBe(60);
  });
});
