import { wilsonInterval, type Interval } from '../../adsmap/stats';
import { NOM_PERSONA_PROVISOIRE } from '../marque/personas-edition';
import { estLotImporte } from '../../adsmap/lot-nature';
import { issueVariante, type Compte } from './conclusion-lot';
import type { FaitsLotSpatial } from './lots';

/**
 * Résultats · QUEL PERSONA fait gagner une créative (lot 9 V5 · VB P06).
 *
 * Pur · ni base, ni réseau, ni modèle, ni horloge.
 *
 * ── Le persona d'un test · une seule table, deux liens, aucune fusion ───────
 *
 * Il n'y a qu'une table de personas (`personas`, le modèle « Avatar » d'Adsmap,
 * décision D2). Un test (une ad Adsmap) y est relié de deux façons, que l'écran
 * DIT toujours :
 *
 *  · la CARTE · l'ad pend d'un concept → angle → désir → persona. Une créa
 *    rattachée depuis les Studios pend du persona provisoire « À qualifier »,
 *    qui ne dit rien de la cible · il ne compte pas comme persona ;
 *  · le BRIEF · la version de projet dont la variante est issue a choisi un
 *    persona (« Pour qui ? », `brief.personaRef`). Le lien est LU (variante →
 *    version → brief), jamais recopié sur l'ad · changer le brief d'une
 *    nouvelle version ou la carte le change, rien n'est à défaire.
 *
 * `personaDuTest` les compose sans rien fusionner · les deux d'accord, ou un
 * seul des deux · ce persona-là ; en désaccord · AUCUN, et l'écran le dit
 * (« à trancher »), plutôt que d'en choisir un en silence.
 *
 * ── La lecture par persona · comparer à la référence ────────────────────────
 *
 * Doctrine « comparer à la référence, jamais à zéro » · pour chaque persona, le
 * taux de gagnantes de SES tests contre celui du RESTE de la marque (les autres
 * personas et les tests sans persona). Seules comptent les variantes tranchées
 * au protocole (`issueVariante` · gagnante, naissante ou perdante, comparables,
 * hors témoin), dans des lots suivis (un historique importé n'est pas mesuré).
 * Un persona ne parle qu'au-delà d'un effectif minimum, la référence aussi, et
 * seulement si son intervalle de Wilson EXCLUT celui du reste. Le silence est
 * une conclusion valable, et la plus fréquente.
 *
 * ── Les seuils, MESURÉS (jamais posés d'instinct) ───────────────────────────
 *
 * Différence avec la conclusion d'un lot · ici PLUSIEURS personas parlent en
 * même temps. Sous l'hypothèse nulle (tous gagnent au taux de la marque), la
 * chance qu'AU MOINS UN se détache à tort grandit avec leur nombre · le niveau
 * du lot (0,90) ne suffit plus. Mesure exacte (loi binomiale, aucun tirage ·
 * script et sorties dans la PR), K personas de n verdicts, U sans persona,
 * taux de 0,1 à 0,7, référence = le reste (au moins 4) :
 *
 *   erreur de FAMILLE (au moins un persona à tort), n 2 à 12, U 0 ou 4
 *   niveau   K=1     K=2     K=3     K=4     K=5     K=6
 *   0,80     ·       ·       ·       0,727   ·       ·        (min 4 à 6)
 *   0,90     0,093   0,161   0,253   0,306   ·       ·        (le niveau du lot)
 *   0,95     0,027   0,042   0,079   0,111   0,147   0,186    ← retenu jusqu'à 4
 *   0,975    ·       ·       ·       ·       0,048   0,059    ← retenu de 5 à 6
 *
 *   niveau 0,95, min = n, toutes K ≤ 4 · pire erreur
 *   n        2      3      4      5      6      8      10     12
 *            0,094  0,096  0,107  0,098  0,111  0,110  0,097  0,068
 *
 *   puissance médiane (un persona gagne deux fois plus, K=3, n 6 à 12)
 *   0,80 · 0,533    0,90 · 0,285    0,95 · 0,151    (min 4 à 6, identique)
 *
 * Choix, avec marge · erreur tolérée 15 % au plus, comme la conclusion d'un
 * lot · niveau 0,95 tant que 4 personas au plus ont le droit de parler (pire
 * 11,1 %), 0,975 de 5 à 6 (pire 5,9 % · à 0,95, K=6 monte à 18,6 %), et
 * silence au-delà de 6 (non mesuré). Le minimum par persona ne change presque
 * pas l'erreur à ce niveau · il est posé au plancher du lot, 4 verdicts
 * tranchés (le même pour la référence). Puissance faible (15 %) · attendu,
 * la lecture se tait le plus souvent et le dit.
 *
 * ── Une règle, plusieurs regroupements (lot 9 bis · par offre) ──────────────
 *
 * La mesure ci-dessus ne dépend QUE du nombre de groupes qui parlent et de
 * leurs effectifs · K groupes de verdicts contre le reste de la marque. Elle
 * vaut telle quelle pour n'importe quel regroupement des mêmes variantes (par
 * persona, par offre). `lectureParGroupe` est CETTE règle, mêmes seuils, mêmes
 * niveaux · seuls les mots changent (`VocabulaireLecture`). `lecturePersonas`
 * en est la lecture par persona, sa sortie inchangée · `lectureOffres`
 * (`lecture-offres.ts`) la lecture par offre. Aucune copie des seuils.
 */

