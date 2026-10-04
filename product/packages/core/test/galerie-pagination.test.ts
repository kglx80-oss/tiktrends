import { describe, expect, it } from 'vitest';
import { fenetrePage, compteurGalerie, borneConsultation, TAILLE_PAGE_GALERIE } from '../src/galerie-pagination';

describe('galerie · pagination de toute la population (lot 13)', () => {
  it('première, dernière, hors bornes, vide', () => {
    expect(fenetrePage(63, 0)).toEqual({ page: 0, pages: 3, offset: 0, de: 1, a: 24 });
    expect(fenetrePage(63, 2)).toEqual({ page: 2, pages: 3, offset: 48, de: 49, a: 63 });
    expect(fenetrePage(63, 9).page, 'page au-delà de la fin').toBe(2);
    expect(fenetrePage(63, -3).page).toBe(0);
    expect(fenetrePage(0, 0)).toEqual({ page: 0, pages: 1, offset: 0, de: 0, a: 0 });
    expect(fenetrePage(24, 1).page, '24 pile tient sur une page').toBe(0);
  });
  it('les pages couvrent chaque rang une seule fois (ni doublon ni perte)', () => {
    for (const total of [1, 23, 24, 25, 47, 63, 100]) {
      const vus: number[] = [];
      const { pages } = fenetrePage(total, 0);
      for (let p = 0; p < pages; p++) { const f = fenetrePage(total, p); for (let r = f.de; r <= f.a; r++) vus.push(r); }
      expect(vus, `total ${total}`).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    }
    expect(TAILLE_PAGE_GALERIE).toBe(24);
  });
  it('compteurs · générations et sorties distinguées', () => {
    expect(compteurGalerie({ generations: 30, sorties: 63, genre: 'image' })).toBe('63 visuels · 30 générations');
    expect(compteurGalerie({ generations: 1, sorties: 1, genre: 'image' })).toBe('1 visuel · 1 génération');
    expect(compteurGalerie({ generations: 31, sorties: 26, genre: 'video' })).toBe('31 générations · 26 vidéos prêtes');
  });
  it('borne de consultation · ISO valide, sinon maintenant ; jamais future', () => {
    const m = new Date('2026-10-02T10:00:00Z');
    expect(borneConsultation('2026-10-01T10:00:00Z', m).toISOString()).toBe('2026-10-01T10:00:00.000Z');
    expect(borneConsultation('nimporte', m)).toBe(m);
    expect(borneConsultation('2027-01-01T00:00:00Z', m)).toBe(m);
    expect(borneConsultation(null, m)).toBe(m);
  });
});
