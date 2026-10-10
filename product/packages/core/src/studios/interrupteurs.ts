/**
 * Studios · F1 · interrupteurs par capacité et par espace (cahier 01 §14).
 *
 * « Feature flags par capacité/espace, default off pour nouveautés
 * incomplètes. Mode shadow pour résolution contexte/prompts sans nouvel appel
 * payant. Rollout interne → espaces pilotes autorisés → généralisation après
 * recette. L'ancienne expérience reste disponible tant que conversion et
 * reprise ne sont pas validées. »
 *
 * Pur : aucune base, aucun réseau, aucune lecture de `process.env`. Le serveur
 * (`apps/web/lib/studios/interrupteurs.ts`), le worker (`boucle.ts`) et les
 * écrans posent la MÊME question à la MÊME règle, avec l'environnement et les
 * réglages de l'espace qu'ils ont lus.
 *
 * ── Ce qui est « complet » et ce qui ne l'est pas ────────────────────────────
 *
 * Est INCOMPLÈTE toute capacité qui dépend d'un fournisseur non validé en réel
 * (génération d'images réelle, contrôle visuel, vidéo, voix, benchmark réel)
 * ou qui n'a pas encore servi en production (résolution à blanc). Elle est
 * COUPÉE par défaut. Le reste (projets, éditeur, textes, export, canvas,
 * propositions, identités) est déjà du produit : ALLUMÉ par défaut, coupable
 * en urgence.
 *
 * ── Ordre de décision (le premier qui tranche gagne) ─────────────────────────
 *
 *  1. ancienne expérience (Studio historique, Pubs IA, ADMIN IA) · TOUJOURS
 *     active, aucun réglage ne la coupe ;
 *  2. capacité inconnue · coupée (on n'allume pas ce qu'on ne connaît pas) ;
 *  3. coupure globale (`STUDIOS_CAPACITES_COUPEES`) · coupée partout ;
 *  4. coupure de l'espace (réglage plateforme) · coupée pour cet espace ;
 *  5. généralisation (`STUDIOS_CAPACITES_GENERALES`) · active partout ;
 *  6. espace pilote · par l'environnement (`STUDIOS_ESPACES_PILOTES` ×
 *     `STUDIOS_CAPACITES_PILOTES`) ou par le réglage plateforme de l'espace ;
 *  7. défaut · complète ⇒ active, incomplète ⇒ coupée.
 *
 * Une capacité de portée PLATEFORME (benchmark réel) n'a pas d'espace : seules
 * les étapes 3, 5 et 7 s'y appliquent.
 */

import { PLAN_IMAGE } from './image/parcours';
import { OPERATION_CONTROLE_VISION } from './execution/tarifs';

export const CAPACITES_STUDIOS = [
  'projets', 'editeur', 'textes', 'export', 'canvas', 'propositions', 'identites',
  'generation_image', 'controle_visuel', 'video', 'voix', 'benchmark_reel', 'shadow',
] as const;
export type CapaciteStudio = (typeof CAPACITES_STUDIOS)[number];

/** L'ancienne expérience · jamais coupée par ces interrupteurs (cahier §14). */
export const EXPERIENCES_TOUJOURS_ACTIVES = ['studio_historique', 'pubs_ia', 'admin_ia_studios'] as const;
export type ExperienceToujoursActive = (typeof EXPERIENCES_TOUJOURS_ACTIVES)[number];

export interface DefinitionCapacite {
  libelle: string;
  /** Ce que la capacité couvre · écrans et gestes. */
  couvre: string;
  maturite: 'complete' | 'incomplete';
  portee: 'espace' | 'plateforme';
  /** Pourquoi elle est incomplète · `null` pour une capacité complète. */
  raison: string | null;
}

