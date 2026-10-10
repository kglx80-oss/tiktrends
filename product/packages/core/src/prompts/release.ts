/**
 * Cycle de vie des versions et des releases, publication, rollback, épinglage.
 *
 * ── Ce que ce module tranche (cahier §8.1, §8.2, recette PROMPT-05…09) ───────
 *
 *  - VERSION d'un template, d'une recette ou du socle : `draft → validated →
 *    retired`. Seul un brouillon se modifie ; une version validée est figée,
 *    toute correction crée une NOUVELLE version, de numéro strictement
 *    supérieur.
 *  - RELEASE : `staged → active → retired`. « active » veut dire publiée et
 *    éligible ; le POINTEUR actif de la portée désigne celle qui sert. Activer B
 *    déplace le pointeur sur B et laisse A active (donc éligible au rollback) ;
 *    le rollback ne fait que remettre le pointeur sur A. Aucune version, aucun
 *    job n'est touché. Retirer une release qui sert est refusé.
 *  - PUBLICATION : JSON valide (chaque entrée existe au registre, validée, à la
 *    bonne empreinte), toutes les clés requises par le code présentes et
 *    COMPATIBLES (mêmes contrats d'entrée/sortie que le consommateur,
 *    PROMPT-09), aucune variable non résolue, tests structurels réussis sur
 *    CETTE empreinte de release, benchmark qualité approuvé sur cette même
 *    empreinte en production. Compare-and-set sur le pointeur attendu.
 *  - ÉVALUATION : une release `staged` exacte se résout sous `prompt.evaluate`,
 *    sur données synthétiques, sans toucher au pointeur.
 *  - ÉPINGLAGE : le devis retient la release pointée au moment du devis ; le
 *    job exécute celle-là, même si le pointeur a bougé ou si elle a été retirée
 *    depuis. Seule une révocation de sécurité le bloque, avec son motif.
 *  - PERMISSIONS : reçues en entrée (le serveur les calcule), jamais déduites
 *    ici. Une cible plateforme exige un octroi plateforme ; une cible espace
 *    exige un octroi de CET espace ; une cible marque, un octroi de cette
 *    marque ou de son espace. Un octroi plateforme ne couvre pas un espace : la
 *    séparation plateforme/espace du cahier §8.1 joue dans les deux sens.
 *
 * L'empreinte de release suit `releaseHashAlgorithm` du pack : SHA-256 du JSON
 * canonique (algorithme de `verify-pack.py`) de l'objet
 * `{ commonSystemInstructions, rendering, styleRecipes, templates }`, templates
 * COMPLETS (contentHash compris) triés par `key`, recettes triées par `id`.
 */

import { comparerPointsDeCode, empreinteContenu, empreinteJson, sha256Texte } from './empreinte';
import { MOTIF_VERSION, variablesDuGabarit, type EntreeRegistre, type StatutVersion } from './pack';
import { constat, type Constat, type RecetteStyle, type RenduPack, type TemplatePrompt } from './types';

/* -------------------------------------------------------------------------- */
/*  Portées et permissions                                                    */
/* -------------------------------------------------------------------------- */

export type Portee =
  | { niveau: 'plateforme' }
  | { niveau: 'espace'; espaceId: string }
  | { niveau: 'marque'; espaceId: string; marqueId: string };

