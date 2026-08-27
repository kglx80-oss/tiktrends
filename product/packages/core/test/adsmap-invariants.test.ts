import { describe, it, expect } from 'vitest';
import {
  checkAdReady, checkIteration, checkVerdictValidation, checkVerdictComparability,
  wouldCreateCycle, iterationDepth, type AdShape,
} from '../src/adsmap/invariants';

/**
 * Les invariants §2.4 sont ce qui distingue ADSMAP du tableur qu'il remplace :
 * ils rendent impossibles, par construction, les défauts D2 (hypothèse jamais
 * remplie), D5 (filiation perdue) et D4 (apprentissages absents).
 */

const adPret: AdShape = {
  status: 'ready', adType: 'ideation',
  hypothesis: 'Le hook question porte le hook rate à 30 % (étape HOOK).',
  testedVariable: 'hook', offerId: 'off_1', landingPageId: 'lp_1',
};

describe('pas d’ad lancée sans test falsifiable', () => {
  it('une ad complète passe', () => {
    expect(checkAdReady(adPret)).toEqual([]);
  });

  it('un brouillon n’est jamais bloqué : on écrit avant de savoir', () => {
    expect(checkAdReady({ ...adPret, status: 'draft', hypothesis: null, testedVariable: null, offerId: null, landingPageId: null })).toEqual([]);
    expect(checkAdReady({ ...adPret, status: 'proposed', hypothesis: null, offerId: null })).toEqual([]);
  });

  it('l’hypothèse manquante bloque · c’est le défaut D2 du tableur', () => {
    const v = checkAdReady({ ...adPret, hypothesis: '   ' });
    expect(v.map((x) => x.rule)).toContain('ad.hypothesis');
  });

  it('« aucune variable » ne vaut pas variable testée', () => {
    expect(checkAdReady({ ...adPret, testedVariable: 'none_control' }).map((x) => x.rule)).toContain('ad.tested_variable');
  });

  it('offre et page de destination sont exigées · sinon un échec CONVERT est imputé à la créa', () => {
    const v = checkAdReady({ ...adPret, offerId: null, landingPageId: null });
    expect(v.map((x) => x.rule)).toEqual(['ad.offer', 'ad.landing_page']);
  });

  it('une ad LIVE est tenue aux mêmes règles qu’une ad READY', () => {
    expect(checkAdReady({ ...adPret, status: 'live', hypothesis: null })).toHaveLength(1);
  });

  it('chaque violation porte un message affichable, jamais un code', () => {
    for (const v of checkAdReady({ status: 'ready', adType: 'ideation' })) {
      expect(v.message.length).toBeGreaterThan(30);
      expect(v.message).not.toMatch(/null|undefined|_id\b/);
    }
  });
});

describe('une itération part d’un gagnant et change une variable', () => {
  const base = { childAdType: 'iteration' as const, parentVerdict: 'winner' as const, changedVariable: 'hook' as const, childAdId: 'a', parentAdId: 'b' };

  it('itérer un gagnant est valide', () => expect(checkIteration(base)).toEqual([]));
  it('itérer un gagnant naissant aussi', () => expect(checkIteration({ ...base, parentVerdict: 'baby_winner' })).toEqual([]));

  it('itérer un perdant est refusé', () => {
    expect(checkIteration({ ...base, parentVerdict: 'loser' }).map((x) => x.rule)).toContain('iteration.parent');
  });

  it('itérer un test non concluant est refusé', () => {
    expect(checkIteration({ ...base, parentVerdict: 'inconclusive' }).map((x) => x.rule)).toContain('iteration.parent');
  });

  it('une itération sans parent est refusée', () => {
    expect(checkIteration({ ...base, parentVerdict: null }).map((x) => x.rule)).toContain('iteration.parent');
  });

  it('une itération qui ne change rien est refusée', () => {
    expect(checkIteration({ ...base, changedVariable: 'none_control' }).map((x) => x.rule)).toContain('iteration.variable');
  });

  it('une ad ne peut pas être sa propre itération', () => {
    expect(checkIteration({ ...base, parentAdId: 'a' }).map((x) => x.rule)).toContain('iteration.self');
  });
});

describe('pas de verdict sans apprentissage', () => {
  it('valider sans apprentissage est refusé · c’est le défaut D4', () => {
    expect(checkVerdictValidation({ status: 'validated', validatedLearnings: 0 })).toHaveLength(1);
  });
  it('valider avec apprentissage passe', () => {
    expect(checkVerdictValidation({ status: 'validated', validatedLearnings: 1 })).toEqual([]);
  });
  it('un verdict seulement calculé n’exige rien : c’est la machine qui parle', () => {
    expect(checkVerdictValidation({ status: 'computed', validatedLearnings: 0 })).toEqual([]);
  });
});

describe('pas de gagnant absolu hors protocole', () => {
  it('WINNER exige un test comparable', () => {
    expect(checkVerdictComparability({ comparable: false, computed: 'winner' })).toHaveLength(1);
  });
  it('RELATIVE_WINNER est le plafond hors protocole', () => {
    expect(checkVerdictComparability({ comparable: false, computed: 'relative_winner' })).toEqual([]);
  });
  it('sous protocole, WINNER passe', () => {
    expect(checkVerdictComparability({ comparable: true, computed: 'winner' })).toEqual([]);
  });
});

describe('graphe d’itération sans cycle', () => {
  // b itère a, c itère b : chaîne a <- b <- c
  const chaine = [{ child: 'b', parent: 'a' }, { child: 'c', parent: 'b' }];

  it('allonger la chaîne est permis', () => {
    expect(wouldCreateCycle(chaine, { child: 'd', parent: 'c' })).toBe(false);
  });
  it('brancher une deuxième itération sur le même parent est permis', () => {
    expect(wouldCreateCycle(chaine, { child: 'e', parent: 'b' })).toBe(false);
  });
  it('reboucler sur l’ancêtre est refusé', () => {
    expect(wouldCreateCycle(chaine, { child: 'a', parent: 'c' })).toBe(true);
  });
  it('reboucler sur le parent direct est refusé', () => {
    expect(wouldCreateCycle(chaine, { child: 'a', parent: 'b' })).toBe(true);
  });
  it('l’auto-référence est refusée', () => {
    expect(wouldCreateCycle([], { child: 'a', parent: 'a' })).toBe(true);
  });
  it('un graphe vide accepte la première arête', () => {
    expect(wouldCreateCycle([], { child: 'b', parent: 'a' })).toBe(false);
  });

  it('la profondeur suit la filiation', () => {
    expect(iterationDepth(chaine, 'a')).toBe(0);
    expect(iterationDepth(chaine, 'b')).toBe(1);
    expect(iterationDepth(chaine, 'c')).toBe(2);
  });

  it('la profondeur ne boucle pas sur un graphe déjà corrompu', () => {
    // Sécurité : si un cycle a échappé au garde (import, écriture directe),
    // le calcul doit s'arrêter plutôt que tourner à l'infini.
    const cyclique = [{ child: 'a', parent: 'b' }, { child: 'b', parent: 'a' }];
    expect(iterationDepth(cyclique, 'a')).toBeLessThan(5);
  });
});
