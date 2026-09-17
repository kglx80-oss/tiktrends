import { describe, expect, it } from 'vitest';
import { formatApercu } from '../src/apercu-format';

/**
 * CDC v6 · #1 (complément) · le format d'aperçu/export est honnête selon le mode.
 * Une composée s'adapte vraiment au cadre · une entière a UN format (l'origine),
 * consulté et exporté à l'identique, la limite dite. Test des RÉSULTATS.
 */

describe('formatApercu · consultation et export honnêtes', () => {
  it('composée · le cadre est un vrai choix d’adaptation, exporté tel quel', () => {
    const f = formatApercu('composee', '9:16');
    expect(f.choixCadre).toBe(true);
    expect(f.adaptation).toBe(true);
    expect(f.libelleTelechargement).toBe('Télécharger (9:16)');
    expect(f.note).toBe('');
  });

  it('sans mode (pub d’avant) · traitée comme une composée', () => {
    expect(formatApercu(null, '4:5').choixCadre).toBe(true);
    expect(formatApercu(undefined, '1:1').adaptation).toBe(true);
  });

  it('entière · un seul format, pas de choix de cadre, export = origine', () => {
    const f = formatApercu('entiere', '9:16');
    expect(f.choixCadre, 'une entière ne se recadre pas en adaptation').toBe(false);
    expect(f.adaptation).toBe(false);
    expect(f.libelleTelechargement).toBe('Télécharger l’original');
    expect(f.note.length, 'la limite doit être dite').toBeGreaterThan(30);
  });

  it('entière · la limite ne dépend pas du cadre demandé', () => {
    // Quel que soit le cadre cliqué, une entière reste consultée à son origine.
    for (const r of ['9:16', '4:5', '1:1'] as const) {
      expect(formatApercu('entiere', r).choixCadre).toBe(false);
    }
  });
});
