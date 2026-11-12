import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LIBELLE_RESULTAT_COMMENTAIRE, LIBELLE_RESULTAT_FIL, LIEN_PAGE_HYPOTHESES, PHRASE_ITERATION_EN_TEST, RAISON_HYPOTHESES_AUTRE_MARQUE, RAISON_LOT_AUTRE_MARQUE,
  cartesHypotheses, conclusionLot, etatLotSpatial, hypothesesDeLaNote, iterationsDuCommentaire, iterationsDuFil, referenceConclusion, resultatsCommentaire, resultatsFil,
  statutsHypothesesNote,
  type FaitsAdSpatial, type FaitsHypotheseAd, type FaitsLotSpatial, type IterationDuCommentaire, type IterationDuFil, type OrigineHypotheseLibre,
} from '../src';

/**
 * Le résultat de l'itération sous la NOTE qui l'a fait naître (suite du lot 11
 * V5) · la règle du commentaire (#1066) GÉNÉRALISÉE au fil « note », pas
 * recopiée · en pur.
 *
 *  · ÉGALITÉ · les exports du commentaire rendent EXACTEMENT ce qu'ils
 *    rendaient avant la généralisation (capture faite sur main avant le
 *    changement, `fixtures/resultat-commentaire-avant.json`) ;
 *  · la note · même règle, même sortie pour les mêmes itérations · une
 *    provenance d'un autre projet, ou celle de l'autre fil, n'est jamais
 *    rattachée ;
 *  · l'hypothèse née d'une note · le statut de SA carte (`cartesHypotheses`,
 *    règle existante) · Résultats fermé, rien · autre marque active, le lien
 *    fermé avec sa raison.
 */

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ad = (id: string, v: 'winner' | 'loser' | null, o: Partial<FaitsAdSpatial> = {}): FaitsAdSpatial => ({
  id, variante: id, statut: 'done', hypothese: 'Si on teste, alors ça baisse, parce que.', variable: 'hook', plateforme: 'meta', texte: null, image: null, manques: [],
  verdict: v ? { calcule: v, retenu: v, statut: 'validated', comparable: true, raison: null, depense: 1, impressions: 1, achats: 1, cpa: 1 } : null, ...o,
});
const lot = (id: string, numero: number, ads: FaitsAdSpatial[], lanceLe = '2026-09-01T00:00:00Z'): FaitsLotSpatial => ({ id, numero, but: null, statut: 'testing', lanceLe, ads, protocole: null });
const CTX = { maintenant: new Date('2026-11-09T00:00:00Z'), fenetreJours: 14 };
const REF = lot('r', 1, Array.from({ length: 8 }, (_, i) => ad(`r${i}`, i === 0 ? 'winner' : 'loser')));
const REF_HAUTE = lot('r', 1, Array.from({ length: 8 }, (_, i) => ad(`r${i}`, i === 0 ? 'loser' : 'winner')));
function iteration(l: FaitsLotSpatial, autres: FaitsLotSpatial[], adId: string): IterationDuCommentaire {
  const etat = etatLotSpatial(l, CTX);
  return { adId, variante: adId, lot: { id: l.id, numero: l.numero, etat }, conclusion: conclusionLot(l, etat, referenceConclusion([l, ...autres], l.id)) };
}
/** Les itérations de la capture · confirmée, infirmée, sans conclusion (bruit, effectif), en test (verdict manquant, hors lot). */
const ITERATIONS: IterationDuFil[] = [
  iteration(lot('c', 3, ['V7', 'a2', 'a3', 'a4'].map((x) => ad(x, 'winner'))), [REF], 'V7'),
  iteration(lot('i', 4, ['V9', 'b2', 'b3', 'b4'].map((x) => ad(x, 'loser'))), [REF_HAUTE], 'V9'),
  iteration(lot('s', 5, [ad('V5', 'winner'), ad('c2', 'loser'), ad('c3', 'loser'), ad('c4', 'loser')]), [REF], 'V5'),
  iteration(lot('p', 6, [ad('V6', 'winner')]), [REF], 'V6'),
  iteration(lot('t', 7, [ad('V11', null), ad('d2', 'winner'), ad('d3', 'winner'), ad('d4', 'winner')]), [REF], 'V11'),
  { adId: 'V10', variante: 'V10', lot: null, conclusion: null },
];
const OUVERT = { resultats: true, marqueActive: true };
const AUTRE = { resultats: true, marqueActive: false };
const FERME = { resultats: false, marqueActive: true };
const AVANT = JSON.parse(readFileSync(new URL('./fixtures/resultat-commentaire-avant.json', import.meta.url), 'utf8')) as Record<string, unknown>;

