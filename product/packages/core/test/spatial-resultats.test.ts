import { describe, expect, it } from 'vitest';
import {
  etatLotSpatial, lotPretAConclure, pastilleLotsAConclure, presentationLot, syntheseLot, barresCpa, segmentsHypothese,
  dansFiltreLots, FILTRES_LOTS, indexLotVedette, indexAutresLots, preparationLot, prochaineActionBoucle, controlesLot,
  kpisResultats, cartesHypotheses, categoriesHypotheses, niveauPreuveApprentissage, etatApprentissage, preuveApprentissage,
  garantiesProtocole, lireVolume, optionsPeriode, kpisBoucle, sousNavResultats, quandCourt, remontees, accrocheResultats,
  buildDecisions, ECRANS_SPATIAUX, ecranSpatial,
  type FaitsAdSpatial, type FaitsLotSpatial, type FaitsVerdictSpatial, type EtatLotSpatial, type VerdictValue,
} from '../src';

const MAINTENANT = new Date('2026-10-27T12:00:00Z');
const CTX = { maintenant: MAINTENANT, fenetreJours: 7 };
const ilYa = (j: number) => new Date(MAINTENANT.getTime() - j * 86_400_000).toISOString();

const verdict = (calcule: VerdictValue | null, o: Partial<FaitsVerdictSpatial> = {}): FaitsVerdictSpatial => ({
  calcule, retenu: null, statut: 'computed', comparable: true, raison: 'r', depense: 100, impressions: 6000, achats: 3, cpa: 30, ...o,
});
const ad = (id: string, v: FaitsVerdictSpatial | null, o: Partial<FaitsAdSpatial> = {}): FaitsAdSpatial => ({
  id, variante: id, statut: 'live', hypothese: 'Si on change l’accroche, alors on retient plus.', variable: 'hook', plateforme: 'meta',
  texte: 't', image: null, manques: [], verdict: v, ...o,
});
const lot = (o: Partial<FaitsLotSpatial> = {}): FaitsLotSpatial => ({
  id: 'l1', numero: 1, but: 'Accroche', statut: 'testing', lanceLe: ilYa(8), protocole: { conforme: true, resume: 'ok' },
  ads: [ad('v1', verdict('winner')), ad('v2', verdict('loser'))], ...o,
});

