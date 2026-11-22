import { describe, expect, it } from 'vitest';
import {
  BORNES_LECTURE_LOTS, DEFAULT_VERDICT_CONFIG, MESURE_LECTURE_LOTS, MESURE_LECTURE_LOT_SEUL, PRESENTATION_ETAT_LOT, TITRE_LECTURE_INCOMPLETE,
  compteAConclure, compteAImporter, dansFiltreLots, etatLotSpatial, lotArbitrable, lotImport, lotLuEnEntier, lotsALire, lotsConclusLus,
  noteLectureLots, phraseLotLuEnPartie, presentationLot, syntheseLot, controlesLot, coachLot, conclusionLot, phraseLot, indexAutresLots, resumerContexteJarvis,
  NON_CALCULE_LECTURE, NON_CALCULE, RAISON_CONCLURE_NON_LANCE, RAISON_CONCLURE_HISTORIQUE, gestesClavierLot, gestesContexteJarvis, variantesDe, RAISON_GESTE_LECTURE_INCOMPLETE, lectureDuLot, nombreVariantes, categorieLot, plateformesLot, hypotheseLot, preparationLot, suiteLot,
  type EtatLotSpatial, type FaitsAdSpatial, type FaitsLotSpatial, type FaitsVerdictSpatial, type VerdictValue,
} from '../src';

/**
 * Un lot est lu EN ENTIER, ou il est dit lu en partie (suite de #1116). Pur.
 *
 * La lecture des lots d'une marque était bornée globalement (2 000 variantes
 * par code, tous lots mêlés) · l'état de chaque lot se calculait sur ce qui
 * restait. Désormais · les lots sont lus entiers, du plus récent au plus
 * ancien, tant que le budget tient (`lotsALire`) · un lot lu en partie n'a
 * pas d'état calculé (`illisible`), il n'est compté nulle part, la fiche ne
 * propose pas son arbitrage, et l'écran le dit.
 */

const J = 86_400_000;
const LANCE = new Date('2026-10-05T08:00:00Z');
const CTX = { maintenant: new Date(LANCE.getTime() + 20 * J), fenetreJours: 7 };
const J8 = new Date(LANCE.getTime() + 8 * J).toISOString();

const verdict = (calcule: VerdictValue, o: Partial<FaitsVerdictSpatial> = {}): FaitsVerdictSpatial => ({
  calcule, retenu: null, statut: 'computed', comparable: true, raison: 'r', depense: 150, impressions: 20_000, achats: 3, cpa: 30, calculeLe: J8, ...o,
});
const arbitre = (v: VerdictValue) => verdict(v, { statut: 'validated', retenu: v });
const ad = (id: string, v: FaitsVerdictSpatial | null): FaitsAdSpatial => ({
  id, variante: id, statut: 'live', hypothese: 'h', variable: 'hook', plateforme: 'meta', texte: 't', image: null, manques: [], verdict: v,
});
/** Un lot tel que la lecture le rend · `variantesEnBase` absent · lu en entier · sinon `lectureDuLot` (partiel s'il en manque). */
const lot = (id: string, numero: number, ads: FaitsAdSpatial[], variantesEnBase?: number, statut = 'testing'): FaitsLotSpatial & { finPrevue: string | null } => ({
  id, numero, but: null, statut, lanceLe: statut === 'testing' ? LANCE.toISOString() : null, protocole: null, finPrevue: new Date(LANCE.getTime() + 7 * J).toISOString(),
  ...lectureDuLot(ads, variantesEnBase ?? ads.length),
});
/** Le motif des phrases tirées de rien (garde « B ») · le même que celui des vues en base. */
const FAUSSES = /aucune variante|Aucune mesure|Durée prévue atteinte|en préparation : 0|à choisir|Aucune hypothèse|Aucun persona|Aucune variante rangée|Pas encore lancé|0 étape/;

