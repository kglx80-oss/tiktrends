import { describe, it, expect } from 'vitest';
import {
  MAX_PERSONAS_LECTURE, NOTE_GESTES_FICHE_OFFRE, NOTE_GESTES_OFFRE_SILENCE, NOTE_OFFRE_PROVENANCE, PHRASE_OFFRE_A_TRANCHER, PHRASE_PERSONA_A_TRANCHER,
  PHRASE_SANS_OFFRE_TEST, PROVENANCES_TEST, VOCABULAIRE_OFFRE, VOCABULAIRE_PERSONA,
  bilanProvenances, cibleDuTest, cibleSeDetache, entreesLectureGroupes, gestesLectureGroupe, lectureParGroupe, libelleOrigine,
  lireDemandeProvenanceOffre, lireOrigineHypothese, noteDepartLectureOffre, noteGestesSilenceFiche, offreDuTest, personaDuTest,
  provenanceCarte, provenanceDuTest, provenanceOffreAdmise, refOrigineHypothese,
  type EntreeLecturePersona, type FaitsAdSpatial, type FaitsLotSpatial, type ProvenanceTest,
} from '../src';

/**
 * La boucle, jusqu'à la fiche d'un test · les RÈGLES, en pur.
 *  · la provenance « Offre » · jamais crue · posée seulement si l'offre a été
 *    relue dans la marque active, et c'est bien elle · sinon « À la main » ;
 *  · le bilan à huit provenances · six lues au plus, silence au-delà, dit ·
 *    une provenance sous l'effectif compte exactement comme le reste (aucun
 *    seuil à remesurer) ;
 *  · la fiche d'un test · son persona, son offre (« à trancher » en désaccord),
 *    leur lecture sur la marque, et les gestes SEULEMENT quand l'un se détache.
 */

const U = (x: string) => `a0a00000-0000-4000-8000-${x.padStart(12, '0')}`;
const OFFRE = U('77');

/* ───────────────────────── la provenance « Offre » ───────────────────────── */

describe('la provenance « Offre » · posée seulement après relecture dans la marque active', () => {
  it('l’offre relue, et c’est elle · « Offre », son intitulé relu (jamais celui de l’adresse)', () => {
    expect(provenanceOffreAdmise(OFFRE, { id: OFFRE, intitule: '  Remise   de bienvenue ' })).toEqual({ type: 'offre', offre: 'Remise de bienvenue', offreId: OFFRE });
  });
  it('une offre d’une autre marque (non relue ici), une autre offre, une demande mal formée · aucune provenance, « À la main »', () => {
    expect(provenanceOffreAdmise(OFFRE, null), 'offre d’une autre marque').toEqual({ type: 'libre' });
    expect(provenanceOffreAdmise(OFFRE, { id: U('78'), intitule: 'Autre' }), 'une autre offre relue').toEqual({ type: 'libre' });
    expect(provenanceOffreAdmise(null, { id: OFFRE, intitule: 'Remise' }), 'demande mal formée').toEqual({ type: 'libre' });
    expect(lireDemandeProvenanceOffre({ offreId: 'Remise de bienvenue' })).toBeNull();
    expect(lireDemandeProvenanceOffre({ offreId: OFFRE.toUpperCase() })).toBe(OFFRE);
    expect(lireDemandeProvenanceOffre(null)).toBeNull();
  });
  it('gardée, relue, dite · « Offre · … » sur la carte, lien vers la fiche Offre de la marque active, provenance du test « offre »', () => {
    const o = provenanceOffreAdmise(OFFRE, { id: OFFRE, intitule: 'Remise de bienvenue' });
    expect(lireOrigineHypothese(refOrigineHypothese(o)), 'la provenance offre ne se relit pas').toEqual(o);
    expect(lireOrigineHypothese({ hypotheseLibre: { type: 'offre', offre: 'x', offreId: '../x' } })).toEqual({ type: 'offre', offre: 'x', offreId: null });
    expect(libelleOrigine(o)).toBe('Offre · Remise de bienvenue');
    const M = 'b0b00000-0000-4000-8000-000000000001';
    expect(provenanceCarte(o, { marqueId: M })).toEqual({ libelle: 'Offre · Remise de bienvenue', href: `/brands/${M}/offre`, lien: 'Voir les offres' });
    expect(provenanceCarte(o, { marqueId: '../x' }).href).toBeNull();
    expect(provenanceDuTest({ origine: o, typeAd: 'ideation' }), 'le bilan range l’hypothèse née d’une offre ailleurs que dans « Offre »').toBe('offre');
    expect(NOTE_OFFRE_PROVENANCE).toContain('« Offre »');
  });
  it('les gestes d’une offre · la source est l’offre (relue au serveur) · la note du lot dit la provenance « Offre »', () => {
    const g = gestesLectureGroupe({ ref: { id: OFFRE, nom: 'Remise' }, lecture: 'au_dessus', k: 6, n: 6, reference: { k: 0, n: 10 } },
      { groupe: 'offre', note: noteDepartLectureOffre(5), prioritaires: [], testsDeLaMarque: [], planIds: new Set() })!;
    expect(g.hypothese.source, 'l’hypothèse née d’une offre part « à la main »').toEqual({ type: 'offre', offreId: OFFRE });
    expect(g.hypothese.note).toBe('Source · la lecture par offre du lot #5. Le « parce que » cite ses verdicts · le reste s’écrit, l’hypothèse entre dans « À formuler », provenance « Offre ».');
    expect(NOTE_GESTES_FICHE_OFFRE, 'l’écran dit encore « À la main »').not.toContain('À la main');
    expect(NOTE_GESTES_OFFRE_SILENCE).toContain('Aucune offre de ce lot ne se détache');
  });
});

