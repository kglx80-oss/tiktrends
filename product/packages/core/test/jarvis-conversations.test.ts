import { describe, it, expect } from 'vitest';
import {
  titreConversation, titreValide, conversationDansPortee, MAX_TITRE_CONVERSATION,
  TITRE_CONVERSATION_PAR_DEFAUT,
} from '../src/index';

/**
 * UX V5 · la règle PURE des conversations Jarvis · un RÉSULTAT, pas un appel.
 *
 * On lit ce que la règle REND · un titre dérivé, un titre refusé, une portée
 * acceptée ou non. La barrière de portée est éprouvée sur les trois axes
 * (espace, marque, personne) ET sur une portée trouée.
 */

describe('titre d’une conversation', () => {
  it('le titre choisi prime, nettoyé et borné', () => {
    expect(titreConversation({ titre: '  Angles rentrée  ', premierMessage: 'autre' })).toBe('Angles rentrée');
    const long = 'x'.repeat(MAX_TITRE_CONVERSATION + 50);
    expect([...titreConversation({ titre: long })].length).toBe(MAX_TITRE_CONVERSATION);
  });

  it('sans titre, dérivé du premier message · retours et marqueurs retirés', () => {
    expect(titreConversation({ premierMessage: 'Par où\nje commence [[SOURCE:x]] ?' }))
      .toBe('Par où je commence SOURCE:x ?');
  });

  it('sans rien, le libellé neutre · jamais une ligne vide', () => {
    expect(titreConversation({})).toBe(TITRE_CONVERSATION_PAR_DEFAUT);
    expect(titreConversation({ titre: '   ', premierMessage: '  ' })).toBe(TITRE_CONVERSATION_PAR_DEFAUT);
  });
});

describe('titre proposé au renommage', () => {
  it('nettoyé si du texte reste, null sinon (on garde l’ancien)', () => {
    expect(titreValide('  Nouveau nom ')).toBe('Nouveau nom');
    expect(titreValide('   ')).toBeNull();
    expect(titreValide('')).toBeNull();
  });
});

describe('portée d’une conversation · seconde barrière', () => {
  const portee = { workspaceId: 'ws', brandId: 'b', userId: 'u' };
  it('accepte seulement l’exacte coïncidence des trois axes', () => {
    expect(conversationDansPortee({ workspaceId: 'ws', brandId: 'b', userId: 'u' }, portee)).toBe(true);
    expect(conversationDansPortee({ workspaceId: 'autre', brandId: 'b', userId: 'u' }, portee)).toBe(false);
    expect(conversationDansPortee({ workspaceId: 'ws', brandId: 'autre', userId: 'u' }, portee)).toBe(false);
    expect(conversationDansPortee({ workspaceId: 'ws', brandId: 'b', userId: 'autre' }, portee)).toBe(false);
  });
  it('une portée trouée n’ouvre rien', () => {
    expect(conversationDansPortee({ workspaceId: 'ws', brandId: 'b', userId: 'u' }, { workspaceId: '', brandId: 'b', userId: 'u' })).toBe(false);
    expect(conversationDansPortee({ workspaceId: 'ws', brandId: 'b', userId: 'u' }, { workspaceId: 'ws', brandId: '', userId: 'u' })).toBe(false);
    expect(conversationDansPortee({ workspaceId: 'ws', brandId: 'b', userId: 'u' }, { workspaceId: 'ws', brandId: 'b', userId: '' })).toBe(false);
  });
});
