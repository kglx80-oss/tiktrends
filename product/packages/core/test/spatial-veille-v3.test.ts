import { describe, expect, it } from 'vitest';
import {
  ecrireOutilsScale, lireOutilsScale, filtrerOutilsScale, criteresOutilsScale, FILTRES_OUTIL_SCALE, lectureMarche, resumeRadarCreatif,
  filtrerSauvegardes, FILTRES_SAUVEGARDES, type DonneesOutilScale,
  lireFiltresSauvegardes, trierSauvegardes, formatFiltrable, provenanceSauvegarde, filesClassement,
  videoLisible,
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

/* ───────────── Vague 4 · ce que l'écran Formats V5 savait faire, dans Sauvegardes ───────────── */

describe('Spatial · Sauvegardes · vague 4 (règles)', () => {
  it('lireFiltresSauvegardes · format, tri et média lus dans l’adresse · une valeur inconnue revient au défaut', () => {
    expect(lireFiltresSauvegardes({ format: 'non_classe', tri: 'duree', media: 'video' })).toEqual({ ...FILTRES_SAUVEGARDES, format: 'non_classe', tri: 'duree', media: 'video' });
    expect(lireFiltresSauvegardes({ format: 'incertain' }).format).toBe('incertain');
    expect(lireFiltresSauvegardes({ format: 'packshot' }).format).toBe('packshot');
    expect(lireFiltresSauvegardes({ format: 'inconnu', tri: 'n/a', media: 'gif' })).toEqual(FILTRES_SAUVEGARDES);
    expect(lireFiltresSauvegardes({ format: ['packshot', 'x'] }).format).toBe('packshot');
  });
  it('trierSauvegardes · les quatre tris de l’écran Formats · une date absente passe en dernier', () => {
    const l = [
      { id: 'a', sauvegardeLe: '2026-10-01T00:00:00Z', classeeLe: '2026-10-09T00:00:00Z', jours: 5 },
      { id: 'b', sauvegardeLe: '2026-10-03T00:00:00Z', classeeLe: null, jours: 50 },
      { id: 'c', sauvegardeLe: '2026-10-02T00:00:00Z', classeeLe: '2026-10-04T00:00:00Z', jours: null },
      { id: 'd', sauvegardeLe: null, classeeLe: null, jours: 20 },
    ];
    const ids = (t: Parameters<typeof trierSauvegardes>[1]) => trierSauvegardes(l, t).map((x) => x.id);
    expect(ids('recent')).toEqual(['b', 'c', 'a', 'd']);
    expect(ids('ancien')).toEqual(['d', 'a', 'c', 'b']);
    expect(ids('classe')).toEqual(['a', 'c', 'b', 'd']);
    expect(ids('duree')).toEqual(['b', 'd', 'a', 'c']);
    expect(l.map((x) => x.id), 'la liste reçue a été modifiée').toEqual(['a', 'b', 'c', 'd']);
  });
  it('formatFiltrable · l’incertaine a sa file, la non classée n’a pas de format', () => {
    expect(formatFiltrable({ id: null, etat: 'incertain' })).toBe('incertain');
    expect(formatFiltrable({ id: 'packshot', etat: 'classe' })).toBe('packshot');
    expect(formatFiltrable({ id: null, etat: 'non_classe' })).toBeNull();
    expect(formatFiltrable(undefined)).toBeNull();
    const items = [{ platform: 'meta', video: false, texte: '', annonceur: '', format: formatFiltrable({ id: null, etat: 'incertain' }) }, { platform: 'meta', video: false, texte: '', annonceur: '', format: null }];
    expect(filtrerSauvegardes(items, { ...FILTRES_SAUVEGARDES, format: 'non_classe' })).toHaveLength(1);
    expect(filtrerSauvegardes(items, { ...FILTRES_SAUVEGARDES, format: 'incertain' })[0]!.format).toBe('incertain');
  });
  it('provenanceSauvegarde · sauvegardée le, classée le, par qui (seulement quand le nom est connu)', () => {
    expect(provenanceSauvegarde({ platform: 'meta', sauvegardeLe: '2026-10-05T09:00:00Z', classeeLe: '2026-10-06T09:00:00Z', auteur: 'Kevin' })).toBe('Meta · sauvegardée le 05/10/2026 · classée le 06/10/2026 par Kevin');
    expect(provenanceSauvegarde({ platform: 'tiktok', sauvegardeLe: null, classeeLe: '2026-10-06T09:00:00Z', auteur: null })).toBe('TikTok · sauvegardée le n/c · classée le 06/10/2026');
    expect(provenanceSauvegarde({ platform: 'google', sauvegardeLe: '2026-10-05T09:00:00Z', classeeLe: null, auteur: 'Kevin' })).toBe('Google · sauvegardée le 05/10/2026');
  });
  it('filesClassement · « à classer » et « incertaines » mènent aux Sauvegardes filtrées · une file vide n’est pas proposée', () => {
    expect(filesClassement({ nonClassees: 3, incertaines: 1 })).toEqual([
      { href: '/saved?format=non_classe', libelle: 'Classer mes 3 sauvegardes' },
      { href: '/saved?format=incertain', libelle: '1 incertaine · à revoir' },
    ]);
    expect(filesClassement({ nonClassees: 0, incertaines: 0 })).toEqual([]);
  });
});

describe('Spatial · vague 4 · videoLisible', () => {
  it('une vidéo à adresse http(s) seulement', () => {
    expect(videoLisible({ mediaType: 'VIDEO', mediaUrl: ' https://cdn/v.mp4 ' })).toBe('https://cdn/v.mp4');
    expect(videoLisible({ mediaType: 'image', mediaUrl: 'https://cdn/i.jpg' })).toBeNull();
    expect(videoLisible({ mediaType: 'video', mediaUrl: 'javascript:alert(1)' })).toBeNull();
    expect(videoLisible({ mediaType: 'video', mediaUrl: null })).toBeNull();
  });
});
