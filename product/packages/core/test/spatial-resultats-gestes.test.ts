import { describe, expect, it } from 'vitest';
import {
  redirectionTestProfond, redirectionVueAdsmap, lienFicheTest, lireFiltresTests, adresseTests, filtresTestsActifs, reperesTests, pastilleVerdict,
  controleArbitrage, lireCarte, libelleDecision, titreDecision, LIBELLE_DECISION, decompteCarte, sensDuSuite, outilsResultats, classeDecision, enJeuDecision, echeancePartage,
  COUT_PROPOSITION_CARTE, costFor, budgetPrevuLot, ecranSpatial, TAUX_NON_CALCULABLE,
  type FaitsLigneTest, type NoeudCarteFait,
} from '../src';

const ID = '0b7c6f1e-1d2a-4c3b-9e8f-112233445566';

describe('Spatial · Résultats · gestes · le lien profond de l’ancienne Adsmap ouvre la fiche', () => {
  it('`/adsmap?ad=<id>` mène à la fiche du test, le retour aux Studios conservé', () => {
    expect(redirectionTestProfond({ ad: ID })).toBe(`/adsmap/tests/${ID}`);
    expect(redirectionTestProfond({ ad: ID.toUpperCase(), depuis: 'studio' })).toBe(`/adsmap/tests/${ID}?depuis=studio`);
    expect(lienFicheTest(ID)).toBe(`/adsmap/tests/${ID}`);
  });
  it('un identifiant mal formé n’est jamais transmis · la vue d’ensemble s’affiche', () => {
    expect(redirectionTestProfond({})).toBeNull();
    expect(redirectionTestProfond({ ad: '../admin' })).toBeNull();
    expect(redirectionTestProfond({ ad: `${ID}' or 1=1` })).toBeNull();
  });
  it('les vues gardées dans l’adresse (`?vue=`) ouvrent l’écran qui les porte', () => {
    expect(redirectionVueAdsmap({ vue: 'table' })).toBe('/adsmap/tests');
    expect(redirectionVueAdsmap({ vue: 'carte' })).toBe('/adsmap/carte');
    expect(redirectionVueAdsmap({ vue: 'decider' })).toBe('/adsmap/decisions');
    expect(redirectionVueAdsmap({ vue: 'autre' })).toBeNull();
    expect(redirectionVueAdsmap({})).toBeNull();
  });
});

describe('Spatial · Résultats · gestes · les filtres de la table vivent dans l’adresse', () => {
  it('aller-retour exact, valeurs inconnues ignorées', () => {
    const f = { batchId: ID, status: 'live', verdict: 'winner', comparableOnly: true };
    const q = Object.fromEntries(new URL(`https://x.test${adresseTests(f)}`).searchParams);
    expect(lireFiltresTests(q)).toEqual(f);
    expect(lireFiltresTests({ lot: 'pas-un-uuid', statut: 'supprimee', verdict: 'genial', comparables: 'oui' })).toEqual({});
    expect(adresseTests({})).toBe('/adsmap/tests');
    expect(filtresTestsActifs({})).toBe(false);
    expect(filtresTestsActifs({ comparableOnly: true })).toBe(true);
  });
});

describe('Spatial · Résultats · gestes · les repères de la table ne gonflent rien', () => {
  const l = (o: Partial<FaitsLigneTest>): FaitsLigneTest => ({ status: 'live', verdict: null, verdictStatus: null, comparable: null, hypothesis: 'h', killFlag: null, ...o });
  it('sans test évaluable, le taux est « Non calculable », jamais 0 %', () => {
    const r = reperesTests([l({}), l({ verdict: 'inconclusive', comparable: true })]);
    expect(r.taux).toBe(TAUX_NON_CALCULABLE);
    expect(r.detailTaux).toBe('aucun test évaluable');
  });
  it('une gagnante non comparable est une piste, pas un succès · les compteurs suivent les faits', () => {
    const r = reperesTests([
      l({ verdict: 'winner', comparable: true, verdictStatus: 'computed' }),
      l({ verdict: 'winner', comparable: false, verdictStatus: 'validated' }),
      l({ verdict: 'loser', comparable: true, verdictStatus: 'validated', killFlag: 'burn' }),
      l({ status: 'ready', hypothesis: null }),
    ]);
    expect(r.taux).toBe('50 %');
    expect(r.aArbitrer).toBe(1);
    expect(r.aCouper).toBe(1);
    expect(r.sansHypothese).toBe(1);
    expect(r.comparables).toBe('67 %');
  });
  it('la pastille dit le verdict EFFECTIF', () => {
    expect(pastilleVerdict('winner', true)).toEqual({ libelle: 'Gagnante', classe: 'g', relatif: false });
    expect(pastilleVerdict('winner', false)).toEqual({ libelle: 'Prometteuse · relatif', classe: '', relatif: true });
    expect(pastilleVerdict('loser', true)!.classe).toBe('r');
    expect(pastilleVerdict(null, true)).toBeNull();
  });
});

