/**
 * Studios · la MACHINE D'ÉTAPES de l'assistant de création V5 (modale
 * `studioWizard` du prototype), et la RÈGLE du brief écrit à la création.
 *
 * Pur · ni base, ni réseau, ni modèle. Toute la décision « quelles étapes,
 * quelles transitions, quelle étape est complète, que contient le brief » vit
 * ICI, testable, jamais dans le JSX ni dans un `'use server'`.
 *
 * ── Le périmètre (lots 2a + 2b) ──────────────────────────────────────────────
 *
 * Quatre étapes sont RÉELLEMENT câblées · `start` (choix du livrable), `brief`
 * (champs V5 écrits à la création), puis `strategie` et `direction`, qui
 * opèrent sur le projet DÉJÀ créé via le vrai cycle de propositions (une
 * proposition relue avant d'être appliquée · aucune écriture sans geste). Les
 * étapes `format` (format & devis) et `creation` restent « bientôt » · elles ne
 * sont pas navigables et ne portent AUCUN contrôle simulé. Jamais de bouton
 * mort, jamais de faux succès : on ne propose une étape que lorsqu'elle aboutit.
 *
 * Stratégie et direction n'écrivent JAMAIS directement dans une version : elles
 * ne produisent que le CHANGEMENT (pur, borné à `/brief`) d'une proposition. Le
 * serveur décide seul de l'application (`deciderApplication`, `proposed →
 * approved`), revalide la forme ET les relations du brief (une hypothèse ne
 * cite que des sources du projet · pas de fuite concurrent). Rien ici n'appelle
 * de modèle ni ne dépense : la proposition Jarvis (payante, sous plafond) part
 * d'une action serveur distincte.
 *
 * ── Le brief écrit à la création ─────────────────────────────────────────────
 *
 * `construireBriefV5` compose un `BriefCanonique` DÉTERMINISTE (aucun modèle,
 * aucune dépense) à partir de la saisie de l'assistant : les treize champs
 * canoniques (valeurs par défaut vides, sauf objectif/audience/contraintes
 * saisis) PLUS les champs V5 optionnels choisis (objectif typé, plateformes,
 * persona, angle, concept). Le résultat passe `validerFormeBrief` ; le serveur
 * le revérifie avant d'écrire (une action serveur est appelable directement).
 */

import {
  validerFormeBrief, faitsHypothese, OBJECTIFS_V5, PLATEFORMES_V5,
  type BriefCanonique, type ObjectifType, type PlateformeV5, type ViolationBrief,
} from '../brief';
import type { ChangementPatch } from '../patch';
import type { HypotheseTest } from '../sources/hypotheses';
import type { ReferenceAdsmap } from '../references-adsmap';
import { TYPES_NOUVEAU_PROJET, verifierNouveauProjet, type TypeNouveauProjet } from './nouveau-projet';

/* ─────────────────────────────── Étapes ──────────────────────────────────── */

export type EtapeAssistant = 'start' | 'brief' | 'strategie' | 'direction' | 'format' | 'creation';

export type StatutEtape = 'actif' | 'bientot';

export interface DefinitionEtape {
  id: EtapeAssistant;
  libelle: string;
  /** `actif` · réellement câblée et navigable. `bientot` · à venir, sans contrôle. */
  statut: StatutEtape;
}

/**
 * Le parcours complet, dans l'ordre. `start` est l'entrée (hors des cinq
 * étapes numérotées du rail V5). `start`, `brief`, `strategie` et `direction`
 * sont câblées ; `format` et `creation` sont honnêtement « bientôt ».
 */
export const ETAPES_ASSISTANT: readonly DefinitionEtape[] = [
  { id: 'start', libelle: 'Départ', statut: 'actif' },
  { id: 'brief', libelle: 'Brief', statut: 'actif' },
  { id: 'strategie', libelle: 'Stratégie', statut: 'actif' },
  { id: 'direction', libelle: 'Direction', statut: 'actif' },
  { id: 'format', libelle: 'Format & devis', statut: 'bientot' },
  { id: 'creation', libelle: 'Création', statut: 'bientot' },
];

/** Les cinq étapes numérotées du rail (le prototype compte « Étape N sur 5 »), sans `start`. */
export const ETAPES_RAIL: readonly DefinitionEtape[] = ETAPES_ASSISTANT.filter((e) => e.id !== 'start');

