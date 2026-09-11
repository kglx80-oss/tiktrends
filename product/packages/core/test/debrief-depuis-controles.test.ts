import { describe, expect, it } from 'vitest';
import { relectureDepuisControle, debriefDepuisControles, type ControleLu } from '../src/adsmap/debrief-lot';

describe('relectureDepuisControle · la sémantique de mesure, sortie du JSX', () => {
  it('une copie GRAVE est une accroche réécrite', () => {
    const r = relectureDepuisControle({ copieResume: 'x', copieGrave: true, produitFidele: true });
    expect(r.accrocheReecrite).toBe(true);
    expect(r.copieMineure).toBe(false);
  });

  it('un résumé non vide SANS gravité est un écart mineur, pas une réécriture', () => {
    const r = relectureDepuisControle({ copieResume: 'accents perdus', copieGrave: false, produitFidele: null });
    expect(r.accrocheReecrite).toBe(false);
    expect(r.copieMineure).toBe(true);
  });

  it('un résumé vide sans gravité = rien à signaler', () => {
    const r = relectureDepuisControle({ copieResume: '   ', copieGrave: false, produitFidele: true });
    expect(r.accrocheReecrite).toBe(false);
    expect(r.copieMineure).toBe(false);
  });

  it('produit et lisibilité passent, texteLisible absent devient null', () => {
    const r = relectureDepuisControle({ copieResume: '', copieGrave: false, produitFidele: false });
    expect(r.produitFidele).toBe(false);
    expect(r.texteLisible).toBeNull();
  });
});

describe('debriefDepuisControles · reconstruire le débrief d’un lot depuis la base', () => {
  const ok: ControleLu = { copieResume: '', copieGrave: false, produitFidele: true, texteLisible: true };
  const reecrite: ControleLu = { copieResume: 'réécrite', copieGrave: true, produitFidele: true, texteLisible: true };

  it('null quand rien n’a été relu (lot composé) · le silence est juste', () => {
    expect(debriefDepuisControles([])).toBeNull();
    expect(debriefDepuisControles([null, undefined])).toBeNull();
  });

  it('compte le lot · trois conformes, une réécrite', () => {
    const d = debriefDepuisControles([ok, ok, ok, reecrite, null]);
    expect(d).not.toBeNull();
    expect(d!.n).toBe(4);
    expect(d!.accrocheReecrite).toBe(1);
    expect(d!.accrocheConforme).toBe(3);
    expect(d!.toutBon).toBe(false);
  });

  it('un lot tout conforme est « tout bon »', () => {
    const d = debriefDepuisControles([ok, ok]);
    expect(d!.toutBon).toBe(true);
  });
});