describe('lotsALire · les plus récents, chacun en entier, tant que le budget tient', () => {
  const b = { budget: 10, plafondParLot: 4, plafondLotSeul: 6 };
  it('prend les lots dans l’ordre, entiers · s’arrête de prendre ce qui ne tient plus', () => {
    const l = [{ id: 'a', variantesEnBase: 4 }, { id: 'b', variantesEnBase: 4 }, { id: 'c', variantesEnBase: 3 }, { id: 'd', variantesEnBase: 2 }];
    expect([...lotsALire(l, b)], 'le budget est dépassé, ou un lot plus ancien passe avant').toEqual(['a', 'b', 'd']);
  });
  it('un lot au-delà du plafond est sauté, jamais lu en partie · il ne prend rien aux plus anciens', () => {
    expect([...lotsALire([{ id: 'gros', variantesEnBase: 5 }, { id: 'x', variantesEnBase: 4 }], b)]).toEqual(['x']);
    expect([...lotsALire([{ id: 'pile', variantesEnBase: 4 }], b)], 'le plafond est exclusif').toEqual(['pile']);
  });
  it('un lot vide est toujours lu (en entier) · le budget exact suffit', () => {
    expect([...lotsALire([{ id: 'a', variantesEnBase: 4 }, { id: 'b', variantesEnBase: 4 }, { id: 'v', variantesEnBase: 0 }, { id: 'c', variantesEnBase: 2 }], b)]).toEqual(['a', 'b', 'v', 'c']);
  });
  it('le lot d’une fiche · lu en entier hors budget, jusqu’au plafond d’un lot seul · les autres lus comme dans la liste', () => {
    const l = [{ id: 'a', variantesEnBase: 4 }, { id: 'b', variantesEnBase: 4 }, { id: 'c', variantesEnBase: 2 }, { id: 'vieux', variantesEnBase: 5 }];
    expect([...lotsALire(l, b)], 'préalable · le plus ancien n’est pas lu dans la liste').toEqual(['a', 'b', 'c']);
    expect([...lotsALire(l, b, 'vieux')].sort(), 'la fiche d’un lot ancien ne le lit pas, ou prend le budget des autres').toEqual(['a', 'b', 'c', 'vieux']);
    expect([...lotsALire([{ id: 'x', variantesEnBase: 7 }], b, 'x')], 'au-delà du plafond d’un lot seul, même sa fiche le lit').toEqual([]);
  });
  it('le lot d’une fiche · les AUTRES lots sont exactement ceux de la liste · il ne libère ni ne prend de budget', () => {
    const l = [{ id: 'a', variantesEnBase: 4 }, { id: 'fiche', variantesEnBase: 4 }, { id: 'b', variantesEnBase: 4 }, { id: 'c', variantesEnBase: 2 }];
    const liste = lotsALire(l, b);
    expect([...liste], 'préalable · la liste').toEqual(['a', 'fiche', 'c']);
    const fiche = lotsALire(l, b, 'fiche');
    expect([...fiche].filter((id) => id !== 'fiche'), 'la fiche lit d’autres lots que la liste').toEqual([...liste].filter((id) => id !== 'fiche'));
    expect(fiche.has('fiche')).toBe(true);
  });
  it('les bornes retenues · celles du tableau mesuré, plafond au quart du budget', () => {
    expect(BORNES_LECTURE_LOTS).toEqual({ budget: 2000, plafondParLot: 500, plafondLotSeul: 500 });
    // La fiche d'un lot au plafond d'un lot seul ne coûte pas plus de dix fois une fiche ordinaire (mesurée 125 à 149 ms) · 1 000 en coûte trente.
    const auPlafond = MESURE_LECTURE_LOT_SEUL.find((m) => m.variantes === BORNES_LECTURE_LOTS.plafondLotSeul);
    expect(auPlafond, 'le plafond d’un lot seul n’a pas été mesuré').toBeDefined();
    expect(Math.max(...auPlafond!.ficheMs.slice(1)), 'la fiche d’un lot au plafond est trop lente').toBeLessThanOrEqual(149 * 10);
    const retenue = MESURE_LECTURE_LOTS.filter((m) => m.marque === 'grande' && m.budget === BORNES_LECTURE_LOTS.budget);
    expect(retenue.length, 'le budget retenu n’a pas été mesuré').toBeGreaterThan(0);
    // Le rail ne coûte pas plus qu'avant, au même passage (médiane des trois passages, 15 % de marge pour le bruit).
    const med = (xs: readonly number[]) => [...xs].sort((x, y) => x - y)[1]!;
    const avant = MESURE_LECTURE_LOTS.filter((m) => m.marque === 'grande' && m.budget === 'avant');
    for (const [i, r] of retenue.entries()) expect(med(r.railMs), 'le rail retenu coûte plus que celui d’avant').toBeLessThanOrEqual(med(avant[i]!.railMs) * 1.15);
  });
});

