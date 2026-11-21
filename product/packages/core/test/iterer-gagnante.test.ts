import { describe, it, expect } from 'vitest';
import {
  CLE_GAGNANTE_FIL, LIBELLE_ITERER_GAGNANTE, PARAM_GAGNANTE_ITERATION, RAISON_GAGNANTE_AUTRE_MARQUE, RAISON_GAGNANTE_NON_ARBITREE, RAISON_ROLE_ITERATION, REFUS_GAGNANTE,
  conclusionLot, departDepuisGagnante, etatLotSpatial, gagnantesConfirmees, gesteIterationGagnante, gestesGagnantesFil, lienIterationGagnante, lireDemandeProvenanceCommentaire,
  lireDemandeProvenanceNote, lireGagnanteDemandee, lireGagnanteDuFil, lireGesteFil, lireProvenanceCommentaire, lireProvenanceNote, phraseNeeDeGagnante,
  provenanceFilDepuisGagnanteAdmise, referenceConclusion, refProvenanceCommentaire, refProvenanceFilGagnante, refProvenanceNote, resultatsCommentaire, resultatsFil,
  choixIterationSpatial, MAX_CHOIX_ITERATION,
  type ChoixVariablesIteration, type FaitsAdSpatial, type LignePlanSpatial, type FaitsLotSpatialEntier, type IterationDuFil, type ResultatFil,
} from '../src';

/**
 * « Itérer depuis la gagnante » (suite de #1079) · en pur.
 *
 *  · QUAND · sous un résultat CONFIRMÉ seulement · infirmée, sans conclusion,
 *    en test · aucun geste · Résultats fermé · aucun résultat, donc rien ;
 *  · FERMÉ avec sa raison · autre marque active, rôle sans `studio.propose`,
 *    variante qui n'est pas une gagnante arbitrée (dans cet ordre) ;
 *  · l'adresse · l'écran Itérer EXISTANT, le fil ET la gagnante, jamais un texte ;
 *  · la provenance · la pub du fil (règle de #1063) OU une gagnante confirmée
 *    relue de ce fil · la même forme que #1066 / #1078, plus `gagnanteAdId` ·
 *    le lecteur de la demande n'en garde rien (le client ne peut pas la forger) ;
 *  · sous le fil · « née de la gagnante V7 » seulement pour une gagnante du
 *    MÊME fil · le champ n'existe pas sinon (la capture de main tient).
 */

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ad = (id: string, v: 'winner' | 'loser' | null): FaitsAdSpatial => ({
  id, variante: id, statut: 'done', hypothese: 'Si on teste, alors ça baisse, parce que.', variable: 'hook', plateforme: 'meta', texte: null, image: null, manques: [],
  verdict: v ? { calcule: v, retenu: v, statut: 'validated', comparable: true, raison: null, depense: 1, impressions: 1, achats: 1, cpa: 1 } : null,
});
const lot = (id: string, numero: number, ads: FaitsAdSpatial[]): FaitsLotSpatialEntier => ({ id, numero, but: null, statut: 'testing', lanceLe: '2026-09-01T00:00:00Z', ads, protocole: null });
const CTX = { maintenant: new Date('2026-11-09T00:00:00Z'), fenetreJours: 14 };
const REF = lot('r', 1, Array.from({ length: 8 }, (_, i) => ad(`r${i}`, i === 0 ? 'winner' : 'loser')));
const REF_HAUTE = lot('r', 1, Array.from({ length: 8 }, (_, i) => ad(`r${i}`, i === 0 ? 'loser' : 'winner')));
const GAGNE = { validated: 'winner' as const, comparable: true };
function iteration(l: FaitsLotSpatialEntier, autres: FaitsLotSpatialEntier[], adId: string, variante: string, plus: Partial<IterationDuFil> = {}): IterationDuFil {
  const etat = etatLotSpatial(l, CTX);
  return { adId, variante, lot: { id: l.id, numero: l.numero, etat }, conclusion: conclusionLot(l, etat, referenceConclusion([l, ...autres], l.id)), ...plus };
}
const A = { c: u(7), i: u(9), s: u(5), t: u(11), h: u(10), suite: u(12) };
/** Une itération par issue · confirmée (gagnante arbitrée), infirmée, sans conclusion, en test (verdict manquant), hors lot. */
const ITERATIONS: IterationDuFil[] = [
  iteration(lot('c', 3, [ad('V7', 'winner'), ad('a2', 'winner'), ad('a3', 'winner'), ad('a4', 'winner')]), [REF], A.c, 'V7', { verdict: GAGNE }),
  iteration(lot('i', 4, ['V9', 'b2', 'b3', 'b4'].map((x) => ad(x, 'loser'))), [REF_HAUTE], A.i, 'V9', { verdict: { validated: 'loser', comparable: true } }),
  iteration(lot('s', 5, [ad('V5', 'winner'), ad('c2', 'loser'), ad('c3', 'loser'), ad('c4', 'loser')]), [REF], A.s, 'V5', { verdict: GAGNE }),
  iteration(lot('t', 7, [ad('V11', null), ad('d2', 'winner'), ad('d3', 'winner'), ad('d4', 'winner')]), [REF], A.t, 'V11', { verdict: null }),
  { adId: A.h, variante: 'V10', lot: null, conclusion: null },
];
const K = u(50); const P = u(60); const N = u(70);
const O = { id: K, projetId: P, marqueActive: true, peutIterer: true };
const statut = (r: ResultatFil) => (r.etat === 'conclue' ? r.statut : 'en_test');
const confirme = () => resultatsFil(ITERATIONS, { resultats: true, marqueActive: true }).find((r) => r.adId === A.c)!;