/** Verdicts tranchés sous lesquels un persona n'a pas le droit de parler · plancher du lot, mesuré. */
export const MIN_VERDICTS_PERSONA = 4;
/** Verdicts tranchés du reste de la marque sous lesquels il ne sert pas de référence · mesuré. */
export const MIN_REFERENCE_PERSONA = 4;
/** Niveau (unilatéral) des intervalles tant que 4 personas au plus parlent · mesuré. */
export const NIVEAU_LECTURE_PERSONA = 0.95;
/** Niveau de 5 à `MAX_PERSONAS_LECTURE` personas · mesuré. */
export const NIVEAU_LECTURE_PERSONA_NOMBREUX = 0.975;
/** Au-delà, l'erreur n'est pas mesurée · la lecture se tait. */
export const MAX_PERSONAS_LECTURE = 6;
/** Personas jusqu'où `NIVEAU_LECTURE_PERSONA` tient l'erreur sous `ERREUR_TOLEREE_PERSONA`. */
export const PERSONAS_NIVEAU_DE_BASE = 4;
/** L'erreur de famille tolérée (au moins un persona détaché à tort) · le critère du choix. */
export const ERREUR_TOLEREE_PERSONA = 0.15;

export interface PersonaRef { id: string; nom: string }

export type SourcePersonaTest = 'carte' | 'brief' | 'accord';

export interface AttributionPersona {
  /** Le persona retenu pour la lecture · `null` sans persona ou en désaccord. */
  persona: PersonaRef | null;
  source: SourcePersonaTest | null;
  /** Les deux liens, tels quels · l'écran les montre en désaccord. */
  carte: PersonaRef | null;
  brief: PersonaRef | null;
  desaccord: boolean;
}

/** Le persona de la carte compte-t-il · le provisoire « À qualifier » ne dit rien de la cible. */
export const estPersonaProvisoire = (nom: string | null | undefined) => (nom ?? '').trim().toLocaleLowerCase('fr') === NOM_PERSONA_PROVISOIRE.toLocaleLowerCase('fr');

/** Le persona d'un test, d'après la carte et le brief · jamais une fusion silencieuse. */
export function personaDuTest(e: { carte: PersonaRef | null; brief: PersonaRef | null }): AttributionPersona {
  const carte = e.carte && !estPersonaProvisoire(e.carte.nom) ? e.carte : null;
  const brief = e.brief;
  if (carte && brief) {
    return carte.id === brief.id
      ? { persona: carte, source: 'accord', carte, brief, desaccord: false }
      : { persona: null, source: null, carte, brief, desaccord: true };
  }
  if (carte) return { persona: carte, source: 'carte', carte, brief: null, desaccord: false };
  if (brief) return { persona: brief, source: 'brief', carte: null, brief, desaccord: false };
  return { persona: null, source: null, carte: null, brief: null, desaccord: false };
}

const prenom = (n: string) => n.split(',')[0]!.trim();

/** Ce que l'écran dit du persona d'un test · d'où il vient, ou pourquoi il n'y en a pas. */
export function libelleAttribution(a: AttributionPersona): string {
  if (a.desaccord) return `Persona à trancher · la carte dit ${prenom(a.carte!.nom)}, le brief du projet ${prenom(a.brief!.nom)}`;
  if (!a.persona) return 'Aucun persona · ni la carte ni le brief n’en nomment un';
  const d = a.source === 'brief' ? 'd’après le brief du projet' : a.source === 'carte' ? 'd’après la carte' : 'carte et brief d’accord';
  return `${prenom(a.persona.nom)} · ${d}`;
}

export type LecturePersona = 'au_dessus' | 'en_dessous' | 'dans_le_bruit' | 'effectif' | 'reference' | 'trop_de_personas';

