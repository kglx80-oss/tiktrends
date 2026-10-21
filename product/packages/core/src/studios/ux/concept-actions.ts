/**
 * Concept créatif V5 · les ACTIONS TYPÉES du fil d'un concept (mandat Kevin du
 * 20/10, items 4-5-7). Ce que l'écran propose comme GESTES CONCRETS au-dessus
 * des cartes de propositions · « Proposer des directions visuelles », « Proposer
 * 3 accroches », « Écrire le scénario », « Préparer la création ».
 *
 * Pur · ni base, ni réseau, ni modèle. L'écran (`ActionsConcept.tsx`) pose la
 * MÊME question à cette règle et ne décide RIEN dans le JSX : quelles actions
 * montrer, lesquelles sont actives, et pourquoi une action est grisée.
 *
 * ── Le vocabulaire est FERMÉ (comme `JARVIS_ACTIONS`) ────────────────────────
 *
 * On ne déclare ICI que les actions RÉELLEMENT raccordées à un chemin existant,
 * ou explicitement grisées en attendant leur raccordement (« Préparer la
 * création » · PR7). Un bouton mort est pire que l'absence de bouton :
 *
 *  · « Modifier le produit » n'y figure pas · changer le produit du concept est
 *    une SÉLECTION (`productRef`), pas un patch texte du brief · aucun
 *    raccordement propre au cycle de propositions aujourd'hui ;
 *  · « Décliner ce concept » n'y figure pas · décliner (fabriquer des variantes)
 *    est le sous-système variantes/essai-lot, hors du périmètre de ce fil.
 *
 * Les montrer grisés « pour faire joli » tromperait · on les laisse dehors tant
 * qu'elles ne font rien, et on le dit.
 *
 * ── Comment une proposition se fabrique SANS second moteur ───────────────────
 *
 * Une action « proposition » ne crée PAS de média et ne dépense RIEN par
 * elle-même : elle demande au serveur une proposition BORNÉE à un chemin du
 * brief (`proposerPatch`, cible `brief`, `allowedPaths` = le seul chemin visé),
 * qui passe par la garde `studio.propose` ET la barrière de dépense existantes.
 * La personne clique · le texte libre du fil, lui, ne propose ni ne dépense
 * jamais. « 3 accroches » = TROIS propositions concurrentes sur `/brief/texts`,
 * que la personne départage dans les cartes.
 */

import type { TypeNouveauProjet } from './nouveau-projet';

/** Les seules actions typées du fil d'un concept · toute autre chaîne est du texte. */
export type ConceptActionKey = 'directions' | 'accroches' | 'scenario' | 'preparer';

/**
 * Le genre décide du RACCORDEMENT :
 *  · `proposition` · demande une proposition bornée à un chemin du brief (relue,
 *    appliquée seulement sur geste) · payante, annoncée avant le clic ;
 *  · `preparation` · passe à la fabrication de la créative · dépend d'une
 *    capacité (`generation_image`) ; pour une image, ouvre le parcours produit
 *    sans génération automatique. Les autres types restent désactivés.
 */
export type GenreActionConcept = 'proposition' | 'preparation';

export interface DefActionConcept {
  key: ConceptActionKey;
  label: string;
  genre: GenreActionConcept;
  /** Ce que le clic fait vraiment · dit AVANT, jamais après. */
  effet: string;
  /** Pour une `proposition` · le chemin du brief visé et le nombre de propositions concurrentes. */
  cibleBrief?: { chemin: string; nombre: number };
  /** Les types de projet où l'action a du sens · une action hors de ces types n'est pas montrée. */
  kinds: readonly TypeNouveauProjet[];
}

/** La cible unique de toutes les propositions de concept · le brief de la version courante. */
export const CIBLE_CONCEPT = 'brief';

const VISUELS: readonly TypeNouveauProjet[] = ['ads', 'image', 'video'];

/**
 * Le vocabulaire FERMÉ, dans l'ordre d'affichage. Les chemins visés existent
 * tous dans le brief canonique (`styleIntent`, `texts`, `composition`), donc une
 * proposition bornée à l'un d'eux reste DANS sa cible (cf. `borneCheminsACible`).
 */
export const ACTIONS_CONCEPT: readonly DefActionConcept[] = [
  {
    key: 'directions', label: 'Proposer des directions visuelles', genre: 'proposition',
    effet: 'Jarvis propose une intention de style à relire · rien n’est appliqué sans ton geste.',
    cibleBrief: { chemin: '/brief/styleIntent', nombre: 1 }, kinds: VISUELS,
  },
  {
    key: 'accroches', label: 'Proposer 3 accroches', genre: 'proposition',
    effet: 'Jarvis propose 3 accroches concurrentes · tu en adoptes une, rien n’est appliqué sans ton geste.',
    cibleBrief: { chemin: '/brief/texts', nombre: 3 }, kinds: ['ads', 'image', 'video', 'text'],
  },
  {
    key: 'scenario', label: 'Écrire le scénario', genre: 'proposition',
    effet: 'Jarvis propose un déroulé de plans à relire · rien n’est appliqué sans ton geste.',
    cibleBrief: { chemin: '/brief/composition', nombre: 1 }, kinds: ['video'],
  },
  {
    key: 'preparer', label: 'Préparer la création', genre: 'preparation',
    effet: 'Passer à la fabrication de la créative à partir du concept.',
    kinds: VISUELS,
  },
];