describe('quand proposer · sous un résultat CONFIRMÉ seulement', () => {
  it('le geste n’existe que sous « Itération confirmée » · infirmée, sans conclusion, en test, hors lot · rien', () => {
    const r = resultatsFil(ITERATIONS, { resultats: true, marqueActive: true });
    expect(r.map(statut), 'les issues du jeu de test').toEqual(['V5', 'V7', 'V9', 'V10', 'V11'].map((v) => ({ V5: 'sans_conclusion', V7: 'confirmee', V9: 'infirmee', V10: 'en_test', V11: 'en_test' } as Record<string, string>)[v]));
    const g = gestesGagnantesFil('commentaire', r, ITERATIONS, O);
    expect(Object.keys(g), 'un geste sous un résultat non confirmé').toEqual([A.c]);
    expect(g[A.c]).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: `/studio/iterer?commentaire=${K}&projet=${P}&gagnante=${A.c}`, raison: null });
    for (const x of r.filter((y) => statut(y) !== 'confirmee')) expect(gesteIterationGagnante('commentaire', x, { ...O, verdict: GAGNE }), `un geste sous « ${statut(x)} »`).toBeNull();
  });
  it('Résultats fermé · aucun résultat, donc aucun geste', () => {
    const r = resultatsFil(ITERATIONS, { resultats: false, marqueActive: true });
    expect(gestesGagnantesFil('note', r, ITERATIONS, O)).toEqual({});
  });
  it('la note · la même règle · l’adresse nomme la note', () => {
    expect(gesteIterationGagnante('note', confirme(), { ...O, id: N, verdict: GAGNE })!.href).toBe(`/studio/iterer?note=${N}&projet=${P}&gagnante=${A.c}`);
  });
});

