import { describe, it, expect } from 'vitest';
import {
  MAX_PERSONAS_LECTURE, NOTE_JARVIS_PROVENANCE, PROVENANCES_TEST, RAISON_ITERER_OFFRE_SANS_GAGNANTE, RAISON_ITERER_SANS_GAGNANTE,
  accesTestsOffre, bilanProvenances, bilanTestsOffre, gestesLectureGroupe, gestesPersonaLot, lectureOffres, lireDemandeProvenanceJarvis,
  lireProvenanceJarvis, lotsDuGroupe, provenanceJarvisAdmise, refProvenanceJarvis, testsDeLOffre, testsDuGroupe, lecturePersonas,
  versGestesLecture, entreesLectureOffres,
  type EntreeLecturePersona, type FaitsAdSpatial, type FaitsLotSpatial, type ProvenanceTest,
} from '../src';

/**
 * « Dans les tests » des fiches persona et offre, et la provenance « Jarvis » · les RÈGLES, en pur.
 *  · les lots d'un groupe (liens), sa lecture, et les gestes SEULEMENT quand il se détache ;
 *  · la provenance Jarvis · jamais crue · posée seulement si la réponse est relue ET la pub de départ dans le contexte relu ;
 *  · le bilan la lit à part, et se tait si plus de six provenances parlent (règle mesurée jusqu'à six · huit au catalogue).
 */

const U = (x: string) => `a0a00000-0000-4000-8000-${x.padStart(12, '0')}`;
const ad = (id: string, v: 'winner' | 'loser'): FaitsAdSpatial => ({
  id, variante: id, statut: 'done', hypothese: 'Si on teste, alors ça baisse, parce que.', variable: 'hook', plateforme: 'meta', texte: null, image: null, manques: [],
  verdict: { calcule: v, retenu: v, statut: 'validated', comparable: true, raison: null, depense: 1, impressions: 1, achats: 1, cpa: 1 },
});
const lot = (id: string, numero: number, but: string | null, ads: FaitsAdSpatial[]): FaitsLotSpatial => ({ id, numero, but, statut: 'testing', lanceLe: '2026-09-01T00:00:00Z', ads, protocole: null });

describe('« Dans les tests » · les lots d’un groupe, sa lecture', () => {
  const REMISE = { id: 'remise', nom: 'Remise de bienvenue' };
  const lots = [
    lot(U('2'), 2, '  Remise   ou bundle ? ', [ad('o1', 'winner'), ad('o2', 'winner'), ad('x1', 'loser')]),
    lot(U('1'), 1, null, [ad('o3', 'winner'), ad('o4', 'winner'), ad('x2', 'loser'), ad('x3', 'loser'), ad('x4', 'loser'), ad('x5', 'loser')]),
    lot(U('9'), 9, 'Sans remise', [ad('y1', 'loser')]),
  ];
  const attribution = (adId: string) => (adId.startsWith('o') ? REMISE : null);

  it('les lots qui ciblent le groupe · liens vers leur fiche, le compte de leurs tests, aucun lot sans test du groupe', () => {
    expect(lotsDuGroupe(lots, attribution, 'remise'), 'les lots du groupe').toEqual([
      { id: U('2'), numero: 2, href: `/adsmap/lots/${U('2')}`, tests: 2, libelle: 'Lot #2 · Remise ou bundle ? · 2 tests' },
      { id: U('1'), numero: 1, href: `/adsmap/lots/${U('1')}`, tests: 2, libelle: 'Lot #1 · 2 tests' },
    ]);
    expect(lotsDuGroupe(lots, attribution, 'autre')).toEqual([]);
    expect(bilanTestsOffre(lots, attribution, 'remise')).toEqual({ tests: 4, lots: 2 });
  });

  it('la lecture par offre de la fiche · le groupe lu, ou le silence dit en clair', () => {
    const l = lectureOffres(entreesLectureOffres(lots, attribution), [REMISE, { id: 'vide', nom: 'Livraison offerte' }]);
    const t = testsDeLOffre(l, 'remise');
    expect(t.groupe?.ref).toEqual(REMISE);
    expect(t.lecture).toBe('au_dessus');
    expect(t.phrase).toMatch(/^4 gagnantes sur 4 variantes tranchées \(\d+ % à 100 %\) · nettement au-dessus du reste de la marque, 0 sur 6/);
    expect(testsDeLOffre(l, 'vide')).toEqual({ lecture: 'aucun', phrase: 'Aucune variante tranchée au protocole ne cible cette offre · rien à lire.', groupe: null });
    expect(testsDuGroupe(l, 'vide', 'ce persona').phrase).toContain('ne cible ce persona');
  });

  it('la fiche offre lit ses tests aux portes d’Adsmap et dans la marque active · fermé, la raison s’écrit', () => {
    expect(accesTestsOffre({ adsmap: 'ok', marqueActive: true })).toBeNull();
    expect(accesTestsOffre({ adsmap: 'plan', marqueActive: true })).toMatch(/formule Plus/);
    expect(accesTestsOffre({ adsmap: 'role', marqueActive: true })).toMatch(/rôle/);
    expect(accesTestsOffre({ adsmap: 'ok', marqueActive: false })).toMatch(/marque active/);
  });
});