/* ───────────────────────── le bilan à huit provenances ───────────────────────── */

const entrees = (p: ProvenanceTest | null, k: number, n: number): EntreeLecturePersona[] =>
  Array.from({ length: n }, (_, i) => ({ persona: p ? { id: p, nom: PROVENANCES_TEST.find((x) => x.cle === p)!.libelle } : null, issue: i < k ? 'gagne' as const : 'perd' as const }));

describe('le bilan · huit provenances, six lues au plus, aucun seuil changé', () => {
  it('« Offre » est une provenance du bilan, lue à sa place', () => {
    expect(PROVENANCES_TEST.map((p) => p.cle)).toEqual(['tag', 'veille', 'apprentissage', 'persona', 'offre', 'libre', 'jarvis', 'iteration']);
    const b = bilanProvenances([...entrees('offre', 6, 6), ...entrees(null, 0, 10)]);
    expect(b.groupes.map((g) => [g.cle, g.libelle, g.lecture])).toEqual([['offre', 'Offre', 'au_dessus']]);
  });
  it('les huit parlent · au-delà du mesuré (six), le bilan se tait et le dit', () => {
    expect(PROVENANCES_TEST.length).toBe(8);
    const b = bilanProvenances([...PROVENANCES_TEST.flatMap((p) => entrees(p.cle, p.cle === 'offre' ? 6 : 0, 6)), ...entrees(null, 0, 4)]);
    expect([b.parle, b.niveau], 'huit provenances lues au-delà du mesuré').toEqual([false, null]);
    expect(b.phrase).toBe(`8 provenances ont assez de verdicts · au-delà de ${MAX_PERSONAS_LECTURE}, la règle n’est pas mesurée · le bilan se tait.`);
    expect(b.regle).toContain('8 provenances, 6 lues au plus à la fois, silence au-delà');
  });
  it('six parlent, deux sous l’effectif · les mêmes intervalles, au même niveau, que si ces deux-là n’avaient pas de provenance (elles sont dans le reste · le U mesuré)', () => {
    const six = PROVENANCES_TEST.slice(0, 6).flatMap((p) => entrees(p.cle, p.cle === 'offre' ? 6 : 1, 6));
    const avec = bilanProvenances([...six, ...entrees('jarvis', 1, 3), ...entrees('iteration', 0, 2), ...entrees(null, 0, 4)]);
    const sans = bilanProvenances([...six, ...entrees(null, 1, 3), ...entrees(null, 0, 2), ...entrees(null, 0, 4)]);
    expect([avec.niveau, avec.reste]).toEqual([sans.niveau, sans.reste]);
    const lus = (b: typeof avec) => b.groupes.filter((g) => g.lecture !== 'effectif').map((g) => [g.cle, g.lecture, g.intervalle, g.reference]);
    expect(lus(avec), 'une provenance sous l’effectif change la lecture des autres').toEqual(lus(sans));
    expect(avec.groupes.filter((g) => g.lecture === 'effectif').map((g) => g.cle)).toEqual(['jarvis', 'iteration']);
    expect(avec.parle).toBe(true);
  });
});

