import { wilsonInterval, type Interval } from '../../adsmap/stats';
import { estLotImporte } from '../../adsmap/lot-nature';
import type { VerdictValue } from '../../adsmap/types';
import { verdictAffiche, type EtatLotSpatial, type FaitsAdSpatial, type FaitsLotSpatial } from './lots';

/**
 * Spatial · Résultats · la CONCLUSION d'un lot entier, et l'écart d'une
 * gagnante au reste de son lot (Accueil, « Quoi itérer »).
 *
 * Pur · ni base, ni réseau, ni modèle, ni horloge.
 *
 * ── Ce que « conclure un lot » veut dire ici ────────────────────────────────
 *
 * Le moteur rend un verdict PAR VARIANTE (cible CPA de la marque). Le lot, lui,
 * porte une hypothèse (« si on change l'accroche, alors… »). Il la CONFIRME
 * quand ses variantes gagnent nettement plus souvent que la marque d'habitude,
 * l'INFIRME quand elles gagnent nettement moins souvent, et se TAIT sinon.
 * Doctrine « comparer à la référence, jamais à zéro » :
 *
 *  · la référence est le taux de gagnantes des AUTRES lots de la marque (suivis
 *    dans l'outil, verdicts au protocole), jamais zéro ni une cible posée ;
 *  · un groupe n'a le droit de parler qu'au-delà d'un effectif minimum (le lot
 *    ET la référence) ;
 *  · l'intervalle de Wilson du lot doit EXCLURE l'intervalle de la référence ·
 *    la référence est elle-même une estimation, on tient compte de son bruit ;
 *  · le silence (« non concluante ») est une conclusion valable, et la plus
 *    fréquente.
 *
 * Seules comptent les variantes tranchées AU PROTOCOLE (verdict comparable ·
 * gagnante, naissante ou perdante) · un non-concluant, un sous-diffusé ou une
 * prometteuse relative ne disent rien de l'hypothèse. Le témoin (`none_control`)
 * ne teste pas l'hypothèse, il n'entre pas dans le compte.
 *
 * ── Les seuils, MESURÉS (jamais posés d'instinct) ───────────────────────────
 *
 * Mesure exacte (loi binomiale, aucun tirage) · script et sorties dans la PR.
 * Données · le tableau réel Truefords (fixture du noyau `sheet-truefords` ·
 * lots tranchés de 4, 5 et 3 variantes, 2 gagnantes sur 12, taux 0,167) et le
 * semis de recette (`packages/db/scripts/seed-fixtures.mjs` · 11 sur 21, 0,524).
 * Sous l'hypothèse nulle (le lot gagne exactement au taux de la marque, la
 * référence estimée sur R verdicts), la part de lots qui « concluent » quand
 * même · confirmée + infirmée, donc une erreur :
 *
 *   intervalle du lot contre…     niveau   pire erreur          puissance médiane
 *                                          (n 4 à 8, p0 0,1     (lot qui gagne deux fois
 *                                          à 0,7, R 6 à 50)     plus · n 4 à 8, R 20)
 *   le taux ponctuel de la marque  0,80    0,843                0,653   (le niveau du moteur)
 *   le taux ponctuel de la marque  0,90    0,454                0,490
 *   le taux ponctuel de la marque  0,95    0,380                0,351   (le bruit de la référence ignoré)
 *   l'intervalle de la marque      0,80    0,373                0,519
 *   l'intervalle de la marque      0,90    0,131                0,221   ← retenu
 *   l'intervalle de la marque      0,95    0,054                0,086   (presque toujours muet)
 *
 *   effectif du lot n (retenu)   2      3      4      5      6      7      8      9      10
 *   pire erreur                  0,125  0,184  0,131  0,114  0,124  0,108  0,104  0,100  0,095
 *
 *   effectif de la référence R (retenu, n 4 à 8)   2      3      4      6      10     20     50
 *   pire erreur                                    0,113  0,125  0,109  0,109  0,106  0,104  0,131
 *
 * Choix, avec marge · erreur tolérée 15 % au plus (le moteur en tolère 20 % par
 * côté) · niveau 0,90 et intervalles disjoints · 4 variantes tranchées au moins
 * (à 3, l'erreur monte à 18 % · à partir de 4 elle ne dépasse plus 13,1 %) ·
 * 4 verdicts de référence au moins (le même plancher que le lot · l'intervalle
 * de la référence absorbe déjà son bruit, R ne change presque pas l'erreur).
 * Lu sur les trois lots réels du tableau (référence · les deux autres), la règle
 * se tait trois fois · c'est attendu. Le test du noyau recalcule l'erreur exacte
 * et tombe si l'un de ces seuils est relâché.
 */

