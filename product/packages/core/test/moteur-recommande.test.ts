import { describe, expect, it } from 'vitest';
import { moteurRecommande, MOTEUR_RECOMMANDE_CATALOGUE, IMAGE_MODELS } from '../src/economics';

/**
 * Le moteur recommandé dépend du MODE.
 *
 * En composée on écrit le texte · le moteur garde le produit (Nano Banana). En
 * entière le moteur écrit la typo · GPT Image 2, confirmé par un lot de contrôle.
 * Le catalogue n'avait qu'un drapeau, aveugle au mode · on répare ça.
 */

const cles = new Set(IMAGE_MODELS.map((m) => m.key));

describe('le défaut suit le mode', () => {
  it('en entière, recommande GPT Image 2', () => {
    expect(moteurRecommande('entiere')).toBe('gpt2');
  });

  it('en composée, recommande le moteur du catalogue', () => {
    expect(moteurRecommande('composee')).toBe(MOTEUR_RECOMMANDE_CATALOGUE);
  });

  it('les deux recommandations sont de VRAIS moteurs', () => {
    // Un renommage de clé dans le catalogue casserait le défaut en silence ·
    // ce test tombe si la recommandation ne pointe plus sur un moteur réel.
    expect(cles.has(moteurRecommande('entiere'))).toBe(true);
    expect(cles.has(moteurRecommande('composee'))).toBe(true);
  });

  it('entière et composée ne recommandent pas le même moteur', () => {
    // C'est tout l'objet du changement · un seul drapeau aveugle au mode
    // proposait le même moteur partout, dont le mauvais en entière.
    expect(moteurRecommande('entiere')).not.toBe(moteurRecommande('composee'));
  });
});
