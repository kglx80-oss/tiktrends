import { describe, it, expect } from 'vitest';
import {
  CLE_DEPUIS_GAGNANTE, LIBELLE_ITERER_GAGNANTE, RAISON_GAGNANTE_AUTRE_MARQUE, RAISON_GAGNANTE_NON_ARBITREE, RAISON_HORS_PLAN, RAISON_NON_GAGNANTE, RAISON_ROLE_ITERATION, REFUS_GAGNANTE_DEPUIS,
  conclusionLot, departDepuisGagnanteDe, etatLotSpatial, etatPlanGagnante, gagnanteDeLHypothese, gagnantesDesHypotheses, gagnantesDuLot, gesteGagnanteHypothese,
  gestesGagnantesFil, gestesGagnantesHypotheses, gestesGagnantesLot, lienIterationDepuis, lireDemandeProvenanceGagnante, lireDepartGagnante, lireDepuisGagnante,
  lireProvenanceCommentaire, lireProvenanceJarvis, lireProvenanceNote, peutCreerIteration, permissionsStudio, phraseSuiteEnTest, provenanceDuTest, provenanceGagnanteAdmise,
  referenceConclusion, refProvenanceGagnante, resultatsFil,
  type FaitsAdSpatial, type FaitsHypotheseAd, type FaitsLotSpatial, type IterationDuFil, type LignePlanSpatial, type LotPourGagnante,
} from '../src';

/**
 * « Itérer depuis la gagnante » PARTOUT où on lit un résultat · en pur.
 *
 *  · la fiche d'un lot CONCLU · un geste par variante arbitrée gagnante (même
 *    sans conclusion du lot entier) · lot pas encore conclu · rien ;
 *  · la carte d'une hypothèse CONFIRMÉE · la gagnante du lot qui l'a confirmée
 *    (la sienne d'abord) · infirmée, sans conclusion, en test · rien ;
 *  · LA règle du fil (#1083) · mêmes raisons, même ordre · un seul chemin ;
 *  · à l'avance · une suite déjà en test est signalée, une gagnante que le plan
 *    exclut est fermée avec la phrase du plan ;
 *  · l'adresse et la provenance · identifiants seuls, rien de cru du client.
 */

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ad = (id: string, variante: string, v: 'winner' | 'loser' | null, statut: 'validated' | 'computed' = 'validated'): FaitsAdSpatial => ({
  id, variante, statut: 'done', hypothese: `Si on teste ${variante}, alors ça baisse, parce que.`, variable: 'hook', plateforme: 'meta', texte: null, image: null, manques: [],
  verdict: v ? { calcule: v, retenu: statut === 'validated' ? v : null, statut, comparable: true, raison: null, depense: 1, impressions: 1, achats: 1, cpa: 1 } : null,
});
const brut = (id: string, numero: number, ads: FaitsAdSpatial[]): FaitsLotSpatial => ({ id, numero, but: null, statut: 'testing', lanceLe: '2026-09-01T00:00:00Z', ads, protocole: null });
const CTX = { maintenant: new Date('2026-11-09T00:00:00Z'), fenetreJours: 14 };
const REF = brut(u(900), 1, Array.from({ length: 8 }, (_, i) => ad(u(800 + i), `r${i}`, i === 0 ? 'winner' : 'loser')));
const REF_HAUTE = brut(u(900), 1, Array.from({ length: 8 }, (_, i) => ad(u(800 + i), `r${i}`, i === 0 ? 'loser' : 'winner')));
function lu(l: FaitsLotSpatial, ref: FaitsLotSpatial): LotPourGagnante {
  const etat = etatLotSpatial(l, CTX);
  return { id: l.id, numero: l.numero, etat, conclusion: conclusionLot(l, etat, referenceConclusion([l, ref], l.id)), ads: l.ads };
}
/** C · confirmé (trois gagnantes, une perdante) · I · infirmé · S · sans conclusion, une gagnante · A · à conclure (rien d'arbitré). */
const C = lu(brut(u(1), 41, [ad(u(11), 'C1', 'loser'), ad(u(12), 'C2', 'winner'), ad(u(13), 'C3', 'winner'), ad(u(14), 'C4', 'winner'), ad(u(15), 'C5', 'winner')]), REF);
const I = lu(brut(u(2), 42, ['I1', 'I2', 'I3', 'I4'].map((v, i) => ad(u(21 + i), v, 'loser'))), REF_HAUTE);
const S = lu(brut(u(3), 43, [ad(u(31), 'S1', 'winner'), ad(u(32), 'S2', 'loser'), ad(u(33), 'S3', 'loser')]), REF);
const A = lu(brut(u(4), 44, [ad(u(41), 'A1', 'winner', 'computed'), ad(u(42), 'A2', 'winner', 'computed'), ad(u(43), 'A3', 'loser', 'computed'), ad(u(44), 'A4', 'winner', 'computed')]), REF);
const O = { marqueActive: true, peutIterer: true };
const ligne = (adId: string, o: Partial<LignePlanSpatial> = {}): LignePlanSpatial => ({
  adId, label: 'x', mode: 'more', modeLabel: 'Plus', rationale: 'r', variableLabel: 'Accroche', freezeLabels: [], parentVerdict: 'winner', parentComparable: true, edgeLegal: true, spend: null, ...o,
});

