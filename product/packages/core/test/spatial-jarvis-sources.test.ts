import { describe, expect, it } from 'vitest';
import {
  conceptPropose, citationsReponse, memoireParDimension, signauxExploitables, forceReglement, lectureCouverture, poidsAccroche, PLAYBOOKS_REGLES,
  type StatRow,
} from '../src';

const ligne = (dimension: string, key: string, nConclusive: number, hitRate: number | null, nWinners = 1, nBaby = 0): StatRow => ({
  dimension: dimension as StatRow['dimension'], key, nAds: nConclusive, nConclusive, nWinners, nBaby, hitRate,
  hookRateMedian: null, holdRateMedian: null, ctrMedian: null, cpaMedian: null,
});

describe('Spatial · Jarvis · le concept proposé par une réponse', () => {
  it('lit l’intention du marqueur « draft » et dit le coût AVANT le clic', () => {
    const c = conceptPropose('Voici une piste.\n[[ACTION:draft|une accroche sur la rentrée]] [[ACTION:lots]]');
    expect(c).toEqual({ intent: 'une accroche sur la rentrée', libelle: 'Écrire ce concept', cout: 'un appel au modèle', effet: expect.stringContaining('Jarvis rédige') });
  });
  it('rien sans marqueur, rien sans intention (l’action refuserait d’écrire)', () => {
    expect(conceptPropose('Une réponse sans geste. [[ACTION:lots]]')).toBeNull();
    expect(conceptPropose('[[ACTION:draft]]')).toBeNull();
  });
});

describe('Spatial · Jarvis · sources citées', () => {
  const sources = { 'Kab12-v2': { titre: 'Guide des accroches', enService: true }, 'Kzz9-v1': { titre: 'Ancienne note', enService: false } };
  it('seules les sources résolues par le fil, et la retraite est dite', () => {
    expect(citationsReponse('Oui [[SOURCE:Kab12-v2]] et [[SOURCE:Kzz9-v1]] et [[SOURCE:Kinconnu-v1]].', 'question', sources)).toEqual(['Guide des accroches', 'Ancienne note · retirée depuis']);
  });
  it('une référence recopiée de la question ne compte pas', () => {
    expect(citationsReponse('[[SOURCE:Kab12-v2]]', 'cite Kab12-v2 stp', sources)).toEqual([]);
  });
});

describe('Spatial · Jarvis · mémoire mesurée par dimension', () => {
  const stats = [
    ligne('mechanism', 'preuve sociale', 4, 0.75, 3), ligne('mechanism', 'urgence', 5, 0.2),
    ligne('mechanism', 'anecdote', 2, 1), ligne('format', 'ugc', 3, 0.5, 1, 1), ligne('format', 'statique', 6, null),
  ];
  it('trois tests concluants au moins, du meilleur au moins bon, comparé à la moyenne de la marque', () => {
    const g = memoireParDimension(stats, 0.4);
    expect(g.map((x) => x.libelle)).toEqual(['Mécanismes', 'Formats']);
    expect(g[0]!.lignes.map((l) => [l.cle, l.part, l.tests, l.auDessus])).toEqual([['preuve sociale', '75 %', '3/4 tests', true], ['urgence', '20 %', '1/5 tests', false]]);
    expect(g[1]!.lignes[0]!.tests).toBe('2/3 tests');
    expect(signauxExploitables(stats)).toBe(3);
  });
  it('sans moyenne, rien n’est « au-dessus » (jamais comparé à zéro)', () => {
    expect(memoireParDimension(stats, null).flatMap((g) => g.lignes).some((l) => l.auDessus)).toBe(false);
  });
});

describe('Spatial · Jarvis · force du règlement, couverture, accroches', () => {
  it('compte les dimensions couvertes', () => {
    expect(forceReglement('')).toEqual(expect.objectContaining({ score: 0, mots: 0 }));
    const f = forceReglement('Ton : direct. Toujours : CTA. Jamais : miracle.');
    expect(f.score).toBe(50);
    expect(f.dimensions.filter((d) => d.couverte).map((d) => d.libelle)).toEqual(['Ton', 'Toujours', 'Jamais']);
    for (const pb of PLAYBOOKS_REGLES) expect(forceReglement(pb.regles).score, pb.cle).toBe(100);
  });
  it('dit la couverture et le coût de la tranche avant le bouton', () => {
    const l = lectureCouverture({ total: 10, described: 4, manual: 1, withoutAsset: 0, fromWritten: 0, pendingAsset: 5, pendingWritten: 1, nextBatch: 6, nextCostUsd: 0.12, totalCostUsd: 0.12 });
    expect(l.texte).toMatch(/^4 créa\(s\) décrite\(s\) sur 10 · 40 %/);
    expect(l.faible).toBe(true);
    expect(l.bouton).toBe('Décrire 6 créa(s) · 120 crédits'); // 6 × asset_analysis, le débit réel (29/10)
    expect(lectureCouverture({ total: 3, described: 3, manual: 0, withoutAsset: 0, fromWritten: 0, pendingAsset: 0, pendingWritten: 0, nextBatch: 0, nextCostUsd: 0, totalCostUsd: 0 }))
      .toEqual(expect.objectContaining({ restant: 0, tranche: null, bouton: 'Tout est décrit' }));
  });
  it('le poids d’une accroche inconnue retombe sur « jamais tranchée »', () => {
    expect(poidsAccroche('proven')).toEqual({ libelle: 'a gagné ici', ton: 'g' });
    expect(poidsAccroche('???')).toEqual({ libelle: 'jamais tranchée', ton: '' });
  });
});