describe('le TYPE · un lot lu en partie n’expose aucune variante', () => {
  it('`lectureDuLot` · autant lues que comptées · entier · sinon partiel, sans `ads`', () => {
    expect(lectureDuLot([1, 2], 2)).toEqual({ ads: [1, 2] });
    expect(lectureDuLot([1], 2)).toEqual({ partielle: { variantesEnBase: 2, variantesLues: 1 } });
    expect(lectureDuLot([1, 2, 3], 2), 'plus lues que comptées (écrites entre le compte et la lecture)').toEqual({ partielle: { variantesEnBase: 2, variantesLues: 3 } });
    expect(lotLuEnEntier(lectureDuLot([], 0))).toBe(true);
    expect(lotLuEnEntier(lectureDuLot([], 3))).toBe(false);
    expect(nombreVariantes(lectureDuLot([], 3))).toBe(3);
  });
  it('parcourir les variantes d’un lot sans traiter le cas partiel ne compile pas', () => {
    const l: FaitsLotSpatial = lot('t', 1, [], 3);
    // @ts-expect-error · `ads` est absent d'un lot lu en partie · un dérivé qui l'oublie ne compile pas (si `ads` redevenait toujours présent, cette ligne casserait le typage).
    expect(() => l.ads.length, 'un lot lu en partie expose une liste de variantes').toThrow(TypeError);
  });
});

describe('l’état d’un lot lu en partie · « Lecture incomplète », jamais un état tiré d’une partie', () => {
  // `a` arbitrée lue, `z` gagnante calculée qui attend, coupée · lue en entier, à conclure.
  const coupe = lot('l', 20, [ad('a', arbitre('winner'))], 2);
  const entier = lot('l', 20, [ad('a', arbitre('winner')), ad('z', verdict('winner'))], 2);
  it('lu en partie · ni conclu, ni à conclure · `illisible`', () => {
    expect(etatLotSpatial(entier, CTX)).toBe('a_conclure');
    expect(etatLotSpatial(coupe, CTX), 'un lot lu en partie reçoit un état calculé sur une partie').toBe('illisible');
    expect(etatLotSpatial(lot('l', 20, [ad('a', arbitre('winner'))]), CTX), 'préalable · lue comme entière, l’ancienne lecture le disait conclu').toBe('conclu');
  });
  it('le statut seul donne l’état · en préparation, prêt, historique · inchangés, lus en partie ou non', () => {
    expect(etatLotSpatial(lot('p', 1, [], 3, 'planned'), CTX)).toBe('composition');
    expect(etatLotSpatial(lot('r', 1, [], 3, 'ready'), CTX)).toBe('pret');
    expect(etatLotSpatial({ ...lot('i', 1, [], 3, 'analyzed'), lanceLe: null }, CTX)).toBe('importe');
  });
  it('compté nulle part · ni à conclure, ni à importer, ni conclu · aucun arbitrage, aucun filtre sauf « Tous »', () => {
    // `a2` sans verdict coupée · lu en entier, des mesures manquent.
    const sansVerdict = lot('m', 21, [ad('a', verdict('winner'))], 2);
    expect(compteAConclure([{ ...coupe, id: 'c' }, sansVerdict], CTX).n, 'un lot lu en partie est compté à conclure').toBe(0);
    expect(compteAImporter([{ ...coupe, id: 'c' }, sansVerdict], CTX, DEFAULT_VERDICT_CONFIG).n, 'un lot lu en partie est compté à importer').toBe(0);
    expect(lotsConclusLus([coupe], CTX).size).toBe(0);
    expect(lotArbitrable('illisible')).toBe(false);
    expect(['tous', 'preparation', 'diffusion', 'importer', 'conclure'].filter((f) => dansFiltreLots('illisible', f as never))).toEqual(['tous']);
  });
  it('la liste le présente « Lecture incomplète », vers sa fiche · ni hypothèse, ni variable, ni plateforme « à choisir »', () => {
    const p = presentationLot(coupe, CTX);
    expect(p.statut.libelle).toBe(TITRE_LECTURE_INCOMPLETE);
    expect(p.action.href).toBe('/adsmap/lots/l');
    expect(PRESENTATION_ETAT_LOT.illisible.versImport).toBeUndefined();
    expect([p.hypothese, p.categorie, p.plateformes]).toEqual([null, NON_CALCULE, NON_CALCULE]);
    expect(p.sansHypothese).toBe('Lecture incomplète · 1 variante lue sur 2 · ses variantes ne sont pas lues ici.');
    expect([categorieLot(coupe), plateformesLot(coupe), hypotheseLot(coupe), preparationLot(coupe, 0)]).toEqual([NON_CALCULE, NON_CALCULE, null, null]);
    expect([p.sansHypothese, p.categorie, p.plateformes].filter((t) => FAUSSES.test(t)), 'la liste dit une phrase tirée de rien').toEqual([]);
  });
});