/** Permissions logiques du cahier §8.1 · le serveur les mappe aux rôles réels. */
export const PERMISSIONS = [
  'prompt.read', 'prompt.draft', 'prompt.evaluate', 'prompt.publish', 'prompt.rollback',
  'provider.configure', 'run.inspect_redacted', 'knowledge.manage', 'studio.propose', 'studio.generate', 'studio.export',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface Octroi {
  permission: Permission;
  portee: Portee;
}

export function memePortee(a: Portee, b: Portee): boolean {
  if (a.niveau !== b.niveau) return false;
  if (a.niveau === 'plateforme') return true;
  if (a.niveau === 'espace') return a.espaceId === (b as typeof a).espaceId;
  return a.espaceId === (b as typeof a).espaceId && a.marqueId === (b as typeof a).marqueId;
}

/** L'acteur détient-il `permission` sur `cible` ? */
export function autorise(octrois: ReadonlyArray<Octroi>, permission: Permission, cible: Portee): boolean {
  return octrois.some((o) => {
    if (o.permission !== permission) return false;
    if (memePortee(o.portee, cible)) return true;
    // Un octroi d'espace couvre les marques de cet espace, et seulement elles.
    return cible.niveau === 'marque' && o.portee.niveau === 'espace' && o.portee.espaceId === cible.espaceId;
  });
}

function refus(permission: Permission, cible: Portee): Constat {
  const ou = cible.niveau === 'plateforme' ? 'la plateforme' : cible.niveau === 'espace' ? `l’espace ${cible.espaceId}` : `la marque ${cible.marqueId}`;
  return constat('FORBIDDEN', permission, `Permission ${permission} absente sur ${ou}.`);
}

/* -------------------------------------------------------------------------- */
/*  Versions · draft → validated → retired                                    */
/* -------------------------------------------------------------------------- */

const TRANSITIONS_VERSION: Record<StatutVersion, ReadonlyArray<StatutVersion>> = {
  draft: ['validated', 'retired'],
  validated: ['retired'],
  retired: [],
};

export function peutModifierVersion(statut: StatutVersion): boolean {
  return statut === 'draft';
}

/**
 * Transition d'une version. Valider exige des contrôles structurels vides
 * (pack.ts : `validerPack`, ou les mêmes règles sur un brouillon édité) ;
 * retirer une version encore référencée par une release active ou staged est
 * refusé.
 */
export function transitionVersion(args: {
  entree: Pick<EntreeRegistre, 'type' | 'cle' | 'version' | 'statut'>;
  vers: StatutVersion;
  octrois: ReadonlyArray<Octroi>;
  controlesStructurels?: ReadonlyArray<Constat>;
  enService?: boolean;
}): { ok: true; statut: StatutVersion } | { ok: false; constats: Constat[] } {
  const { entree, vers } = args;
  const cible = `${entree.type}:${entree.cle}@${entree.version}`;
  if (!TRANSITIONS_VERSION[entree.statut].includes(vers)) {
    return { ok: false, constats: [constat('TRANSITION_INTERDITE', cible, `${entree.statut} → ${vers} interdit · une version validée ne redevient pas brouillon, une version retirée ne revient pas.`)] };
  }
  const permission: Permission = entree.statut === 'validated' ? 'prompt.publish' : 'prompt.draft';
  if (!autorise(args.octrois, permission, { niveau: 'plateforme' })) return { ok: false, constats: [refus(permission, { niveau: 'plateforme' })] };
  if (vers === 'validated' && (args.controlesStructurels === undefined || args.controlesStructurels.length > 0)) {
    return { ok: false, constats: args.controlesStructurels?.length ? [...args.controlesStructurels] : [constat('CONTROLES_ABSENTS', cible, 'Valider exige des contrôles structurels exécutés et vides.')] };
  }
  if (vers === 'retired' && args.enService) return { ok: false, constats: [constat('VERSION_EN_SERVICE', cible, 'Version référencée par une release active ou en attente.')] };
  return { ok: true, statut: vers };
}

function comparerVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  return 0;
}

/** Une nouvelle version d'une clé doit dépasser toutes celles du registre. */
export function controlerNouvelleVersion(cle: string, nouvelle: string, existantes: ReadonlyArray<Pick<EntreeRegistre, 'cle' | 'version'>>): Constat[] {
  if (!MOTIF_VERSION.test(nouvelle)) return [constat('VERSION_FORMAT', cle, `Version « ${nouvelle} » hors format X.Y.Z.`)];
  const max = existantes.filter((e) => e.cle === cle).map((e) => e.version).sort(comparerVersions).pop();
  if (max !== undefined && comparerVersions(nouvelle, max) <= 0) return [constat('VERSION_NON_CROISSANTE', cle, `Version ${nouvelle} ≤ ${max} déjà au registre · jamais de réécriture.`)];
  return [];
}