/** Niveau (unilatéral) des intervalles de Wilson de la conclusion · mesuré, voir le tableau. */
export const NIVEAU_CONCLUSION_LOT = 0.9;
/** Variantes tranchées au protocole sous lesquelles un lot n'a pas le droit de conclure · mesuré. */
export const MIN_VARIANTES_CONCLUSION = 4;
/** Verdicts tranchés des autres lots sous lesquels la marque ne sert pas de référence · mesuré. */
export const MIN_REFERENCE_CONCLUSION = 4;
/** L'erreur tolérée par la règle (confirmée ou infirmée à tort, sous l'hypothèse nulle) · le critère du choix. */
export const ERREUR_TOLEREE_CONCLUSION = 0.15;

const GAGNANTES: ReadonlySet<VerdictValue> = new Set<VerdictValue>(['winner', 'baby_winner']);
const TRANCHES: ReadonlySet<VerdictValue> = new Set<VerdictValue>(['winner', 'baby_winner', 'loser']);

/** Une variante compte-t-elle pour l'hypothèse · verdict comparable et tranché, hors témoin ? `null` = ne compte pas. */
export function issueVariante(a: FaitsAdSpatial): 'gagne' | 'perd' | null {
  if (a.variable === 'none_control' || !a.verdict?.comparable) return null;
  const v = verdictAffiche(a.verdict);
  if (!v || !TRANCHES.has(v)) return null;
  return GAGNANTES.has(v) ? 'gagne' : 'perd';
}

export interface Compte { k: number; n: number }

function compter(ads: readonly FaitsAdSpatial[]): Compte {
  let k = 0, n = 0;
  for (const a of ads) {
    const i = issueVariante(a);
    if (!i) continue;
    n++;
    if (i === 'gagne') k++;
  }
  return { k, n };
}

/** La référence de la marque pour un lot · les verdicts tranchés de ses AUTRES lots suivis (un historique importé n'est pas comparable). */
export function referenceConclusion(lots: readonly FaitsLotSpatial[], lotId: string): Compte {
  return compter(lots.filter((l) => l.id !== lotId && !estLotImporte({ status: l.statut, launchedAt: l.lanceLe })).flatMap((l) => l.ads));
}

export type ConclusionLot = 'confirmee' | 'infirmee' | 'non_concluante' | 'en_attente';
export type MotifConclusion = 'lecture' | 'effectif' | 'reference' | 'pas_pret' | 'importe';

export interface LectureConclusion {
  conclusion: ConclusionLot;
  motif: MotifConclusion;
  titre: string;
  phrase: string;
  lot: (Compte & { intervalle: Interval }) | null;
  reference: (Compte & { intervalle: Interval }) | null;
}

export const LIBELLE_CONCLUSION_LOT: Record<ConclusionLot, string> = {
  confirmee: 'Hypothèse confirmée', infirmee: 'Hypothèse infirmée', non_concluante: 'Non concluante', en_attente: 'Pas encore de conclusion',
};

/**
 * La lecture seule, SANS les planchers d'effectif · l'intervalle du lot doit
 * exclure celui de la référence (strictement). Exportée pour que la mesure des
 * planchers se refasse dans le test · `conclusionLot` est le seul appelant.
 */
export function lectureIntervalles(lot: Compte, reference: Compte): { lecture: 'confirmee' | 'infirmee' | 'non_concluante'; lot: Interval; reference: Interval } {
  const il = wilsonInterval(lot.k, lot.n, NIVEAU_CONCLUSION_LOT);
  const ir = wilsonInterval(reference.k, reference.n, NIVEAU_CONCLUSION_LOT);
  return { lecture: il.lo > ir.hi ? 'confirmee' : il.hi < ir.lo ? 'infirmee' : 'non_concluante', lot: il, reference: ir };
}