export interface GroupePersona {
  persona: PersonaRef;
  lecture: LecturePersona;
  k: number;
  n: number;
  intervalle: Interval | null;
  reference: (Compte & { intervalle: Interval }) | null;
  phrase: string;
}

export interface LecturePersonas {
  /** Un persona au moins se détache-t-il du reste de la marque ? */
  parle: boolean;
  /** Le niveau des intervalles appliqué · `null` quand personne n'a le droit de parler. */
  niveau: number | null;
  /** Personas qui avaient le droit de parler (effectif et référence). */
  eligibles: number;
  /** Variantes tranchées au protocole, en tout, et celles sans persona (ou à trancher). */
  tranchees: number;
  sansPersona: number;
  groupes: GroupePersona[];
  /** La phrase d'ensemble · le silence dit comme une conclusion. */
  phrase: string;
}

export interface EntreeLecturePersona {
  persona: PersonaRef | null;
  /** `issueVariante` · `null` = ne compte pas (non tranchée, témoin, non comparable). */
  issue: 'gagne' | 'perd' | null;
}

const pc = (x: number) => `${Math.round(x * 100)} %`;
const plage = (i: Interval) => `${pc(i.lo)} à ${pc(i.hi)}`;
const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/** Le niveau des intervalles selon le nombre de personas qui ont le droit de parler · `null` au-delà du mesuré. */
export function niveauLecturePersonas(eligibles: number): number | null {
  if (eligibles <= PERSONAS_NIVEAU_DE_BASE) return NIVEAU_LECTURE_PERSONA;
  if (eligibles <= MAX_PERSONAS_LECTURE) return NIVEAU_LECTURE_PERSONA_NOMBREUX;
  return null;
}

/**
 * Les mots d'une lecture par groupe · le genre et le nombre suivent le groupe
 * (« un persona », « une offre »). `court` · le nom tel qu'il se lit dans la
 * phrase d'ensemble (le prénom d'un persona, l'intitulé d'une offre).
 */
export interface VocabulaireLecture {
  /** « un persona » · « une offre ». */
  un: string;
  /** « du persona » · « de l’offre ». */
  du: string;
  /** « Aucun persona » · « Aucune offre ». */
  aucun: string;
  /** « personas » · « offres ». */
  pluriel: string;
  /** « personas lus » · « offres lues ». */
  plurielLus: string;
  /** « par persona » · « par offre ». */
  par: string;
  court: (nom: string) => string;
}

export const VOCABULAIRE_PERSONA: VocabulaireLecture = {
  un: 'un persona', du: 'du persona', aucun: 'Aucun persona', pluriel: 'personas', plurielLus: 'personas lus', par: 'par persona', court: prenom,
};

/** Un groupe de la lecture · `ref` · le persona, l'offre… */
export interface GroupeLecture {
  ref: PersonaRef;
  lecture: LecturePersona;
  k: number;
  n: number;
  intervalle: Interval | null;
  reference: (Compte & { intervalle: Interval }) | null;
  phrase: string;
}

export interface LectureGroupes {
  parle: boolean;
  niveau: number | null;
  eligibles: number;
  tranchees: number;
  /** Variantes tranchées sans groupe (ou à trancher). */
  sansGroupe: number;
  groupes: GroupeLecture[];
  phrase: string;
}

export interface EntreeLectureGroupe {
  groupe: PersonaRef | null;
  issue: 'gagne' | 'perd' | null;
}

/**
 * LA règle · les verdicts de la marque lus par groupe (persona, offre…) · chaque
 * nombre de chaque phrase est un compte de verdicts ou une borne d'intervalle,
 * rien d'autre. L'ordre des groupes est celui des `groupes` passés.
 */