/* -------------------------------------------------------------------------- */
/*  Releases                                                                  */
/* -------------------------------------------------------------------------- */

export type StatutRelease = 'staged' | 'active' | 'retired';

export interface EntreeRelease {
  cle: string;
  version: string;
  contentHash: string;
}

export interface EvaluationRelease {
  /** Empreinte de la release évaluée · une évaluation ne vaut que pour celle-là. */
  releaseHash: string;
  testsStructurels: boolean;
  benchmarkApprouve: boolean;
  approuvePar?: string;
  /**
   * Mise en service SANS benchmark, décidée par le propriétaire (mandat du
   * 10/10 : « la recette Docker isolée et le benchmark ne sont plus des
   * préalables à la mise en ligne ; tests manuels après déploiement »).
   * Geste ADMIN nominatif, motif obligatoire, audité ; exige les tests
   * structurels réussis sur la même empreinte. Affiché tel quel dans l'admin.
   */
  recetteManuelle?: boolean;
}

/**
 * Une release peut-elle devenir (ou redevenir) active en PRODUCTION ? Il faut
 * une évaluation de CETTE empreinte, et soit un benchmark approuvé, soit
 * l'accord de recette manuelle du propriétaire.
 */
export function utilisableEnProduction(r: Pick<Release, 'hash' | 'evaluation'>): boolean {
  const ev = r.evaluation;
  return !!ev && ev.releaseHash === r.hash && (ev.benchmarkApprouve || ev.recetteManuelle === true);
}

/**
 * Motifs qui interdisent l'accord de recette manuelle sur une release · vide =
 * accordable. Pas de dépense ni de publication ici : la release reste `staged`.
 */
export function controlerRecetteManuelle(args: {
  release: { id: string; statut: StatutRelease; revoquee: boolean; testsStructurels: boolean; benchmarkApprouve: boolean; recetteManuelle: boolean };
  octrois: ReadonlyArray<Octroi>;
  approbateur: string | null;
  motif: string;
}): Constat[] {
  const { release: r } = args;
  const sortie: Constat[] = [];
  if (!autorise(args.octrois, 'prompt.publish', { niveau: 'plateforme' })) sortie.push(refus('prompt.publish', { niveau: 'plateforme' }));
  if (!args.approbateur) sortie.push(constat('APPROBATEUR_ABSENT', r.id, 'L’accord de recette manuelle porte le nom d’une personne.'));
  if (!args.motif.trim()) sortie.push(constat('MOTIF_ABSENT', r.id, 'Indique pourquoi cette release part sans benchmark.'));
  if (r.statut !== 'staged') sortie.push(constat('RELEASE_NON_STAGED', r.id, `Seule une release en attente reçoit cet accord (statut ${r.statut}).`));
  if (r.revoquee) sortie.push(constat('RELEASE_REVOQUEE', r.id, 'Release révoquée.'));
  if (!r.testsStructurels) sortie.push(constat('TESTS_STRUCTURELS_ABSENTS', r.id, 'Tests structurels non réussis sur cette empreinte · lancer l’évaluation d’abord.'));
  if (r.benchmarkApprouve || r.recetteManuelle) sortie.push(constat('DEJA_UTILISABLE', r.id, 'Cette release est déjà utilisable en production.'));
  return sortie;
}

export interface Release {
  id: string;
  portee: Portee;
  statut: StatutRelease;
  hash: string;
  templates: EntreeRelease[];
  recettes: EntreeRelease[];
  socle: EntreeRelease;
  rendu: EntreeRelease;
  evaluation?: EvaluationRelease;
  /** Révocation explicite de sécurité ou de capacité · bloque même les devis épinglés. */
  revocation?: { motif: string };
}