export const DEFINITIONS_CAPACITES: Readonly<Record<CapaciteStudio, DefinitionCapacite>> = {
  projets: { libelle: 'Projets et atelier', couvre: 'liste et fiche projet, création depuis la Veille, produit et références, variantes et tests', maturite: 'complete', portee: 'espace', raison: null },
  editeur: { libelle: 'Éditeur d’image', couvre: 'calques, aperçu, déclinaison de format', maturite: 'complete', portee: 'espace', raison: null },
  textes: { libelle: 'Textes IA du projet', couvre: 'écrire, retenir, exporter et injecter des textes', maturite: 'complete', portee: 'espace', raison: null },
  export: { libelle: 'Export', couvre: 'export image et brief, téléchargement audité', maturite: 'complete', portee: 'espace', raison: null },
  canvas: { libelle: 'Canvas du projet', couvre: 'disposition personnelle des cartes', maturite: 'complete', portee: 'espace', raison: null },
  propositions: { libelle: 'Propositions de Jarvis', couvre: 'proposer, appliquer, rejeter un changement du projet', maturite: 'complete', portee: 'espace', raison: null },
  identites: { libelle: 'Identités de personnages', couvre: 'fiches, liaisons aux plans, contradictions', maturite: 'complete', portee: 'espace', raison: null },
  generation_image: { libelle: 'Génération d’images', couvre: 'consigne image, devis et lancement payant, fiches d’identité générées', maturite: 'incomplete', portee: 'espace', raison: 'le fournisseur d’images n’est pas encore validé en réel' },
  controle_visuel: { libelle: 'Contrôle visuel', couvre: 'relecture d’un média livré par la vision, ligne du devis', maturite: 'incomplete', portee: 'espace', raison: 'la relecture par la vision n’est pas encore validée en réel' },
  video: { libelle: 'Vidéo · storyboard et images clés', couvre: 'storyboard, consignes et images clés, montage du projet vidéo', maturite: 'incomplete', portee: 'espace', raison: 'la chaîne vidéo n’est pas encore validée en réel' },
  voix: { libelle: 'Voix', couvre: 'modes de parole et prises de voix', maturite: 'incomplete', portee: 'espace', raison: 'aucun fournisseur de voix n’est validé' },
  benchmark_reel: { libelle: 'Benchmark réel', couvre: 'approbation du budget d’une campagne réelle', maturite: 'incomplete', portee: 'plateforme', raison: 'campagne réelle non budgétée' },
  shadow: { libelle: 'Résolution à blanc', couvre: 'requête de compilation image reconstruite sans appel ni écriture', maturite: 'incomplete', portee: 'espace', raison: 'outil de recette interne, pas encore comparé en production' },
};

/** Variables d'environnement lues par la règle · noms seulement, jamais un secret. */
export const ENV_INTERRUPTEURS = {
  coupees: 'STUDIOS_CAPACITES_COUPEES',
  generales: 'STUDIOS_CAPACITES_GENERALES',
  espacesPilotes: 'STUDIOS_ESPACES_PILOTES',
  capacitesPilotes: 'STUDIOS_CAPACITES_PILOTES',
} as const;

/** Réglage d'un espace, posé par la plateforme (`app_settings`, clé dédiée). */
export interface ReglagesEspace { actives: CapaciteStudio[]; coupees: CapaciteStudio[] }

export const PREFIXE_CLE_INTERRUPTEURS = 'studios_interrupteurs:';
export function cleInterrupteursEspace(workspaceId: string): string {
  return `${PREFIXE_CLE_INTERRUPTEURS}${workspaceId}`;
}

export type SourceDecision =
  | 'toujours' | 'inconnue' | 'coupure_globale' | 'coupure_espace'
  | 'generalisation' | 'pilote_env' | 'pilote_espace' | 'defaut';

export interface DecisionCapacite { active: boolean; source: SourceDecision }

export interface ContexteInterrupteurs {
  env: Readonly<Record<string, string | undefined>>;
  /** Identifiant de l'espace · `null` pour une décision de plateforme. */
  espace: string | null;
  /** Réglage de l'espace tel que lu en base (forme libre, relue ici). */
  reglages?: unknown;
}