export function lectureParGroupe(entrees: readonly EntreeLectureGroupe[], groupesConnus: readonly PersonaRef[], v: VocabulaireLecture): LectureGroupes {
  const tranchees = entrees.filter((e) => e.issue);
  const total: Compte = { k: tranchees.filter((e) => e.issue === 'gagne').length, n: tranchees.length };
  const sansGroupe = tranchees.filter((e) => !e.groupe).length;
  const compte = new Map<string, Compte>();
  for (const e of tranchees) {
    if (!e.groupe) continue;
    const c = compte.get(e.groupe.id) ?? { k: 0, n: 0 };
    c.n++;
    if (e.issue === 'gagne') c.k++;
    compte.set(e.groupe.id, c);
  }
  // Un groupe qui n'a aucun test dans `groupesConnus` (supprimé) n'est pas lu · ses verdicts restent dans la référence.
  const lus = groupesConnus.filter((p) => compte.has(p.id));
  const droit = (c: Compte) => c.n >= MIN_VERDICTS_PERSONA && total.n - c.n >= MIN_REFERENCE_PERSONA;
  const eligibles = lus.filter((p) => droit(compte.get(p.id)!)).length;
  const niveau = eligibles ? niveauLecturePersonas(eligibles) : null;

  const groupes: GroupeLecture[] = lus.map((p) => {
    const c = compte.get(p.id)!;
    const ref: Compte = { k: total.k - c.k, n: total.n - c.n };
    const base = { ref: p, k: c.k, n: c.n };
    if (c.n < MIN_VERDICTS_PERSONA) {
      return { ...base, lecture: 'effectif' as const, intervalle: null, reference: null,
        phrase: `${pl(c.n, 'variante tranchée', 'variantes tranchées')} · il en faut ${MIN_VERDICTS_PERSONA} pour qu’${v.un} ait le droit de parler.` };
    }
    if (ref.n < MIN_REFERENCE_PERSONA) {
      return { ...base, lecture: 'reference' as const, intervalle: null, reference: null,
        phrase: `Le reste de la marque n’a que ${pl(ref.n, 'variante tranchée', 'variantes tranchées')} · il en faut ${MIN_REFERENCE_PERSONA} pour servir de référence.` };
    }
    if (niveau === null) {
      return { ...base, lecture: 'trop_de_personas' as const, intervalle: null, reference: null,
        phrase: `${eligibles} ${v.pluriel} ont assez de verdicts · au-delà de ${MAX_PERSONAS_LECTURE}, la règle n’est pas mesurée et se tait.` };
    }
    const ip = wilsonInterval(c.k, c.n, niveau);
    const ir = wilsonInterval(ref.k, ref.n, niveau);
    const faits = `${pl(c.k, 'gagnante', 'gagnantes')} sur ${pl(c.n, 'variante tranchée', 'variantes tranchées')} (${plage(ip)})`;
    const reste = `reste de la marque, ${ref.k} sur ${ref.n} (${plage(ir)})`;
    const reference = { ...ref, intervalle: ir };
    if (ip.lo > ir.hi) return { ...base, lecture: 'au_dessus' as const, intervalle: ip, reference, phrase: `${faits} · nettement au-dessus du ${reste}.` };
    if (ip.hi < ir.lo) return { ...base, lecture: 'en_dessous' as const, intervalle: ip, reference, phrase: `${faits} · nettement en dessous du ${reste}.` };
    return { ...base, lecture: 'dans_le_bruit' as const, intervalle: ip, reference, phrase: `${faits} · l’écart avec le ${reste} reste dans le bruit.` };
  });

  const parle = groupes.some((g) => g.lecture === 'au_dessus' || g.lecture === 'en_dessous');
  let phrase: string;
  if (!total.n) phrase = `Aucune variante tranchée au protocole · rien à lire ${v.par} pour l’instant.`;
  else if (!eligibles) phrase = `${v.aucun} n’a encore ${MIN_VERDICTS_PERSONA} variantes tranchées · la lecture ${v.par} se tait, faute d’effectif.`;
  else if (niveau === null) phrase = `${eligibles} ${v.pluriel} ont assez de verdicts · au-delà de ${MAX_PERSONAS_LECTURE}, la règle n’est pas mesurée · elle se tait.`;
  else if (!parle) phrase = `${v.aucun} ne se détache du reste de la marque · le silence est la conclusion la plus fréquente, il ne dit pas que les ${v.pluriel} se valent.`;
  else {
    const d = groupes.filter((g) => g.lecture === 'au_dessus' || g.lecture === 'en_dessous').map((g) => `${v.court(g.ref.nom)} ${g.lecture === 'au_dessus' ? 'au-dessus' : 'en dessous'}`);
    phrase = `${d.join(' · ')} du reste de la marque, intervalles disjoints au niveau ${String(niveau).replace('.', ',')}.`;
  }
  return { parle, niveau, eligibles, tranchees: total.n, sansGroupe, groupes, phrase };
}

/**
 * La lecture par persona des verdicts de la marque · `lectureParGroupe` avec
 * les mots du persona, sortie inchangée (`persona`, `sansPersona`).
 * L'ordre des groupes est celui des `personas` passés (rang de la marque).
 */