/** Contenu complet d'une release, tel que le registre le restitue. */
export interface ContenuRelease {
  commonSystemInstructions: string;
  rendering: RenduPack;
  templates: TemplatePrompt[];
  styleRecipes: RecetteStyle[];
}

/** Empreinte de release · voir l'en-tête du module. */
export function empreinteRelease(contenu: ContenuRelease): string {
  return empreinteJson({
    commonSystemInstructions: contenu.commonSystemInstructions,
    rendering: contenu.rendering,
    styleRecipes: [...contenu.styleRecipes].sort((a, b) => comparerPointsDeCode(a.id, b.id)),
    templates: [...contenu.templates].sort((a, b) => comparerPointsDeCode(a.key, b.key)),
  }, 'python');
}

/** Contrat qu'un consommateur (studio, Jarvis) attend d'une clé. */
export interface ContratConsommateur {
  key: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
}

export type Environnement = 'production' | 'preproduction' | 'test';

export interface Pointeur {
  portee: Portee;
  releaseId: string | null;
}

function cleRegistre(type: EntreeRegistre['type'], cle: string, version: string): string {
  return `${type}\u0000${cle}\u0000${version}`;
}

/**
 * Tous les motifs qui interdisent de publier `release` · liste vide = publiable.
 * Les contrôles sont rendus ensemble pour que l'ADMIN corrige en une passe.
 */