const estCapacite = (x: unknown): x is CapaciteStudio => typeof x === 'string' && (CAPACITES_STUDIOS as readonly string[]).includes(x);
const estToujours = (x: unknown): x is ExperienceToujoursActive => typeof x === 'string' && (EXPERIENCES_TOUJOURS_ACTIVES as readonly string[]).includes(x);

/** Liste d'environnement · séparateurs virgule, point-virgule ou blanc ; vide ⇒ []. */
export function lireListeEnv(brut: string | undefined): string[] {
  return (brut ?? '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
}

/** Capacités d'une liste d'environnement · les noms inconnus sont ignorés (et rapportés à part). */
export function capacitesDeListe(brut: string | undefined): { capacites: CapaciteStudio[]; inconnues: string[] } {
  const l = lireListeEnv(brut);
  return { capacites: [...new Set(l.filter(estCapacite))], inconnues: l.filter((x) => !estCapacite(x)) };
}

/**
 * Lecture défensive du réglage d'un espace. Une capacité de portée plateforme
 * n'a rien à faire dans un réglage d'espace : elle est ignorée. Si une même
 * capacité est à la fois allumée et coupée, la coupure gagne.
 */
export function lireReglagesEspace(x: unknown): ReglagesEspace {
  const o = (typeof x === 'object' && x !== null ? x : {}) as { actives?: unknown; coupees?: unknown };
  const liste = (v: unknown): CapaciteStudio[] => (Array.isArray(v) ? [...new Set(v.filter(estCapacite))] : [])
    .filter((c) => DEFINITIONS_CAPACITES[c].portee === 'espace');
  const coupees = liste(o.coupees);
  return { actives: liste(o.actives).filter((c) => !coupees.includes(c)), coupees };
}

/** La décision, avec sa source · l'écran ADMIN la montre telle quelle. */
export function decisionCapacite(capacite: CapaciteStudio | ExperienceToujoursActive | string, c: ContexteInterrupteurs): DecisionCapacite {
  if (estToujours(capacite)) return { active: true, source: 'toujours' };
  if (!estCapacite(capacite)) return { active: false, source: 'inconnue' };
  const def = DEFINITIONS_CAPACITES[capacite];
  if (capacitesDeListe(c.env[ENV_INTERRUPTEURS.coupees]).capacites.includes(capacite)) return { active: false, source: 'coupure_globale' };
  const parEspace = def.portee === 'espace' && typeof c.espace === 'string' && c.espace.length > 0;
  const reglages = parEspace ? lireReglagesEspace(c.reglages) : { actives: [], coupees: [] };
  if (reglages.coupees.includes(capacite)) return { active: false, source: 'coupure_espace' };
  if (capacitesDeListe(c.env[ENV_INTERRUPTEURS.generales]).capacites.includes(capacite)) return { active: true, source: 'generalisation' };
  if (parEspace) {
    const pilotes = lireListeEnv(c.env[ENV_INTERRUPTEURS.espacesPilotes]).map((x) => x.toLowerCase());
    if (pilotes.includes(c.espace!.toLowerCase()) && capacitesDeListe(c.env[ENV_INTERRUPTEURS.capacitesPilotes]).capacites.includes(capacite)) {
      return { active: true, source: 'pilote_env' };
    }
    if (reglages.actives.includes(capacite)) return { active: true, source: 'pilote_espace' };
  }
  return { active: def.maturite === 'complete', source: 'defaut' };
}

export function capaciteActive(capacite: CapaciteStudio | ExperienceToujoursActive | string, c: ContexteInterrupteurs): boolean {
  return decisionCapacite(capacite, c).active;
}

/** Les capacités coupées parmi celles demandées · vide ⇒ tout est permis. */
export function capacitesCoupees(capacites: readonly CapaciteStudio[], c: ContexteInterrupteurs): CapaciteStudio[] {
  return [...new Set(capacites)].filter((x) => !capaciteActive(x, c));
}

/**
 * Les capacités qu'exige l'exécution d'opérations de devis ou de job
 * (identifiants de nœuds du plan d'impact, cf. `profilDuNoeud`).
 *
 *  · `keyframe:s_image` (image du studio Image) · génération d'images ;
 *  · `keyframe:<plan>` (image clé d'un plan vidéo), `clip:` · vidéo ;
 *  · `identite:` (fiche générée) · génération d'images ;
 *  · `voix:` · voix ;
 *  · `controle:vision` · contrôle visuel ;
 *  · nœuds de calcul (composition, montage, export…) · rien.
 */
export function capacitesDesOperations(operations: readonly unknown[]): CapaciteStudio[] {
  const out = new Set<CapaciteStudio>();
  for (const o of operations) {
    if (typeof o !== 'string') continue;
    if (o === OPERATION_CONTROLE_VISION) { out.add('controle_visuel'); continue; }
    const [prefixe, reste] = [o.split(':')[0], o.slice(o.indexOf(':') + 1)];
    if (prefixe === 'keyframe') out.add(reste === PLAN_IMAGE ? 'generation_image' : 'video');
    else if (prefixe === 'clip') out.add('video');
    else if (prefixe === 'identite') out.add('generation_image');
    else if (prefixe === 'voix') out.add('voix');
  }
  return CAPACITES_STUDIOS.filter((c) => out.has(c));
}

/** Les capacités des lignes d'un devis ou d'un instantané de job (forme libre, lue défensivement). */
export function capacitesDesLignes(lignes: unknown): CapaciteStudio[] {
  if (!Array.isArray(lignes)) return [];
  return capacitesDesOperations(lignes.map((l) => (typeof l === 'object' && l !== null ? (l as { operation?: unknown }).operation : null)));
}

/** La phrase d'un refus · dite telle quelle à l'écran et dans l'erreur serveur. */
export function messageCapaciteCoupee(capacites: readonly CapaciteStudio[]): string {
  const noms = capacites.map((c) => `« ${DEFINITIONS_CAPACITES[c].libelle} »`).join(', ');
  return `${noms} · non activé pour cet espace. Rien n’a été écrit ni débité.`;
}

/** Validation d'un réglage d'espace soumis par la plateforme · refus nommés, rien deviné. */
export function validerReglagesEspace(x: unknown): { ok: true; reglages: ReglagesEspace } | { ok: false; raisons: string[] } {
  const o = (typeof x === 'object' && x !== null ? x : null) as { actives?: unknown; coupees?: unknown } | null;
  if (!o || !Array.isArray(o.actives) || !Array.isArray(o.coupees)) return { ok: false, raisons: ['réglage illisible · deux listes attendues (actives, coupées)'] };
  const raisons: string[] = [];
  for (const v of [...o.actives, ...o.coupees]) {
    if (!estCapacite(v)) raisons.push(`capacité inconnue : ${String(v).slice(0, 40)}`);
    else if (DEFINITIONS_CAPACITES[v].portee !== 'espace') raisons.push(`« ${DEFINITIONS_CAPACITES[v].libelle} » se règle pour toute la plateforme, pas par espace`);
  }
  const doubles = o.actives.filter((v) => (o.coupees as unknown[]).includes(v));
  for (const d of doubles) raisons.push(`« ${estCapacite(d) ? DEFINITIONS_CAPACITES[d].libelle : String(d)} » à la fois allumée et coupée`);
  if (raisons.length) return { ok: false, raisons };
  return { ok: true, reglages: lireReglagesEspace(o) };
}

/**
 * Les capacités nommées par un refus d'interrupteur · un refus
 * `UNSUPPORTED_CAPABILITY` porte ses capacités dans `targetIds`. Un autre
 * refus du même code (fournisseur non branché, profil sans tarif) n'en porte
 * aucune : l'écran garde alors son message d'erreur.
 */
export function capacitesDuRefus(e: { ok?: unknown; code?: unknown; targetIds?: unknown } | null | undefined): CapaciteStudio[] {
  if (!e || e.ok !== false || e.code !== 'UNSUPPORTED_CAPABILITY' || !Array.isArray(e.targetIds)) return [];
  return e.targetIds.filter(estCapacite);
}
