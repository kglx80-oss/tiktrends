import { describe, it, expect } from 'vitest';
import {
  controlerParole, suiteControleParole, nombreEnLettres, cleParole, motsParole,
  ECARTS_TOLERES, MESURE_CORPUS_PAROLE, REPRISES_PAROLE_MAX, PRISES_REELLES_MESUREES, EFFECTIF_PRISES_REELLES_MIN, modeControleParole,
} from '../src';
import { CORPUS_PAROLE, estVarianteParole } from '../src/studios/video/corpus-parole';

/**
 * Contrôle de la parole · la transcription d'une prise contre la réplique
 * validée. Le seuil est MESURÉ sur le corpus : ce test recompte chaque famille
 * et exige l'égalité avec le tableau écrit dans le module.
 */

const arrondi = (x: number) => Math.round(x * 1000) / 1000;

describe('corpus · le seuil mesuré', () => {
  it('le tableau du module est celui que le corpus donne aujourd’hui', () => {
    const mesure: Record<string, { paires: number; min: number; max: number; tauxMin: number; tauxMax: number }> = {};
    for (const p of CORPUS_PAROLE) {
      const v = controlerParole(p.replique, p.transcription);
      const m = mesure[p.famille] ?? { paires: 0, min: Infinity, max: -Infinity, tauxMin: Infinity, tauxMax: -Infinity };
      mesure[p.famille] = { paires: m.paires + 1, min: Math.min(m.min, v.ecarts), max: Math.max(m.max, v.ecarts), tauxMin: Math.min(m.tauxMin, arrondi(v.taux)), tauxMax: Math.max(m.tauxMax, arrondi(v.taux)) };
    }
    expect(mesure).toEqual(MESURE_CORPUS_PAROLE);
  });

  it('les familles sont séparées par le seuil · toute variante acceptée, tout écart refusé', () => {
    const maxVariantes = Math.max(...Object.entries(MESURE_CORPUS_PAROLE).filter(([f]) => f.startsWith('variante')).map(([, m]) => m.max));
    const minEcarts = Math.min(...Object.entries(MESURE_CORPUS_PAROLE).filter(([f]) => f.startsWith('écart')).map(([, m]) => m.min));
    expect(maxVariantes).toBeLessThanOrEqual(ECARTS_TOLERES);
    expect(minEcarts).toBeGreaterThan(ECARTS_TOLERES);
    // Un taux ne séparerait pas : le plus petit taux d'un vrai écart est sous 5 %.
    expect(MESURE_CORPUS_PAROLE['écart · mot manquant']!.tauxMin).toBeLessThan(0.05);
  });

  it.each(CORPUS_PAROLE.map((p) => [p.famille, p.replique, p.transcription] as const))('%s · « %s » / « %s »', (famille, replique, transcription) => {
    const v = controlerParole(replique, transcription);
    if (estVarianteParole(famille)) {
      expect(v, v.raison).toMatchObject({ conforme: true, ecarts: 0, raison: '' });
    } else {
      expect(v.conforme).toBe(false);
      expect(v.raison).toMatch(/^La prise ne dit pas la réplique validée · /);
    }
  });

  it('une tolérance d’UN écart laisserait passer 14 des 25 vrais écarts (l’en-tête le dit)', () => {
    const ecarts = CORPUS_PAROLE.filter((p) => !estVarianteParole(p.famille)).map((p) => controlerParole(p.replique, p.transcription).ecarts);
    expect(ecarts).toHaveLength(25);
    expect(ecarts.filter((e) => e <= 1)).toHaveLength(14);
  });
});

describe('ce qui est dit dans la raison', () => {
  it('mot manquant nommé · « sans sulfate » devenu « sulfate »', () => {
    expect(controlerParole('Un shampooing sans sulfate.', 'Un shampooing sulfate.')).toMatchObject({
      conforme: false, ecarts: 1, manquants: ['sans'], ajoutes: [], remplaces: [],
      raison: 'La prise ne dit pas la réplique validée · manque « sans ».',
    });
  });
  it('mot ajouté et mot remplacé nommés', () => {
    const v = controlerParole('Découvre la crème Lumina.', 'Bonjour, découvre la crème Lumière.');
    expect(v).toMatchObject({ ecarts: 2, ajoutes: ['Bonjour'], remplaces: [{ attendu: 'Lumina', dit: 'Lumière' }] });
    expect(v.raison).toBe('La prise ne dit pas la réplique validée · en trop « Bonjour » · « Lumina » dit « Lumière ».');
  });
  it('silence · aucun mot prononcé', () => {
    expect(controlerParole('Découvre notre crème.', '').raison).toBe('La prise ne dit pas la réplique validée · aucun mot n’est prononcé dans la prise.');
  });
  it('réplique vide · rien à comparer, jamais conforme', () => {
    expect(controlerParole('', 'Bonjour')).toMatchObject({ conforme: false, raison: 'Aucune réplique validée à comparer.' });
  });
});

