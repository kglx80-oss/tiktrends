import { describe, expect, it } from 'vitest';
import { bilanNotes, intervalleMoyenne, MIN_NOTES, type NoteLue } from '../src/adsmap/bilan-notes';
import type { SceneDefect } from '../src/scene-defects';

const note = (score: number, o: Partial<NoteLue> = {}): NoteLue =>
  ({ score, defauts: [], vu: true, cles: {}, ...o });

/** n notes de même score sur une clé de coquille. */
const bloc = (n: number, score: number, coquille: string, defauts: SceneDefect[] = []): NoteLue[] =>
  Array.from({ length: n }, (_, i) => note(score + (i % 2 ? 1 : -1), { cles: { coquille }, defauts }));

describe('l’intervalle sur une moyenne', () => {
  it('n’existe pas sous deux valeurs', () => {
    // Un intervalle de largeur nulle déclarerait un groupe tranchant sur une
    // seule note.
    expect(intervalleMoyenne([70])).toBeNull();
    expect(intervalleMoyenne([])).toBeNull();
  });

  it('rétrécit quand les notes s’accumulent', () => {
    const peu = intervalleMoyenne([60, 70, 80])!;
    const beaucoup = intervalleMoyenne([60, 70, 80, 60, 70, 80, 60, 70, 80])!;
    expect(beaucoup.hi - beaucoup.lo).toBeLessThan(peu.hi - peu.lo);
  });

  it('encadre la moyenne', () => {
    const i = intervalleMoyenne([50, 60, 70])!;
    expect(i.lo).toBeLessThan(60);
    expect(i.hi).toBeGreaterThan(60);
  });
});

describe('le bilan par dimension', () => {
  it('ne tranche pas sous le seuil de notes', () => {
    const notes = [...bloc(MIN_NOTES - 1, 90, 'affiche'), ...bloc(10, 50, 'immersif')];
    const b = bilanNotes(notes);
    const coquilles = b.dimensions.find((d) => d.dimension === 'coquille')!;
    const affiche = coquilles.lignes.find((l) => l.cle === 'affiche')!;
    expect(affiche.tranche).toBe(false);
  });

  it('détache un groupe nettement au-dessus', () => {
    const b = bilanNotes([...bloc(10, 88, 'affiche'), ...bloc(10, 45, 'immersif')]);
    const coquilles = b.dimensions.find((d) => d.dimension === 'coquille')!;
    expect(coquilles.conclusif).toBe(true);
    expect(coquilles.lignes[0]!.cle).toBe('affiche');
    expect(coquilles.lignes[0]!.ecart).toBeGreaterThan(0);
  });

  it('ne détache rien quand tout se vaut', () => {
    const b = bilanNotes([...bloc(10, 62, 'affiche'), ...bloc(10, 62, 'immersif')]);
    const coquilles = b.dimensions.find((d) => d.dimension === 'coquille')!;
    expect(coquilles.conclusif).toBe(false);
    expect(coquilles.resume).toContain('Aucun écart');
  });

  it('ignore les notes qui n’ont pas cette dimension', () => {
    const b = bilanNotes([note(70), note(80), ...bloc(6, 60, 'immersif')]);
    const coquilles = b.dimensions.find((d) => d.dimension === 'coquille')!;
    expect(coquilles.lignes.length).toBe(1);
    expect(coquilles.lignes[0]!.n).toBe(6);
  });

  it('se tait complètement quand il n’y a aucune note', () => {
    const b = bilanNotes([]);
    expect(b.notes).toBe(0);
    expect(b.moyenne).toBeNull();
    expect(b.dimensions).toEqual([]);
  });
});

describe('les ratés de fabrication', () => {
  it('ne compte que les notes qui ont vu l’image', () => {
    // Compter les notes aveugles comme « sans défaut » diluerait le taux.
    const b = bilanNotes([
      note(70, { vu: false }), note(70, { vu: false }),
      note(70, { vu: true, defauts: ['texte_incruste'] }),
    ]);
    expect(b.defauts.vues).toBe(1);
    expect(b.defauts.taux).toBe(1);
  });

  it('dit qu’il n’y a rien à compter quand aucune note n’a vu', () => {
    const b = bilanNotes([note(70, { vu: false })]);
    expect(b.defauts.resume).toContain('n’a encore regardé');
  });

  it('« aucun raté » est le résultat qu’on veut, pas un silence', () => {
    const b = bilanNotes([note(70), note(80)]);
    expect(b.defauts.avecDefaut).toBe(0);
    expect(b.defauts.resume).toContain('C’est le résultat qu’on veut');
  });

  it('classe les ratés du plus fréquent au moins', () => {
    const b = bilanNotes([
      note(40, { defauts: ['texte_incruste'] }),
      note(40, { defauts: ['texte_incruste', 'anatomie'] }),
      note(40, { defauts: ['texte_incruste'] }),
    ]);
    expect(b.defauts.parType[0]).toEqual({ defaut: 'texte_incruste', n: 3 });
    expect(b.defauts.parType[1]).toEqual({ defaut: 'anatomie', n: 1 });
  });

  it('désigne une origine quand elle produit une MAJORITÉ de ratés', () => {
    const b = bilanNotes([
      ...bloc(6, 40, 'immersif', ['texte_incruste']),
      ...bloc(6, 70, 'affiche'),
    ]);
    expect(b.defauts.suspects.length).toBe(1);
    expect(b.defauts.suspects[0]!.cle).toBe('immersif');
    expect(b.defauts.resume).toContain('immersif');
  });

  it('ne désigne personne sur une minorité de ratés', () => {
    // Un seul raté sur six images ne désigne pas un coupable · le nommer
    // enverrait changer de moteur pour du bruit.
    const notes = [...bloc(6, 60, 'immersif')];
    notes[0] = { ...notes[0]!, defauts: ['anatomie'] };
    const b = bilanNotes(notes);
    expect(b.defauts.suspects).toEqual([]);
    expect(b.defauts.resume).toContain('sans qu’une origine se détache');
  });

  it('ne désigne personne sous le seuil de notes', () => {
    const b = bilanNotes(bloc(MIN_NOTES - 1, 40, 'immersif', ['texte_incruste']));
    expect(b.defauts.suspects).toEqual([]);
  });
});