export function controlerPublication(args: {
  release: Release;
  contenu: ContenuRelease;
  registre: ReadonlyArray<EntreeRegistre>;
  consommateurs: ReadonlyArray<ContratConsommateur>;
  environnement: Environnement;
  octrois: ReadonlyArray<Octroi>;
  pointeur: Pointeur;
  /** Release active que l'auteur croyait remplacer (compare-and-set). */
  attendue: string | null;
}): Constat[] {
  const { release: r, contenu: c } = args;
  const sortie: Constat[] = [];
  if (!autorise(args.octrois, 'prompt.publish', r.portee)) sortie.push(refus('prompt.publish', r.portee));
  if (r.statut !== 'staged') sortie.push(constat('RELEASE_NON_STAGED', r.id, `Seule une release staged se publie (statut ${r.statut}).`));
  if (r.revocation) sortie.push(constat('RELEASE_REVOQUEE', r.id, `Release révoquée · ${r.revocation.motif}`));
  if (!memePortee(args.pointeur.portee, r.portee)) sortie.push(constat('PORTEE_INCOHERENTE', r.id, 'Le pointeur visé n’est pas celui de la portée de la release.'));
  if (args.pointeur.releaseId !== args.attendue) sortie.push(constat('VERSION_CONFLICT', r.id, 'La release active a changé depuis l’ouverture · recharger avant de publier.'));

  // Registre · chaque entrée existe, validée, à la même empreinte, et le contenu la reproduit.
  const index = new Map(args.registre.map((e) => [cleRegistre(e.type, e.cle, e.version), e]));
  const verifierEntree = (type: EntreeRegistre['type'], e: EntreeRelease, empreinte: string | null) => {
    const reg = index.get(cleRegistre(type, e.cle, e.version));
    const cible = `${type}:${e.cle}@${e.version}`;
    if (!reg) sortie.push(constat('VERSION_INCONNUE', cible, 'Entrée absente du registre.'));
    else {
      if (reg.statut !== 'validated') sortie.push(constat('VERSION_NON_VALIDEE', cible, `Statut ${reg.statut} · seule une version validée entre dans une release.`));
      if (reg.contentHash !== e.contentHash) sortie.push(constat('EMPREINTE_FAUSSE', cible, 'Empreinte de la release ≠ empreinte du registre.'));
    }
    if (empreinte === null) sortie.push(constat('CONTENU_ABSENT', cible, 'Contenu de la version non fourni.'));
    else if (empreinte !== e.contentHash) sortie.push(constat('EMPREINTE_FAUSSE', cible, 'Le contenu ne reproduit pas l’empreinte déclarée.'));
  };

  const contenuTemplates = new Map(c.templates.map((t) => [`${t.key}@${t.version}`, t]));
  const cles = new Set<string>();
  for (const e of r.templates) {
    if (cles.has(e.cle)) sortie.push(constat('CLE_DUPLIQUEE', e.cle, 'Une clé apparaît deux fois dans la release.'));
    cles.add(e.cle);
    const t = contenuTemplates.get(`${e.cle}@${e.version}`);
    verifierEntree('template', e, t ? empreinteContenu(t as unknown as Record<string, unknown>) : null);
    if (t) {
      const { noms, orphelines } = variablesDuGabarit(t.userTemplate);
      const inconnues = noms.filter((n) => !c.rendering.requiredVariables.includes(n));
      const absentes = c.rendering.requiredVariables.filter((v) => !noms.includes(v));
      if (inconnues.length || absentes.length || orphelines || /\{\{|\}\}/.test(t.taskInstructions)) {
        sortie.push(constat('VARIABLE_NON_RESOLUE', `template:${e.cle}`, `Variables non résolues ou absentes · ${[...inconnues, ...absentes].join(', ') || 'accolades orphelines'}.`));
      }
    }
  }
  const contenuRecettes = new Map(c.styleRecipes.map((x) => [`${x.id}@${x.version}`, x]));
  for (const e of r.recettes) {
    const x = contenuRecettes.get(`${e.cle}@${e.version}`);
    verifierEntree('recette', e, x ? empreinteContenu(x as unknown as Record<string, unknown>) : null);
  }
  verifierEntree('socle', r.socle, sha256Texte(c.commonSystemInstructions));
  verifierEntree('rendu', r.rendu, empreinteContenu(c.rendering as unknown as Record<string, unknown>));
  if (/\{\{|\}\}/.test(c.commonSystemInstructions)) sortie.push(constat('VARIABLE_NON_RESOLUE', 'socle', 'Les consignes communes portent une variable.'));
  if (c.rendering.unresolvedVariablePolicy !== 'reject') sortie.push(constat('VARIABLE_NON_RESOLUE', 'rendu', 'Politique de variable non résolue autre que reject.'));

  // Consommateurs · toute clé requise est présente ET compatible (PROMPT-09).
  const parCle = new Map(r.templates.map((e) => [e.cle, contenuTemplates.get(`${e.cle}@${e.version}`)]));
  for (const k of args.consommateurs) {
    if (!parCle.has(k.key)) {
      sortie.push(constat('CLE_REQUISE_ABSENTE', k.key, `Le code consomme « ${k.key} » · la release ne la contient pas.`));
      continue;
    }
    const t = parCle.get(k.key);
    if (t && (t.inputSchemaRef !== k.inputSchemaRef || t.outputSchemaRef !== k.outputSchemaRef)) {
      sortie.push(constat('SCHEMA_INCOMPATIBLE', k.key, `Contrat ${t.inputSchemaRef} → ${t.outputSchemaRef} ≠ attendu ${k.inputSchemaRef} → ${k.outputSchemaRef}.`));
    }
  }

  // Empreinte et évaluation de CETTE release.
  const hash = empreinteRelease(c);
  if (hash !== r.hash) sortie.push(constat('RELEASE_EMPREINTE_FAUSSE', r.id, 'L’empreinte de la release ne correspond pas à son contenu.'));
  const ev = r.evaluation;
  if (!ev || ev.releaseHash !== r.hash || !ev.testsStructurels) sortie.push(constat('TESTS_STRUCTURELS_ABSENTS', r.id, 'Tests structurels non réussis sur cette empreinte de release.'));
  if (args.environnement === 'production' && !utilisableEnProduction(r)) {
    sortie.push(constat('BENCHMARK_NON_APPROUVE', r.id, 'Une release sans benchmark approuvé ni accord de recette manuelle ne devient pas active en production.'));
  }
  return sortie;
}