describe('Spatial · Résultats · état d’un lot (quand est-il prêt à conclure ?)', () => {
  it('un lot lancé, fenêtre écoulée, tout mesuré, un verdict tranché en attente · à conclure', () => {
    expect(etatLotSpatial(lot(), CTX)).toBe('a_conclure');
    expect(lotPretAConclure(lot(), CTX)).toBe(true);
  });

  it('la fenêtre se compte en jours ENTIERS depuis le lancement · 6 j 23 h ne suffisent pas, 7 j oui', () => {
    expect(etatLotSpatial(lot({ lanceLe: new Date(MAINTENANT.getTime() - (7 * 86_400_000 - 3_600_000)).toISOString() }), CTX)).toBe('diffusion');
    expect(etatLotSpatial(lot({ lanceLe: ilYa(7) }), CTX)).toBe('a_conclure');
  });

  it('une variante sans mesure bloque la conclusion · à importer', () => {
    expect(etatLotSpatial(lot({ ads: [ad('v1', verdict('winner')), ad('v2', null)] }), CTX)).toBe('a_importer');
    expect(etatLotSpatial(lot({ ads: [] }), CTX)).toBe('a_importer');
    // Une ligne de verdict sans calcul (rien n'a été mesuré) ne vaut pas une mesure.
    expect(etatLotSpatial(lot({ ads: [ad('v1', verdict('winner')), ad('v2', verdict(null))] }), CTX)).toBe('a_importer');
  });

  it('le silence est une conclusion · que des non concluants en attente ⇒ non concluant, jamais « à conclure »', () => {
    const l = lot({ ads: [ad('v1', verdict('inconclusive')), ad('v2', verdict('insufficient_delivery'))] });
    expect(etatLotSpatial(l, CTX)).toBe('non_concluant');
    expect(lotPretAConclure(l, CTX)).toBe(false);
  });

  it('tout arbitré ⇒ conclu · même si le lot reste « testing » en base', () => {
    const fait = (v: VerdictValue) => verdict(v, { statut: 'validated', retenu: v });
    expect(etatLotSpatial(lot({ ads: [ad('v1', fait('winner')), ad('v2', fait('loser'))] }), CTX)).toBe('conclu');
  });

  it('un historique importé (analysé sans lancement) ne se conclut jamais', () => {
    expect(etatLotSpatial(lot({ statut: 'analyzed', lanceLe: null }), CTX)).toBe('importe');
  });

  it('préparation · composition et prêt suivent le statut du lot, avant tout lancement', () => {
    expect(etatLotSpatial(lot({ statut: 'planned', lanceLe: null }), CTX)).toBe('composition');
    expect(etatLotSpatial(lot({ statut: 'in_production', lanceLe: null }), CTX)).toBe('composition');
    expect(etatLotSpatial(lot({ statut: 'ready', lanceLe: null }), CTX)).toBe('pret');
  });

  it('sans date de lancement lisible, on ne suppose jamais la fenêtre écoulée', () => {
    expect(etatLotSpatial(lot({ lanceLe: null }), CTX)).toBe('diffusion');
    expect(etatLotSpatial(lot({ lanceLe: 'pas une date' }), CTX)).toBe('diffusion');
  });

  it('même règle que la file de décisions · un lot « à conclure » y produit un `validate_verdict`, un lot en diffusion aucun', () => {
    const decisions = (l: FaitsLotSpatial) => buildDecisions({
      ads: l.ads.map((a) => ({
        id: a.id, label: a.variante, status: a.statut, verdict: a.verdict?.calcule ?? null, verdictStatus: a.verdict?.statut ?? null,
        killFlag: null, spend: a.verdict?.depense ?? null, matched: true, hasIteration: false,
        daysSinceLaunch: Math.floor((MAINTENANT.getTime() - Date.parse(l.lanceLe!)) / 86_400_000),
      })),
      batches: [], gaps: [], evaluationWindowDays: CTX.fenetreJours,
    }).filter((d) => d.type === 'validate_verdict');
    expect(decisions(lot()).length).toBeGreaterThan(0);
    expect(decisions(lot({ lanceLe: ilYa(3) }))).toEqual([]);
    expect(etatLotSpatial(lot({ lanceLe: ilYa(3) }), CTX)).toBe('diffusion');
    const muet = lot({ ads: [ad('v1', verdict('inconclusive'))] });
    expect(decisions(muet)).toEqual([]);
    expect(lotPretAConclure(muet, CTX)).toBe(false);
  });
});

describe('Spatial · Résultats · la pastille du rail', () => {
  it('absente sans lot prêt à conclure', () => {
    expect(pastilleLotsAConclure([])).toBeNull();
    expect(pastilleLotsAConclure(['diffusion', 'a_importer', 'non_concluant', 'conclu', 'importe', 'composition', 'pret'])).toBeNull();
  });
  it('un point d’état (`badge`, sans valeur) dès un lot à conclure, libellé compté', () => {
    expect(pastilleLotsAConclure(['diffusion', 'a_conclure'])).toEqual({ classe: 'badge', valeur: '', libelle: 'Un lot à conclure' });
    expect(pastilleLotsAConclure(['a_conclure', 'a_conclure', 'conclu'])).toEqual({ classe: 'badge', valeur: '', libelle: '2 lots à conclure' });
  });
});

