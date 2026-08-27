import { describe, it, expect } from 'vitest';
import {
  rollupDaily, evaluationWindow, brandMediansFrom, rankByCpa, matchByName, matchByBatchVariant,
  type DailyRow,
} from '../src/adsmap/rollup';

const jour = (date: string, o: Partial<DailyRow> = {}): DailyRow => ({
  date, spend: 10, impressions: 1000, linkClicks: 12, purchases: 1, ...o,
});

describe('rollupDaily', () => {
  it('somme les journées de la fenêtre et ignore le reste', () => {
    const rows = [jour('2026-01-01'), jour('2026-01-02'), jour('2026-01-09')];
    const r = rollupDaily(rows, { since: '2026-01-01', until: '2026-01-07' });
    expect(r.metrics.spend).toBe(20);
    expect(r.days).toBe(2);
    expect(r.firstDate).toBe('2026-01-01');
    expect(r.lastDate).toBe('2026-01-02');
  });

  it('sans fenêtre, prend tout', () => {
    expect(rollupDaily([jour('2026-01-01'), jour('2026-03-01')]).metrics.spend).toBe(20);
  });

  it('laisse les champs vidéo absents plutôt que de les mettre à zéro', () => {
    // Une créa statique n'a pas de hook rate · un 0 ferait croire à un hook nul.
    const r = rollupDaily([jour('2026-01-01')]);
    expect(r.metrics.video3sViews).toBeUndefined();
    expect(r.metrics.thruplays).toBeUndefined();
  });

  it('somme les champs vidéo dès qu’une seule journée les porte', () => {
    const r = rollupDaily([jour('2026-01-01', { video3s: 300 }), jour('2026-01-02')]);
    expect(r.metrics.video3sViews).toBe(300);
  });

  it('compte les journées distinctes, pas les lignes', () => {
    expect(rollupDaily([jour('2026-01-01'), jour('2026-01-01')]).days).toBe(1);
  });

  it('rend un agrégat vide sans lignes', () => {
    const r = rollupDaily([]);
    expect(r.metrics.spend).toBe(0);
    expect(r.days).toBe(0);
    expect(r.firstDate).toBeNull();
  });
});

describe('evaluationWindow', () => {
  it('borne les deux extrémités, jour de lancement inclus', () => {
    expect(evaluationWindow('2026-01-01', 7)).toEqual({ since: '2026-01-01', until: '2026-01-07' });
  });

  it('franchit un changement de mois', () => {
    expect(evaluationWindow('2026-01-28', 7).until).toBe('2026-02-03');
  });

  it('une fenêtre d’un jour reste sur le jour même', () => {
    expect(evaluationWindow('2026-05-10', 1)).toEqual({ since: '2026-05-10', until: '2026-05-10' });
  });
});

describe('brandMediansFrom', () => {
  it('ignore les ads trop peu diffusées', () => {
    // L'ad à 100 impressions afficherait un CTR de 10 % · du bruit pur.
    const med = brandMediansFrom([
      { spend: 10, impressions: 100, linkClicks: 10, purchases: 0 },
      { spend: 10, impressions: 10_000, linkClicks: 100, purchases: 1 },
      { spend: 10, impressions: 10_000, linkClicks: 100, purchases: 1 },
    ]);
    expect(med.ctr).toBeCloseTo(0.01, 6);
  });

  it('rend un objet vide quand rien n’est exploitable', () => {
    expect(brandMediansFrom([{ spend: 1, impressions: 10, linkClicks: 0, purchases: 0 }])).toEqual({});
  });

  it('ne médiane le CPA que sur les ads qui ont converti', () => {
    const med = brandMediansFrom([
      { spend: 30, impressions: 5000, linkClicks: 50, purchases: 1 },   // CPA 30
      { spend: 50, impressions: 5000, linkClicks: 50, purchases: 1 },   // CPA 50
      { spend: 90, impressions: 5000, linkClicks: 50, purchases: 0 },   // pas de CPA
    ]);
    expect(med.cpa).toBe(40);
  });
});

describe('rankByCpa', () => {
  it('classe du meilleur au pire', () => {
    const r = rankByCpa([{ adId: 'a', cpa: 30 }, { adId: 'b', cpa: 12 }, { adId: 'c', cpa: 45 }]);
    expect(r).toEqual({ b: 1, a: 2, c: 3 });
  });

  it('met les ads sans achat hors classement, à égalité', () => {
    const r = rankByCpa([{ adId: 'a', cpa: 30 }, { adId: 'b', cpa: null }, { adId: 'c', cpa: null }]);
    expect(r.a).toBe(1);
    expect(r.b).toBe(2);
    expect(r.c).toBe(2);
  });
});

describe('matchByName', () => {
  const cands = [
    { adId: '1', adName: 'TRUEFORDS_B12_LISTICLE_v1_HOOK' },
    { adId: '2', adName: 'TRUEFORDS_B12_LISTICLE_v2_HOOK' },
  ];

  it('rattache sur un nom identique à la ponctuation près', () => {
    expect(matchByName('truefords b12 listicle v1 hook', cands)).toBe('1');
  });

  it('rattache quand le nom réel porte un suffixe', () => {
    expect(matchByName('TRUEFORDS_B12_LISTICLE_v2_HOOK', [
      { adId: '9', adName: 'TRUEFORDS_B12_LISTICLE_v2_HOOK — copie 2026' },
    ])).toBe('9');
  });

  it('rattache sur les jetons dans le désordre', () => {
    expect(matchByName('v1 listicle b12', cands)).toBe('1');
  });

  it('refuse de trancher une ambiguïté', () => {
    // Deux annonces collent aussi bien : un rattachement au hasard produirait
    // des verdicts faux que personne ne songerait à contester.
    expect(matchByName('TRUEFORDS B12 LISTICLE HOOK', cands)).toBeNull();
  });

  it('rend null quand rien ne colle', () => {
    expect(matchByName('AUTRE_MARQUE_B1_v1', cands)).toBeNull();
  });

  it('rend null sur un nom attendu vide', () => {
    expect(matchByName('   ', cands)).toBeNull();
  });
});

describe('matchByBatchVariant', () => {
  const cands = [
    { adId: '1', adName: 'Truefords B12 - listicle v1' },
    { adId: '2', adName: 'Truefords B12 - listicle v2' },
    { adId: '3', adName: 'Truefords B3 - demo v1' },
  ];

  it('exige le lot ET la variante', () => {
    expect(matchByBatchVariant(12, 'v2', cands)).toBe('2');
    expect(matchByBatchVariant(3, 'v1', cands)).toBe('3');
  });

  it('ne rattache pas sur la variante seule', () => {
    // « v1 » se retrouve dans deux lots · sans le lot, c'est ambigu.
    expect(matchByBatchVariant(99, 'v1', cands)).toBeNull();
  });

  it('rend null si deux annonces du même lot portent la même variante', () => {
    expect(matchByBatchVariant(12, 'v1', [...cands, { adId: '4', adName: 'Truefords B12 bis v1' }])).toBeNull();
  });
});