const INDEX = new Map<EtapeAssistant, number>(ETAPES_ASSISTANT.map((e, i) => [e.id, i]));
const DEF = new Map<EtapeAssistant, DefinitionEtape>(ETAPES_ASSISTANT.map((e) => [e.id, e]));

export function definitionEtape(id: EtapeAssistant): DefinitionEtape {
  const d = DEF.get(id);
  if (!d) throw new Error(`étape inconnue : ${id}`);
  return d;
}

/** Une étape est DISPONIBLE (câblée, navigable) quand elle est `actif`. */
export function etapeDisponible(id: EtapeAssistant): boolean {
  return DEF.get(id)?.statut === 'actif';
}

/**
 * Une étape opère-t-elle sur un projet DÉJÀ créé ? Vrai pour tout ce qui suit
 * le brief (stratégie, direction, et les « bientôt »). L'UI ne laisse y aller
 * qu'une fois le projet écrit · avant, le projet n'existe pas encore.
 */
export function etapeRequiertProjet(id: EtapeAssistant): boolean {
  const i = INDEX.get(id);
  return i !== undefined && i > INDEX.get('brief')!;
}

/** L'étape `actif` suivante (saute les « bientôt »), ou `null` s'il n'y en a plus. */
export function etapeProjetSuivante(courante: EtapeAssistant): EtapeAssistant | null {
  const i = INDEX.get(courante);
  if (i === undefined) return null;
  for (let j = i + 1; j < ETAPES_ASSISTANT.length; j++) {
    if (ETAPES_ASSISTANT[j]!.statut === 'actif') return ETAPES_ASSISTANT[j]!.id;
  }
  return null;
}

/** L'étape `actif` précédente, ou `null` si l'on est au départ. */
export function etapeProjetPrecedente(courante: EtapeAssistant): EtapeAssistant | null {
  const i = INDEX.get(courante);
  if (i === undefined) return null;
  for (let j = i - 1; j >= 0; j--) {
    if (ETAPES_ASSISTANT[j]!.statut === 'actif') return ETAPES_ASSISTANT[j]!.id;
  }
  return null;
}

export type EtatRailEtape = 'done' | 'current' | 'todo' | 'bientot';

/**
 * L'état d'affichage d'une étape du rail par rapport à l'étape courante · une
 * étape « bientôt » le reste toujours (jamais « faite »), même quand on est
 * passé plus loin, car elle n'a jamais été franchie pour de vrai.
 */
export function etatRail(id: EtapeAssistant, courante: EtapeAssistant): EtatRailEtape {
  const def = DEF.get(id);
  if (!def) return 'todo';
  if (def.statut === 'bientot') return 'bientot';
  const i = INDEX.get(id)!;
  const c = INDEX.get(courante) ?? -1;
  if (i < c) return 'done';
  if (i === c) return 'current';
  return 'todo';
}

/* ──────────────────────────── Saisie du brief ────────────────────────────── */

const TEXTE_MAX = 12_000;
const LISTE_MAX = 100;

/** Ce que l'assistant collecte à l'étape brief · tout est optionnel sauf l'intention. */
export interface SaisieBriefV5 {
  /** « Votre intention » · devient `objective`. Requis pour que le brief soit prêt. */
  intention: string;
  /** « Audience » · texte libre, copié tel quel. */
  audience: string;
  /** Objectif publicitaire TYPÉ · `null` = aucun choisi (non bloquant). */
  objectifType: ObjectifType | null;
  /** Plateformes cochées · dédupliquées et remises en ordre canonique. */
  plateformes: readonly PlateformeV5[];
  /** Persona Adsmap choisi · référence de portée {id, label}. `null` = « Aucun persona » (décision Kevin · optionnel). */
  persona: ReferenceAdsmap | null;
  /** « Écrire mon angle » · texte libre. */
  angle: string;
  /** « Concept » · texte libre. */
  concept: string;
  /** « Contraintes et mentions obligatoires » · une par ligne, rangées en invariants. */
  contraintes: string;
}

export function saisieBriefVide(): SaisieBriefV5 {
  return { intention: '', audience: '', objectifType: null, plateformes: [], persona: null, angle: '', concept: '', contraintes: '' };
}

const borne = (t: string) => t.trim().slice(0, TEXTE_MAX);
const lignes = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, LISTE_MAX);