describe('les préalables du jeu · les conclusions calculées par la vraie règle', () => {
  it('C confirmé, I infirmé, S sans conclusion, A pas encore conclu', () => {
    expect([C.conclusion?.conclusion, I.conclusion?.conclusion, S.conclusion?.conclusion, A.etat]).toEqual(['confirmee', 'infirmee', 'non_concluante', 'a_conclure']);
  });
});

describe('la fiche d’un lot CONCLU · un geste par variante arbitrée gagnante', () => {
  it('les gagnantes, dans l’ordre du lot · la perdante n’en a pas · un lot à conclure · rien, même avec des verdicts du moteur gagnants', () => {
    expect(gagnantesDuLot(C).map((g) => g.variante)).toEqual(['C2', 'C3', 'C4', 'C5']);
    expect(gagnantesDuLot(S).map((g) => g.variante), 'un lot conclu sans conclusion garde sa gagnante').toEqual(['S1']);
    expect(gagnantesDuLot(I)).toEqual([]);
    expect(gagnantesDuLot(A), 'un verdict du moteur non arbitré n’est pas une gagnante').toEqual([]);
    expect(gagnantesDuLot({ ...C, conclusion: null }), 'sans conclusion lue, rien').toEqual([]);
  });

  it('ouvert · l’écran Itérer EXISTANT, le lot ET la gagnante · fermé · autre marque, rôle (dans cet ordre)', () => {
    const g = gestesGagnantesLot(C, O);
    expect(Object.keys(g)).toEqual([u(12), u(13), u(14), u(15)]);
    expect(g[u(12)]).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: `/studio/iterer?lot=${u(1)}&gagnante=${u(12)}`, raison: null });
    expect(gestesGagnantesLot(C, { marqueActive: false, peutIterer: false })[u(12)]).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: null, raison: RAISON_GAGNANTE_AUTRE_MARQUE });
    expect(gestesGagnantesLot(C, { marqueActive: true, peutIterer: false })[u(12)]).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: null, raison: RAISON_ROLE_ITERATION });
    expect(gestesGagnantesLot(I, O)).toEqual({});
    expect(gestesGagnantesLot(A, O)).toEqual({});
  });

  it('l’adresse · identifiants bien formés seulement', () => {
    expect(lienIterationDepuis('lot', { id: 'L1', adId: u(12) })).toBeNull();
    expect(lienIterationDepuis('hypothese', { id: u(13), adId: u(13).toUpperCase() })).toBe(`/studio/iterer?hypothese=${u(13)}&gagnante=${u(13)}`);
  });
});