describe('Spatial · Résultats · présentation et synthèse', () => {
  it('la synthèse reprend le verdict du moteur · gagnante au protocole, jamais une prometteuse relative', () => {
    const s = syntheseLot(lot({ ads: [ad('v1', verdict('loser', { cpa: 60 })), ad('v2', verdict('baby_winner', { cpa: 40 })), ad('v3', verdict('winner', { cpa: 33 }))] }), 35);
    expect(s).toMatchObject({ gagnante: 'v3', titre: 'v3 · Gagnante', niveau: 3 });
    // Gagnante NON comparable · rétrogradée en prometteuse, jamais présentée gagnante.
    const r = syntheseLot(lot({ ads: [ad('v1', verdict('winner', { comparable: false }))] }), 35);
    expect(r.gagnante).toBeNull();
    expect(r.titre).toBe('v1 · Prometteuse · relatif');
    expect(r.niveau).toBe(2);
    const vide = syntheseLot(lot({ ads: [ad('v1', null)] }), 35);
    expect(vide).toMatchObject({ gagnante: null, titre: 'Pas encore de verdict', niveau: 1 });
    const perdu = syntheseLot(lot({ ads: [ad('v1', verdict('loser')), ad('v2', verdict('inconclusive'))] }), 35);
    expect(perdu.titre).toBe('Aucune gagnante');
    expect(perdu.phrase).toBe('1 perdante, 1 non concluant · aucune ne tient la cible de 35 € par achat.');
  });

  it('les barres de CPA · la moins chère au plus haut, une variante sans achat à zéro', () => {
    expect(barresCpa([ad('a', verdict('winner', { cpa: 20 })), ad('b', verdict('loser', { cpa: 40 })), ad('c', verdict('inconclusive', { cpa: null })), ad('d', null)]))
      .toEqual([{ id: 'a', libelle: '20 €', part: 100 }, { id: 'b', libelle: '40 €', part: 50 }, { id: 'c', libelle: 'aucun achat', part: 0 }, { id: 'd', libelle: 'en mesure', part: 0 }]);
  });

  it('présentation · jour plafonné à la fenêtre, anneau, action et lien vers la fiche', () => {
    const d = presentationLot(lot({ lanceLe: ilYa(2) }), CTX);
    expect(d).toMatchObject({ etat: 'diffusion', jour: 3, anneau: { part: 43, libelle: 'J3', classe: 'c' }, action: { libelle: 'Suivre', href: '/adsmap/lots/l1' } });
    expect(presentationLot(lot(), CTX)).toMatchObject({ jour: 7, anneau: { part: 100, libelle: 'J7', classe: 'g' }, action: { libelle: 'Conclure', primaire: true } });
    expect(presentationLot(lot({ ads: [ad('v1', null)] }), CTX).action.href).toBe('/adsmap/import');
    expect(presentationLot(lot({ statut: 'planned', lanceLe: null }), CTX)).toMatchObject({ jour: null, anneau: { part: 0, libelle: '–' } });
  });

  it('les filtres · chaque état dans un seul groupe, « Tous » voit tout', () => {
    const etats: EtatLotSpatial[] = ['composition', 'pret', 'diffusion', 'a_importer', 'a_conclure', 'non_concluant', 'conclu', 'importe'];
    for (const e of etats) {
      expect(dansFiltreLots(e, 'tous')).toBe(true);
      expect(FILTRES_LOTS.filter((f) => f.cle !== 'tous' && dansFiltreLots(e, f.cle)).length).toBeLessThanOrEqual(1);
    }
    expect(dansFiltreLots('pret', 'preparation')).toBe(true);
    expect(dansFiltreLots('a_conclure', 'conclure')).toBe(true);
  });

  it('« Si », « alors », « parce que » en gras · pas « Simple » ni « alorsque »', () => {
    expect(segmentsHypothese('Si on montre, alors ça clique, parce que les avis.')).toEqual([
      { texte: 'Si', fort: true }, { texte: ' on montre, ', fort: false }, { texte: 'alors', fort: true },
      { texte: ' ça clique, ', fort: false }, { texte: 'parce que', fort: true }, { texte: ' les avis.', fort: false },
    ]);
    expect(segmentsHypothese('Simple, alorsque rien')).toEqual([{ texte: 'Simple, alorsque rien', fort: false }]);
  });

  it('vedette · le premier lot à conclure, sinon le plus récent avec un verdict · les autres par urgence', () => {
    const lots = [{ etat: 'diffusion' as const, aDesVerdicts: false }, { etat: 'conclu' as const, aDesVerdicts: true }, { etat: 'a_conclure' as const, aDesVerdicts: true }, { etat: 'a_importer' as const, aDesVerdicts: false }];
    expect(indexLotVedette(lots)).toBe(2);
    expect(indexAutresLots(lots, 2)).toEqual([3, 0, 1]);
    expect(indexLotVedette([{ etat: 'composition', aDesVerdicts: false }])).toBe(-1);
  });

  it('préparation en quatre étapes réelles', () => {
    expect(preparationLot(lot({ statut: 'planned', ads: [] }), 0)).toEqual({ fait: 0, sur: 4 });
    expect(preparationLot(lot({ statut: 'planned', ads: [ad('a', null, { manques: ['l’offre'] })] }), 0).fait).toBe(1);
    expect(preparationLot(lot({ statut: 'ready', ads: [ad('a', null)] }), 1).fait).toBe(4);
  });

  it('prochaine action · conclure d’abord, puis importer, lancer, préparer, suites, hypothèses', () => {
    const pl = (l: FaitsLotSpatial) => ({ presentation: presentationLot(l, CTX), synthese: syntheseLot(l, 35) });
    expect(prochaineActionBoucle([pl(lot({ statut: 'ready', lanceLe: null })), pl(lot({ id: 'l2', numero: 2 }))], true)).toMatchObject({ titre: 'Conclure le lot #2', href: '/adsmap/lots/l2' });
    expect(prochaineActionBoucle([pl(lot({ statut: 'ready', lanceLe: null }))], true).titre).toBe('Lancer le lot #1');
    expect(prochaineActionBoucle([], true).href).toBe('/adsmap/suites');
    expect(prochaineActionBoucle([], false).href).toBe('/adsmap/hypotheses');
  });

  it('les contrôles de la fiche disent ce qui est, y compris l’absence', () => {
    const c = controlesLot(lot({ protocole: null, ads: [ad('a', null)], lanceLe: ilYa(2) }), presentationLot(lot({ lanceLe: ilYa(2) }), CTX), 5000);
    expect(c.map((x) => x.titre)).toEqual(['3 jours sur 7', 'Aucune mesure', 'Protocole à contrôler']);
    const ok = controlesLot(lot(), presentationLot(lot(), CTX), 5000);
    expect(ok.map((x) => x.titre)).toEqual(['7 jours sur 7', `${(6000).toLocaleString('fr-FR')} impressions`, 'Règle respectée']);
  });

  it('l’accroche compte, elle n’interprète pas', () => {
    const s = syntheseLot(lot(), 35);
    expect(accrocheResultats({ numero: 1, synthese: s, aConclure: true }, 2)).toEqual({ avant: 'Le lot #1 est prêt à donner sa réponse :', fort: 'v1 · Gagnante.', apres: '2 autres attendent une action de ta part.' });
    expect(accrocheResultats(null, 0).apres).toBe('Prépare un lot pour ouvrir la boucle.');
  });
});