/**
 * Le BRIEF écrit à la création, composé déterministement depuis la saisie.
 *
 * Les treize champs canoniques sont présents (vides par défaut) ; les champs V5
 * ne sont posés QUE s'ils ont une valeur, pour rester en compatibilité
 * ascendante. Les plateformes sont dédupliquées en ordre canonique (une
 * plateforme en double serait refusée par la forme).
 */
export function construireBriefV5(s: SaisieBriefV5): BriefCanonique {
  const b: BriefCanonique = {
    objective: borne(s.intention),
    audience: borne(s.audience),
    hypothesisId: null,
    testedVariable: '',
    facts: [],
    invariants: lignes(s.contraintes),
    variables: [],
    references: [],
    composition: '',
    styleIntent: '',
    texts: [],
    formats: [],
    exclusions: [],
  };
  if (s.objectifType && (OBJECTIFS_V5 as readonly string[]).includes(s.objectifType)) b.objectifType = s.objectifType;
  const plateformes = PLATEFORMES_V5.filter((p) => s.plateformes.includes(p));
  if (plateformes.length) b.plateformes = plateformes;
  if (s.persona) b.personaRef = { id: s.persona.id, label: s.persona.label.slice(0, TEXTE_MAX) };
  const angle = borne(s.angle);
  if (angle) b.angle = angle;
  const concept = borne(s.concept);
  if (concept) b.concept = concept;
  return b;
}

/** La forme du brief composé · liste vide = prêt à écrire. Le serveur revérifie. */
export function violationsBriefV5(s: SaisieBriefV5): ViolationBrief[] {
  return validerFormeBrief(construireBriefV5(s));
}

/* ──────────────────────────── Complétude ─────────────────────────────────── */

/**
 * L'étape `brief` est prête quand l'intention est renseignée · l'objectif est
 * le seul champ bloquant du brief à la création (cf. `completudeProjet`). Les
 * champs V5 restent tous optionnels (persona compris · décision Kevin).
 */
export function etapeBriefPrete(s: SaisieBriefV5): boolean {
  return s.intention.trim().length > 0;
}

export interface EtatCreation {
  type: TypeNouveauProjet;
  titre: string;
  saisie: SaisieBriefV5;
}

/** Une étape est « complète » · `start` l'est toujours (type par défaut), `brief` quand il est prêt, les « bientôt » jamais. */
export function etapeProjetComplete(id: EtapeAssistant, e: EtatCreation): boolean {
  if (id === 'start') return (TYPES_NOUVEAU_PROJET as readonly string[]).includes(e.type);
  if (id === 'brief') return etapeBriefPrete(e.saisie) && e.titre.trim().length > 0;
  return false;
}

/**
 * Vérification AVANT envoi au serveur · titre et type valides (réutilise
 * `verifierNouveauProjet`), intention présente, brief bien formé. Le message dit
 * quoi corriger ; le serveur revérifie tout.
 */
export function verifierCreationAssistant(e: EtatCreation):
  | { ok: true; titre: string; type: TypeNouveauProjet; brief: BriefCanonique }
  | { ok: false; message: string } {
  const base = verifierNouveauProjet({ titre: e.titre, type: e.type });
  if (!base.ok) return base;
  if (!etapeBriefPrete(e.saisie)) return { ok: false, message: 'Décris ton intention pour ce projet.' };
  const brief = construireBriefV5(e.saisie);
  const v = validerFormeBrief(brief);
  if (v.length) return { ok: false, message: 'Le brief n’a pas la forme attendue · vérifie les champs saisis.' };
  return { ok: true, titre: base.titre, type: base.type, brief };
}

/* ─────────────────── Stratégie & direction (sur le projet créé) ──────────── */

const texteRenseigne = (x: string | null | undefined): boolean => typeof x === 'string' && x.trim().length > 0;

/**
 * La stratégie est « renseignée » quand le brief RELU porte un angle (libre ou
 * adopté) OU une hypothèse retenue. Mesuré sur le brief persisté · prouve la
 * restitution après rechargement, jamais un état d'écran éphémère.
 */
export function etapeStrategieRenseignee(brief: BriefCanonique): boolean {
  return texteRenseigne(brief.angle) || texteRenseigne(brief.hypothesisId);
}

/** La direction est « renseignée » quand le brief RELU porte une intention de style. */
export function etapeDirectionRenseignee(brief: BriefCanonique): boolean {
  return texteRenseigne(brief.styleIntent);
}

/**
 * L'état du rail pour une étape câblée qui opère sur le projet · « done » si
 * elle est renseignée dans le brief relu, sinon l'état positionnel ordinaire.
 */