describe('la carte d’une hypothèse CONFIRMÉE · la gagnante du lot qui l’a confirmée', () => {
  it('la sienne si elle a gagné · sinon la première gagnante du lot · infirmée, sans conclusion, à conclure · rien', () => {
    expect(gagnanteDeLHypothese(u(14), C)?.variante).toBe('C4');
    expect(gagnanteDeLHypothese(u(11), C)?.variante, 'la carte perdante d’un lot confirmé part de la première gagnante').toBe('C2');
    expect(gagnanteDeLHypothese(u(31), S), 'sans conclusion').toBeNull();
    expect(gagnanteDeLHypothese(u(21), I)).toBeNull();
    expect(gagnanteDeLHypothese(u(41), A)).toBeNull();
    expect(gesteGagnanteHypothese(u(11), C, O)).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: `/studio/iterer?hypothese=${u(11)}&gagnante=${u(12)}`, raison: null });
    for (const [a, l] of [[u(31), S], [u(21), I], [u(41), A]] as const) expect(gesteGagnanteHypothese(a, l, O), `un geste sur ${a}`).toBeNull();
  });

  it('confirmé sans aucune gagnante arbitrée (verdicts relatifs) · fermé, une itération part d’une gagnante', () => {
    const sans = { ...C, ads: C.ads.map((a) => ({ ...a, verdict: a.verdict && { ...a.verdict, retenu: 'relative_winner' as const } })) };
    expect(gesteGagnanteHypothese(u(12), sans, O)).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: null, raison: RAISON_GAGNANTE_NON_ARBITREE });
  });

  it('les gestes de la page, par carte · les gagnantes dont le plan est lu', () => {
    const lots = [C, I, S, A];
    const faits: FaitsHypotheseAd[] = lots.flatMap((l) => l.ads.map((a) => ({ ad: a, concept: 'x', bande: null, lot: { id: l.id, numero: l.numero, etat: l.etat, jour: null, conclusion: l.conclusion } })));
    faits.push({ ad: ad(u(99), 'H', null), concept: 'x', bande: null, lot: null });
    const adsDe = (id: string) => lots.find((l) => l.id === id)?.ads ?? [];
    expect(Object.keys(gestesGagnantesHypotheses(faits, adsDe, O))).toEqual([u(11), u(12), u(13), u(14), u(15)]);
    expect(gagnantesDesHypotheses(faits, adsDe)).toEqual([u(12), u(13), u(14), u(15)]);
  });
});