describe('Spatial · Résultats · indicateurs de la vue d’ensemble', () => {
  it('ratios réels, écarts seulement avec une période précédente mesurée, « up » = amélioration', () => {
    const k = kpisResultats({ depense: 1000, impressions: 10000, vues3s: 2400, achats: 50, ventes: 2000 }, { depense: 800, impressions: 10000, vues3s: 2100, achats: 40, ventes: 1800 });
    expect(k.map((x) => [x.valeur, x.delta, x.classe])).toEqual([
      ['24 %', '+3 pts', 'up'], ['20,00 €', '0,00 €', ''], ['2,00', '−0,25', ''], [`${(1000).toLocaleString('fr-FR')} €`, '+25,0 %', ''],
    ]);
    const seul = kpisResultats({ depense: 0, impressions: 0, vues3s: 0, achats: 0, ventes: 0 }, null);
    expect(seul.map((x) => x.valeur)).toEqual(['–', '–', '–', '0 €']);
    expect(seul.every((x) => x.delta === '')).toBe(true);
    // Un coût par achat qui baisse est une amélioration.
    expect(kpisResultats({ depense: 900, impressions: 1, vues3s: 0, achats: 60, ventes: 0 }, { depense: 1000, impressions: 1, vues3s: 0, achats: 50, ventes: 0 })[1]).toMatchObject({ delta: '−5,00 €', classe: 'up' });
  });
});