describe('égalité · le commentaire rend EXACTEMENT ce qu’il rendait avant la généralisation', () => {
  const k = u(50); const p = u(60);
  const ads = [
    { id: 'a', commentaire: { commentaireId: k, projetId: p } }, { id: 'b', commentaire: { commentaireId: k, projetId: u(61) } },
    { id: 'c', commentaire: { commentaireId: u(51), projetId: p } }, { id: 'd', commentaire: null }, { id: 'e', commentaire: { commentaireId: k.toUpperCase(), projetId: p } },
  ];
  it('`resultatsCommentaire` · ouvert, autre marque, fermé, vide · strictement la capture de main', () => {
    expect(resultatsCommentaire(ITERATIONS, OUVERT), 'ouvert').toStrictEqual(AVANT.ouvert);
    expect(resultatsCommentaire(ITERATIONS, AUTRE), 'autre marque').toStrictEqual(AVANT.autreMarque);
    expect(resultatsCommentaire(ITERATIONS, FERME), 'Résultats fermé').toStrictEqual(AVANT.ferme);
    expect(resultatsCommentaire([], OUVERT), 'sans itération').toStrictEqual(AVANT.vide);
    expect(iterationsDuCommentaire(ads, { commentaireId: k, projetId: p }).map((x) => x.id), 'les itérations du commentaire').toStrictEqual(AVANT.iterations);
  });
  it('les phrases du commentaire · inchangées, et ce sont celles du fil', () => {
    expect(LIBELLE_RESULTAT_COMMENTAIRE).toStrictEqual({ confirmee: 'Itération confirmée', infirmee: 'Itération infirmée', sans_conclusion: 'Itération sans conclusion' });
    expect(LIBELLE_RESULTAT_COMMENTAIRE).toBe(LIBELLE_RESULTAT_FIL);
    expect([PHRASE_ITERATION_EN_TEST, RAISON_LOT_AUTRE_MARQUE]).toEqual(['son résultat se lira ici quand son lot sera conclu', 'Le lot se lit dans sa marque · ouvre la marque du projet pour le voir.']);
  });
});

describe('la note · la MÊME règle · même sortie pour les mêmes itérations · sa provenance seulement', () => {
  it('`resultatsFil` sur les itérations d’une note · la sortie du commentaire, valeur pour valeur', () => {
    for (const o of [OUVERT, AUTRE, FERME]) expect(resultatsFil(ITERATIONS, o)).toStrictEqual(resultatsCommentaire(ITERATIONS, o));
    expect(resultatsFil(ITERATIONS, OUVERT).map((r) => [r.variante, r.etat === 'conclue' ? r.statut : 'en_test']))
      .toEqual([['V5', 'sans_conclusion'], ['V6', 'sans_conclusion'], ['V7', 'confirmee'], ['V9', 'infirmee'], ['V10', 'en_test'], ['V11', 'en_test']]);
  });
  it('les itérations d’une note · même note ET même projet · un autre projet, l’autre fil, une autre note · jamais', () => {
    const n = u(70); const p = u(80);
    const ads = [
      { id: 'a', note: { noteId: n, projetId: p } },
      { id: 'b', note: { noteId: n, projetId: u(81) } },
      { id: 'c', note: { noteId: u(71), projetId: p } },
      { id: 'd', commentaire: { commentaireId: n, projetId: p } },
      { id: 'e', note: { noteId: n.toUpperCase(), projetId: p.toUpperCase() } },
      { id: 'f', note: null, commentaire: null },
    ];
    expect(iterationsDuFil(ads, { fil: 'note', id: n, projetId: p }).map((x) => x.id), 'une itération d’un autre projet ou d’un autre fil est rattachée à la note').toEqual(['a', 'e']);
    expect(iterationsDuFil(ads, { fil: 'commentaire', id: n, projetId: p }).map((x) => x.id), 'une note lue comme un commentaire').toEqual(['d']);
    expect(iterationsDuFil(ads, { fil: 'note', id: n, projetId: u(82) })).toEqual([]);
  });
});

/* ───────────────────────── l'hypothèse née d'une note ───────────────────────── */

const NOTE = u(90); const PROJET = u(91);
const origineNote = (noteId: string | null = NOTE, projetId: string | null = PROJET): OrigineHypotheseLibre => ({ type: 'note', noeud: 'Brief · version 1', noteId, projetId });
function fait(a: FaitsAdSpatial, l: FaitsLotSpatial | null, autres: FaitsLotSpatial[] = [REF], origine: OrigineHypotheseLibre | null = origineNote()): FaitsHypotheseAd {
  if (!l) return { ad: a, concept: 'Crème', bande: null, origine, lot: null };
  const etat = etatLotSpatial(l, CTX);
  return { ad: a, concept: 'Crème', bande: null, origine, lot: { id: l.id, numero: l.numero, etat, jour: null, conclusion: conclusionLot(l, etat, referenceConclusion([l, ...autres], l.id)) } };
}

