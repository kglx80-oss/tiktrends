/**
 * Chargement, validation et import du pack de prompts (`02-PROMPTS.json`).
 *
 * ── Ce que ce module tranche ─────────────────────────────────────────────────
 *
 *  - Le pack est REÇU (objet ou texte), jamais lu du disque ici : le serveur
 *    choisit sa source (fichier du dépôt, base), le noyau la juge.
 *  - Structure stricte : 22 templates et 8 recettes attendus, clés uniques,
 *    champs connus seulement, versions sémantiques, références de schéma au
 *    format `03-CONTRATS.schema.json#/$defs/<nom>`, gabarit utilisateur limité
 *    aux variables déclarées par `rendering.requiredVariables`.
 *  - Empreintes RECALCULÉES : `contentHash` de chaque template (et de chaque
 *    recette, qui n'en porte pas dans la v1.0 : il est calculé), puis
 *    `commonSystemHash`, selon l'algorithme de `verify-pack.py` (voir
 *    `empreinte.ts`). Une empreinte fausse refuse le pack entier.
 *  - Import en BROUILLON, idempotent par (type, clé, version, empreinte) : un
 *    second import ne crée rien ; une même (clé, version) avec une autre
 *    empreinte est un CONFLIT et l'import entier est refusé · jamais
 *    d'écrasement, jamais d'activation automatique.
 *
 * ── Ce qu'il refuse en plus de verify-pack.py ────────────────────────────────
 *
 *  - un template ou une recette qui ne se déclare pas `draft` (un pack ne peut
 *    pas arriver « actif ») ;
 *  - un `allowedTools` non vide (« Aucun outil/action exécuté par le modèle ») ;
 *  - plus d'une tentative de réparation (cahier §9.3 : « limitées à une ») ;
 *  - une étape déterministe qui porterait la clé d'un template (elle serait
 *    déléguée au modèle) ;
 *  - une politique de variable non résolue autre que `reject`.
 */

import { empreinteContenu, sha256Texte, ErreurEmpreinte, MOTIF_SHA256 } from './empreinte';
import { constat, PROFILS_MODELE, type Constat, type PackPrompts, type RecetteStyle, type TemplatePrompt } from './types';

/* -------------------------------------------------------------------------- */
/*  Constantes                                                                */
/* -------------------------------------------------------------------------- */

export const NOMBRE_TEMPLATES_ATTENDU = 22;
export const NOMBRE_RECETTES_ATTENDU = 8;
/** Cahier §9.3 · « Les réparations de sortie LLM sont limitées à une tentative ». */
export const REPARATIONS_MAXIMUM = 1;

export const MOTIF_VERSION = /^\d+\.\d+\.\d+$/;
export const MOTIF_REF_SCHEMA = /^03-CONTRATS\.schema\.json#\/\$defs\/([A-Za-z0-9_]+)$/;
/** Toute occurrence `{{ … }}` · bien ou mal formée, pour ne rien laisser passer. */
const MOTIF_PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

const CHAMPS_TEMPLATE = [
  'key', 'title', 'version', 'status', 'scope', 'modelProfile', 'allowedTools', 'taskInstructions', 'userTemplate',
  'inputSchemaRef', 'outputSchemaRef', 'semanticChecks', 'evaluationCaseIds', 'maximumRepairAttempts', 'contentHash',
] as const;
const CHAMPS_RECETTE = ['id', 'version', 'status', 'title', 'material', 'lighting', 'composition', 'scope', 'invariants', 'forbiddenTransfers', 'origin'] as const;
const PORTEES_RECETTE = ['background', 'subject', 'global'] as const;
const CHAMPS_PACK = [
  'packId', 'version', 'date', 'status', 'origin', 'promotion', 'commonSystemInstructions', 'rendering', 'templates',
  'deterministicStages', 'styleRecipes', 'commonSystemHash', 'releaseHashAlgorithm',
] as const;

