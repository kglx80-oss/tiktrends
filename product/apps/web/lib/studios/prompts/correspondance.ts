/**
 * Correspondance entre le noyau du registre (types purs) et les tables L1.
 * PUR : ni base, ni réseau. Tout ce qui traduit une ligne en objet du noyau
 * passe ici, une seule fois.
 *
 * ── Les écarts tranchés ──────────────────────────────────────────────────────
 *
 *  - VERSION : le noyau et le pack parlent « X.Y.Z » ; la colonne
 *    `studio_prompt_versions.version` est un entier. Codage injectif et
 *    croissant : X·1 000 000 + Y·1 000 + Z, chaque composante entre 0 et 999
 *    (X ≤ 2146 pour tenir dans un int4). L'ordre des entiers est celui des
 *    versions sémantiques.
 *  - TYPE : la colonne `kind` connaît `template`, `style_recipe`, `common`.
 *    Le socle (`commonSystemInstructions`), le rendu (`rendering`) et les
 *    politiques de conversation (`jarvis.conversation`) sont des `common`,
 *    distingués par leur clé.
 *  - RELEASE : `entries` porte les entrées du noyau (templates, recettes,
 *    socle, rendu) PLUS les politiques de conversation, et `packHash`,
 *    l'empreinte du noyau (`empreinteRelease`). `release_hash` est l'identité
 *    COMPLÈTE : égale à `packHash` sans conversation, sinon SHA-256 du JSON
 *    canonique `{ packHash, conversations }` (contenus complets triés par clé).
 *    Changer une seule phrase de Jarvis change donc l'empreinte de release.
 *  - ÉVALUATION : stockée sur l'empreinte complète ; traduite pour le noyau
 *    seulement si elle vise exactement cette empreinte.
 */

import {
  empreinteContenu, empreinteJson, empreinteRelease, sha256Texte, comparerPointsDeCode, MOTIF_SHA256, MOTIF_VERSION,
  type ContenuRelease, type EntreeRegistre, type EntreeRelease, type EvaluationRelease, type Release,
  type StatutRelease, type StatutVersion, type TemplatePrompt, type RecetteStyle, type RenduPack,
} from './noyau';
import { CLES_CONVERSATION, type PolitiqueConversation } from './conversation';

export const CLE_SOCLE = 'commonSystemInstructions';
export const CLE_RENDU = 'rendering';

export type TypeEntree = 'template' | 'recette' | 'socle' | 'rendu' | 'conversation';
export type KindBase = 'template' | 'style_recipe' | 'common';

export const LIBELLE_TYPE: Readonly<Record<TypeEntree, string>> = {
  template: 'Template', recette: 'Recette de style', socle: 'Consignes communes', rendu: 'Rendu', conversation: 'Politique de conversation',
};

/* ─────────────────────────────── Versions ──────────────────────────────── */

const BASE = 1000;
export const VERSION_MAJEURE_MAX = 2146;

export function versionVersEntier(v: string): number | null {
  if (!MOTIF_VERSION.test(v)) return null;
  const [x, y, z] = v.split('.').map(Number) as [number, number, number];
  if (y >= BASE || z >= BASE || x > VERSION_MAJEURE_MAX) return null;
  const n = x * BASE * BASE + y * BASE + z;
  return n >= 1 ? n : null;
}

export function entierVersVersion(n: number): string {
  return `${Math.floor(n / (BASE * BASE))}.${Math.floor(n / BASE) % BASE}.${n % BASE}`;
}

/** Version suivante (correctif) au-dessus de toutes celles d'une clé. */
export function versionSuivante(existantes: readonly string[]): string {
  let max = 0;
  for (const v of existantes) max = Math.max(max, versionVersEntier(v) ?? 0);
  return max === 0 ? '1.0.0' : entierVersVersion(max + 1);
}

/* ─────────────────────────────── Types ─────────────────────────────────── */

export function kindDe(type: TypeEntree): KindBase {
  return type === 'template' ? 'template' : type === 'recette' ? 'style_recipe' : 'common';
}

