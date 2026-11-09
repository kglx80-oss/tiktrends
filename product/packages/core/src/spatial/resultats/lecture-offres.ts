import type { FaitsLotSpatial } from './lots';
import {
  bilanTestsPersona, entreesLectureGroupes, lectureParGroupe, regleLecture, testsDuGroupe,
  type LectureGroupes, type PersonaRef, type VocabulaireLecture,
} from './lecture-personas';

/**
 * Résultats · QUELLE OFFRE fait gagner une créative (lot 9 bis V5 · VB M07).
 *
 * Pur · ni base, ni réseau, ni modèle, ni horloge.
 *
 * ── L'offre d'un test · une seule table, deux liens, aucune fusion ──────────
 *
 * Une seule table d'offres (`adsmap_offers`). Un test (une ad Adsmap) y est
 * relié de deux façons, que l'écran DIT toujours, sur le modèle exact du
 * persona (`personaDuTest`) :
 *
 *  · l'ANNONCE · l'offre que le test diffuse (`adsmap_ads.offer_id`, choisie
 *    au rattachement du test ou dans Adsmap) ;
 *  · le BRIEF · la version de projet dont la variante est issue a choisi une
 *    offre (fait déclaré `offre.<id>` du brief, `offreDuBrief`). Le lien est
 *    LU (variante → version → brief), jamais recopié sur l'ad.
 *
 * `offreDuTest` les compose sans rien fusionner · d'accord, ou un seul des
 * deux · cette offre-là ; en désaccord · AUCUNE, et l'écran le dit.
 *
 * ── La lecture par offre · LA règle de la lecture par persona ───────────────
 *
 * `lectureOffres` n'est que `lectureParGroupe` (lecture-personas.ts) avec les
 * mots de l'offre · mêmes seuils mesurés (4 verdicts tranchés de chaque côté),
 * même niveau corrigé pour le nombre d'offres qui parlent (0,95 jusqu'à 4,
 * 0,975 de 5 à 6, silence au-delà), mêmes intervalles de Wilson qui doivent
 * être disjoints du reste de la marque. La mesure de l'erreur de famille ne
 * dépend que du nombre de groupes et de leurs effectifs · elle vaut pour un
 * regroupement par offre comme par persona. Le silence s'affiche.
 */

export type SourceOffreTest = 'annonce' | 'brief' | 'accord';

export interface AttributionOffre {
  /** L'offre retenue pour la lecture · `null` sans offre ou en désaccord. */
  offre: PersonaRef | null;
  source: SourceOffreTest | null;
  annonce: PersonaRef | null;
  brief: PersonaRef | null;
  desaccord: boolean;
}

/** L'offre d'un test, d'après l'annonce et le brief · jamais une fusion silencieuse. */
export function offreDuTest(e: { annonce: PersonaRef | null; brief: PersonaRef | null }): AttributionOffre {
  const { annonce, brief } = e;
  if (annonce && brief) {
    return annonce.id === brief.id
      ? { offre: annonce, source: 'accord', annonce, brief, desaccord: false }
      : { offre: null, source: null, annonce, brief, desaccord: true };
  }
  if (annonce) return { offre: annonce, source: 'annonce', annonce, brief: null, desaccord: false };
  if (brief) return { offre: brief, source: 'brief', annonce: null, brief, desaccord: false };
  return { offre: null, source: null, annonce: null, brief: null, desaccord: false };
}

/** Le libellé d'une variante sans offre lisible · le même partout. */
export const SANS_OFFRE_TEST = 'Aucune offre · ni le test ni le brief n’en nomment une';

/** Ce que l'écran dit de l'offre d'un test · d'où elle vient, ou pourquoi il n'y en a pas. */
export function libelleAttributionOffre(a: AttributionOffre): string {
  if (a.desaccord) return `Offre à trancher · le test diffuse « ${a.annonce!.nom} », le brief du projet « ${a.brief!.nom} »`;
  if (!a.offre) return SANS_OFFRE_TEST;
  const d = a.source === 'brief' ? 'd’après le brief du projet' : a.source === 'annonce' ? 'd’après le test' : 'test et brief d’accord';
  return `${a.offre.nom} · ${d}`;
}

export const VOCABULAIRE_OFFRE: VocabulaireLecture = {
  un: 'une offre', du: 'de l’offre', aucun: 'Aucune offre', pluriel: 'offres', plurielLus: 'offres lues', par: 'par offre', court: (n) => n.trim(),
};

export interface EntreeLectureOffre { offre: PersonaRef | null; issue: 'gagne' | 'perd' | null }

/** La lecture par offre des verdicts de la marque · `lectureParGroupe`, mots de l'offre. L'ordre est celui des `offres` passées. */
export function lectureOffres(entrees: readonly EntreeLectureOffre[], offres: readonly PersonaRef[]): LectureGroupes {
  return lectureParGroupe(entrees.map((e) => ({ groupe: e.offre, issue: e.issue })), offres, VOCABULAIRE_OFFRE);
}

/** Les entrées · les variantes des lots SUIVIS de la marque, chacune avec son offre et son issue. */
export function entreesLectureOffres(lots: readonly FaitsLotSpatial[], attribution: (adId: string) => PersonaRef | null): EntreeLectureOffre[] {
  return entreesLectureGroupes(lots, attribution).map((e) => ({ offre: e.groupe, issue: e.issue }));
}

/** La règle, dite à l'écran sous la lecture par offre · les seuils du module des personas, jamais recopiés. */
export function regleLectureOffres(): string {
  return regleLecture(VOCABULAIRE_OFFRE);
}

/* ───────────────────────── « Dans les tests » de la fiche Offre ───────────────────────── */

/** Combien de tests diffusent cette offre, et dans combien de lots · le compte de la fiche persona, par offre. */
export function bilanTestsOffre(lots: readonly FaitsLotSpatial[], attribution: (adId: string) => PersonaRef | null, offreId: string): { tests: number; lots: number } {
  return bilanTestsPersona(lots, attribution, offreId);
}

/** La case « Dans les tests » d'une offre · son groupe dans la lecture par offre, ou le silence dit en clair. */
export function testsDeLOffre(l: LectureGroupes, offreId: string) {
  return testsDuGroupe(l, offreId, 'cette offre');
}

/**
 * La fiche Offre lit-elle ses tests par offre ? Les portes d'Adsmap (formule,
 * rôle) et la marque ACTIVE, comme la fiche persona (`accesTestsPersona`) · les
 * lectures sont bornées à elle. Fermé, la raison s'écrit.
 */
export function accesTestsOffre(o: { adsmap: 'ok' | 'plan' | 'role'; marqueActive: boolean }): string | null {
  if (o.adsmap === 'plan') return 'Les tests par offre vivent dans Résultats, ouvert à partir de la formule Plus';
  if (o.adsmap === 'role') return 'Résultats n’est pas ouvert à ton rôle';
  if (!o.marqueActive) return 'Les tests se lisent dans la marque active · ouvre d’abord cette marque';
  return null;
}