describe('les gestes d’une fiche · seulement quand le groupe se détache · persona et offre, une seule règle', () => {
  const [G1, G2] = [U('11'), U('12')];
  const plan = new Set([G2]);
  const OFFRE = { id: 'remise', nom: 'Remise de bienvenue' };
  it('dans le bruit, sous l’effectif, sans référence · aucun geste', () => {
    for (const lecture of ['dans_le_bruit', 'effectif', 'reference', 'trop_de_personas'] as const) {
      expect(gestesLectureGroupe({ ref: OFFRE, lecture, k: 6, n: 6, reference: { k: 0, n: 6 } }, { groupe: 'offre', note: 'n', prioritaires: [], testsDeLaMarque: [G2], planIds: plan }), lecture).toBeNull();
    }
    expect(gestesLectureGroupe({ ref: OFFRE, lecture: 'au_dessus', k: 6, n: 6, reference: null }, { groupe: 'offre', note: 'n', prioritaires: [], testsDeLaMarque: [G2], planIds: plan })).toBeNull();
  });
  it('une offre au-dessus · Itérer part de SA gagnante au plan · l’hypothèse cite l’offre et ses verdicts, la variable est l’offre, source « offre »', () => {
    const g = gestesLectureGroupe({ ref: OFFRE, lecture: 'au_dessus', k: 4, n: 4, reference: { k: 0, n: 6 } }, { groupe: 'offre', note: 'note', prioritaires: [], testsDeLaMarque: [G1, G2], planIds: plan })!;
    expect(g.iterer).toEqual({ href: `/studio/iterer?iter=${G2}`, adId: G2, raison: null });
    expect(g.libelles).toEqual({ iterer: 'Itérer sur cette offre', hypothese: 'Créer une hypothèse', titre: 'Créer une hypothèse · Remise de bienvenue' });
    expect(g.hypothese, 'le départ et la source de l’hypothèse d’une offre').toEqual({
      depart: { parties: { si: 'on met l’offre « Remise de bienvenue » dans nos prochaines créas', alors: '', parceQue: 'ses variantes gagnent nettement plus souvent que le reste de la marque (4 sur 4 contre 0 sur 6)' }, variable: 'offer' },
      note: 'note', source: { type: 'offre', offreId: 'remise' },
    });
  });
  it('une offre en dessous, sans gagnante au plan · Itérer fermé avec SA raison', () => {
    const g = gestesLectureGroupe({ ref: OFFRE, lecture: 'en_dessous', k: 0, n: 6, reference: { k: 6, n: 8 } }, { groupe: 'offre', note: 'n', prioritaires: [], testsDeLaMarque: [G1], planIds: plan })!;
    expect(g.iterer).toEqual({ href: null, adId: null, raison: RAISON_ITERER_OFFRE_SANS_GAGNANTE });
    expect(g.hypothese.depart.parties.si).toBe('on remplace l’offre « Remise de bienvenue » dans nos prochaines créas');
  });
  it('un persona · la source de l’hypothèse est le persona · la forme du lot (`gestesPersonaLot`) est inchangée et se relit à l’identique', () => {
    const LEA = { id: 'lea', nom: 'Léa, 34 ans' };
    const g = gestesLectureGroupe({ ref: LEA, lecture: 'au_dessus', k: 6, n: 6, reference: { k: 0, n: 10 } }, { groupe: 'persona', note: 'n', prioritaires: [G1], testsDeLaMarque: [G2], planIds: new Set([G1, G2]) })!;
    expect([g.iterer.adId, g.libelles.iterer, g.libelles.titre, g.hypothese.source]).toEqual([G1, 'Itérer sur ce persona', 'Créer une hypothèse · Léa', { type: 'persona', personaId: 'lea' }]);
    const lotG = gestesPersonaLot({ persona: LEA, lecture: 'en_dessous', k: 0, n: 6, reference: { k: 8, n: 10 } }, { numeroLot: 3, testsDuLot: [], testsDeLaMarque: [], planIds: new Set() })!;
    expect(Object.keys(lotG).sort()).toEqual(['hypothese', 'iterer', 'nom', 'personaId']);
    expect(lotG.iterer.raison).toBe(RAISON_ITERER_SANS_GAGNANTE);
    expect(versGestesLecture(lotG)).toMatchObject({ groupe: 'persona', id: 'lea', iterer: lotG.iterer, hypothese: { ...lotG.hypothese, source: { type: 'persona', personaId: 'lea' } } });
  });
});