export function typeDe(kind: string, key: string): TypeEntree | null {
  if (kind === 'template') return 'template';
  if (kind === 'style_recipe') return 'recette';
  if (kind !== 'common') return null;
  if (key === CLE_SOCLE) return 'socle';
  if (key === CLE_RENDU) return 'rendu';
  if (CLES_CONVERSATION.includes(key)) return 'conversation';
  return null;
}

/** Ligne de `studio_prompt_versions` · les colonnes que la correspondance lit. */
export interface LigneVersion {
  id: string;
  key: string;
  version: number;
  kind: string;
  status: string;
  content: unknown;
  contentHash: string;
  origin: string;
  reason: string;
  createdAt?: Date | string | null;
  validatedAt?: Date | string | null;
}

export interface EntreeServeur {
  id: string;
  type: TypeEntree;
  cle: string;
  version: string;
  contentHash: string;
  statut: StatutVersion;
}

export function entreeDeLigne(l: LigneVersion): EntreeServeur | null {
  const type = typeDe(l.kind, l.key);
  if (!type || (l.status !== 'draft' && l.status !== 'validated' && l.status !== 'retired')) return null;
  return { id: l.id, type, cle: l.key, version: entierVersVersion(l.version), contentHash: l.contentHash, statut: l.status };
}

/** Entrées du noyau (sans les politiques de conversation, qu'il ne connaît pas). */
export function registreNoyau(entrees: ReadonlyArray<EntreeServeur>): EntreeRegistre[] {
  return entrees.filter((e) => e.type !== 'conversation').map((e) => ({ type: e.type as EntreeRegistre['type'], cle: e.cle, version: e.version, contentHash: e.contentHash, statut: e.statut }));
}

/** Contenu d'une version tel que la base le garde · socle : `{ commonSystemInstructions }`. */
export function contenuPourBase(type: TypeEntree, objet: unknown): Record<string, unknown> {
  if (type === 'socle') return { [CLE_SOCLE]: objet as string };
  return objet as Record<string, unknown>;
}

/** Empreinte d'un contenu de version, selon son type (algorithmes du noyau). */
export function empreinteDeContenu(type: TypeEntree, contenu: unknown): string {
  if (type === 'socle') return sha256Texte(String((contenu as Record<string, unknown>)[CLE_SOCLE] ?? ''));
  return empreinteContenu(contenu as Record<string, unknown>);
}

/* ─────────────────────────────── Releases ──────────────────────────────── */

export interface EntreesRelease {
  templates: EntreeRelease[];
  recettes: EntreeRelease[];
  socle: EntreeRelease;
  rendu: EntreeRelease;
  conversations: EntreeRelease[];
  /** Empreinte du noyau (`empreinteRelease`) · sans les politiques de conversation. */
  packHash: string;
}

function estEntree(x: unknown): x is EntreeRelease {
  const o = x as Record<string, unknown>;
  return typeof o === 'object' && o !== null && typeof o.cle === 'string' && typeof o.version === 'string' && typeof o.contentHash === 'string';
}

/** Relit `entries` · `null` si la forme ne tient pas (aucune release bancale ne sert). */
export function lireEntrees(brut: unknown): EntreesRelease | null {
  const o = brut as Record<string, unknown>;
  if (typeof o !== 'object' || o === null) return null;
  const listes = ['templates', 'recettes', 'conversations'] as const;
  for (const l of listes) if (!Array.isArray(o[l]) || !(o[l] as unknown[]).every(estEntree)) return null;
  if (!estEntree(o.socle) || !estEntree(o.rendu) || typeof o.packHash !== 'string' || !MOTIF_SHA256.test(o.packHash)) return null;
  return o as unknown as EntreesRelease;
}

export interface ContenuComplet extends ContenuRelease {
  conversations: PolitiqueConversation[];
}

/** Identité complète d'une release · voir l'en-tête. */
export function empreinteReleaseComplete(packHash: string, conversations: ReadonlyArray<PolitiqueConversation>): string {
  if (conversations.length === 0) return packHash;
  return empreinteJson({ packHash, conversations: [...conversations].sort((a, b) => comparerPointsDeCode(a.key, b.key)) }, 'python');
}

