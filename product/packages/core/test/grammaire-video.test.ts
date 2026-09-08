import { describe, expect, it } from 'vitest';
import {
  grammaireVideo, resumeGrammaireVideo, briefVideo,
  type ObservationVideo, type GrammaireVideo,
} from '../src/adsmap/grammaire-video';
import { MIN_MARCHE } from '../src/adsmap/grammaire-layout';

/**
 * La grammaire vidéo · même discipline que le statique.
 *
 * Un minimum d'effectif et une majorité franche par dimension · le silence est
 * la réponse quand une catégorie n'a pas de motif vidéo qui se détache. C'est la
 * fondation du loop vidéo · le moteur de génération est un chantier à part.
 */

const obs = (o: Partial<ObservationVideo>): ObservationVideo => ({
  hookType: o.hookType ?? null,
  openingType: o.openingType ?? null,
  talent: o.talent ?? null,
});

const vide: GrammaireVideo = { hookType: null, openingType: null, talent: null, n: 0 };

describe('on ne conclut que sur un motif net', () => {
  it('sous le minimum d’effectif, rien ne parle', () => {
    const g = grammaireVideo(Array.from({ length: MIN_MARCHE - 1 }, () => obs({ openingType: 'face_talking' })));
    expect(g.openingType).toBeNull();
  });

  it('au minimum et en majorité, la dominante se détache', () => {
    const g = grammaireVideo(Array.from({ length: MIN_MARCHE }, () => obs({ openingType: 'face_talking', talent: 'ugc_creator' })));
    expect(g.openingType).toBe('face_talking');
    expect(g.talent).toBe('ugc_creator');
  });

  it('sans majorité franche, rien ne tranche', () => {
    const lot = [
      ...Array.from({ length: MIN_MARCHE }, () => obs({ hookType: 'question' })),
      ...Array.from({ length: MIN_MARCHE }, () => obs({ hookType: 'number' })),
    ];
    expect(grammaireVideo(lot).hookType).toBeNull();
  });
});

describe('la carte et le brief', () => {
  it('une grammaire vide ne dit rien', () => {
    expect(resumeGrammaireVideo(vide)).toEqual([]);
    expect(briefVideo(vide)).toEqual([]);
  });

  it('une grammaire nette se lit et se distille', () => {
    const g: GrammaireVideo = { ...vide, openingType: 'face_talking', hookType: 'question', talent: 'ugc_creator', n: 40 };
    const parAxe = Object.fromEntries(resumeGrammaireVideo(g).map((l) => [l.axe, l.valeur]));
    expect(parAxe['Ouverture']).toBeTruthy();
    expect(parAxe['Accroche']).toBeTruthy();
    expect(parAxe['À l’écran']).toBeTruthy();
    const cs = briefVideo(g);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatch(/videos that keep running/i);
    expect(cs[0]).toMatch(/unless the product demands otherwise/i);
  });
});