export function lecturePersonas(entrees: readonly EntreeLecturePersona[], personas: readonly PersonaRef[]): LecturePersonas {
  const l = lectureParGroupe(entrees.map((e) => ({ groupe: e.persona, issue: e.issue })), personas, VOCABULAIRE_PERSONA);
  return {
    parle: l.parle, niveau: l.niveau, eligibles: l.eligibles, tranchees: l.tranchees, sansPersona: l.sansGroupe,
    groupes: l.groupes.map(({ ref, ...g }) => ({ persona: ref, ...g })), phrase: l.phrase,
  };
}

/**
 * Les entrées de la lecture · les variantes des lots SUIVIS de la marque (un
 * historique importé n'a pas été mesuré au protocole), chacune avec son
 * persona (`attribution(adId)`) et son issue (`issueVariante`).
 */
export function entreesLecturePersonas(lots: readonly FaitsLotSpatial[], attribution: (adId: string) => PersonaRef | null): EntreeLecturePersona[] {
  return entreesLectureGroupes(lots, attribution).map((e) => ({ persona: e.groupe, issue: e.issue }));
}

/** Les entrées de `lectureParGroupe` · les variantes des lots SUIVIS, chacune avec son groupe et son issue. */
export function entreesLectureGroupes(lots: readonly FaitsLotSpatial[], attribution: (adId: string) => PersonaRef | null): EntreeLectureGroupe[] {
  return lots.filter((l) => !estLotImporte({ status: l.statut, launchedAt: l.lanceLe }))
    .flatMap((l) => l.ads.map((a) => ({ groupe: attribution(a.id), issue: issueVariante(a) })));
}

/** Combien de tests ciblent ce persona, et dans combien de lots (« N tests · N lots » de la fiche). */
export function bilanTestsPersona(lots: readonly FaitsLotSpatial[], attribution: (adId: string) => PersonaRef | null, personaId: string): { tests: number; lots: number } {
  let tests = 0, n = 0;
  for (const l of lots) {
    const k = l.ads.filter((a) => attribution(a.id)?.id === personaId).length;
    tests += k;
    if (k) n++;
  }
  return { tests, lots: n };
}

/** La règle, dite à l'écran sous la lecture · les seuils du module, jamais recopiés. */
export function regleLecturePersonas(): string {
  return regleLecture(VOCABULAIRE_PERSONA);
}

/** La règle d'une lecture par groupe, dite avec ses mots · les seuils du module, jamais recopiés. */
export function regleLecture(v: VocabulaireLecture): string {
  return `Règle · au moins ${MIN_VERDICTS_PERSONA} variantes tranchées au protocole pour ${v.un} et ${MIN_REFERENCE_PERSONA} dans le reste de la marque · l’intervalle ${v.du} doit exclure celui du reste (niveau ${String(NIVEAU_LECTURE_PERSONA).replace('.', ',')}, ${String(NIVEAU_LECTURE_PERSONA_NOMBREUX).replace('.', ',')} au-delà de ${PERSONAS_NIVEAU_DE_BASE} ${v.plurielLus}, silence au-delà de ${MAX_PERSONAS_LECTURE}).`;
}

/**
 * La fiche d'une marque lit-elle ses tests par persona, et peut-elle valider un
 * persona ? Les mêmes portes qu'Adsmap (formule, rôle) et la marque ACTIVE · les
 * lectures et `validateNodeAction` sont bornés à elle. Fermé, la raison s'écrit.
 */
export function accesTestsPersona(o: { adsmap: 'ok' | 'plan' | 'role'; marqueActive: boolean }): { lecture: string | null; validation: string | null } {
  if (o.adsmap === 'plan') return { lecture: 'Les tests par persona vivent dans Résultats, ouvert à partir de l’offre Plus', validation: 'La validation passe par Adsmap, ouvert à partir de l’offre Plus' };
  if (o.adsmap === 'role') return { lecture: 'Résultats n’est pas ouvert à ton rôle', validation: 'Ton rôle ne permet pas de valider dans Adsmap' };
  if (!o.marqueActive) return { lecture: 'Les tests se lisent dans la marque active · ouvre d’abord cette marque', validation: 'La validation se fait dans la marque active · ouvre d’abord cette marque' };
  return { lecture: null, validation: null };
}

/** La case « Dans les tests » d'un persona · son groupe dans la lecture, ou le silence dit en clair. */
export function testsDuPersona(l: LecturePersonas, personaId: string): { lecture: LecturePersona | 'aucun'; phrase: string } {
  const g = l.groupes.find((x) => x.persona.id === personaId);
  return g ? { lecture: g.lecture, phrase: g.phrase } : { lecture: 'aucun', phrase: 'Aucune variante tranchée au protocole ne cible ce persona · rien à lire.' };
}