describe('normalisation', () => {
  it('nombres en lettres · formes françaises', () => {
    expect([0, 1, 16, 17, 21, 71, 80, 81, 91, 99, 100, 101, 200, 1000, 1001, 2024, 25_000, 1_000_000].map(nombreEnLettres)).toEqual([
      'zero', 'un', 'seize', 'dix sept', 'vingt et un', 'soixante et onze', 'quatre vingt', 'quatre vingt un', 'quatre vingt onze', 'quatre vingt dix neuf',
      'cent', 'cent un', 'deux cent', 'mille', 'mille un', 'deux mille vingt quatre', 'vingt cinq mille', 'un million',
    ]);
    expect(nombreEnLettres(-1)).toBeNull();
    expect(nombreEnLettres(1.5)).toBeNull();
  });
  it('clé · accents, casse, apostrophes, finales muettes, homophones', () => {
    expect(['À', 'Où', 'C’est', "s'est", 'Ces', 'Produits', 'hydratez', 'hydraté', 'peux', 'sont'].map(cleParole)).toEqual(['a', 'ou', 'ses', 'ses', 'ses', 'produit', 'hydrate', 'hydrate', 'peu', 'son']);
    // Un mot hors de la liste n'est jamais rapproché d'un autre.
    expect(cleParole('gras')).not.toBe(cleParole('grave'));
    expect(cleParole('sous')).not.toBe(cleParole('sans'));
  });
  it('mots · ponctuation et tirets retirés, prix et pourcentages en lettres', () => {
    expect(motsParole('-20 % sur 9,99 € !').map((m) => m.cle)).toEqual(['moin', 'vingt', 'pour', 'cent', 'sur', 'neuf', 'euro', 'quatre', 'vingt', 'dix', 'neuf']);
  });
});

describe('suite d’un contrôle · au plus une reprise, seulement si approuvée', () => {
  const prix = { credits: 25, usdMicros: 610_000 };
  const ecart = controlerParole('Un shampooing sans sulfate.', 'Un shampooing sulfate.');
  it('conforme ⇒ rien à faire', () => {
    expect(suiteControleParole({ verdict: controlerParole('Bonjour.', 'bonjour'), reprisesFaites: 0, repriseApprouvee: false, prixReprise: prix, mode: 'decision' })).toEqual({ suite: 'conforme', raison: '' });
  });
  it('écart, reprise approuvée au devis, aucune faite ⇒ reprendre', () => {
    expect(suiteControleParole({ verdict: ecart, reprisesFaites: 0, repriseApprouvee: true, prixReprise: prix, mode: 'decision' })).toMatchObject({ suite: 'reprendre' });
  });
  it('écart, aucune reprise approuvée ⇒ proposition de reprise AVEC son prix, jamais lancée', () => {
    expect(suiteControleParole({ verdict: ecart, reprisesFaites: 0, repriseApprouvee: false, prixReprise: prix, mode: 'decision' })).toEqual({ suite: 'proposer_reprise', raison: ecart.raison, prix });
  });
  it('écart après la reprise autorisée ⇒ revue humaine, plus aucune relance (même approuvée)', () => {
    expect(REPRISES_PAROLE_MAX).toBe(1);
    const s = suiteControleParole({ verdict: ecart, reprisesFaites: 1, repriseApprouvee: true, prixReprise: prix, mode: 'decision' });
    expect(s.suite).toBe('revue');
    expect(s.raison).toMatch(/aucune relance/);
  });
});

describe('normalisation · heures, ordinaux, numéros, « OK »', () => {
  it.each([
    ['Rendez-vous à 14h30.', 'Rendez-vous à quatorze heures trente.'],
    ['Rendez-vous à 14 h 30.', 'Rendez-vous à 14h30.'],
    ['Le 2e flacon est offert.', 'Le deuxième flacon est offert.'],
    ['Le 5ème jour.', 'Le cinquième jour.'],
    ['Le 9e essai.', 'Le neuvième essai.'],
    ['Le n°1 des ventes.', 'Le numéro un des ventes.'],
    ['OK, on y va.', 'Okay, on y va.'],
  ])('« %s » ≡ « %s »', (a, b) => {
    expect(controlerParole(a, b)).toMatchObject({ conforme: true, ecarts: 0 });
  });
  it('un ordinal différent reste un écart', () => {
    expect(controlerParole('Le 2e flacon.', 'Le troisième flacon.').remplaces).toEqual([{ attendu: 'deuxieme', dit: 'troisième' }]);
  });
  it('« euh » est un écart (hésitation audible dans une publicité) · décision documentée', () => {
    expect(controlerParole('Une peau douce.', 'Une peau euh douce.').ajoutes).toEqual(['euh']);
  });
});

describe('observation d’abord · tant que le seuil n’est pas mesuré sur de vraies prises', () => {
  it('aucune vraie prise mesurée ⇒ mode observation', () => {
    expect(PRISES_REELLES_MESUREES).toEqual([]);
    expect(modeControleParole()).toBe('observation');
    expect(EFFECTIF_PRISES_REELLES_MIN).toBeGreaterThan(0);
  });
  it('en observation · un écart est noté, ni reprise proposée ni revue', () => {
    const ecart = controlerParole('Un shampooing sans sulfate.', 'Un shampooing sulfate.');
    const s = suiteControleParole({ verdict: ecart, reprisesFaites: 0, repriseApprouvee: true, prixReprise: { credits: 25, usdMicros: 610_000 }, mode: 'observation' });
    expect(s).toEqual({ suite: 'observation', raison: ecart.raison });
  });
  it('le mode décision ne s’ouvre qu’avec l’effectif', () => {
    const p = { famille: 'variante · nombres' as const, replique: 'a', transcription: 'a' };
    expect(modeControleParole(Array.from({ length: EFFECTIF_PRISES_REELLES_MIN - 1 }, () => p))).toBe('observation');
    expect(modeControleParole(Array.from({ length: EFFECTIF_PRISES_REELLES_MIN }, () => p))).toBe('decision');
  });
});