const PAR_CLE: Readonly<Record<ConceptActionKey, DefActionConcept>> =
  Object.fromEntries(ACTIONS_CONCEPT.map((a) => [a.key, a])) as Record<ConceptActionKey, DefActionConcept>;

/** Combien d'appels texte une action « proposition » déclenche · 0 pour les autres. */
export function nombreAppels(def: DefActionConcept): number {
  return def.genre === 'proposition' && def.cibleBrief ? def.cibleBrief.nombre : 0;
}

/**
 * La demande ENVOYÉE au serveur pour une proposition · fermée et déterministe,
 * dérivée de la clé (jamais du texte libre de la personne). Pour « 3 accroches »,
 * chaque variante demande un angle distinct pour que les trois ne se répètent pas.
 * Clé inconnue ⇒ `null` · l'écran n'envoie alors rien.
 */
export function demandeProposition(key: ConceptActionKey, index = 0): string | null {
  switch (key) {
    case 'directions':
      return 'Propose une intention de style pour ce concept · 2 ou 3 phrases, cohérentes avec la marque. Ne touche QUE l’intention de style, rien d’autre du brief.';
    case 'accroches': {
      const angles = ['un angle émotionnel', 'un angle bénéfice concret', 'un angle preuve ou curiosité'];
      const angle = angles[index] ?? angles[angles.length - 1]!;
      return `Propose UNE accroche courte et percutante pour ce concept · ${angle}, une seule phrase, distincte des autres variantes. Ne touche QUE les textes du brief.`;
    }
    case 'scenario':
      return 'Propose un déroulé de plans pour ce concept vidéo · 3 à 5 plans décrits brièvement, dans l’ordre. Ne touche QUE la composition du brief.';
    case 'preparer':
      return null;
  }
}

/* ─────────────────────────────── Résolution ──────────────────────────────── */

/**
 * Tout ce que la règle a besoin de savoir · des booléens, jamais un appel.
 * `briefPret` = la version courante porte un brief canonique (sinon il n'y a
 * aucun chemin à affiner). `jarvisDisponible`/`jarvisRaison` = la disponibilité
 * déjà calculée (`disponibiliteJarvis`). `generationImageActive` = l'état de la
 * capacité d'espace (`generation_image`).
 */
export interface ContexteActionsConcept {
  kind: string;
  peutProposer: boolean;
  briefPret: boolean;
  jarvisDisponible: boolean;
  jarvisRaison: string;
  generationImageActive: boolean;
  /** Une version historique ne propose pas de passage en fabrication. */
  ancienneVersion?: boolean;
}

export type EtatActionConcept = 'actif' | 'desactive';

export interface ActionConceptResolue {
  def: DefActionConcept;
  etat: EtatActionConcept;
  /** Pourquoi l'action est grisée · `null` quand elle est active. */
  raison: string | null;
}

const RAISON_ROLE = 'Ton rôle permet de lire, pas de demander une proposition.';
const RAISON_BRIEF = 'Cadre d’abord le concept · le brief n’a pas encore de version à affiner.';
const RAISON_PREPARER_BIENTOT = 'La fabrication de la créative sera branchée prochainement.';
const raisonPreparerCapacite = 'La génération d’images n’est pas activée pour cet espace · elle le sera après recette.';

/**
 * Les actions à montrer pour ce concept, chacune avec son état et, si grisée, la
 * raison. Une action hors du type de projet n'est PAS montrée (ni active, ni
 * grisée) · « Écrire le scénario » n'apparaît que pour une vidéo. Une action
 * `proposition` est active seulement si la personne peut proposer, qu'un brief
 * existe et que Jarvis est disponible · sinon grisée, avec le PREMIER blocage en
 * clair. La préparation image ouvre le parcours produit après ses propres gardes.
 */
export function actionsConceptResolues(ctx: ContexteActionsConcept): ActionConceptResolue[] {
  const out: ActionConceptResolue[] = [];
  for (const def of ACTIONS_CONCEPT) {
    if (!(def.kinds as readonly string[]).includes(ctx.kind)) continue;
    if (def.genre === 'preparation') {
      // Navigation image seulement, après les gardes de version, rôle et capacité.
      const raison = ctx.kind !== 'image'
        ? (ctx.generationImageActive ? RAISON_PREPARER_BIENTOT : raisonPreparerCapacite)
        : ctx.ancienneVersion ? 'Reprends la version courante pour préparer la création.'
        : !ctx.peutProposer ? 'Ton rôle permet de lire, pas de préparer une création.'
        : !ctx.generationImageActive ? raisonPreparerCapacite
        : !ctx.briefPret ? RAISON_BRIEF : null;
      out.push({ def, etat: raison ? 'desactive' : 'actif', raison });
      continue;
    }
    // genre === 'proposition' · le premier blocage gagne.
    if (!ctx.peutProposer) { out.push({ def, etat: 'desactive', raison: RAISON_ROLE }); continue; }
    if (!ctx.briefPret) { out.push({ def, etat: 'desactive', raison: RAISON_BRIEF }); continue; }
    if (!ctx.jarvisDisponible) { out.push({ def, etat: 'desactive', raison: ctx.jarvisRaison || 'Jarvis n’est pas disponible pour l’instant.' }); continue; }
    out.push({ def, etat: 'actif', raison: null });
  }
  return out;
}

/** Une clé est-elle une action de concept connue (vocabulaire fermé) ? */
export function estActionConcept(x: unknown): x is ConceptActionKey {
  return typeof x === 'string' && x in PAR_CLE;
}