export interface ChangementPointeur {
  pointeur: Pointeur;
  /** Transitions de statut à écrire, dans la même transaction que le pointeur. */
  transitions: Array<{ releaseId: string; de: StatutRelease; vers: StatutRelease }>;
  audit: { action: 'release.publier' | 'release.rollback'; releaseAvant: string | null; releaseApres: string };
}

/** Publie : pointeur sur la release, `staged → active`. Les autres releases ne bougent pas. */
export function publierRelease(args: Parameters<typeof controlerPublication>[0]):
  { ok: true; changement: ChangementPointeur } | { ok: false; constats: Constat[] } {
  const constats = controlerPublication(args);
  if (constats.length > 0) return { ok: false, constats };
  return {
    ok: true,
    changement: {
      pointeur: { portee: args.release.portee, releaseId: args.release.id },
      transitions: [{ releaseId: args.release.id, de: 'staged', vers: 'active' }],
      audit: { action: 'release.publier', releaseAvant: args.pointeur.releaseId, releaseApres: args.release.id },
    },
  };
}

/**
 * Rollback : le pointeur revient sur une release DÉJÀ publiée (statut active,
 * non retirée, non révoquée) de la même portée. Aucune transition de statut,
 * aucune version touchée, les jobs en cours gardent leur release épinglée.
 */
export function rollbackRelease(args: {
  cible: Release;
  pointeur: Pointeur;
  attendue: string | null;
  octrois: ReadonlyArray<Octroi>;
  environnement: Environnement;
}): { ok: true; changement: ChangementPointeur } | { ok: false; constats: Constat[] } {
  const { cible: r } = args;
  const constats: Constat[] = [];
  if (!autorise(args.octrois, 'prompt.rollback', r.portee)) constats.push(refus('prompt.rollback', r.portee));
  if (r.statut !== 'active') constats.push(constat('ROLLBACK_INTERDIT', r.id, `Seule une release déjà publiée et non retirée peut reprendre le pointeur (statut ${r.statut}).`));
  if (r.revocation) constats.push(constat('RELEASE_REVOQUEE', r.id, `Release révoquée · ${r.revocation.motif}`));
  if (!memePortee(args.pointeur.portee, r.portee)) constats.push(constat('PORTEE_INCOHERENTE', r.id, 'Rollback hors de la portée de la release.'));
  if (args.pointeur.releaseId !== args.attendue) constats.push(constat('VERSION_CONFLICT', r.id, 'La release active a changé depuis l’ouverture.'));
  if (args.pointeur.releaseId === r.id) constats.push(constat('ROLLBACK_SANS_EFFET', r.id, 'Cette release est déjà active.'));
  if (args.environnement === 'production' && !utilisableEnProduction(r)) {
    constats.push(constat('BENCHMARK_NON_APPROUVE', r.id, 'Rollback vers une release non évaluée refusé en production.'));
  }
  if (constats.length > 0) return { ok: false, constats };
  return {
    ok: true,
    changement: {
      pointeur: { portee: r.portee, releaseId: r.id },
      transitions: [],
      audit: { action: 'release.rollback', releaseAvant: args.pointeur.releaseId, releaseApres: r.id },
    },
  };
}

/** Retire une release · jamais celle que le pointeur désigne. */
export function retirerRelease(args: { release: Release; pointeur: Pointeur; octrois: ReadonlyArray<Octroi> }):
  { ok: true; transition: { releaseId: string; de: StatutRelease; vers: 'retired' } } | { ok: false; constats: Constat[] } {
  const r = args.release;
  const constats: Constat[] = [];
  if (!autorise(args.octrois, 'prompt.publish', r.portee)) constats.push(refus('prompt.publish', r.portee));
  if (r.statut === 'retired') constats.push(constat('TRANSITION_INTERDITE', r.id, 'Release déjà retirée.'));
  if (args.pointeur.releaseId === r.id) constats.push(constat('RELEASE_EN_SERVICE', r.id, 'Release pointée · publier ou rollback d’abord.'));
  return constats.length > 0 ? { ok: false, constats } : { ok: true, transition: { releaseId: r.id, de: r.statut, vers: 'retired' } };
}