describe('fermé · la raison écrite à côté · l’ordre des portes', () => {
  it('autre marque active · d’abord (même sans le rôle) · puis le rôle · puis la variante non arbitrée', () => {
    const c = confirme();
    expect(gesteIterationGagnante('commentaire', c, { ...O, marqueActive: false, peutIterer: false, verdict: null }), 'autre marque active · le geste n’est pas fermé avec sa raison').toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: null, raison: RAISON_GAGNANTE_AUTRE_MARQUE });
    expect(gesteIterationGagnante('commentaire', c, { ...O, peutIterer: false, verdict: GAGNE }), 'sans le rôle · le geste n’est pas fermé avec sa raison').toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: null, raison: RAISON_ROLE_ITERATION });
    for (const v of [null, { validated: 'loser' as const, comparable: true }, { validated: 'winner' as const, comparable: false }, { validated: null, comparable: true }]) {
      expect(gesteIterationGagnante('commentaire', c, { ...O, verdict: v })?.raison, `verdict ${JSON.stringify(v)} · ouvert`).toBe(RAISON_GAGNANTE_NON_ARBITREE);
    }
    expect(RAISON_GAGNANTE_AUTRE_MARQUE).toMatch(/marque active/);
    expect(RAISON_ROLE_ITERATION).toBe('Ton rôle ne permet pas de créer le projet de cette itération.');
  });
  it('un identifiant mal formé · pas d’adresse, pas de geste', () => {
    expect(gesteIterationGagnante('commentaire', confirme(), { ...O, id: 'pas-un-uuid', verdict: GAGNE })).toBeNull();
    expect(lienIterationGagnante('commentaire', { id: K, projetId: P, adId: 'V7' })).toBeNull();
  });
});

describe('l’adresse · lue par l’écran Itérer', () => {
  it('`?gagnante=` · absente, lue, refusée (mal formée, donnée deux fois) · le fil se lit comme avant', () => {
    const href = lienIterationGagnante('commentaire', { id: K, projetId: P, adId: A.c })!;
    const sp = Object.fromEntries(new URL(href, 'http://x').searchParams.entries());
    expect(lireGesteFil(sp), 'le fil ne se lit plus').toEqual({ etat: 'ok', fil: 'commentaire', id: K, projetId: P });
    expect(lireGagnanteDemandee(sp)).toEqual({ etat: 'ok', adId: A.c });
    expect(lireGagnanteDemandee({ [PARAM_GAGNANTE_ITERATION]: A.c.toUpperCase() })).toEqual({ etat: 'ok', adId: A.c });
    expect(lireGagnanteDemandee({})).toEqual({ etat: 'absente' });
    expect(lireGagnanteDemandee({ gagnante: 'V7' })).toEqual({ etat: 'refus' });
    expect(lireGagnanteDemandee({ gagnante: [A.c, A.i] })).toEqual({ etat: 'refus' });
    expect(href, 'un texte dans l’adresse').toMatch(/^\/studio\/iterer\?commentaire=[0-9a-f-]{36}&projet=[0-9a-f-]{36}&gagnante=[0-9a-f-]{36}$/);
  });
  it('les gagnantes confirmées d’un fil · la règle de l’écran · rien d’autre', () => {
    expect(gagnantesConfirmees(ITERATIONS), 'une itération non confirmée comptée comme gagnante').toEqual([{ adId: A.c, variante: 'V7' }]);
    expect(gagnantesConfirmees([])).toEqual([]);
  });
  it('le départ · la gagnante présélectionnée, la variable du plan, aucun texte repris · la phrase le dit', () => {
    const choix: ChoixVariablesIteration = { adId: A.c, ferme: null, options: [], defaut: 'hook' };
    const d = departDepuisGagnante('commentaire', { adId: A.c, variante: 'V7' }, choix);
    expect([d.adId, d.hypothese, d.variable]).toEqual([A.c, null, 'hook']);
    expect(d.note).toBe('Itération depuis la gagnante V7, confirmée et née de ce commentaire · la variable proposée est celle du plan, modifiable · la nouvelle itération gardera la provenance de ce commentaire. Rien n’est créé sans ton clic sur « Créer l’itération ».');
    const n = departDepuisGagnante('note', { adId: A.c, variante: 'V7' }, { ...choix, ferme: 'Tout est fermé.', defaut: null });
    expect([n.variable, n.note]).toEqual([null, expect.stringContaining('née de cette note · choisis la variable à l’étape « Ce qu’on change »')]);
    expect(departDepuisGagnante('note', { adId: A.c, variante: 'V7' }, null).variable).toBeNull();
    expect(REFUS_GAGNANTE.commentaire).toMatch(/rien n’est présélectionné/);
  });
});

