import { describe, expect, it } from 'vitest';
import {
  ecrireOutilsScale, lireOutilsScale, filtrerOutilsScale, criteresOutilsScale, FILTRES_OUTIL_SCALE, lectureMarche, resumeRadarCreatif,
  filtrerSauvegardes, FILTRES_SAUVEGARDES, type DonneesOutilScale,
} from '../src';

const o = (annonceur: string, jours: number, croissance: number, video = false): { o: DonneesOutilScale } => ({ o: { video, annonceur, angle: 'offer', texte: `pub ${annonceur}`, jours, croissance, reach: 0, depense: 0 } });

describe('Spatial · Ce qui scale · critères de l’outil', () => {
  it('l’adresse relit les critères · une valeur hors liste retombe sur le défaut (durée)', () => {
    expect(lireOutilsScale({ type: 'video', tri: 'growth', annonceur: 'Neva', angle: 'offer', texte: 'x' }, { annonceurs: ['Neva'], angles: ['offer'] }))
      .toEqual({ type: 'video', tri: 'growth', annonceur: 'Neva', angle: 'offer', texte: 'x' });
    expect(lireOutilsScale({ type: 'gif', tri: 'n', annonceur: 'Inconnu' }, { annonceurs: ['Neva'], angles: [] })).toEqual(FILTRES_OUTIL_SCALE);
  });
  it('écrire garde la niche et n’écrit pas le défaut', () => {
    expect(ecrireOutilsScale('?q=skincare&country=FR', { ...FILTRES_OUTIL_SCALE, type: 'video' })).toBe('?q=skincare&country=FR&type=video');
    expect(ecrireOutilsScale('?q=skincare&tri=growth', FILTRES_OUTIL_SCALE)).toBe('?q=skincare');
  });
  it('filtre puis trie · le tri ne retire rien, les critères actifs se disent', () => {
    const l = [o('A', 10, 5), o('B', 30, 1, true), o('C', 20, 9)];
    expect(filtrerOutilsScale(l, FILTRES_OUTIL_SCALE).map((x) => x.o.annonceur)).toEqual(['B', 'C', 'A']);
    expect(filtrerOutilsScale(l, { ...FILTRES_OUTIL_SCALE, tri: 'growth' }).map((x) => x.o.annonceur)).toEqual(['C', 'A', 'B']);
    expect(filtrerOutilsScale(l, { ...FILTRES_OUTIL_SCALE, type: 'static', texte: 'pub c' }).map((x) => x.o.annonceur)).toEqual(['C']);
    expect(criteresOutilsScale({ ...FILTRES_OUTIL_SCALE, type: 'video', angle: 'offer' }).map((c) => c.libelle)).toEqual(['Vidéos', 'Offre / promo']);
  });
});

describe('Spatial · mémoire marché et Radar créatif', () => {
  it('sans créa décrite, le compte le dit · la confrontation garde ses sources', () => {
    expect(lectureMarche({ rows: [], contrasts: [], sampleSize: 0, provenSize: 0, advertisers: 0, summary: '' })).toEqual(expect.objectContaining({ aDesDonnees: false, contrastes: [], groupes: [] }));
    const l = lectureMarche({ rows: [], contrasts: [{ dimension: 'format', key: 'ugc', kind: 'inexploite', statement: 'S', sources: 1 }], sampleSize: 3, provenSize: 1, advertisers: 1, summary: '' });
    expect(l.contrastes[0]).toEqual(expect.objectContaining({ ton: 'w', sources: '1 source' }));
  });
  it('le résumé ne montre que les recommandations peuplées', () => {
    expect(resumeRadarCreatif([{ bucket: 'winner' }, { bucket: 'winner' }, { bucket: 'fatigued' }])).toEqual([{ libelle: 'Scaler', classe: 'g', n: 2 }, { libelle: 'Rafraîchir', classe: 'w', n: 1 }]);
  });
});

describe('Spatial · Sauvegardes · filtres', () => {
  const s = [{ platform: 'meta', video: false, texte: 'Sérum', annonceur: 'Neva', format: 'packshot' }, { platform: 'tiktok', video: true, texte: 'Danse', annonceur: 'Ploufy', format: null }];
  it('format (dont la file « non classées »), média, plateforme, texte', () => {
    expect(filtrerSauvegardes(s, FILTRES_SAUVEGARDES)).toHaveLength(2);
    expect(filtrerSauvegardes(s, { ...FILTRES_SAUVEGARDES, format: 'non_classe' }).map((x) => x.annonceur)).toEqual(['Ploufy']);
    expect(filtrerSauvegardes(s, { ...FILTRES_SAUVEGARDES, format: 'packshot', media: 'image' }).map((x) => x.annonceur)).toEqual(['Neva']);
    expect(filtrerSauvegardes(s, { ...FILTRES_SAUVEGARDES, plateforme: 'tiktok', texte: 'dan' })).toHaveLength(1);
  });
});