/**
 * Commande d'évaluation : résout une release `staged` EXACTE, sous
 * `prompt.evaluate`, sur données synthétiques et budget d'évaluation séparé.
 * Ne rend aucun changement de pointeur.
 */
export function resoudreReleaseEvaluation(args: { release: Release; octrois: ReadonlyArray<Octroi>; donneesSynthetiques: boolean }):
  { ok: true; releaseId: string; releaseHash: string; budget: 'evaluation' } | { ok: false; constats: Constat[] } {
  const r = args.release;
  const constats: Constat[] = [];
  if (!autorise(args.octrois, 'prompt.evaluate', r.portee)) constats.push(refus('prompt.evaluate', r.portee));
  if (r.statut !== 'staged') constats.push(constat('EVALUATION_HORS_STAGED', r.id, 'La commande d’évaluation ne résout qu’une release staged.'));
  if (!args.donneesSynthetiques) constats.push(constat('DONNEES_REELLES_INTERDITES', r.id, 'L’évaluation d’une release non publiée se fait sur données synthétiques.'));
  return constats.length > 0 ? { ok: false, constats } : { ok: true, releaseId: r.id, releaseHash: r.hash, budget: 'evaluation' };
}

/* -------------------------------------------------------------------------- */
/*  Épinglage au devis                                                        */
/* -------------------------------------------------------------------------- */

export interface Epinglage {
  promptReleaseId: string;
  releaseHash: string;
}

/** Au devis : la release que le pointeur désigne À CET INSTANT. */
export function epinglerAuDevis(pointeur: Pointeur, releases: ReadonlyArray<Release>): { ok: true; epinglage: Epinglage } | { ok: false; constats: Constat[] } {
  const r = releases.find((x) => x.id === pointeur.releaseId);
  if (!r || r.statut !== 'active') return { ok: false, constats: [constat('RELEASE_ACTIVE_ABSENTE', pointeur.releaseId ?? '', 'Aucune release active pour cette portée · aucun repli.')] };
  if (r.revocation) return { ok: false, constats: [constat('RELEASE_REVOQUEE', r.id, `Release révoquée · ${r.revocation.motif}`)] };
  return { ok: true, epinglage: { promptReleaseId: r.id, releaseHash: r.hash } };
}

/**
 * À l'exécution : la release ÉPINGLÉE, jamais le pointeur courant. Une release
 * retirée depuis reste exécutable pour ce devis ; une release révoquée bloque.
 */
export function releaseDuJob(epinglage: Epinglage, releases: ReadonlyArray<Release>): { ok: true; release: Release } | { ok: false; constats: Constat[] } {
  const r = releases.find((x) => x.id === epinglage.promptReleaseId);
  if (!r) return { ok: false, constats: [constat('RELEASE_INTROUVABLE', epinglage.promptReleaseId, 'Release épinglée introuvable.')] };
  if (r.hash !== epinglage.releaseHash) return { ok: false, constats: [constat('RELEASE_EMPREINTE_FAUSSE', r.id, 'La release épinglée a changé d’empreinte.')] };
  if (r.revocation) return { ok: false, constats: [constat('RELEASE_REVOQUEE', r.id, `Release révoquée · ${r.revocation.motif}`)] };
  if (r.statut === 'staged') return { ok: false, constats: [constat('RELEASE_NON_PUBLIEE', r.id, 'Un devis ne s’épingle que sur une release publiée.')] };
  return { ok: true, release: r };
}