describe('signalé à l’avance · le plan et la lignée, lus sans écriture · la même règle pour le fil, la fiche et la carte', () => {
  const SUITES = [
    { parentAdId: u(12), variante: 'V14', arbitree: false }, { parentAdId: u(12), variante: 'V9', arbitree: false },
    { parentAdId: u(13), variante: 'V8', arbitree: true },
  ];
  const PLAN = [ligne(u(13)), ligne(u(14), { edgeLegal: false }), ligne(u(15))];
  const plan = (adId: string) => etatPlanGagnante(adId, { plan: PLAN, suites: SUITES });

  it('l’état · hors plan (la phrase de « Créer l’itération »), piste fermée (la phrase de l’écran), proposée · la plus petite suite sans verdict arbitré', () => {
    expect(plan(u(12))).toEqual({ exclue: RAISON_HORS_PLAN, suiteEnTest: 'V9' });
    expect(plan(u(13)), 'une suite arbitrée n’est plus en test').toEqual({ exclue: null, suiteEnTest: null });
    expect(plan(u(14))).toEqual({ exclue: RAISON_NON_GAGNANTE, suiteEnTest: null });
    expect(plan(u(15))).toEqual({ exclue: null, suiteEnTest: null });
  });

  it('sur la fiche · exclue · fermée avec la raison du plan, la suite signalée · proposée avec une suite en test · ouverte ET signalée', () => {
    const g = gestesGagnantesLot(C, { ...O, plan });
    expect(g[u(12)]).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: null, raison: RAISON_HORS_PLAN, signal: phraseSuiteEnTest('V9') });
    expect(g[u(14)]).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: null, raison: RAISON_NON_GAGNANTE });
    expect(g[u(15)]?.href).toBe(`/studio/iterer?lot=${u(1)}&gagnante=${u(15)}`);
    const ouverte = gestesGagnantesLot(C, { ...O, plan: (a) => (a === u(15) ? { exclue: null, suiteEnTest: 'V3' } : null) });
    expect(ouverte[u(15)]).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: `/studio/iterer?lot=${u(1)}&gagnante=${u(15)}`, raison: null, signal: 'Déjà une suite en test · V3' });
    expect(gestesGagnantesLot(C, { marqueActive: true, peutIterer: false, plan })[u(12)], 'le rôle passe avant le plan').toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: null, raison: RAISON_ROLE_ITERATION });
  });

  it('sur la carte et sous le fil · la même chose', () => {
    expect(gesteGagnanteHypothese(u(12), C, { ...O, plan })).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: null, raison: RAISON_HORS_PLAN, signal: phraseSuiteEnTest('V9') });
    const it1: IterationDuFil = { adId: u(12), variante: 'C2', lot: { id: C.id, numero: C.numero, etat: C.etat }, conclusion: C.conclusion, verdict: { validated: 'winner', comparable: true } };
    const r = resultatsFil([it1], { resultats: true, marqueActive: true });
    const f = gestesGagnantesFil('commentaire', r, [it1], { id: u(50), projetId: u(60), ...O, plan });
    expect(f[u(12)]).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: null, raison: RAISON_HORS_PLAN, signal: phraseSuiteEnTest('V9') });
    expect(gestesGagnantesFil('commentaire', r, [it1], { id: u(50), projetId: u(60), ...O })[u(12)], 'sans plan lu · le geste de #1083, rien de signalé').toEqual({
      libelle: LIBELLE_ITERER_GAGNANTE, href: `/studio/iterer?commentaire=${u(50)}&projet=${u(60)}&gagnante=${u(12)}`, raison: null,
    });
  });
});

describe('l’écran Itérer · l’adresse lue · rien n’est deviné', () => {
  it('lot ou hypothèse ET gagnante · les deux sources, une valeur doublée, un identifiant mal formé · refus', () => {
    expect(lireDepartGagnante({})).toEqual({ etat: 'absente' });
    expect(lireDepartGagnante({ gagnante: u(12) }), 'la gagnante seule appartient au fil').toEqual({ etat: 'absente' });
    expect(lireDepartGagnante({ lot: u(1).toUpperCase(), gagnante: u(12) })).toEqual({ etat: 'ok', source: 'lot', id: u(1), gagnante: u(12) });
    expect(lireDepartGagnante({ hypothese: u(14), gagnante: u(14) })).toEqual({ etat: 'ok', source: 'hypothese', id: u(14), gagnante: u(14) });
    expect(lireDepartGagnante({ lot: u(1) })).toEqual({ etat: 'refus', source: 'lot' });
    expect(lireDepartGagnante({ lot: u(1), hypothese: u(14), gagnante: u(12) })).toEqual({ etat: 'refus', source: 'lot' });
    expect(lireDepartGagnante({ lot: [u(1), u(2)], gagnante: u(12) })).toEqual({ etat: 'refus', source: 'lot' });
    expect(lireDepartGagnante({ hypothese: 'C4', gagnante: u(12) })).toEqual({ etat: 'refus', source: 'hypothese' });
    expect(REFUS_GAGNANTE_DEPUIS.lot).toContain('rien n’est présélectionné');
  });

  it('le départ · la gagnante, la variable du plan, aucun texte repris', () => {
    const choix = { options: [], defaut: 'hook' as const, ferme: null };
    const d = departDepuisGagnanteDe('hypothese', { adId: u(14), variante: 'C4' }, { numero: 41 }, choix as never);
    expect(d).toEqual({
      adId: u(14), hypothese: null, variable: 'hook',
      note: 'Itération depuis la gagnante C4, gagnante du lot #41, qui a confirmé l’hypothèse · la variable proposée est celle du plan, modifiable · la nouvelle itération gardera la gagnante d’où elle part. Rien n’est créé sans ton clic sur « Créer l’itération ».',
    });
    expect(departDepuisGagnanteDe('lot', { adId: u(12), variante: 'C2' }, { numero: 41 }, null).note).toBe('Itération depuis la gagnante C2, gagnante arbitrée du lot #41 · choisis la variable à l’étape « Ce qu’on change » · la nouvelle itération gardera la gagnante d’où elle part. Rien n’est créé sans ton clic sur « Créer l’itération ».');
  });
});