describe('Spatial · Résultats · gestes · arbitrer exige ce que l’action exige', () => {
  it('un apprentissage trop court est refusé avant l’envoi', () => {
    expect(controleArbitrage({ calcule: 'winner', retenu: 'winner', motif: '', enonce: 'ok' })).toMatch(/pas seulement « ok »/);
  });
  it('s’écarter du calcul sans motif est refusé · avec motif, ça part', () => {
    const enonce = 'Une accroche chiffrée tient mieux que la question.';
    expect(controleArbitrage({ calcule: 'winner', retenu: 'loser', motif: '', enonce })).toMatch(/écartes du verdict calculé/);
    expect(controleArbitrage({ calcule: 'winner', retenu: 'loser', motif: 'Coupée par la modération au jour 2.', enonce })).toBeNull();
    expect(controleArbitrage({ calcule: 'winner', retenu: 'winner', motif: '', enonce })).toBeNull();
  });
});

describe('Spatial · Résultats · gestes · la carte montre les branches mortes là où elles sont', () => {
  const n = (id: string, kind: NoeudCarteFait['kind'], parentId: string | null, childCount: number, o: Partial<NoeudCarteFait> = {}): NoeudCarteFait => ({ id, kind, label: id, parentId, status: 'validated', childCount, ...o });
  const noeuds = [
    n('p1', 'persona', null, 2), n('p2', 'persona', null, 0),
    n('d1', 'desire', 'p1', 1), n('d2', 'desire', 'p1', 0),
    n('a1', 'angle', 'd1', 1, { mechanism: 'preuve sociale' }),
    n('c1', 'concept', 'a1', 2),
    n('v1', 'ad', 'c1', 0, { verdict: 'winner', comparable: true }), n('v2', 'ad', 'c1', 0, { verdict: 'loser', comparable: true }),
  ];
  it('un désir sans angle et une gagnante jamais itérée portent leur manque · l’itération porte sa variable', () => {
    const c = lireCarte(noeuds, [{ source: 'v1', target: 'v2', kind: 'iteration', label: 'Hook' }]);
    const d2 = c.arbre[0]!.enfants.find((x) => x.id === 'd2')!;
    expect(d2.manque).toMatch(/Désir jamais attaqué/);
    const ads = c.arbre[0]!.enfants[0]!.enfants[0]!.enfants[0]!.enfants;
    expect(ads.map((a) => [a.id, a.verdict?.libelle, a.iteration])).toEqual([['v1', 'Gagnante', null], ['v2', 'Perdante', 'Hook']]);
    // v1 a une itération (v2) · ce n'est plus un gisement dormant.
    expect(ads[0]!.manque).toBeNull();
    expect(decompteCarte(c.compte)).toBe('2 avatar(s) · 2 désir(s) · 1 angle(s) · 1 concept(s) · 2 ad(s) · 1 gagnante(s)');
  });
  it('une gagnante sans descendance est signalée · le filtre par avatar isole un arbre', () => {
    const c = lireCarte(noeuds, []);
    const v1 = c.arbre[0]!.enfants[0]!.enfants[0]!.enfants[0]!.enfants[0]!;
    expect(v1.manque).toMatch(/Gagnante jamais itérée/);
    expect(c.resume).toMatch(/1 gagnante\(s\) jamais itérée/);
    expect(lireCarte(noeuds, [], 'p2').arbre.map((a) => a.id)).toEqual(['p2']);
    expect(c.avatars.map((a) => a.id)).toEqual(['p1', 'p2']);
  });
});