describe('un lot lu en partie · aucune phrase tirée d’une partie (ou de rien)', () => {
  // Lancé il y a 3 jours, fenêtre de 7 · encore en cours · AUCUNE variante lue sur 8.
  const enCours = { maintenant: new Date(LANCE.getTime() + 3 * J), fenetreJours: 7 };
  const nonLu = lot('n', 30, [], 8);
  const p = presentationLot(nonLu, enCours);
  it('synthèse, contrôles, conseil, conclusion · « non calculé », jamais « aucune variante », « Aucune mesure » ni « Durée prévue atteinte »', () => {
    const syn = syntheseLot(nonLu, 50);
    const textes = [syn.titre, syn.phrase, ...controlesLot(nonLu, p, 5000).flatMap((c) => [c.titre, c.detail]),
      ...Object.values(coachLot(p, syn, nonLu)), phraseLot(p, syn, nonLu), suiteLot(p.etat, syn), conclusionLot(nonLu, p.etat, { n: 40, k: 10 }).titre, conclusionLot(nonLu, p.etat, { n: 40, k: 10 }).phrase];
    expect(textes.filter((t) => FAUSSES.test(t)), 'une phrase est tirée de rien').toEqual([]);
    expect(syn).toMatchObject({ gagnante: null, titre: 'Non calculé' });
    expect(syn.phrase).toBe('Lecture incomplète · 0 variante lue sur 8 · le verdict d’ensemble n’est pas calculé sur une partie du lot.');
    expect(controlesLot(nonLu, p, 5000).map((c) => c.detail).slice(0, 2)).toEqual([NON_CALCULE_LECTURE, 'lecture incomplète · minimum 5\u202f000']);
    expect(conclusionLot(nonLu, p.etat, { n: 40, k: 10 }).titre).toBe('Non calculée · lecture incomplète');
  });
  it('un lot en préparation lu en partie · le conseil ne dit pas « 0 variante »', () => {
    const prep = lot('p', 31, [], 900, 'planned');
    const pp = presentationLot(prep, CTX);
    expect(pp.etat).toBe('composition');
    expect(phraseLot(pp, syntheseLot(prep, 50), prep), 'une préparation lue en partie dit « Aucune variante rangée »').toMatch(/^Non lu · 0 variante lue sur 900 · /);
    expect(controlesLot(prep, pp, 5000).map((c) => c.titre).filter((t) => FAUSSES.test(t)), 'les contrôles d’une préparation lue en partie disent « Pas encore lancé »').toEqual([]);
    const imp = { ...lot('h', 32, [], 40, 'analyzed'), lanceLe: null };
    expect(controlesLot(imp, presentationLot(imp, CTX), 5000)[0]!.titre, 'un historique lu en partie dit « Pas encore lancé »').toBe('Historique importé');
    expect(Object.values(coachLot(pp, syntheseLot(prep, 50), prep)).join(' ')).toBe('Lecture incomplète : non calculé · 0 variante lue sur 900 · aucun conseil n’est tiré d’une partie du lot.');
  });
  it('Jarvis · le contexte d’un lot lu en partie dit le compte en base, jamais « 0 variante » ni « aucune variante »', () => {
    const r = resumerContexteJarvis({ type: 'lot', brandId: 'm', lot: nonLu, lots: [nonLu], ctx: enCours, cibleCpa: 50 }, { brandId: 'm' })!;
    const texte = r.lignes.join('\n');
    expect(texte.match(FAUSSES), 'le contexte de Jarvis dit une phrase tirée de rien').toBeNull();
    expect(texte).not.toMatch(/· 0 variante(?! lue)/);
    expect(texte).toMatch(/8 variantes en base, 0 variante lue sur 8 · lecture incomplète, rien n’est calculé sur ce lot/);
    expect(r.question, 'la question de Jarvis parle d’un état « lecture incomplète »').not.toMatch(/ce lot est lecture incomplète/i);
    expect(r.question).toMatch(/ses variantes n’ont pas été lues ici \(0 variante lue sur 8\)/);
  });
  it('« Lu en partie » pour une partie, « Non lu » pour rien · l’urgence passe après l’historique importé', () => {
    expect(phraseLot(p, syntheseLot(nonLu, 50), nonLu)).toMatch(/^Non lu · /);
    const partie = lot('q', 33, [ad('a', null), ad('b', null), ad('c', null)], 8);
    expect(phraseLot(presentationLot(partie, enCours), syntheseLot(partie, 50), partie)).toMatch(/^Lu en partie · 3 variantes lues sur 8 · /);
    expect(indexAutresLots([{ etat: 'illisible' }, { etat: 'importe' }, { etat: 'conclu' }, { etat: 'non_concluant' }], -1, 4), 'un lot illisible passe avant un lot conclu ou importé').toEqual([3, 2, 1, 0]);
  });
});