const pc = (x: number) => `${Math.round(x * 100)} %`;
const plage = (i: Interval) => `${pc(i.lo)} à ${pc(i.hi)}`;
const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
/** Les états où toutes les variantes ont leur verdict et où plus rien ne se mesure. */
const LISIBLES: ReadonlySet<EtatLotSpatial> = new Set<EtatLotSpatial>(['a_conclure', 'non_concluant', 'conclu']);

/**
 * La conclusion d'un lot · `etat` est celui de `etatLotSpatial`, `reference` le
 * compte de `referenceConclusion`. Ne fabrique aucun chiffre · chaque nombre de
 * la phrase est un compte de verdicts ou une borne d'intervalle.
 */
export function conclusionLot(l: FaitsLotSpatial, etat: EtatLotSpatial, reference: Compte): LectureConclusion {
  const titre = (c: ConclusionLot) => LIBELLE_CONCLUSION_LOT[c];
  if (etat === 'importe') {
    return { conclusion: 'non_concluante', motif: 'importe', titre: titre('non_concluante'), lot: null, reference: null,
      phrase: 'Historique repris du tableau · ses verdicts n’ont pas été mesurés au protocole, le lot ne peut rien confirmer.' };
  }
  if (!LISIBLES.has(etat)) {
    return { conclusion: 'en_attente', motif: 'pas_pret', titre: titre('en_attente'), lot: null, reference: null,
      phrase: 'Le lot conclut quand sa fenêtre est écoulée et que chaque variante a son verdict.' };
  }
  const c = compter(l.ads);
  if (c.n < MIN_VARIANTES_CONCLUSION) {
    return { conclusion: 'non_concluante', motif: 'effectif', titre: titre('non_concluante'), lot: null, reference: null,
      phrase: `${c.n === 0 ? 'Aucune variante tranchée' : pl(c.n, 'variante tranchée', 'variantes tranchées')} au protocole · il en faut ${MIN_VARIANTES_CONCLUSION} pour qu’un lot ait le droit de conclure.` };
  }
  if (reference.n < MIN_REFERENCE_CONCLUSION) {
    return { conclusion: 'non_concluante', motif: 'reference', titre: titre('non_concluante'), lot: null, reference: null,
      phrase: `La marque n’a que ${pl(reference.n, 'verdict tranché', 'verdicts tranchés')} dans ses autres lots · il en faut ${MIN_REFERENCE_CONCLUSION} pour servir de référence.` };
  }
  const { lecture, lot: il, reference: ir } = lectureIntervalles(c, reference);
  const lot = { ...c, intervalle: il };
  const ref = { ...reference, intervalle: ir };
  const faits = `${pl(c.k, 'gagnante', 'gagnantes')} sur ${pl(c.n, 'variante tranchée', 'variantes tranchées')} (${plage(il)})`;
  const marque = `la marque, ${reference.k} sur ${reference.n} dans ses autres lots (${plage(ir)})`;
  if (lecture === 'confirmee') {
    return { conclusion: 'confirmee', motif: 'lecture', titre: titre('confirmee'), lot, reference: ref,
      phrase: `${faits} · nettement au-dessus de ${marque}.` };
  }
  if (lecture === 'infirmee') {
    return { conclusion: 'infirmee', motif: 'lecture', titre: titre('infirmee'), lot, reference: ref,
      phrase: `${faits} · nettement en dessous de ${marque}.` };
  }
  return { conclusion: 'non_concluante', motif: 'lecture', titre: titre('non_concluante'), lot, reference: ref,
    phrase: `${faits} · l’écart avec ${marque} reste dans le bruit · rien ne dit que ce lot fait mieux ou moins bien que d’habitude.` };
}

/* ───────────────────────── écart d'une gagnante au reste de son lot (Accueil) ───────────────────────── */

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Le compte (succès, impressions) d'un taux lu dans un agrégat de verdict · `null` sans les deux. */
function compteTaux(agg: unknown, cle: 'hookRate' | 'ctr'): Compte | null {
  if (!agg || typeof agg !== 'object') return null;
  const a = agg as Record<string, unknown>;
  const taux = num(a[cle]), imp = num(a.impressions);
  if (taux === null || imp === null || imp <= 0 || taux < 0 || taux > 1) return null;
  return { k: Math.round(taux * imp), n: Math.round(imp) };
}

