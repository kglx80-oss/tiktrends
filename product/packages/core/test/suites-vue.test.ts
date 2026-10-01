import { describe, expect, it } from 'vitest';
import { resultatParentSuite, videSuites, lienFicheAdsmap } from '../src/adsmap/suites-vue';
import { lireFiltreSuites, ecrireFiltreSuites } from '../src/filtres-url';

describe('Suites · le résultat du parent se lit sur la carte', () => {
  it('gagnante prouvée, perdante avec son étape, gagnant non comparable = piste relative', () => {
    expect(resultatParentSuite({ verdict: 'winner', comparable: true, etapeLachee: null })).toBe('Résultat du test · Gagnante');
    expect(resultatParentSuite({ verdict: 'loser', comparable: true, etapeLachee: 'le clic' })).toBe('Résultat du test · Perdante · a lâché sur le clic');
    const r = resultatParentSuite({ verdict: 'winner', comparable: false, etapeLachee: null });
    expect(r, 'un gagnant non comparable passe pour prouvé').toContain('Prometteuse · relatif');
    expect(r).toContain('comparaison relative seulement');
  });
});

describe('Suites · état vide sans contradiction', () => {
  it('« arbitrés mais rien à itérer » ne dit pas « dès qu’un verdict est arbitré »', () => {
    expect(videSuites(4).pourquoi).toContain('4 test(s) arbitré(s)');
    expect(videSuites(4).pourquoi, 'contradiction avec le résumé').not.toContain('dès qu’un verdict est arbitré');
    expect(videSuites(0).pourquoi).toContain('dès qu’un verdict est arbitré');
  });
});

describe('Suites · liens et filtre', () => {
  it('le lien de production ouvre LA fiche, pas la carte nue', () => {
    expect(lienFicheAdsmap('ad-9')).toBe('/adsmap?ad=ad-9');
  });
  it('le mode vit dans l’URL, défaut omis, autres paramètres gardés', () => {
    expect(lireFiltreSuites('?mode=better')).toBe('better');
    expect(lireFiltreSuites('?mode=zzz')).toBe('all');
    expect(ecrireFiltreSuites('?x=1', 'new')).toBe('?x=1&mode=new');
    expect(ecrireFiltreSuites('?x=1&mode=new', 'all')).toBe('?x=1');
  });
});