describe('Spatial · Résultats · gestes · suites, décisions, partage', () => {
  it('« Décliner » ne promet pas une victoire non prouvée', () => {
    const GAGNE = 'Elle a gagné · on garde ce qui a gagné et on multiplie.';
    expect(sensDuSuite('more', GAGNE, true)).toBe(GAGNE);
    expect(sensDuSuite('more', GAGNE, false)).toMatch(/pas une victoire prouvée/);
    expect(sensDuSuite('better', 'Elle a buté sur un point précis.', false)).toBe('Elle a buté sur un point précis.');
  });
  it('une décision dit sa priorité et ce qui se joue, jamais « 0 € »', () => {
    expect([1, 2, 3, 4].map(classeDecision)).toEqual(['r', 'w', 'c', '']);
    expect(enJeuDecision(412.6)).toBe('413 € en jeu');
    expect(enJeuDecision(0)).toBeNull();
    expect(enJeuDecision(null)).toBeNull();
  });
  it('l’échéance d’un lien de partage se dit en clair', () => {
    expect(echeancePartage({ expired: true, expiresAt: '2026-01-01T00:00:00Z' })).toBe('Expiré');
    expect(echeancePartage({ expired: false, expiresAt: null })).toBe('Sans échéance');
    expect(echeancePartage({ expired: false, expiresAt: '2027-01-26T00:00:00Z' })).toMatch(/^Jusqu’au 26 janv\. 2027$/);
  });
  it('un membre ne voit pas les portes réservées (partage client, radar)', () => {
    expect(outilsResultats({ admin: false }).map((o) => o.href)).not.toContain('/adsmap/partage');
    expect(outilsResultats({ admin: false }).map((o) => o.href)).not.toContain('/adsmap/radar');
    expect(outilsResultats({ admin: true }).map((o) => o.href)).toEqual(expect.arrayContaining(['/adsmap/partage', '/adsmap/radar', '/adsmap/tests']));
  });
  it('le budget d’un lot est PRÉVU · sur un lot vide, le 0 € s’explique', () => {
    expect(budgetPrevuLot(0, 0)).toBe('0 € prévus · le total suit le nombre de variantes (aucune pour l’instant)');
    expect(budgetPrevuLot(1680, 4)).toBe('1\u202f680 € prévus au total');
    expect(budgetPrevuLot(1680, 4)).not.toContain('engagé');
  });
  it('le coût d’une proposition de carte vient du barème réel', () => {
    expect(COUT_PROPOSITION_CARTE).toBe(`${costFor('map_proposal')} crédits`);
  });
});

describe('Spatial · Résultats · gestes · chaque geste porté a son écran déclaré', () => {
  it.each(['/adsmap/tests', '/adsmap/tests/abc', '/adsmap/decisions', '/adsmap/carte', '/adsmap/partage', '/adsmap/suites', '/adsmap/tri', '/adsmap/radar', '/adsmap/essais', '/adsmap/jarvis'])('%s est servi par Spatial', (chemin) => {
    expect(ecranSpatial(chemin)).toMatchObject({ section: 'resultats' });
  });
});

describe('Spatial · Résultats · une décision se lit en français, avec un vrai titre', () => {
  const TYPES_EN_BASE = ['validate_verdict', 'review_learning', 'accept_iteration', 'kill_suggested', 'coverage_gap', 'unmapped_ad', 'protocol_violation', 'cro_handoff', 'prelaunch_warning', 'ai_budget_reached'];
  it('chaque type admis par la base a un libellé lisible · jamais la clé technique', () => {
    for (const t of TYPES_EN_BASE) {
      expect(libelleDecision(t), t).not.toMatch(/_/);
      expect(LIBELLE_DECISION[t], `${t} sans libellé`).toBeDefined();
    }
    expect(libelleDecision('review_learning')).toBe('Apprentissage à relire');
    expect(libelleDecision('type_inconnu')).toBe('Décision à examiner');
  });
  it('le titre enregistré prime · sinon le nom de ce qu’elle concerne · sinon une phrase honnête, jamais « n.c. »', () => {
    expect(titreDecision({ type: 'kill_suggested', titre: 'v1 brûle 80 €', cible: { kind: 'ad', nom: 'v1 · X' } })).toBe('v1 brûle 80 €');
    expect(titreDecision({ type: 'review_learning', titre: 'n.c.', cible: { kind: 'ad', nom: 'v2 · Listicle' } })).toBe('Test v2 · Listicle');
    expect(titreDecision({ type: 'protocol_violation', titre: undefined, cible: { kind: 'batch', nom: '#3 · Accroche' } })).toBe('Lot #3 · Accroche');
    expect(titreDecision({ type: 'coverage_gap', titre: '', cible: { kind: 'desire', nom: 'Gagner du temps' } })).toBe('Désir « Gagner du temps »');
    const perdu = titreDecision({ type: 'review_learning', titre: 'n.c.', cible: { kind: 'ad', nom: null } });
    expect(perdu).toMatch(/^Apprentissage à relire · ce qu’elle concerne n’est plus identifiable/);
    expect(perdu).not.toContain('n.c.');
  });
});