/* -------------------------------------------------------------------------- */
/*  Petits contrôles                                                          */
/* -------------------------------------------------------------------------- */

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function estTexte(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}
function estListeTextes(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** Noms des variables `{{ nom }}` d'un texte, et nombre d'accolades orphelines. */
export function variablesDuGabarit(texte: string): { noms: string[]; orphelines: number } {
  const noms: string[] = [];
  let couvertes = 0;
  for (const m of texte.matchAll(MOTIF_PLACEHOLDER)) {
    noms.push(m[1] ?? '');
    couvertes++;
  }
  const ouvertures = texte.split('{{').length - 1;
  const fermetures = texte.split('}}').length - 1;
  return { noms, orphelines: Math.max(ouvertures, fermetures) - couvertes };
}

/* -------------------------------------------------------------------------- */
/*  Lecture d'un texte JSON · clés dupliquées                                 */
/* -------------------------------------------------------------------------- */

/**
 * Clés dupliquées d'un texte JSON. `JSON.parse` garde la DERNIÈRE occurrence
 * sans rien dire : une consigne doublée en fin de fichier remplacerait la
 * première en silence. On les cherche avant de parser.
 */
export function clesDupliquees(texte: string): string[] {
  type Cadre = { objet: boolean; cles: Set<string>; attendCle: boolean; chemin: string; derniere: string };
  const pile: Cadre[] = [];
  const doublons: string[] = [];
  let i = 0;
  while (i < texte.length) {
    const c = texte[i]!;
    if (c === '"') {
      let j = i + 1;
      while (j < texte.length && texte[j] !== '"') j += texte[j] === '\\' ? 2 : 1;
      const brut = texte.slice(i, j + 1);
      i = j + 1;
      const haut = pile[pile.length - 1];
      if (haut?.objet && haut.attendCle) {
        let cle: string;
        try { cle = JSON.parse(brut) as string; } catch { cle = brut; }
        if (haut.cles.has(cle)) doublons.push(`${haut.chemin}/${cle}`);
        haut.cles.add(cle);
        haut.derniere = cle;
        haut.attendCle = false;
      }
      continue;
    }
    if (c === '{' || c === '[') {
      const parent = pile[pile.length - 1];
      const segment = parent ? (parent.objet ? parent.derniere : '*') : '';
      pile.push({ objet: c === '{', cles: new Set(), attendCle: c === '{', chemin: parent ? `${parent.chemin}/${segment}` : '', derniere: '' });
    } else if (c === '}' || c === ']') {
      pile.pop();
    } else if (c === ',') {
      const haut = pile[pile.length - 1];
      if (haut?.objet) haut.attendCle = true;
    }
    i++;
  }
  return doublons;
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

export interface OptionsValidationPack {
  /** Noms des `$defs` du schéma de contrats · si fourni, chaque référence doit y exister. */
  defsSchema?: ReadonlySet<string>;
  /** Identifiants d'exigences et de cas connus (04-RECETTE.csv ∪ 09-BENCHMARK.json). */
  casConnus?: ReadonlySet<string>;
  /** Identifiants des cas du benchmark (F01…F24) · chaque template doit en viser au moins un. */
  casBenchmark?: ReadonlySet<string>;
  nombreTemplates?: number;
  nombreRecettes?: number;
}

export interface EmpreintesPack {
  templates: Record<string, string>;
  recettes: Record<string, string>;
  commonSystemHash: string;
  rendering: string;
}

export type ResultatPack =
  | { ok: true; pack: PackPrompts; empreintes: EmpreintesPack }
  | { ok: false; constats: Constat[] };

function champsInconnus(objet: Record<string, unknown>, connus: readonly string[], cible: string, sortie: Constat[]): void {
  for (const k of Object.keys(objet)) {
    if (!connus.includes(k)) sortie.push(constat('PACK_CHAMP_INCONNU', `${cible}/${k}`, `Champ « ${k} » inconnu · refusé plutôt qu'ignoré.`));
  }
}

function empreinteSure(objet: Record<string, unknown>, cible: string, sortie: Constat[]): string | null {
  try {
    return empreinteContenu(objet);
  } catch (e) {
    const detail = e instanceof ErreurEmpreinte ? `${e.code} en ${e.chemin}` : String(e);
    sortie.push(constat('PACK_EMPREINTE_IMPOSSIBLE', cible, `Empreinte non reproductible · ${detail}.`));
    return null;
  }
}

function validerTemplate(t: unknown, i: number, pack: Record<string, unknown>, options: OptionsValidationPack, sortie: Constat[]): string | null {
  const cible = `/templates/${i}`;
  if (!estObjet(t)) {
    sortie.push(constat('PACK_STRUCTURE', cible, 'Un template doit être un objet.'));
    return null;
  }
  champsInconnus(t, CHAMPS_TEMPLATE, cible, sortie);
  for (const champ of CHAMPS_TEMPLATE) {
    if (!(champ in t)) sortie.push(constat('PACK_CHAMP_MANQUANT', `${cible}/${champ}`, `Champ obligatoire « ${champ} » absent.`));
  }
  for (const champ of ['key', 'title', 'version', 'status', 'scope', 'taskInstructions', 'userTemplate', 'inputSchemaRef', 'outputSchemaRef', 'contentHash'] as const) {
    if (champ in t && !estTexte(t[champ])) sortie.push(constat('PACK_TYPE', `${cible}/${champ}`, `« ${champ} » doit être un texte non vide.`));
  }
  for (const champ of ['allowedTools', 'semanticChecks', 'evaluationCaseIds'] as const) {
    if (champ in t && !estListeTextes(t[champ])) sortie.push(constat('PACK_TYPE', `${cible}/${champ}`, `« ${champ} » doit être une liste de textes.`));
  }
  if (typeof t.version === 'string' && !MOTIF_VERSION.test(t.version)) sortie.push(constat('PACK_VERSION', `${cible}/version`, `Version « ${t.version} » hors format X.Y.Z.`));
  if (t.status !== 'draft') sortie.push(constat('PACK_STATUT_NON_BROUILLON', `${cible}/status`, 'Un template importé est un brouillon · aucun statut actif ne vient du pack.'));
  if (t.scope !== 'global') sortie.push(constat('PACK_PORTEE', `${cible}/scope`, 'Le pack est de portée plateforme · « global » seulement.'));
  if (!PROFILS_MODELE.includes(t.modelProfile as never)) sortie.push(constat('PACK_PROFIL_INCONNU', `${cible}/modelProfile`, `Profil de modèle « ${String(t.modelProfile)} » inconnu du cahier §6.3.`));
  if (Array.isArray(t.allowedTools) && t.allowedTools.length > 0) sortie.push(constat('PACK_OUTIL_INTERDIT', `${cible}/allowedTools`, 'Aucun outil ni action ne s’exécute depuis un modèle.'));
  if (Array.isArray(t.semanticChecks) && t.semanticChecks.length === 0) sortie.push(constat('PACK_CONTROLES_VIDES', `${cible}/semanticChecks`, 'Un template sans contrôle sémantique déclaré est refusé.'));
  if (!Number.isInteger(t.maximumRepairAttempts) || (t.maximumRepairAttempts as number) < 0 || (t.maximumRepairAttempts as number) > REPARATIONS_MAXIMUM) {
    sortie.push(constat('PACK_REPARATIONS_EXCESSIVES', `${cible}/maximumRepairAttempts`, `Entre 0 et ${REPARATIONS_MAXIMUM} tentative de réparation.`));
  }
  for (const champ of ['inputSchemaRef', 'outputSchemaRef'] as const) {
    const ref = t[champ];
    if (typeof ref !== 'string') continue;
    const m = MOTIF_REF_SCHEMA.exec(ref);
    if (!m) sortie.push(constat('PACK_REF_SCHEMA', `${cible}/${champ}`, `Référence « ${ref} » hors format 03-CONTRATS.schema.json#/$defs/<nom>.`));
    else if (options.defsSchema && !options.defsSchema.has(m[1]!)) sortie.push(constat('PACK_REF_SCHEMA_ABSENTE', `${cible}/${champ}`, `« ${m[1]} » n'existe pas dans le schéma de contrats.`));
  }
  if (Array.isArray(t.evaluationCaseIds)) {
    if (options.casConnus) {
      for (const id of t.evaluationCaseIds) {
        if (typeof id === 'string' && !options.casConnus.has(id)) sortie.push(constat('PACK_CAS_INCONNU', `${cible}/evaluationCaseIds`, `Cas « ${id} » absent de la recette et du benchmark.`));
      }
    }
    if (options.casBenchmark && !t.evaluationCaseIds.some((id) => typeof id === 'string' && options.casBenchmark!.has(id))) {
      sortie.push(constat('PACK_SANS_BENCHMARK', `${cible}/evaluationCaseIds`, 'Chaque template vise au moins un cas du benchmark.'));
    }
  }
  // Gabarit · seulement les variables déclarées, chacune présente, aucune accolade orpheline.
  const requises = estObjet(pack.rendering) && estListeTextes(pack.rendering.requiredVariables) ? pack.rendering.requiredVariables : [];
  if (typeof t.userTemplate === 'string') {
    const { noms, orphelines } = variablesDuGabarit(t.userTemplate);
    for (const n of noms) if (!requises.includes(n)) sortie.push(constat('PACK_VARIABLE_INCONNUE', `${cible}/userTemplate`, `Variable « ${n} » non déclarée par rendering.requiredVariables.`));
    for (const r of requises) if (!noms.includes(r)) sortie.push(constat('PACK_VARIABLE_ABSENTE', `${cible}/userTemplate`, `Variable obligatoire « ${r} » absente du gabarit.`));
    if (orphelines !== 0) sortie.push(constat('PACK_GABARIT_MAL_FORME', `${cible}/userTemplate`, 'Accolades doubles orphelines dans le gabarit.'));
  }
  if (typeof t.taskInstructions === 'string' && /\{\{|\}\}/.test(t.taskInstructions)) {
    sortie.push(constat('PACK_VARIABLE_HORS_GABARIT', `${cible}/taskInstructions`, 'Les consignes ne portent aucune variable · les données passent par le gabarit.'));
  }
  // Empreinte recalculée.
  const calculee = empreinteSure(t, `${cible}/contentHash`, sortie);
  if (calculee !== null && typeof t.contentHash === 'string' && calculee !== t.contentHash) {
    sortie.push(constat('PACK_EMPREINTE_FAUSSE', `${cible}/contentHash`, `Empreinte déclarée ${t.contentHash.slice(0, 12)}… ≠ recalculée ${calculee.slice(0, 12)}…`));
  }
  return calculee;
}

function validerRecette(r: unknown, i: number, sortie: Constat[]): string | null {
  const cible = `/styleRecipes/${i}`;
  if (!estObjet(r)) {
    sortie.push(constat('PACK_STRUCTURE', cible, 'Une recette doit être un objet.'));
    return null;
  }
  champsInconnus(r, [...CHAMPS_RECETTE, 'contentHash'], cible, sortie);
  for (const champ of CHAMPS_RECETTE) {
    if (!(champ in r)) sortie.push(constat('PACK_CHAMP_MANQUANT', `${cible}/${champ}`, `Champ obligatoire « ${champ} » absent.`));
  }
  for (const champ of ['id', 'version', 'status', 'title', 'material', 'lighting', 'composition', 'scope', 'origin'] as const) {
    if (champ in r && !estTexte(r[champ])) sortie.push(constat('PACK_TYPE', `${cible}/${champ}`, `« ${champ} » doit être un texte non vide.`));
  }
  for (const champ of ['invariants', 'forbiddenTransfers'] as const) {
    if (champ in r && !estListeTextes(r[champ])) sortie.push(constat('PACK_TYPE', `${cible}/${champ}`, `« ${champ} » doit être une liste de textes.`));
  }
  if (typeof r.version === 'string' && !MOTIF_VERSION.test(r.version)) sortie.push(constat('PACK_VERSION', `${cible}/version`, `Version « ${r.version} » hors format X.Y.Z.`));
  if (r.status !== 'draft') sortie.push(constat('PACK_STATUT_NON_BROUILLON', `${cible}/status`, 'Une recette importée est un brouillon.'));
  if (!PORTEES_RECETTE.includes(r.scope as never)) sortie.push(constat('PACK_PORTEE', `${cible}/scope`, 'Portée de recette : background, subject ou global.'));
  const calculee = empreinteSure(r, `${cible}/contentHash`, sortie);
  if (calculee !== null && 'contentHash' in r && r.contentHash !== calculee) {
    sortie.push(constat('PACK_EMPREINTE_FAUSSE', `${cible}/contentHash`, 'Empreinte déclarée de la recette ≠ recalculée.'));
  }
  return calculee;
}

/**
 * Valide un pack et recalcule ses empreintes. Ne modifie pas l'objet reçu.
 * `ok: false` dès le premier défaut de structure ou d'empreinte · tous les
 * constats sont rendus d'un coup pour que l'ADMIN corrige en une passe.
 */
export function validerPack(brut: unknown, options: OptionsValidationPack = {}): ResultatPack {
  const sortie: Constat[] = [];
  if (!estObjet(brut)) return { ok: false, constats: [constat('PACK_STRUCTURE', '', 'Le pack doit être un objet JSON.')] };
  champsInconnus(brut, CHAMPS_PACK, '', sortie);
  for (const champ of CHAMPS_PACK) if (!(champ in brut)) sortie.push(constat('PACK_CHAMP_MANQUANT', `/${champ}`, `Champ obligatoire « ${champ} » absent.`));
  for (const champ of ['packId', 'version', 'status', 'commonSystemInstructions', 'commonSystemHash', 'releaseHashAlgorithm'] as const) {
    if (champ in brut && !estTexte(brut[champ])) sortie.push(constat('PACK_TYPE', `/${champ}`, `« ${champ} » doit être un texte non vide.`));
  }
  if (typeof brut.version === 'string' && !MOTIF_VERSION.test(brut.version)) sortie.push(constat('PACK_VERSION', '/version', 'Version du pack hors format X.Y.Z.'));
  if (brut.status !== 'draft') sortie.push(constat('PACK_STATUT_NON_BROUILLON', '/status', 'Un pack s’importe en brouillon.'));

  // Rendu · la politique d'injection des données n'est pas négociable.
  const rendu = brut.rendering;
  if (!estObjet(rendu)) sortie.push(constat('PACK_STRUCTURE', '/rendering', 'rendering doit être un objet.'));
  else {
    if (!estListeTextes(rendu.requiredVariables) || rendu.requiredVariables.length === 0) sortie.push(constat('PACK_TYPE', '/rendering/requiredVariables', 'Liste de variables obligatoires attendue.'));
    if (rendu.unresolvedVariablePolicy !== 'reject') sortie.push(constat('PACK_POLITIQUE_VARIABLE', '/rendering/unresolvedVariablePolicy', 'Une variable non résolue doit être refusée (reject) · aucun repli.'));
    if (rendu.contextVersionPinned !== true) sortie.push(constat('PACK_CONTEXTE_NON_EPINGLE', '/rendering/contextVersionPinned', 'Le contexte doit être épinglé par version.'));
  }
  if (typeof brut.commonSystemInstructions === 'string' && /\{\{|\}\}/.test(brut.commonSystemInstructions)) {
    sortie.push(constat('PACK_VARIABLE_HORS_GABARIT', '/commonSystemInstructions', 'Les consignes communes ne portent aucune variable.'));
  }

  // Templates.
  const empreintesTemplates: Record<string, string> = {};
  const nbT = options.nombreTemplates ?? NOMBRE_TEMPLATES_ATTENDU;
  if (!Array.isArray(brut.templates)) sortie.push(constat('PACK_STRUCTURE', '/templates', 'templates doit être une liste.'));
  else {
    if (brut.templates.length !== nbT) sortie.push(constat('PACK_NOMBRE_TEMPLATES', '/templates', `${brut.templates.length} templates · ${nbT} attendus.`));
    const vues = new Set<string>();
    brut.templates.forEach((t, i) => {
      const h = validerTemplate(t, i, brut, options, sortie);
      const cle = estObjet(t) && typeof t.key === 'string' ? t.key : null;
      if (cle === null) return;
      if (vues.has(cle)) sortie.push(constat('PACK_CLE_DUPLIQUEE', `/templates/${i}/key`, `Clé « ${cle} » déjà présente dans le pack.`));
      vues.add(cle);
      if (h) empreintesTemplates[cle] = h;
    });
  }

  // Recettes.
  const empreintesRecettes: Record<string, string> = {};
  const nbR = options.nombreRecettes ?? NOMBRE_RECETTES_ATTENDU;
  if (!Array.isArray(brut.styleRecipes)) sortie.push(constat('PACK_STRUCTURE', '/styleRecipes', 'styleRecipes doit être une liste.'));
  else {
    if (brut.styleRecipes.length !== nbR) sortie.push(constat('PACK_NOMBRE_RECETTES', '/styleRecipes', `${brut.styleRecipes.length} recettes · ${nbR} attendues.`));
    const vues = new Set<string>();
    brut.styleRecipes.forEach((r, i) => {
      const h = validerRecette(r, i, sortie);
      const id = estObjet(r) && typeof r.id === 'string' ? r.id : null;
      if (id === null) return;
      if (vues.has(id)) sortie.push(constat('PACK_CLE_DUPLIQUEE', `/styleRecipes/${i}/id`, `Recette « ${id} » déjà présente dans le pack.`));
      vues.add(id);
      if (h) empreintesRecettes[id] = h;
    });
  }

  // Étapes déterministes · jamais confiées au modèle.
  if (!Array.isArray(brut.deterministicStages)) sortie.push(constat('PACK_STRUCTURE', '/deterministicStages', 'deterministicStages doit être une liste.'));
  else {
    const vues = new Set<string>();
    brut.deterministicStages.forEach((e, i) => {
      if (!estObjet(e) || !estTexte(e.key) || !estTexte(e.implementation)) {
        sortie.push(constat('PACK_STRUCTURE', `/deterministicStages/${i}`, 'Étape déterministe : key et implementation attendus.'));
        return;
      }
      if (vues.has(e.key)) sortie.push(constat('PACK_CLE_DUPLIQUEE', `/deterministicStages/${i}/key`, `Étape « ${e.key} » en double.`));
      vues.add(e.key);
      if (e.key in empreintesTemplates) sortie.push(constat('PACK_ETAPE_DETERMINISTE_DELEGUEE', `/deterministicStages/${i}/key`, `« ${e.key} » est une étape déterministe · aucun template ne peut la porter.`));
    });
  }

  // Socle commun.
  let commonSystemHash = '';
  if (typeof brut.commonSystemInstructions === 'string') {
    try {
      commonSystemHash = sha256Texte(brut.commonSystemInstructions);
    } catch {
      sortie.push(constat('PACK_EMPREINTE_IMPOSSIBLE', '/commonSystemInstructions', 'Texte non encodable en UTF-8.'));
    }
    if (commonSystemHash && commonSystemHash !== brut.commonSystemHash) {
      sortie.push(constat('PACK_EMPREINTE_FAUSSE', '/commonSystemHash', 'commonSystemHash déclaré ≠ SHA-256 des consignes communes.'));
    }
  }
  if (typeof brut.commonSystemHash === 'string' && !MOTIF_SHA256.test(brut.commonSystemHash)) {
    sortie.push(constat('PACK_TYPE', '/commonSystemHash', 'Empreinte SHA-256 hexadécimale attendue.'));
  }
  const empreinteRendu = estObjet(rendu) ? empreinteSure(rendu, '/rendering', sortie) : null;

  if (sortie.length > 0) return { ok: false, constats: sortie };
  return {
    ok: true,
    pack: brut as unknown as PackPrompts,
    empreintes: { templates: empreintesTemplates, recettes: empreintesRecettes, commonSystemHash, rendering: empreinteRendu ?? '' },
  };
}

/** Lit un pack depuis son TEXTE JSON · refuse d'abord les clés dupliquées. */
export function lirePackTexte(texte: string, options: OptionsValidationPack = {}): ResultatPack {
  const doublons = clesDupliquees(texte);
  if (doublons.length > 0) {
    return { ok: false, constats: doublons.map((c) => constat('PACK_CLE_JSON_DUPLIQUEE', c, 'Clé JSON en double · JSON.parse garderait la dernière en silence.')) };
  }
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch (e) {
    return { ok: false, constats: [constat('PACK_JSON_INVALIDE', '', `JSON illisible · ${(e as Error).message}`)] };
  }
  return validerPack(brut, options);
}

/* -------------------------------------------------------------------------- */
/*  Import · brouillons idempotents, conflit sans écrasement                  */
/* -------------------------------------------------------------------------- */

export type StatutVersion = 'draft' | 'validated' | 'retired';
export type TypeEntree = 'template' | 'recette' | 'socle' | 'rendu';

/** Une version du registre, telle que la base la conserve (sans le texte). */
export interface EntreeRegistre {
  type: TypeEntree;
  cle: string;
  version: string;
  contentHash: string;
  statut: StatutVersion;
}

export interface PlanImport {
  /** `true` si rien ne s'oppose à l'import · sinon RIEN ne doit être écrit. */
  ok: boolean;
  /** Versions à créer, toutes en `draft`. Vide si `ok` est faux. */
  aCreer: EntreeRegistre[];
  /** Versions déjà présentes avec la même empreinte · laissées telles quelles. */
  dejaPresentes: EntreeRegistre[];
  conflits: Constat[];
}

/** Entrées qu'un pack valide apporte au registre · clé `commonSystemInstructions`/`rendering` pour le socle. */
export function entreesDuPack(pack: PackPrompts, empreintes: EmpreintesPack): EntreeRegistre[] {
  const entrees: EntreeRegistre[] = [
    { type: 'socle', cle: 'commonSystemInstructions', version: pack.version, contentHash: empreintes.commonSystemHash, statut: 'draft' },
    { type: 'rendu', cle: 'rendering', version: pack.version, contentHash: empreintes.rendering, statut: 'draft' },
  ];
  for (const t of pack.templates) entrees.push({ type: 'template', cle: t.key, version: t.version, contentHash: empreintes.templates[t.key]!, statut: 'draft' });
  for (const r of pack.styleRecipes) entrees.push({ type: 'recette', cle: r.id, version: r.version, contentHash: empreintes.recettes[r.id]!, statut: 'draft' });
  return entrees;
}

/**
 * Plan d'import d'un pack VALIDÉ face au registre existant.
 *
 * Idempotent : (type, clé, version, empreinte) déjà présent → rien à créer,
 * quel que soit son statut (un brouillon déjà validé reste validé). Même
 * (type, clé, version) avec une autre empreinte → conflit, et l'import entier
 * est refusé (`aCreer` vide) : on n'écrit jamais la moitié d'un pack.
 */
export function planifierImport(pack: PackPrompts, empreintes: EmpreintesPack, existantes: ReadonlyArray<EntreeRegistre>): PlanImport {
  const index = new Map<string, EntreeRegistre[]>();
  for (const e of existantes) {
    const k = `${e.type}\u0000${e.cle}\u0000${e.version}`;
    index.set(k, [...(index.get(k) ?? []), e]);
  }
  const aCreer: EntreeRegistre[] = [];
  const dejaPresentes: EntreeRegistre[] = [];
  const conflits: Constat[] = [];
  for (const entree of entreesDuPack(pack, empreintes)) {
    const memes = index.get(`${entree.type}\u0000${entree.cle}\u0000${entree.version}`) ?? [];
    const autre = memes.find((e) => e.contentHash !== entree.contentHash);
    if (autre) {
      conflits.push(constat('IMPORT_CONFLIT_EMPREINTE', `${entree.type}:${entree.cle}@${entree.version}`,
        `Même clé et version, empreinte différente (registre ${autre.contentHash.slice(0, 12)}…, pack ${entree.contentHash.slice(0, 12)}…) · créer une nouvelle version, jamais écraser.`));
    } else if (memes.length > 0) {
      dejaPresentes.push(memes[0]!);
    } else {
      aCreer.push(entree);
    }
  }
  return conflits.length > 0 ? { ok: false, aCreer: [], dejaPresentes, conflits } : { ok: true, aCreer, dejaPresentes, conflits };
}

/** Templates d'un pack indexés par clé. */
export function templatesParCle(pack: PackPrompts): Map<string, TemplatePrompt> {
  return new Map(pack.templates.map((t) => [t.key, t]));
}

/** Recettes d'un pack indexées par identifiant. */
export function recettesParId(pack: PackPrompts): Map<string, RecetteStyle> {
  return new Map(pack.styleRecipes.map((r) => [r.id, r]));
}