export function etatRailProjet(id: EtapeAssistant, courante: EtapeAssistant, brief: BriefCanonique | null): EtatRailEtape {
  const base = etatRail(id, courante);
  if (base === 'current' || base === 'bientot' || !brief) return base;
  if (id === 'strategie' && etapeStrategieRenseignee(brief)) return 'done';
  if (id === 'direction' && etapeDirectionRenseignee(brief)) return 'done';
  return base;
}

/** Les chemins bornés à la cible brief · une saisie de stratégie/direction ne touche que le brief. */
export const ALLOWED_PATHS_BRIEF: readonly string[] = ['/brief'];

const BRIEF_ANGLE = '/brief/angle';
const BRIEF_STYLE = '/brief/styleIntent';

/**
 * « Écrire mon angle » · le CHANGEMENT (pur) d'une proposition manuelle, borné
 * à `/brief/angle`. `add` si le champ est absent du brief (angle optionnel,
 * jamais écrit à la création quand vide), `replace` sinon · le serveur refuse
 * un `replace` sur un champ absent et un `add` sur un champ présent.
 */
export function changementAngleManuel(brief: BriefCanonique, angle: string): ChangementPatch {
  const existe = typeof brief.angle === 'string';
  return { op: existe ? 'replace' : 'add', path: BRIEF_ANGLE, newValue: borne(angle), reason: 'Angle écrit à la main · stratégie' };
}

/** « Écrire l'intention de style » · `styleIntent` est canonique (toujours présent) · `replace`. */
export function changementStyleManuel(style: string): ChangementPatch {
  return { op: 'replace', path: BRIEF_STYLE, newValue: borne(style), reason: 'Intention de style écrite à la main · direction' };
}

/**
 * Retenir une hypothèse proposée · un nouveau brief qui porte `hypothesisId`,
 * la variable testée, et les faits de protocole (`faitsHypothese` PRÉSERVE les
 * `sourceIds`). Tout le reste du brief est conservé. Aucune source n'est
 * inventée · si une source citée n'appartient pas au projet, le serveur
 * refusera à la validation relationnelle (pas de fuite concurrent).
 */
export function briefAvecHypothese(brief: BriefCanonique, h: HypotheseTest): BriefCanonique {
  const faits = faitsHypothese(h);
  const ecartes = new Set(faits.map((f) => f.id));
  const variable = borne(h.variable);
  return {
    ...brief,
    hypothesisId: h.id,
    testedVariable: variable,
    facts: [...brief.facts.filter((f) => !ecartes.has(f.id)), ...faits].slice(0, LISTE_MAX),
    variables: variable ? [...new Set([...brief.variables, variable])].slice(0, LISTE_MAX) : brief.variables,
  };
}

/** « Retenir cette hypothèse » · le CHANGEMENT (remplace le brief entier, borné à `/brief`). */
export function changementHypotheseRetenue(brief: BriefCanonique, h: HypotheseTest): ChangementPatch {
  return { op: 'replace', path: '/brief', newValue: briefAvecHypothese(brief, h), reason: `Hypothèse retenue · ${h.id}` };
}

const demande = (bouts: Array<string | false | ''>): string => bouts.filter(Boolean).join('\n').slice(0, TEXTE_MAX);

/** Demande par défaut pour « Proposer d'autres angles » (Jarvis) · dérivée du brief, bornée. */
export function demandeAnglesDepuisBrief(brief: BriefCanonique): string {
  return demande([
    'Propose un nouvel angle publicitaire pour ce projet.',
    texteRenseigne(brief.objective) && `Objectif : ${brief.objective.trim()}`,
    texteRenseigne(brief.audience) && `Audience : ${brief.audience.trim()}`,
    texteRenseigne(brief.angle) && `Angle actuel à dépasser : ${brief.angle!.trim()}`,
  ]);
}

/** Demande par défaut pour « Autre direction » (Jarvis) · dérivée du brief, bornée. */
export function demandeDirectionDepuisBrief(brief: BriefCanonique): string {
  return demande([
    'Propose une direction artistique (intention de style) à partir de l’angle retenu.',
    texteRenseigne(brief.angle) && `Angle : ${brief.angle!.trim()}`,
    texteRenseigne(brief.concept) && `Concept : ${brief.concept!.trim()}`,
    texteRenseigne(brief.styleIntent) && `Style actuel à faire évoluer : ${brief.styleIntent.trim()}`,
  ]);
}