describe('Spatial · Résultats · hypothèses', () => {
  it('chaque ad va dans sa colonne · aucune hypothèse inventée, aucun bouton vers nulle part', () => {
    const c = cartesHypotheses([
      { ad: ad('a', null, { statut: 'draft', hypothese: null, variable: null, manques: ['l’hypothèse', 'la variable testée'] }), concept: 'C', lot: null, bande: null },
      { ad: ad('b', null, { statut: 'draft' }), concept: 'C', lot: null, bande: 'high' },
      { ad: ad('c', null, { statut: 'ready' }), concept: 'C', lot: { id: 'l3', numero: 3, etat: 'pret', jour: null }, bande: 'med' },
      { ad: ad('d', verdict(null), { statut: 'live' }), concept: 'C', lot: { id: 'l2', numero: 2, etat: 'diffusion', jour: 6 }, bande: 'low' },
      { ad: ad('e', verdict('winner', { statut: 'validated', retenu: 'winner' }), { statut: 'done' }), concept: 'C', lot: null, bande: null },
      { ad: ad('f', verdict('winner', { statut: 'validated', retenu: 'winner', comparable: false }), { statut: 'done' }), concept: 'C', lot: null, bande: null },
    ], [{ adId: 'p', libelle: 'C · v1', variable: 'format', etape: 'le clic', raison: 'Change le format.', priorite: 0 }]);
    const par = Object.fromEntries(c.map((x) => [x.cle, x]));
    expect(par.a).toMatchObject({ colonne: 'formuler', action: null, categorie: 'Variable à choisir', texte: 'C · a · hypothèse à écrire', meta: 'Il manque l’hypothèse et la variable testée' });
    expect(par.b).toMatchObject({ colonne: 'prete', priorite: 3, action: { href: '/adsmap/lots' } });
    expect(par.c).toMatchObject({ colonne: 'prete', priorite: 2, action: { libelle: 'Lot #3 · prêt', href: '/adsmap/lots/l3' } });
    expect(par.d).toMatchObject({ colonne: 'test', priorite: 1, action: { libelle: 'Lot #2 · J6' } });
    expect(par.e!.conclusion).toEqual({ libelle: 'Confirmée', classe: 'g', icone: 'check' });
    expect(par.f!.conclusion!.libelle).toBe('Prometteuse · relatif');
    expect(par['suite-p-format']).toMatchObject({ colonne: 'formuler', categorie: 'Format', priorite: 3, action: { href: '/adsmap/suites' } });
    expect(categoriesHypotheses(c)[0]).toEqual({ cle: 'tous', libelle: 'Toutes', n: 7 });
  });
});

describe('Spatial · Résultats · apprentissages', () => {
  const base = { id: 'x', enonce: 'e', statut: 'validated', refute: false, source: 'arbitrage', creeLe: '2026-10-11T00:00:00Z' };
  it('niveau de preuve · mesuré seulement arbitré, comparable et tranché', () => {
    const lie = (v: FaitsVerdictSpatial | null) => ({ ...ad('a', v), lot: { id: 'l', numero: 1 } });
    expect(niveauPreuveApprentissage({ ...base, ad: lie(verdict('winner', { statut: 'validated', retenu: 'winner' })) })).toBe(3);
    expect(niveauPreuveApprentissage({ ...base, ad: lie(verdict('winner', { comparable: false, retenu: 'winner' })) })).toBe(2);
    expect(niveauPreuveApprentissage({ ...base, ad: lie(verdict('inconclusive', { retenu: 'inconclusive' })) })).toBe(2);
    expect(niveauPreuveApprentissage({ ...base, source: 'import Sheet', ad: lie(verdict(null, { retenu: 'winner', comparable: false })) })).toBe(2);
    expect(niveauPreuveApprentissage({ ...base, source: 'import Sheet', ad: null })).toBe(1);
    // Mesuré exige un ARBITRAGE dans l'outil · un constat importé n'y monte jamais, même comparable.
    expect(niveauPreuveApprentissage({ ...base, source: 'import Sheet', ad: lie(verdict('winner', { statut: 'validated', retenu: 'winner' })) })).toBe(2);
    expect(etatApprentissage({ ...base, ad: null, refute: true })).toBe('retester');
    expect(etatApprentissage({ ...base, ad: null })).toBe('valide');
  });
  it('preuve chiffrée · seulement si deux variantes ont un CPA · la plus chère à gauche', () => {
    const lotAds = [ad('a', verdict('winner', { cpa: 20 })), ad('b', verdict('loser', { cpa: 40 })), ad('c', verdict('loser', { cpa: 50 }))];
    const p = preuveApprentissage('a', lotAds)!;
    expect(p.map((x) => [x.ad.id, x.libelle, x.part, x.gagne])).toEqual([['b', '40 €', 50, false], ['a', '20 €', 100, true]]);
    expect(preuveApprentissage('a', [lotAds[0]!])).toBeNull();
    expect(preuveApprentissage('z', lotAds)).toBeNull();
  });
});

