import { describe, expect, it } from 'vitest';
import {
  croissance7j, classeCroissance, estTendanceVeille, depenseEstimeeVeille, euroCourt, nombreCourt, pastilleMarque, lireCpmVeille,
  signauxVeille, lectureVeille, etiquetteStyleVeille, PROVEN_DAYS,
  analyserRechercheVeille, lienVeille, lireCriteresVeille, pucesVeille, suggestionsVeille,
  collectionsSauvegardes, dansCollection, collectionValide, classerParDuree, accrocheDe, alertesSemaine, nouveautesMarque,
  lectureRapportConcurrent, ilYa, ecranSpatial,
} from '../src';

describe('Spatial · Veille · carte', () => {
  it('la croissance 7 j rapporte le gain à la portée d’il y a 7 jours', () => {
    expect(croissance7j(150_000, 50_000)).toBe(50);
    expect(croissance7j(100_000, -10_000)).toBe(-9);
    expect(croissance7j(100_000, undefined)).toBeNull();
    expect(croissance7j(undefined, 5)).toBeNull();
    expect(croissance7j(1000, 1000)).toBeNull(); // tout est neuf · pas de pourcentage
  });

  it('les seuils de la maquette · hausse ≥ 20, tendance ≥ 25, baisse < 0', () => {
    expect(classeCroissance(20)).toBe('up');
    expect(classeCroissance(19)).toBe('');
    expect(classeCroissance(-1)).toBe('down');
    expect(classeCroissance(null)).toBe('');
    expect(estTendanceVeille(25)).toBe(true);
    expect(estTendanceVeille(24)).toBe(false);
    expect(estTendanceVeille(null)).toBe(false);
  });

  it('la dépense estimée est une borne basse · portée × CPM / 1000, rien sans portée', () => {
    expect(depenseEstimeeVeille(110_000, 9)).toBe(990);
    expect(depenseEstimeeVeille(0, 9)).toBeNull();
    expect(depenseEstimeeVeille(undefined, 9)).toBeNull();
    expect(lireCpmVeille('12')).toBe(12);
    expect(lireCpmVeille('7')).toBe(9);
    expect(euroCourt(1600)).toBe('1,6 k€');
    expect(euroCourt(3000)).toBe('3 k€');
    expect(euroCourt(864)).toBe('864 €');
    expect(nombreCourt(110_400)).toBe('110 k');
    expect(nombreCourt(1_200_000)).toBe('1,2 M');
  });

  it('la pastille est stable pour un nom et prend sa première lettre', () => {
    expect(pastilleMarque('Ploufy')).toEqual(pastilleMarque('Ploufy'));
    expect(pastilleMarque('« Brasse & Co »').initiale).toBe('B');
    expect(pastilleMarque('').initiale).toBe('?');
    expect(pastilleMarque('x').fond).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('les signaux ne montrent que ce que la source donne', () => {
    expect(signauxVeille({ platform: 'meta' })).toEqual([]);
    expect(signauxVeille({ platform: 'meta', liveAdsCount: 3 })).toEqual([{ icone: 'eye', texte: '3 actives', titre: 'Pubs actives de l’annonceur' }]);
    expect(signauxVeille({ platform: 'tiktok', views: 12_000, likes: 800 }).map((s) => s.texte)).toEqual(['12 k', '800']);
  });

  it('la lecture suit la durée (seuil du noyau) puis la croissance', () => {
    expect(lectureVeille({ daysRunning: PROVEN_DAYS, croissance: null })).toMatch(/la marque la garde/);
    expect(lectureVeille({ daysRunning: 3, croissance: 40 })).toMatch(/hausse de 40 %/);
    expect(lectureVeille({ daysRunning: 3, croissance: 5 })).toMatch(/Encore récente/);
    expect(etiquetteStyleVeille({ body: '-30 % ce week-end', mediaType: 'image' })).toBe('Offre / promo');
    expect(etiquetteStyleVeille({ body: '', mediaType: 'video' })).toBe('Vidéo');
  });
});

describe('Spatial · Veille · recherche Jarvis', () => {
  it('chaque exemple proposé pose au moins un critère RÉEL', () => {
    for (const s of suggestionsVeille('Ploufy')) {
      const c = analyserRechercheVeille(s);
      const poses = [c.q, c.p, c.country, c.media, c.status, c.sort, c.searchIn].filter(Boolean);
      expect(poses.length, s).toBeGreaterThan(0);
    }
  });

  it('lit plateforme, durée, marque, format et pays', () => {
    expect(analyserRechercheVeille('Avis client sur Meta')).toMatchObject({ p: 'meta', q: 'avis client' });
    expect(analyserRechercheVeille('Pubs qui tournent depuis +30 jours')).toMatchObject({ sort: 'longestRunning' });
    expect(analyserRechercheVeille('Pubs de Brasse & Co sur Meta')).toMatchObject({ q: 'Brasse & Co', searchIn: 'brand', p: 'meta' });
    expect(analyserRechercheVeille('Vidéos sur TikTok')).toMatchObject({ p: 'tiktok', media: 'video' });
    expect(analyserRechercheVeille('pubs actives en Suisse')).toMatchObject({ status: 'active', country: 'CH' });
    expect(analyserRechercheVeille('Pubs avec une offre')).toMatchObject({ q: 'offre' });
    expect(analyserRechercheVeille('Pubs avec une offre').j).toBe('Pubs avec une offre');
  });

  it('les exemples ne nomment jamais une marque inventée · une marque suivie ou rien', () => {
    expect(suggestionsVeille(null).some((s) => s.startsWith('Pubs de '))).toBe(false);
    expect(suggestionsVeille('Ma Marque')).toContain('Pubs de Ma Marque');
  });

  it('l’adresse se relit à l’identique et un critère se retire seul', () => {
    const c = analyserRechercheVeille('Vidéos sur TikTok en France');
    const url = lienVeille(c);
    const relu = lireCriteresVeille(Object.fromEntries(new URLSearchParams(url.split('?')[1])));
    expect(relu).toEqual(c);
    expect(lienVeille(relu, { media: undefined })).not.toContain('media=');
    expect(lienVeille({ q: 'x', page: 3 }, { sort: 'reach' })).not.toContain('page=');
    expect(lienVeille({ q: 'x', cpm: 9, vue: 'tout' })).toBe('/veille?q=x');
    expect(lienVeille({})).toBe('/veille');
    expect(pucesVeille(c).map((p) => p.cle).sort()).toEqual(['country', 'media', 'p']);
  });

  it('une valeur forgée dans l’adresse est ignorée', () => {
    expect(lireCriteresVeille({ p: 'myspace', sort: 'drop', country: 'france', page: '9999', cpm: '1', vue: 'x' })).toEqual({});
  });

  it('les cinq adresses de la rubrique sont servies par Spatial, section veille', () => {
    for (const c of ['/veille', '/veille/concurrents', '/veille/scale', '/saved', '/radar']) expect(ecranSpatial(c)).toEqual({ interne: `/sp${c}`, section: 'veille' });
  });
});

describe('Spatial · Veille · listes', () => {
  it('les collections sont les dossiers réels · toutes, dossiers triés, non classées', () => {
    const items = [{ folder: 'B' }, { folder: 'A' }, { folder: null }, { folder: 'A' }, { folder: '  ' }];
    expect(collectionsSauvegardes(items)).toEqual([
      { cle: 'all', libelle: 'Toutes les sauvegardes', n: 5 },
      { cle: 'f:A', libelle: 'A', n: 2 },
      { cle: 'f:B', libelle: 'B', n: 1 },
      { cle: 'none', libelle: 'Non classées', n: 2 },
    ]);
    expect(dansCollection('A', 'f:A')).toBe(true);
    expect(dansCollection(null, 'none')).toBe(true);
    expect(dansCollection('A', 'none')).toBe(false);
    expect(collectionValide('f:Z', collectionsSauvegardes(items))).toBe('all');
  });

  it('« Ce qui scale » range par durée, la première à 100 %', () => {
    const r = classerParDuree([{ daysRunning: 10 }, { daysRunning: 40 }, { daysRunning: 20 }]);
    expect(r.map((x) => x.ad.daysRunning)).toEqual([40, 20, 10]);
    expect(r.map((x) => x.part)).toEqual([100, 50, 25]);
    expect(r.map((x) => x.rang)).toEqual([1, 2, 3]);
    expect(accrocheDe('\n  Première ligne\nseconde')).toBe('Première ligne');
  });

  it('les alertes de la semaine ne viennent que des nouveautés réelles des 7 derniers jours', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    const j = (n: number) => new Date(now.getTime() - n * 86_400_000);
    const a = alertesSemaine([
      { advertiserName: 'A', createdAt: j(1), unseen: true }, { advertiserName: 'A', createdAt: j(2), unseen: false },
      { advertiserName: 'B', createdAt: j(3), unseen: true }, { advertiserName: 'C', createdAt: j(9), unseen: true },
    ], now);
    expect(a.map((x) => [x.marque, x.n])).toEqual([['A', 2], ['B', 1]]);
    expect(a[0]!.titre).toBe('A a lancé 2 nouvelles pubs cette semaine');
    expect(alertesSemaine([], now)).toEqual([]);
    expect(nouveautesMarque(0)).toBeNull();
    expect(nouveautesMarque(1)).toBe('1 nouvelle non vue');
  });

  it('la lecture d’un rapport concurrent tient en parts réelles', () => {
    const l = lectureRapportConcurrent({
      analyzedAt: '2026-10-27T10:00:00Z',
      aggregates: { adCount: 4, byPlatform: { meta: 4 }, byMedia: { video: 3, image: 1 }, avgDaysRunning: 22 },
      ads: [{ body: 'Court', daysRunning: 5, status: 'active' }, { body: 'Long\nsuite', daysRunning: 50, status: 'inactive', estimatedSpend: 1200 }, { body: '', daysRunning: 80 }, { body: 'Long', daysRunning: 40 }],
      insights: { adAngles: ['La preuve par les parents'] },
    });
    expect(l).toMatchObject({ pubs: 4, actives: 3, dureeMoyenne: 22, depense: 1200, metaTiktok: '100 / 0', angle: 'La preuve par les parents' });
    expect(l.medias).toEqual([{ libelle: 'Vidéo', part: 75 }, { libelle: 'Image', part: 25 }]);
    expect(l.accroches).toEqual(['Long', 'Court']);
    expect(ilYa('2026-10-27T10:00:00Z', new Date('2026-10-27T10:12:00Z'))).toBe('il y a 12 min');
    expect(ilYa('2026-10-27T08:00:00Z', new Date('2026-10-27T10:12:00Z'))).toBe('il y a 2 h');
  });
});