describe('la provenance « Jarvis » · jamais crue · posée seulement après relecture', () => {
  const J = { reponseId: U('21'), contexte: { type: 'lot' as const, id: U('22') } };
  it('la demande est relue champ par champ · un champ mal formé, et rien n’est deviné', () => {
    expect(lireDemandeProvenanceJarvis({ reponseId: U('21').toUpperCase(), contexte: { type: 'lot', id: U('22') } })).toEqual(J);
    for (const forge of [null, 'x', { reponseId: 'La V1 gagne', contexte: J.contexte }, { reponseId: J.reponseId }, { reponseId: J.reponseId, contexte: { type: 'resultats', id: U('22') } },
      { reponseId: J.reponseId, contexte: { type: 'lot', id: '../x' } }]) {
      expect(lireDemandeProvenanceJarvis(forge), JSON.stringify(forge)).toBeNull();
    }
  });
  it('posée seulement si la réponse est relue ET la pub de départ dans le contexte relu', () => {
    expect(provenanceJarvisAdmise(J, { reponseLue: true, parentAdId: U('31').toUpperCase(), adsDuContexte: [U('30'), U('31')] })).toEqual(J);
    expect(provenanceJarvisAdmise(J, { reponseLue: false, parentAdId: U('31'), adsDuContexte: [U('31')] }), 'réponse hors portée').toBeNull();
    expect(provenanceJarvisAdmise(J, { reponseLue: true, parentAdId: U('31'), adsDuContexte: null }), 'contexte hors portée').toBeNull();
    expect(provenanceJarvisAdmise(J, { reponseLue: true, parentAdId: U('39'), adsDuContexte: [U('31')] }), 'pub hors du contexte').toBeNull();
    expect(provenanceJarvisAdmise(null, { reponseLue: true, parentAdId: U('31'), adsDuContexte: [U('31')] })).toBeNull();
  });
  it('gardée dans le JSON de source, fusionnée, relue · un JSON abîmé ne dit rien', () => {
    const ref = { generationId: 'g', ...refProvenanceJarvis(J) };
    expect(lireProvenanceJarvis(ref)).toEqual(J);
    expect(lireProvenanceJarvis({ jarvis: { reponseId: 'x' } })).toBeNull();
    expect(lireProvenanceJarvis(null)).toBeNull();
  });
});

describe('le bilan lit « Geste de Jarvis » à part', () => {
  const entrees = (p: ProvenanceTest | null, k: number, n: number): EntreeLecturePersona[] =>
    Array.from({ length: n }, (_, i) => ({ persona: p ? { id: p, nom: PROVENANCES_TEST.find((x) => x.cle === p)!.libelle } : null, issue: i < k ? 'gagne' as const : 'perd' as const }));
  it('Jarvis forme son groupe, distinct des itérations ordinaires · la note ne dit plus qu’il tombe dans les itérations', () => {
    const b = bilanProvenances([...entrees('jarvis', 6, 6), ...entrees('iteration', 1, 4), ...entrees(null, 0, 10)]);
    expect(b.groupes.map((g) => [g.cle, g.lecture])).toEqual([['jarvis', 'au_dessus'], ['iteration', 'dans_le_bruit']]);
    expect(b.phrase).toBe('Geste de Jarvis au-dessus du reste de la marque, intervalles disjoints au niveau 0,975.');
    expect(NOTE_JARVIS_PROVENANCE, 'l’écran dit encore que Jarvis tombe dans les itérations').not.toContain('ne garde pas');
    expect(NOTE_JARVIS_PROVENANCE).toContain('« Geste de Jarvis »');
  });
  it('sept provenances qui parlent · au-delà du mesuré (six), le bilan se tait et dit pourquoi', () => {
    // Huit, puis neuf avec « Commentaire » · la règle en lit six au plus, le reste se tait.
    expect(PROVENANCES_TEST.length).toBe(MAX_PERSONAS_LECTURE + 3);
    const b = bilanProvenances([...PROVENANCES_TEST.slice(0, 7).flatMap((p) => entrees(p.cle, p.cle === 'tag' ? 6 : 0, 6)), ...entrees(null, 0, 4)]);
    expect([b.parle, b.niveau], 'sept provenances lues au-delà du mesuré').toEqual([false, null]);
    expect(b.groupes.every((g) => g.lecture === 'non_mesure'), 'sept provenances lues au-delà du mesuré').toBe(true);
    expect(b.groupes[0]!.phrase).toBe('6 gagnantes sur 6 variantes tranchées · plus de 6 provenances parlent, la règle n’est pas mesurée et se tait.');
    expect(b.phrase).toBe('7 provenances ont assez de verdicts · au-delà de 6, la règle n’est pas mesurée · le bilan se tait.');
    // Six seulement · la règle parle de nouveau, au niveau mesuré.
    const six = bilanProvenances([...PROVENANCES_TEST.slice(0, 6).flatMap((p) => entrees(p.cle, p.cle === 'tag' ? 6 : 0, 6)), ...entrees(null, 0, 4)]);
    expect(six.parle).toBe(true);
    expect(lecturePersonas([], []).parle).toBe(false);
  });
});