describe('les gestes d’un lot lu en partie · le lot lui-même, une raison vraie', () => {
  const partiel = lot('g', 40, [], 8);
  it('les raccourcis de la fiche · ni « aucun verdict n’attend », ni « aucune gagnante » · « Non calculé », avec le recours', () => {
    const g = gestesClavierLot({ etat: 'illisible', ...variantesDe(partiel), planIds: new Set() });
    expect([g.conclure.href, g.iterer.href]).toEqual([null, null]);
    expect([g.conclure.raison, g.iterer.raison], 'un geste fermé d’un lot lu en partie dit une raison tirée de rien').toEqual([RAISON_GESTE_LECTURE_INCOMPLETE, RAISON_GESTE_LECTURE_INCOMPLETE]);
    expect(RAISON_GESTE_LECTURE_INCOMPLETE).toBe('Non calculé · lecture incomplète · arbitre depuis la fiche de test d’une variante.');
  });
  it('les gestes de Jarvis · même raison, pour « Créer l’itération » et « Conclure le lot »', () => {
    const id = '00000000-0000-4000-8000-000000000040';
    const g = gestesContexteJarvis({ type: 'lot', id, ...variantesDe(partiel), lot: { id, etat: 'illisible', ...variantesDe(partiel) } })!;
    expect([g.iterer.cible, g.conclure.cible]).toEqual([null, null]);
    expect([g.iterer.raison, g.conclure.raison], 'un geste de Jarvis fermé sur un lot lu en partie dit une raison tirée de rien').toEqual([RAISON_GESTE_LECTURE_INCOMPLETE, RAISON_GESTE_LECTURE_INCOMPLETE]);
  });
  it('lu en partie mais NON lancé (préparation, prêt) ou importé · raisons tirées du STATUT · jamais « aucune gagnante » ni « aucun verdict »', () => {
    // Une gagnante arbitrée hors lot peut être rangée dans un lot en préparation de plus de 500 variantes (`setBatchAdAction`) · la partie
    // non lue peut la porter · « Aucune variante de ce lot n'est une gagnante arbitrée » serait faux.
    const cas: Array<[EtatLotSpatial, string, string]> = [
      ['composition', 'planned', RAISON_CONCLURE_NON_LANCE],
      ['pret', 'ready', RAISON_CONCLURE_NON_LANCE],
      ['importe', 'analyzed', RAISON_CONCLURE_HISTORIQUE],
    ];
    for (const [etat, statut, conclure] of cas) {
      const prep = lot('p', 42, [], 900, statut);
      const g = gestesClavierLot({ etat, ...variantesDe(prep), planIds: new Set() });
      expect([g.conclure.raison, g.iterer.raison], `raccourcis · ${etat}`).toEqual([conclure, NON_CALCULE_LECTURE]);
      const id = '00000000-0000-4000-8000-000000000042';
      const j = gestesContexteJarvis({ type: 'lot', id, ...variantesDe(prep), lot: { id, etat, ...variantesDe(prep) } })!;
      expect([j.iterer.raison, j.conclure.raison], `Jarvis · ${etat}`).toEqual([NON_CALCULE_LECTURE, conclure]);
      for (const r of [g.conclure.raison, g.iterer.raison, j.iterer.raison, j.conclure.raison]) {
        expect(r, `${etat} · une raison tirée d'un contenu non lu`).not.toMatch(/gagnante arbitrée|Aucun verdict|arbitre depuis/i);
      }
    }
    expect(RAISON_CONCLURE_NON_LANCE).toBe('Ce lot n’est pas lancé · il se conclut après sa diffusion.');
    expect(RAISON_CONCLURE_HISTORIQUE).toBe('Ce lot est un historique importé · il ne se conclut pas ici.');
  });
  it('`variantesDe` · toutes ou aucune, jamais un `[]` à la place', () => {
    expect(variantesDe(partiel)).toEqual({ partielle: { variantesEnBase: 8, variantesLues: 0 } });
    expect(variantesDe(lot('e', 41, [ad('a', null)]))).toEqual({ ads: [ad('a', null)] });
  });
});