describe('la provenance · identifiants seuls, relue par le serveur · le bilan inchangé', () => {
  it('le lecteur de la demande ne garde que la source et son identifiant · une gagnante ou un lot donnés par le client sont ignorés', () => {
    expect(lireDemandeProvenanceGagnante({ source: 'lot', id: u(1), gagnanteAdId: u(99), lotId: u(98) })).toEqual({ source: 'lot', id: u(1) });
    expect(lireDemandeProvenanceGagnante({ source: 'tag', id: u(1) })).toBeNull();
    expect(lireDemandeProvenanceGagnante({ source: 'lot', id: 'x' })).toBeNull();
  });

  it('admise seulement pour une gagnante RELUE · posée, relue · le bilan la compte « Itération d’une gagnante »', () => {
    const d = { source: 'hypothese' as const, id: u(11) };
    expect(provenanceGagnanteAdmise(d, { lotId: u(1), gagnantes: [u(12)], parentAdId: u(13) })).toBeNull();
    expect(provenanceGagnanteAdmise(d, { lotId: null, gagnantes: [u(12)], parentAdId: u(12) })).toBeNull();
    const p = provenanceGagnanteAdmise(d, { lotId: u(1), gagnantes: [u(12)], parentAdId: u(12).toUpperCase() })!;
    const ref = refProvenanceGagnante(p);
    expect(ref).toEqual({ [CLE_DEPUIS_GAGNANTE]: { source: 'hypothese', lotId: u(1), hypotheseAdId: u(11), gagnanteAdId: u(12) } });
    expect(lireDepuisGagnante(ref)).toEqual({ source: 'hypothese', lotId: u(1), hypotheseAdId: u(11), gagnanteAdId: u(12) });
    expect(lireDepuisGagnante(refProvenanceGagnante({ demande: { source: 'lot', id: u(1) }, lotId: u(1), gagnante: u(12) }))).toEqual({ source: 'lot', lotId: u(1), hypotheseAdId: null, gagnanteAdId: u(12) });
    expect([lireProvenanceCommentaire(ref), lireProvenanceNote(ref), lireProvenanceJarvis(ref)]).toEqual([null, null, null]);
    expect(provenanceDuTest({ origine: null, typeAd: 'iteration' })).toBe('iteration');
    expect(lireDepuisGagnante({ [CLE_DEPUIS_GAGNANTE]: { source: 'lot', lotId: 'x', gagnanteAdId: u(12) } })).toBeNull();
  });
});

describe('la porte de l’écran Itérer · une règle', () => {
  it('`studio.propose`, pour une marque de la portée', () => {
    const p = permissionsStudio({ roleEspace: 'member', studioOuvert: true, roleEquipe: null });
    const v = permissionsStudio({ roleEspace: 'client_viewer', studioOuvert: true, roleEquipe: null });
    expect(peutCreerIteration({ permissions: p, marques: [u(5)] }, u(5))).toBe(true);
    expect(peutCreerIteration({ permissions: p, marques: [u(5)] }, u(6))).toBe(false);
    expect(peutCreerIteration({ permissions: p, marques: [u(5)] }, null)).toBe(false);
    expect(peutCreerIteration({ permissions: v, marques: [u(5)] }, u(5))).toBe(false);
  });
});
