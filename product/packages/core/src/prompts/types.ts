/**
 * Types partagés du registre de prompts (Studios v1.0, lot L2).
 *
 * Tout constat du registre a la même forme : un CODE stable (pour le serveur,
 * les tests et l'audit), une CIBLE (chemin JSON Pointer ou identifiant visé) et
 * une phrase française lisible en ADMIN. Aucun constat n'est un avertissement
 * implicite : ce qui est renvoyé ici bloque, sauf mention `avertissement`.
 */

export interface Constat {
  /** Code stable, en MAJUSCULES · jamais traduit, jamais reformulé. */
  code: string;
  /** Chemin JSON Pointer dans l'objet contrôlé, ou identifiant visé. */
  cible: string;
  /** Explication en français, pour ADMIN et les journaux expurgés. */
  message: string;
}

export function constat(code: string, cible: string, message: string): Constat {
  return { code, cible, message };
}

/** Profils logiques de modèle du cahier §6.3 · aucun autre n'est accepté. */
export const PROFILS_MODELE = [
  'reasoning_structured', 'vision_analysis', 'image_generation', 'image_edit',
  'speech', 'animation', 'lipsync', 'transcription', 'music',
] as const;
export type ProfilModele = (typeof PROFILS_MODELE)[number];

/** Un template du pack, tel que `02-PROMPTS.json` le décrit. */
export interface TemplatePrompt {
  key: string;
  title: string;
  version: string;
  status: string;
  scope: string;
  modelProfile: ProfilModele;
  allowedTools: string[];
  taskInstructions: string;
  userTemplate: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  semanticChecks: string[];
  evaluationCaseIds: string[];
  maximumRepairAttempts: number;
  contentHash: string;
}

/** Une recette de style du pack. */
export interface RecetteStyle {
  id: string;
  version: string;
  status: string;
  title: string;
  material: string;
  lighting: string;
  composition: string;
  scope: string;
  invariants: string[];
  forbiddenTransfers: string[];
  origin: string;
  /** Absent du pack v1.0 · calculé à l'import, vérifié s'il est fourni. */
  contentHash?: string;
}

export interface RenduPack {
  method: string;
  requiredVariables: string[];
  unresolvedVariablePolicy: string;
  contextVersionPinned: boolean;
  resolvedDataContract: string;
  mediaBindingContract: string;
}

export interface EtapeDeterministe {
  key: string;
  implementation: string;
}

export interface PackPrompts {
  packId: string;
  version: string;
  date: string;
  status: string;
  origin: string;
  promotion: string;
  commonSystemInstructions: string;
  rendering: RenduPack;
  templates: TemplatePrompt[];
  deterministicStages: EtapeDeterministe[];
  styleRecipes: RecetteStyle[];
  commonSystemHash: string;
  releaseHashAlgorithm: string;
}

/* -------------------------------------------------------------------------- */
/*  Contrats d'exécution (03-CONTRATS.schema.json, $defs/Context)             */
/* -------------------------------------------------------------------------- */

export interface Fait {
  id: string;
  claim: string;
  sourceIds: string[];
  kind: 'observed' | 'measured' | 'declared' | 'hypothesis';
  confidence: 'low' | 'medium' | 'high';
}

export interface ReferenceTypee {
  assetId: string;
  assetVersion: string;
  sha256: string;
  role: 'product' | 'identity' | 'style' | 'composition' | 'logo' | 'integrate';
  scope: 'product' | 'subject' | 'background' | 'global';
  allowedChanges: string[];
  requiredComponents: string[];
}

export interface Extrait {
  sourceId: string;
  version: string;
  text: string;
  trust: 'untrusted_data';
}

export interface DocumentResolu {
  id: string;
  version: string;
  schemaKey: string;
  content: Record<string, unknown>;
  sha256: string;
}

export interface IdAlloue {
  id: string;
  entityType: 'concept' | 'shot' | 'identity' | 'variant' | 'hypothesis' | 'batch_item' | 'fact';
  ordinal: number;
}

export interface LienMedia {
  bindingId: string;
  assetId: string;
  assetVersion: string;
  sha256: string;
  role: string;
  modality: 'image' | 'video' | 'audio';
  derivation: 'original' | 'thumbnail' | 'sampled_frames' | 'audio_excerpt';
  nativeAttachmentIndex: number;
  coverageDescription: string;
}

export interface ContexteTache {
  tenantId: string;
  brandId: string;
  projectVersionId: string | null;
  language: string;
  authorizedSourceIds: string[];
  facts: Fait[];
  invariants: string[];
  references: ReferenceTypee[];
  selectionIds: string[];
  allowedPaths: string[];
  knowledgeVersionIds: string[];
  historySummary: string;
  sourceExcerpts: Extrait[];
  knowledgeExcerpts: Extrait[];
  resolvedDocuments: DocumentResolu[];
  allocatedIds: IdAlloue[];
  mediaBindings: LienMedia[];
}

/** Entrée d'une tâche · `{ context, taskInputs }`, validée par `inputSchemaRef`. */
export interface EntreeTache {
  context: ContexteTache;
  taskInputs: Record<string, unknown>;
}

/** Enveloppe de sortie commune aux 22 templates, validée par `outputSchemaRef`. */
export interface SortieTache {
  status: 'ready' | 'blocked';
  questions: string[];
  warnings: string[];
  evidenceIds: string[];
  result: Record<string, unknown> | null;
}