describe('ce que l’écran dit d’un lot lu en partie', () => {
  it('la fiche d’un lot trop grand pour elle · le recours · la fiche de test d’une variante', () => {
    expect(phraseLotLuEnPartie(lectureDuLot([], 6000), { etatCalcule: false, fiche: true })).toMatch(/proposé ici\. Une fiche lit son lot en entier jusqu’à 500 variantes · au-delà, ouvre la fiche de test d’une variante \(Résultats · Tests\) pour l’arbitrer seule\.$/);
  });
  it('la fiche · combien lues, sur combien, et pourquoi rien n’est calculé · en français, sans tiret cadratin', () => {
    const t = phraseLotLuEnPartie(lectureDuLot([1], 600), { etatCalcule: false })!;
    expect(t).toBe('1 variante lue sur 600 · son état n’est pas calculé sur une partie de ses variantes · il n’est compté ni à conclure ni à importer, et son arbitrage n’est pas proposé ici. La lecture garde les lots les plus récents, chacun avec toutes ses variantes, jusqu’à 2 000 variantes en tout et 500 par lot.');
    expect(phraseLotLuEnPartie(lectureDuLot([1, 2], 2), { etatCalcule: false })).toBeNull();
    expect(phraseLotLuEnPartie(lectureDuLot([], 900), { etatCalcule: true })).toMatch(/^0 variante lue sur 900 · ses variantes ne sont pas affichées, aucune n’est tirée d’une partie du lot\. /);
    expect(t).not.toMatch(/—/);
  });
  it('la liste · le nombre de lots lus en partie · rien quand tous sont entiers', () => {
    expect(noteLectureLots([lectureDuLot([], 3), lectureDuLot([1], 1)])).toMatch(/^1 lot lu en partie · aucun état n’est calculé sur une partie de ses variantes · /);
    expect(noteLectureLots([lectureDuLot([], 3), lectureDuLot([], 2)])).toMatch(/^2 lots lus en partie · aucun état n’est calculé sur une partie de leurs variantes · un lot lancé dit « Lecture incomplète »\. .* Sa fiche le lit en entier jusqu’à 500 variantes\.$/);
    expect(noteLectureLots([lectureDuLot([1], 1), lectureDuLot([], 0)])).toBeNull();
  });
  it('l’import d’un lot lu en partie · aucun diagnostic tiré des variantes lues, la phrase à la place', () => {
    const v = { code: 'a', nomRegie: 'N', statut: 'live', plateforme: 'meta', verdict: null };
    const p = lotImport({ id: 'l', numero: 22, but: null }, { partielle: { variantesEnBase: 2, variantesLues: 1 } }, DEFAULT_VERDICT_CONFIG, { ...CTX, lanceLe: LANCE.toISOString() });
    expect(p.diagnostic, 'l’import tire un diagnostic d’une partie du lot').toBeNull();
    expect(p.variantes, 'l’import montre une partie des variantes').toEqual([]);
    expect(p.lecture).toMatch(/^1 variante lue sur 2 · /);
    const e = lotImport({ id: 'l', numero: 22, but: null }, [v], DEFAULT_VERDICT_CONFIG, { ...CTX, lanceLe: LANCE.toISOString() });
    expect(e.lecture).toBeNull();
    expect(e.diagnostic).not.toBeNull();
  });
});
