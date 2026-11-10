import {
  libelleAttribution, regleLecture, testsDuGroupe, VOCABULAIRE_PERSONA,
  type AttributionPersona, type LectureGroupes, type LecturePersona,
} from './lecture-personas';
import { libelleAttributionOffre, regleLectureOffres, SANS_OFFRE_TEST, type AttributionOffre } from './lecture-offres';
import { gestesLectureGroupe, noteGestesSilenceFiche, NOTE_GESTES_FICHE_OFFRE, NOTE_GESTES_FICHE_PERSONA, type GestesLecture, type GroupeGestes } from './boucle-preuve';

/**
 * Résultats · POUR QUI et QUELLE OFFRE, sur la fiche d'un test (`/adsmap/tests/[id]`).
 *
 * Pur · ni base, ni réseau, ni modèle, ni horloge. Aucune règle nouvelle · la
 * composition, pour UN test, des règles déjà mesurées :
 *
 *  · le persona du test (`personaDuTest` · carte et brief LUS, jamais recopiés)
 *    et son offre (`offreDuTest` · annonce et brief) · en désaccord, AUCUN des
 *    deux n'est retenu, et l'écran dit « à trancher » ;
 *  · la lecture de ce persona et de cette offre sur TOUTE la marque
 *    (`lectureParGroupe` · seuils du module des personas, inchangés · le silence
 *    s'affiche) ;
 *  · les gestes « Itérer » et « Créer une hypothèse » SEULEMENT quand le groupe
 *    se détache (`gestesLectureGroupe`) · ce test d'abord s'il est au plan
 *    d'itération · rien n'est écrit sans le clic.
 */

export interface CoteCibleTest {
  groupe: GroupeGestes;
  /** Le persona ou l'offre retenu · `null` sans lien lisible ou en désaccord. */
  id: string | null;
  /** D'où il vient, ou pourquoi il n'y en a pas · « à trancher » en désaccord. */
  libelle: string;
  desaccord: boolean;
  /** Sa lecture sur la marque · `null` quand le test n'en retient aucun. */
  lecture: LecturePersona | 'aucun' | null;
  phrase: string;
  gestes: GestesLecture | null;
  /** Pourquoi aucun geste n'est proposé, quand une lecture existe sans se détacher. */
  silence: string | null;
  regle: string;
}

export interface CibleTest { persona: CoteCibleTest; offre: CoteCibleTest }

export const PHRASE_PERSONA_A_TRANCHER = 'À trancher · tant que la carte et le brief ne s’accordent pas, ce test ne compte pour aucun persona dans la lecture.';
export const PHRASE_OFFRE_A_TRANCHER = 'À trancher · tant que le test et le brief ne s’accordent pas, ce test ne compte pour aucune offre dans la lecture.';
export const PHRASE_SANS_PERSONA_TEST = 'Ce test ne compte pour aucun persona · ses verdicts entrent dans le reste de la marque.';
export const PHRASE_SANS_OFFRE_TEST = 'Ce test ne compte pour aucune offre · ses verdicts entrent dans le reste de la marque.';
export const SANS_PERSONA_TEST = 'Aucun persona · ni la carte ni le brief n’en nomment un';

interface Cote {
  groupe: GroupeGestes;
  retenu: { id: string } | null;
  desaccord: boolean;
  libelle: string;
  lecture: LectureGroupes;
  tests: readonly string[];
}

function cote(c: Cote, o: { adId: string; planIds: ReadonlySet<string> }): CoteCibleTest {
  const persona = c.groupe === 'persona';
  const regle = persona ? regleLecture(VOCABULAIRE_PERSONA) : regleLectureOffres();
  const base = { groupe: c.groupe, libelle: c.libelle, desaccord: c.desaccord, regle };
  if (!c.retenu) {
    const phrase = c.desaccord
      ? (persona ? PHRASE_PERSONA_A_TRANCHER : PHRASE_OFFRE_A_TRANCHER)
      : (persona ? PHRASE_SANS_PERSONA_TEST : PHRASE_SANS_OFFRE_TEST);
    return { ...base, id: null, lecture: null, phrase, gestes: null, silence: null };
  }
  const t = testsDuGroupe(c.lecture, c.retenu.id, persona ? 'ce persona' : 'cette offre');
  const gestes = t.groupe
    ? gestesLectureGroupe({ ref: t.groupe.ref, lecture: t.groupe.lecture, k: t.groupe.k, n: t.groupe.n, reference: t.groupe.reference },
      { groupe: c.groupe, note: persona ? NOTE_GESTES_FICHE_PERSONA : NOTE_GESTES_FICHE_OFFRE, prioritaires: [o.adId], testsDeLaMarque: c.tests, planIds: o.planIds })
    : null;
  return {
    ...base, id: c.retenu.id, lecture: t.lecture, phrase: t.phrase, gestes,
    silence: !gestes && t.lecture !== 'aucun' ? noteGestesSilenceFiche(persona ? 'Ce persona' : 'Cette offre') : null,
  };
}

/**
 * Le persona et l'offre d'un test, et ce que la marque en dit · `lecturePersonas`
 * et `lectureOffres` sont les lectures de TOUTE la marque (`lectureParGroupe`,
 * mots du persona et de l'offre) · `testsPersona` et `testsOffre` · les tests de
 * la marque qui ciblent ce persona, cette offre (Itérer en part) · `planIds` · les
 * gagnantes arbitrées au plan d'itération (lu seulement si un groupe se détache).
 */
export function cibleDuTest(o: {
  adId: string;
  persona: AttributionPersona | null;
  offre: AttributionOffre | null;
  lecturePersonas: LectureGroupes;
  lectureOffres: LectureGroupes;
  testsPersona: readonly string[];
  testsOffre: readonly string[];
  planIds: ReadonlySet<string>;
}): CibleTest {
  const p = o.persona, f = o.offre;
  return {
    persona: cote({
      groupe: 'persona', retenu: p?.persona ?? null, desaccord: !!p?.desaccord, libelle: p ? libelleAttribution(p) : SANS_PERSONA_TEST,
      lecture: o.lecturePersonas, tests: o.testsPersona,
    }, o),
    offre: cote({
      groupe: 'offre', retenu: f?.offre ?? null, desaccord: !!f?.desaccord, libelle: f ? libelleAttributionOffre(f) : SANS_OFFRE_TEST,
      lecture: o.lectureOffres, tests: o.testsOffre,
    }, o),
  };
}

/** Faut-il lire le plan d'itération ? Seulement si le persona ou l'offre retenus se détachent · sinon aucune lecture de plus. */
export function cibleSeDetache(o: { personaId: string | null; offreId: string | null; lecturePersonas: LectureGroupes; lectureOffres: LectureGroupes }): boolean {
  const detache = (l: LectureGroupes, id: string | null) => !!id && l.groupes.some((g) => g.ref.id === id && (g.lecture === 'au_dessus' || g.lecture === 'en_dessous'));
  return detache(o.lecturePersonas, o.personaId) || detache(o.lectureOffres, o.offreId);
}