describe('la provenance · la même forme que le fil, plus la gagnante · relue avant d’être posée', () => {
  const demande = { commentaireId: K, projetId: P };
  it('la pub du fil · admise sans gagnante · une gagnante relue · admise avec elle · une autre pub, un fil non relu · rien', () => {
    expect(provenanceFilDepuisGagnanteAdmise(demande, { adDuFil: u(1), gagnantes: [A.c], parentAdId: u(1) })).toEqual({ provenance: demande, gagnante: null });
    expect(provenanceFilDepuisGagnanteAdmise(demande, { adDuFil: u(1), gagnantes: [A.c], parentAdId: A.c.toUpperCase() })).toEqual({ provenance: demande, gagnante: A.c });
    expect(provenanceFilDepuisGagnanteAdmise(demande, { adDuFil: u(1), gagnantes: [A.c], parentAdId: A.i }), 'une pub qui n’est pas une gagnante du fil').toBeNull();
    expect(provenanceFilDepuisGagnanteAdmise(demande, { adDuFil: null, gagnantes: [A.c], parentAdId: A.c }), 'le fil non relu').toBeNull();
    expect(provenanceFilDepuisGagnanteAdmise(null, { adDuFil: u(1), gagnantes: [A.c], parentAdId: A.c })).toBeNull();
  });
  it('la valeur posée · strictement celle de #1066 / #1078 sans gagnante · `gagnanteAdId` en plus sinon · relue par les lecteurs existants', () => {
    expect(refProvenanceFilGagnante({ fil: 'commentaire', provenance: demande }, null)).toStrictEqual(refProvenanceCommentaire(demande));
    expect(refProvenanceFilGagnante({ fil: 'note', provenance: { noteId: N, projetId: P } }, null)).toStrictEqual(refProvenanceNote({ noteId: N, projetId: P }));
    const ref = refProvenanceFilGagnante({ fil: 'commentaire', provenance: demande }, A.c);
    expect(ref).toStrictEqual({ commentaire: { commentaireId: K, projetId: P, [CLE_GAGNANTE_FIL]: A.c } });
    expect(lireProvenanceCommentaire(ref), 'la provenance du fil ne se relit plus').toEqual(demande);
    expect(lireGagnanteDuFil(ref, 'commentaire')).toBe(A.c);
    expect(lireGagnanteDuFil(ref, 'note'), 'la gagnante lue sous l’autre fil').toBeNull();
    const note = refProvenanceFilGagnante({ fil: 'note', provenance: { noteId: N, projetId: P } }, A.c);
    expect([lireProvenanceNote(note), lireGagnanteDuFil(note, 'note')]).toEqual([{ noteId: N, projetId: P }, A.c]);
    expect(refProvenanceFilGagnante({ fil: 'note', provenance: { noteId: N, projetId: P } }, 'V7'), 'une gagnante mal formée posée').toStrictEqual(refProvenanceNote({ noteId: N, projetId: P }));
  });
  it('le client ne forge rien · le lecteur de la demande ne garde que les identifiants du fil', () => {
    expect(lireDemandeProvenanceCommentaire({ commentaireId: K, projetId: P, gagnanteAdId: A.c })).toStrictEqual({ commentaireId: K, projetId: P });
    expect(lireDemandeProvenanceNote({ noteId: N, projetId: P, gagnanteAdId: A.c })).toStrictEqual({ noteId: N, projetId: P });
    expect(lireGagnanteDuFil({ commentaire: { commentaireId: K, projetId: P, gagnanteAdId: 'x' } }, 'commentaire')).toBeNull();
    expect(lireGagnanteDuFil(null, 'commentaire')).toBeNull();
  });
});