export function empreintesRelease(c: ContenuComplet): { packHash: string; releaseHash: string } {
  const packHash = empreinteRelease(c);
  return { packHash, releaseHash: empreinteReleaseComplete(packHash, c.conversations) };
}

export interface EvaluationStockee {
  /** Empreinte COMPLÈTE évaluée. */
  releaseHash: string;
  testsStructurels: boolean;
  benchmarkApprouve: boolean;
  evaluationId?: string;
  approuvePar?: string;
  evalueeLe?: string;
}

export function lireEvaluation(brut: unknown): EvaluationStockee | null {
  const o = brut as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || typeof o.releaseHash !== 'string') return null;
  return { ...(o as unknown as EvaluationStockee), testsStructurels: o.testsStructurels === true, benchmarkApprouve: o.benchmarkApprouve === true };
}

/** Ligne de `studio_prompt_releases` · colonnes lues. */
export interface LigneRelease {
  id: string;
  scope: string;
  entries: unknown;
  releaseHash: string;
  status: string;
  evaluation: unknown;
  reason?: string;
  createdAt?: Date | string | null;
}

/**
 * Release du noyau depuis une ligne (portée plateforme seulement dans ce lot).
 * L'évaluation n'est transmise que si elle vise l'empreinte COMPLÈTE de la
 * ligne ; elle est alors exprimée sur `packHash`, la seule que le noyau sait
 * recalculer.
 */
export function releaseDeLigne(l: LigneRelease): Release | null {
  const e = lireEntrees(l.entries);
  if (!e || l.scope !== 'platform') return null;
  if (l.status !== 'staged' && l.status !== 'active' && l.status !== 'retired') return null;
  const ev = lireEvaluation(l.evaluation);
  const evaluation: EvaluationRelease | undefined = ev && ev.releaseHash === l.releaseHash
    ? { releaseHash: e.packHash, testsStructurels: ev.testsStructurels, benchmarkApprouve: ev.benchmarkApprouve, ...(ev.approuvePar ? { approuvePar: ev.approuvePar } : {}) }
    : undefined;
  return {
    id: l.id, portee: { niveau: 'plateforme' }, statut: l.status as StatutRelease, hash: e.packHash,
    templates: e.templates, recettes: e.recettes, socle: e.socle, rendu: e.rendu,
    ...(evaluation ? { evaluation } : {}),
  };
}

/** Les versions (clé@version) qu'une release référence, par type. */
export function referencesRelease(e: EntreesRelease): Array<{ type: TypeEntree; entree: EntreeRelease }> {
  return [
    ...e.templates.map((entree) => ({ type: 'template' as const, entree })),
    ...e.recettes.map((entree) => ({ type: 'recette' as const, entree })),
    { type: 'socle' as const, entree: e.socle },
    { type: 'rendu' as const, entree: e.rendu },
    ...e.conversations.map((entree) => ({ type: 'conversation' as const, entree })),
  ];
}

/** Reconstitue le contenu complet d'une release depuis les contenus de versions (clé `type:cle@version`). */
export function contenuDeRelease(e: EntreesRelease, contenus: ReadonlyMap<string, unknown>): ContenuComplet | null {
  const lire = (type: TypeEntree, x: EntreeRelease) => contenus.get(`${type}:${x.cle}@${x.version}`);
  const socle = lire('socle', e.socle) as Record<string, unknown> | undefined;
  const rendu = lire('rendu', e.rendu) as RenduPack | undefined;
  const templates = e.templates.map((x) => lire('template', x) as TemplatePrompt | undefined);
  const recettes = e.recettes.map((x) => lire('recette', x) as RecetteStyle | undefined);
  const conversations = e.conversations.map((x) => lire('conversation', x) as PolitiqueConversation | undefined);
  if (!socle || typeof socle[CLE_SOCLE] !== 'string' || !rendu || templates.some((t) => !t) || recettes.some((r) => !r) || conversations.some((c) => !c)) return null;
  return {
    commonSystemInstructions: socle[CLE_SOCLE] as string, rendering: rendu,
    templates: templates as TemplatePrompt[], styleRecipes: recettes as RecetteStyle[], conversations: conversations as PolitiqueConversation[],
  };
}
