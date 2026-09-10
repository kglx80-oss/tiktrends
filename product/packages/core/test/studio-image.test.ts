import { describe, it, expect } from 'vitest';
import { promptImage, AD_DIRECTIONS, directionScenePrompt, directionPrompt } from '../src';

/**
 * Le studio Image reçoit la même direction artistique que la pub · on réutilise
 * le catalogue mesuré, on n'en duplique pas un second. Sans direction, la
 * description libre passe telle quelle · rien d'imposé.
 */

const studio = AD_DIRECTIONS.find((d) => d.key === 'studio')!;

describe('promptImage · la description augmentée de la direction', () => {
  it('sans direction, la description passe intacte', () => {
    expect(promptImage('un thé sur une table', null, false)).toBe('un thé sur une table');
    expect(promptImage('  espacé  ', undefined, false)).toBe('espacé');
  });

  it('une direction sans texte ajoute la SCÈNE seule · pas de typo ni disposition', () => {
    const out = promptImage('un thé', 'studio', false);
    expect(out).toContain('un thé');
    expect(out).toContain(directionScenePrompt(studio));
    // Le mode « scène seule » ne dicte ni typographie ni disposition · on n'écrit
    // pas de texte sur l'image, donc rien à réserver pour lui.
    expect(out).not.toContain('Typography:');
    expect(out).not.toContain('Layout:');
  });

  it('avec texte lisible, la direction COMPLÈTE entre · typo et disposition comprises', () => {
    const out = promptImage('un thé', 'studio', true);
    expect(out).toContain(directionPrompt(studio));
    expect(out).toContain('Typography:');
    expect(out).toContain('Layout:');
  });

  it('une clé inconnue ne casse rien · on garde la description', () => {
    expect(promptImage('un thé', 'nexistepas', true)).toBe('un thé');
  });
});