describe('sous le fil · « née de la gagnante V7 » · seulement une gagnante du MÊME fil', () => {
  it('l’itération partie de la gagnante le dit · une gagnante hors du fil, ou elle-même · le champ n’existe pas', () => {
    const suite = { adId: A.suite, variante: 'V12', lot: null, conclusion: null, gagnante: A.c };
    const r = resultatsFil([...ITERATIONS, suite], { resultats: true, marqueActive: true });
    expect(r.find((x) => x.adId === A.suite)).toEqual({ etat: 'en_test', adId: A.suite, variante: 'V12', libelle: 'Itération en test', phrase: 'son résultat se lira ici quand son lot sera conclu', depuis: 'V7' });
    expect(phraseNeeDeGagnante('V7')).toBe('née de la gagnante V7');
    const ailleurs = resultatsFil([...ITERATIONS, { ...suite, gagnante: u(99) }], { resultats: true, marqueActive: true });
    expect('depuis' in ailleurs.find((x) => x.adId === A.suite)!, 'une gagnante hors du fil est nommée').toBe(false);
    const elle = resultatsFil([{ ...ITERATIONS[0]!, gagnante: A.c }], { resultats: true, marqueActive: true });
    expect('depuis' in elle[0]!, 'une itération née d’elle-même').toBe(false);
  });
  it('les champs nouveaux (verdict, gagnante nulle) · la sortie est strictement celle d’avant, sans eux', () => {
    const sans = ITERATIONS.map(({ verdict: _v, gagnante: _g, ...x }) => x);
    for (const o of [{ resultats: true, marqueActive: true }, { resultats: true, marqueActive: false }]) {
      expect(resultatsCommentaire(ITERATIONS.map((i) => ({ ...i, gagnante: null })), o)).toStrictEqual(resultatsCommentaire(sans, o));
    }
  });
});

describe('l’écran Itérer · la pub demandée par un fil est gardée même au-delà des plus urgentes', () => {
  const ligne = (i: number): LignePlanSpatial => ({
    adId: u(200 + i), label: `Pub ${i}`, mode: 'more', modeLabel: 'Plus de', rationale: 'Raison.', variableLabel: 'Accroche', freezeLabels: [],
    parentVerdict: 'winner', parentComparable: true, edgeLegal: true, spend: null,
  });
  const rows = Array.from({ length: MAX_CHOIX_ITERATION + 3 }, (_, i) => ligne(i));
  it('sans pub demandée · les plus urgentes, comme avant · demandée parmi elles · rien de plus · demandée plus loin · ajoutée à la fin, sélectionnable', () => {
    const avant = choixIterationSpatial(rows, () => undefined, { peutIterer: true });
    expect(avant.map((c) => c.adId)).toEqual(rows.slice(0, MAX_CHOIX_ITERATION).map((r) => r.adId));
    expect(choixIterationSpatial(rows, () => undefined, { peutIterer: true, garder: rows[3]!.adId })).toStrictEqual(avant);
    const loin = rows[MAX_CHOIX_ITERATION + 1]!.adId;
    const garde = choixIterationSpatial(rows, () => undefined, { peutIterer: true, garder: loin.toUpperCase() });
    expect(garde.map((c) => c.adId), 'la pub demandée n’est pas gardée').toEqual([...avant.map((c) => c.adId), loin]);
    expect(garde.at(-1)!.selectionnable).toBe(true);
    expect(choixIterationSpatial(rows, () => undefined, { peutIterer: true, garder: u(999) }), 'une pub hors du plan ajoutée').toStrictEqual(avant);
  });
});