describe('l’hypothèse née d’une note · le statut de SA carte, la règle existante', () => {
  it('les hypothèses d’une note · origine « note », même note ET même projet · une autre origine, un autre projet, une note sans identifiant · jamais', () => {
    const ads = [
      { id: 'a', origine: origineNote() }, { id: 'b', origine: origineNote(NOTE, u(92)) }, { id: 'c', origine: origineNote(u(93)) },
      { id: 'd', origine: { type: 'libre' } as OrigineHypotheseLibre }, { id: 'e', origine: origineNote(null, PROJET) }, { id: 'f', origine: null },
      { id: 'g', origine: origineNote(NOTE.toUpperCase(), PROJET) },
    ];
    expect(hypothesesDeLaNote(ads, { noteId: NOTE, projetId: PROJET }).map((x) => x.id), 'une hypothèse d’une autre note, d’un autre projet ou d’une autre origine est rattachée').toEqual(['a', 'g']);
  });

  const formuler = fait(ad('h1', null, { statut: 'draft', hypothese: 'Si on montre la texture, alors…', manques: ['offer'] }), null);
  const prete = fait(ad('h2', null, { statut: 'draft' }), null);
  const enTest = fait(ad('h3', null, { statut: 'live' }), lot('t', 8, [ad('h3', null, { statut: 'live' }), ad('x2', 'winner')], '2026-11-05T00:00:00Z'));
  const confirmee = (() => { const l = lot('c', 9, ['h4', 'y2', 'y3', 'y4'].map((x) => ad(x, 'winner'))); return fait(l.ads[0]!, l); })();
  const infirmee = (() => { const l = lot('i', 10, ['h5', 'z2', 'z3', 'z4'].map((x) => ad(x, 'loser'))); return fait(l.ads[0]!, l, [REF_HAUTE]); })();

  it('chaque colonne de la carte · à formuler, prête, en test, conclue (confirmée, infirmée) · la conclusion, le chiffre et le lien de la carte', () => {
    const faits = [formuler, prete, enTest, confirmee, infirmee];
    const s = statutsHypothesesNote(faits, OUVERT);
    const cartes = cartesHypotheses(faits, []);
    expect(s.map((x) => x.colonne), 'la colonne n’est pas celle de la carte').toEqual(cartes.map((c) => c.colonne));
    expect(s.map((x) => x.conclusion), 'la conclusion n’est pas celle de la carte').toEqual(cartes.map((c) => c.conclusion));
    expect(s.map((x) => [x.adId, x.libelle, x.conclusion?.libelle ?? null, x.lien.libelle, x.lien.href])).toEqual([
      ['h1', 'Hypothèse · À formuler', null, 'Voir les hypothèses', LIEN_PAGE_HYPOTHESES],
      ['h2', 'Hypothèse · Prête à tester', null, 'Ranger dans un lot', '/adsmap/lots'],
      ['h3', 'Hypothèse · En test', null, 'Lot #8 · en test', '/adsmap/lots/t'],
      ['h4', 'Hypothèse · Conclue', 'Confirmée', 'Voir le lot #9', '/adsmap/lots/c'],
      ['h5', 'Hypothèse · Conclue', 'Infirmée', 'Voir le lot #10', '/adsmap/lots/i'],
    ]);
    expect(s[3]!.chiffre).toMatch(/^4 gagnantes sur 4 variantes tranchées \(\d+ % à 100 %\) · la marque, 1 sur 8 dans ses autres lots/);
    expect(s[3]!.chiffre, 'le chiffre n’est pas celui du résultat de la carte').toBe(cartes[3]!.resultat!.chiffre);
    expect(s.slice(0, 3).map((x) => x.chiffre), 'un chiffre avant la conclusion').toEqual([null, null, null]);
    expect(s[0]!.texte).toBe('Si on montre la texture, alors…');
  });
  it('Résultats fermé · rien · autre marque active · le statut se dit, chaque lien fermé avec SA raison', () => {
    expect(statutsHypothesesNote([confirmee, formuler], FERME)).toEqual([]);
    const s = statutsHypothesesNote([confirmee, formuler, prete], AUTRE);
    expect(s.map((x) => [x.colonne, x.lien.href, x.lien.raison])).toEqual([
      ['conclue', null, RAISON_LOT_AUTRE_MARQUE], ['formuler', null, RAISON_HYPOTHESES_AUTRE_MARQUE], ['prete', null, RAISON_LOT_AUTRE_MARQUE],
    ]);
    expect(statutsHypothesesNote([], OUVERT)).toEqual([]);
  });
});