describe('Spatial · Résultats · protocole, import, boucle, navigation', () => {
  it('garanties · ce que l’outil fait respecter, CBO dit relatif', () => {
    expect(garantiesProtocole({ structure: 'abo_one_adset_per_ad', cibleCpa: 35, multiplePerdante: 1.5 }).map((g) => g.ok)).toEqual([true, true, true, true]);
    const cbo = garantiesProtocole({ structure: 'cbo_tolerated', cibleCpa: 35, multiplePerdante: 1.5 });
    expect(cbo[0]).toEqual({ ok: false, texte: 'Budget réparti par Meta (CBO) · les verdicts ne seront que relatifs' });
    expect(cbo[3]!.texte).toBe('Arrêt suggéré si, même au mieux, le coût par achat dépasse 1,5× la cible (53 €)');
  });
  it('volume et période', () => {
    expect(lireVolume('15 000 impressions / variante')).toBe(15000);
    expect(lireVolume('beaucoup')).toBeNull();
    expect(lireVolume('0')).toBeNull();
    expect(optionsPeriode(7)).toEqual([7, 14, 21]);
    expect(optionsPeriode(10)).toEqual([7, 10, 14, 21]);
  });
  it('remontées · les deux faits qui existent, les plus récents d’abord', () => {
    const r = remontees({ mesureLe: '2026-10-27T10:00:00Z', variantesMesurees: 3, lotsImportes: [{ numero: 4, variantes: 2, le: '2026-10-26T10:00:00Z' }, { numero: 1, variantes: 1, le: '2026-10-28T10:00:00Z' }] });
    expect(r.map((x) => x.texte)).toEqual(['Tableau · Lot #1 · 1 variante', 'Mesure Meta · 3 variantes avec un verdict calculé', 'Tableau · Lot #4 · 2 variantes']);
    expect(remontees({ mesureLe: null, variantesMesurees: 0, lotsImportes: [] })).toEqual([]);
    expect(quandCourt('2026-10-27T10:00:00Z', MAINTENANT)).toBe('il y a 2 h');
    expect(quandCourt('2026-10-26T06:00:00Z', MAINTENANT)).toBe('hier');
    expect(quandCourt('2026-10-11T06:00:00Z', MAINTENANT)).toBe('11 oct.');
  });
  it('boucle · taux honnête (« Non calculable » sans évaluable), cycle médian', () => {
    const k = kpisBoucle({ verdicts: [verdict('winner'), verdict('loser'), verdict('inconclusive'), verdict('winner', { comparable: false })], premierLancement: '2026-07-03T00:00:00Z', cyclesJours: [10, 16, 30], apprentissages: { total: 2, mesures: 1 } });
    expect(k.map((x) => x.valeur)).toEqual(['4', '50 %', '16 j', '2']);
    expect(k[0]!.note).toBe('variantes mesurées depuis juillet');
    const vide = kpisBoucle({ verdicts: [], premierLancement: null, cyclesJours: [], apprentissages: { total: 0, mesures: 0 } });
    expect(vide.map((x) => x.valeur)).toEqual(['0', 'Non calculable', '–', '0']);
  });
  it('sous-navigation · lots et import réservés aux admins', () => {
    expect(sousNavResultats({ admin: true }).map((x) => x.href)).toEqual(['/adsmap', '/adsmap/boucle', '/adsmap/hypotheses', '/adsmap/lots', '/adsmap/protocole', '/adsmap/import', '/adsmap/apprentissages']);
    expect(sousNavResultats({ admin: false }).map((x) => x.href)).toEqual(['/adsmap', '/adsmap/boucle', '/adsmap/hypotheses', '/adsmap/protocole', '/adsmap/apprentissages']);
  });
  it('les écrans portés de la rubrique sont servis par Spatial, un chemin inconnu ne l’est pas', () => {
    for (const c of ['/adsmap', '/adsmap/boucle', '/adsmap/lots/abc', '/adsmap/import', '/adsmap/suites', '/adsmap/tri', '/adsmap/radar']) expect(ecranSpatial(c)).toMatchObject({ section: 'resultats' });
    for (const c of ['/adsmap/inconnu', '/adsmap/tests/abc/plus']) expect(ecranSpatial(c)).toBeNull();
    expect(ECRANS_SPATIAUX.filter((e) => e.section === 'resultats')).toHaveLength(18);
  });
});
