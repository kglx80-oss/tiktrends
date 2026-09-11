import { describe, it, expect } from 'vitest';
import { noteImage } from '../src/note-image';
import { PLAFOND_SI_GRAVE } from '../src/scene-defects';

describe('noteImage · lire un score de créa comme une note de visuel', () => {
  it('une note à l’aveugle (non vue) ne s’affiche pas', () => {
    expect(noteImage({ score: 80, defauts: [], verdict: 'x', vu: false })).toBeNull();
    expect(noteImage(null)).toBeNull();
  });

  it('un visuel sain garde sa note', () => {
    const n = noteImage({ score: 72, defauts: [], verdict: 'Solide, ça accroche.', vu: true })!;
    expect(n.note).toBe(72);
    expect(n.grave).toBe(false);
    expect(n.resume).toBe('');
    expect(n.defauts).toEqual([]);
  });

  it('un raté rédhibitoire plafonne la note, quoi qu’ait dit le modèle', () => {
    // « texte_incruste » est rédhibitoire · une fausse accroche cuite dans l'image.
    const n = noteImage({ score: 88, defauts: ['texte_incruste'], verdict: 'Beau', vu: true })!;
    expect(n.grave).toBe(true);
    expect(n.note).toBeLessThanOrEqual(PLAFOND_SI_GRAVE);
    expect(n.defauts).toContain('texte_incruste');
    expect(n.resume).not.toBe('');
  });

  it('un défaut mineur ne plafonne pas mais se signale', () => {
    const n = noteImage({ score: 65, defauts: ['produit_deforme'], verdict: 'ok', vu: true })!;
    expect(n.grave).toBe(false);
    expect(n.note).toBe(65);
    expect(n.defauts).toContain('produit_deforme');
  });
});