export interface EcartAuLot { texte: string; classe: '' | 'g' | 'r' }

/**
 * L'écart d'une gagnante au RESTE de son lot (même protocole, même fenêtre) ·
 * l'accroche si les deux côtés la portent, sinon le CTR. Même doctrine que la
 * conclusion · chaque côté doit atteindre le volume minimum de la marque
 * (`minImpressions`, réglage de la marque), et les deux intervalles de Wilson
 * (au niveau mesuré de la conclusion) doivent être disjoints pour qu'un écart
 * en points s'affiche. Sinon · « non tranché » si le volume y est, rien du tout
 * s'il n'y est pas.
 */
export function ecartAuLot(gagnante: unknown, autres: readonly unknown[], o: { numeroLot: number; minImpressions: number }): EcartAuLot | null {
  for (const [cle, libelle] of [['hookRate', 'Accroche'], ['ctr', 'CTR']] as const) {
    const g = compteTaux(gagnante, cle);
    const r = autres.map((x) => compteTaux(x, cle)).filter((x): x is Compte => !!x)
      .reduce<Compte | null>((s, x) => ({ k: (s?.k ?? 0) + x.k, n: (s?.n ?? 0) + x.n }), null);
    if (!g || !r) continue;
    if (g.n < o.minImpressions || r.n < o.minImpressions) return null;
    const ig = wilsonInterval(g.k, g.n, NIVEAU_CONCLUSION_LOT);
    const ir = wilsonInterval(r.k, r.n, NIVEAU_CONCLUSION_LOT);
    const pts = Math.round((g.k / g.n - r.k / r.n) * 1000) / 10;
    const lot = `le reste du lot #${o.numeroLot}`;
    if (ig.lo > ir.hi || ig.hi < ir.lo) {
      const s = `${pts > 0 ? '+' : '−'}${Math.abs(pts).toLocaleString('fr-FR')} pt${Math.abs(pts) >= 2 ? 's' : ''}`;
      return { texte: `${libelle} ${s} vs ${lot}`, classe: pts > 0 ? 'g' : 'r' };
    }
    return { texte: `${libelle} · écart avec ${lot} non tranché`, classe: '' };
  }
  return null;
}

/* ───────────────────────── duplication d'un lot ───────────────────────── */

/** Les champs d'une variante qu'on recopie dans un lot dupliqué · la STRUCTURE seule. */
export interface StructureVariante {
  conceptId: string; creativeId: string | null; variantCode: string; format: string; adType: string;
  hypothesis: string | null; testedVariable: string | null; variableValue: string | null;
  offerId: string | null; landingPageId: string | null; briefUrl: string | null; assetUrl: string | null; platform: string;
}

/**
 * Ce que la copie d'une variante emporte · ce qui la DÉCRIT (concept, créa,
 * hypothèse, variable, offre, page) et rien de ce qui la MESURE ou la DATE ·
 * ni nom régie, ni identifiants Meta, ni lancement, ni verdict, ni provenance
 * de génération (une génération reliée à deux ads rendrait l'attribution
 * ambiguë). La copie repart en brouillon · elle se prépare comme une neuve.
 */
export function structureVariante(a: StructureVariante & Record<string, unknown>): StructureVariante & { status: 'draft' } {
  return {
    conceptId: a.conceptId, creativeId: a.creativeId, variantCode: a.variantCode, format: a.format, adType: a.adType,
    hypothesis: a.hypothesis, testedVariable: a.testedVariable, variableValue: a.variableValue,
    offerId: a.offerId, landingPageId: a.landingPageId, briefUrl: a.briefUrl, assetUrl: a.assetUrl, platform: a.platform,
    status: 'draft',
  };
}

/** Le but d'un lot dupliqué · dit d'où il vient, borné à la longueur de `createBatchAction`. */
export function butLotDuplique(numero: number, but: string | null): string {
  return `Reprise du lot #${numero}${but?.trim() ? ` · ${but.trim()}` : ''}`.slice(0, 300);
}