/* ───────────────────────── la fiche d'un test ───────────────────────── */

const ad = (id: string, v: 'winner' | 'loser'): FaitsAdSpatial => ({
  id, variante: id, statut: 'done', hypothese: 'Si on teste, alors ça baisse, parce que.', variable: 'hook', plateforme: 'meta', texte: null, image: null, manques: [],
  verdict: { calcule: v, retenu: v, statut: 'validated', comparable: true, raison: null, depense: 1, impressions: 1, achats: 1, cpa: 1 },
});
const lot = (id: string, numero: number, ads: FaitsAdSpatial[]): FaitsLotSpatial => ({ id, numero, but: null, statut: 'testing', lanceLe: '2026-09-01T00:00:00Z', ads, protocole: null });

describe('la fiche d’un test · son persona, son offre, leur lecture, les gestes seulement au détachement', () => {
  const LEA = { id: 'lea', nom: 'Léa, 34 ans' }, MAX = { id: 'max', nom: 'Max' };
  const REMISE = { id: 'remise', nom: 'Remise de bienvenue' }, LIVRAISON = { id: 'livraison', nom: 'Livraison offerte' };
  // Les identifiants d'ad sont des UUID (Itérer n'ouvre qu'une adresse sûre) · `l` Léa et la remise, `m` Max et la livraison.
  const id = (x: string) => U(`${x.charCodeAt(0)}${x.slice(1)}`);
  const L = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].map(id), M = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9'].map(id);
  const lots = [lot(U('1'), 1, M.map((x, i) => ad(x, i === 0 ? 'winner' : 'loser'))), lot(U('5'), 5, L.map((x) => ad(x, 'winner')))];
  const personas = (x: string) => (L.includes(x) ? LEA : M.includes(x) ? MAX : null);
  const offres = (x: string) => (L.includes(x) ? REMISE : x === M[0] ? null : M.includes(x) ? LIVRAISON : null);
  const lp = lectureParGroupe(entreesLectureGroupes(lots, personas), [LEA, MAX], VOCABULAIRE_PERSONA);
  const lo = lectureParGroupe(entreesLectureGroupes(lots, offres), [REMISE, LIVRAISON], VOCABULAIRE_OFFRE);
  const tests = (f: (id: string) => { id: string } | null, g: string) => lots.flatMap((l) => l.ads).filter((a) => f(a.id)?.id === g).map((a) => a.id);

  it('persona et offre d’accord, Léa et la remise se détachent · leur lecture, les gestes, ce test d’abord s’il est au plan', () => {
    const c = cibleDuTest({
      adId: L[2]!, persona: personaDuTest({ carte: LEA, brief: LEA }), offre: offreDuTest({ annonce: REMISE, brief: null }),
      lecturePersonas: lp, lectureOffres: lo, testsPersona: tests(personas, 'lea'), testsOffre: tests(offres, 'remise'), planIds: new Set([L[0]!, L[2]!]),
    });
    expect([c.persona.id, c.persona.libelle, c.persona.lecture]).toEqual(['lea', 'Léa · carte et brief d’accord', 'au_dessus']);
    expect(c.persona.phrase).toMatch(/^6 gagnantes sur 6 variantes tranchées .* · nettement au-dessus du reste de la marque, 1 sur 10/);
    expect(c.persona.gestes?.iterer, 'Itérer part d’abord de CE test quand il est au plan').toEqual({ href: `/studio/iterer?iter=${L[2]}`, adId: L[2], raison: null });
    expect(c.persona.gestes?.hypothese.source).toEqual({ type: 'persona', personaId: 'lea' });
    expect([c.offre.id, c.offre.libelle, c.offre.lecture]).toEqual(['remise', 'Remise de bienvenue · d’après le test', 'au_dessus']);
    expect(c.offre.gestes?.libelles.iterer).toBe('Itérer sur cette offre');
    expect(c.offre.gestes?.hypothese.source, 'l’hypothèse de l’offre ne porte pas la provenance offre').toEqual({ type: 'offre', offreId: 'remise' });
    expect([c.persona.silence, c.offre.silence]).toEqual([null, null]);
    expect(cibleSeDetache({ personaId: 'lea', offreId: null, lecturePersonas: lp, lectureOffres: lo })).toBe(true);
  });

  it('ce test hors du plan · Itérer part d’une autre gagnante du groupe au plan · aucune au plan · fermé avec sa raison', () => {
    const base = { adId: L[2]!, persona: personaDuTest({ carte: LEA, brief: null }), offre: null, lecturePersonas: lp, lectureOffres: lo, testsPersona: tests(personas, 'lea'), testsOffre: [] };
    expect(cibleDuTest({ ...base, planIds: new Set([L[4]!]) }).persona.gestes?.iterer.adId).toBe(L[4]);
    expect(cibleDuTest({ ...base, planIds: new Set() }).persona.gestes?.iterer.href).toBeNull();
  });

  it('désaccord carte / brief, désaccord test / brief · « à trancher », AUCUN groupe retenu, aucune lecture, aucun geste', () => {
    const c = cibleDuTest({
      adId: M[1]!, persona: personaDuTest({ carte: MAX, brief: LEA }), offre: offreDuTest({ annonce: LIVRAISON, brief: REMISE }),
      lecturePersonas: lp, lectureOffres: lo, testsPersona: [], testsOffre: [], planIds: new Set([L[0]!]),
    });
    expect([c.persona.id, c.persona.desaccord, c.persona.lecture, c.persona.gestes]).toEqual([null, true, null, null]);
    expect(c.persona.libelle).toBe('Persona à trancher · la carte dit Max, le brief du projet Léa');
    expect(c.persona.phrase).toBe(PHRASE_PERSONA_A_TRANCHER);
    expect([c.offre.id, c.offre.desaccord, c.offre.gestes]).toEqual([null, true, null]);
    expect(c.offre.libelle).toBe('Offre à trancher · le test diffuse « Livraison offerte », le brief du projet « Remise de bienvenue »');
    expect(c.offre.phrase).toBe(PHRASE_OFFRE_A_TRANCHER);
  });

  it('sans offre · dit · un groupe lu qui ne se détache pas · sa lecture, AUCUN geste, et c’est dit', () => {
    const S = ['s1', 's2'].map(id);
    const lots2 = [lot(U('2'), 2, S.map((x) => ad(x, 'winner'))), ...lots];
    const p2 = lectureParGroupe(entreesLectureGroupes(lots2, (x) => (S.includes(x) ? { id: 'sam', nom: 'Sam' } : personas(x))), [LEA, MAX, { id: 'sam', nom: 'Sam' }], VOCABULAIRE_PERSONA);
    const c = cibleDuTest({ adId: S[0]!, persona: personaDuTest({ carte: { id: 'sam', nom: 'Sam' }, brief: null }), offre: null, lecturePersonas: p2, lectureOffres: lo, testsPersona: S, testsOffre: [], planIds: new Set(S) });
    expect([c.persona.lecture, c.persona.gestes]).toEqual(['effectif', null]);
    expect(c.persona.silence, 'le silence des gestes n’est pas dit').toBe(noteGestesSilenceFiche('Ce persona'));
    expect([c.offre.id, c.offre.lecture, c.offre.phrase]).toEqual([null, null, PHRASE_SANS_OFFRE_TEST]);
    expect(cibleSeDetache({ personaId: 'sam', offreId: null, lecturePersonas: p2, lectureOffres: lo })).toBe(false);
  });
});
