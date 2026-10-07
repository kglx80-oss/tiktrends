/**
 * Résolution d'un template pour une opération et une portée, et trace ordonnée.
 *
 * ── Ce que ce module tranche (cahier §8.3) ───────────────────────────────────
 *
 * Ordre de résolution, du plus fort au plus faible :
 *
 *   politique fixe → release autorisée pour l'opération et la portée →
 *   contraintes projet validées → connaissances autorisées → faits produit →
 *   références typées → demande courante.
 *
 * Une couche plus haute l'emporte : la demande ne lève pas un invariant (les
 * contrôles sémantiques bloquent), une source ne change pas la politique (elle
 * reste une donnée). `couchesResolution` rend cette pile dans cet ordre, avec
 * identifiants et empreintes, pour le PromptRun (PROMPT-10).
 *
 * Portée explicite : override MARQUE approuvé, sinon override ESPACE approuvé,
 * sinon le template de la release globale active, tel quel. Un override :
 *
 *  - ne vient que de l'ADMIN (`origine: 'admin'`) · une source, une
 *    conversation ou un apprentissage n'en crée jamais ;
 *  - ne touche que des champs DÉCLARÉS extensibles pour cette clé, et jamais un
 *    champ de contrat (clé, version, schémas, contrôles, outils, gabarit…) ;
 *  - porte la version et l'empreinte du template qu'il surcharge : si la
 *    release globale a changé de version, il est PÉRIMÉ et écarté, ce que la
 *    trace dit ;
 *  - reste chez lui : un override d'une autre marque ou d'un autre espace ne
 *    s'applique jamais, même si l'identifiant coïncide.
 *
 * Le pack v1.0 ne déclare AUCUN champ extensible : par défaut, aucun override
 * ne peut s'appliquer (fermé tant que le propriétaire n'a rien ouvert).
 */

import { empreinteContenu, empreinteJson, sha256Texte } from './empreinte';
import { autorise, memePortee, type Octroi, type Portee, type Release } from './release';
import { constat, type Constat, type EntreeTache, type TemplatePrompt } from './types';

export const ORDRE_RESOLUTION = [
  'politique_fixe', 'release', 'contraintes_projet', 'connaissances', 'faits_produit', 'references', 'demande',
] as const;
export type CoucheResolution = (typeof ORDRE_RESOLUTION)[number];

/** Champs qu'aucune déclaration ne peut rendre extensibles · le contrat du template. */
export const CHAMPS_JAMAIS_EXTENSIBLES: ReadonlySet<string> = new Set([
  'key', 'version', 'status', 'scope', 'modelProfile', 'allowedTools', 'userTemplate', 'inputSchemaRef',
  'outputSchemaRef', 'semanticChecks', 'evaluationCaseIds', 'maximumRepairAttempts', 'contentHash',
]);

export type OrigineOverride = 'admin' | 'source' | 'conversation' | 'apprentissage';

export interface Override {
  id: string;
  portee: Portee;
  templateKey: string;
  /** Version et empreinte du template global surchargé. */
  baseVersion: string;
  baseContentHash: string;
  champs: Record<string, unknown>;
  statut: 'propose' | 'approuve' | 'rejete' | 'retire';
  origine: OrigineOverride;
}

/** Champs extensibles déclarés, par clé de template. Vide par défaut. */
export type ChampsExtensibles = Readonly<Record<string, ReadonlyArray<string>>>;

function extensibles(declares: ChampsExtensibles, key: string): string[] {
  const liste = Object.prototype.hasOwnProperty.call(declares, key) ? declares[key] ?? [] : [];
  return liste.filter((c) => !CHAMPS_JAMAIS_EXTENSIBLES.has(c));
}

/**
 * Contrôle d'un override avant création (`proposer`, `prompt.draft`) ou
 * approbation (`approuver`, `prompt.publish`) sur SA portée.
 */
export function controlerOverride(args: {
  override: Override;
  action: 'proposer' | 'approuver';
  champsExtensibles: ChampsExtensibles;
  octrois: ReadonlyArray<Octroi>;
  template: TemplatePrompt;
}): Constat[] {
  const { override: o, template: t } = args;
  const sortie: Constat[] = [];
  if (o.origine !== 'admin') sortie.push(constat('OVERRIDE_ORIGINE_INTERDITE', o.id, `Un override ne naît que dans l’ADMIN · jamais d’une ${o.origine}.`));
  if (o.portee.niveau === 'plateforme') sortie.push(constat('OVERRIDE_PORTEE', o.id, 'La portée plateforme se change par une release, pas par un override.'));
  const permission = args.action === 'proposer' ? 'prompt.draft' : 'prompt.publish';
  if (!autorise(args.octrois, permission, o.portee)) sortie.push(constat('FORBIDDEN', o.id, `Permission ${permission} absente sur la portée de l’override.`));
  if (o.templateKey !== t.key || o.baseVersion !== t.version || o.baseContentHash !== t.contentHash) {
    sortie.push(constat('OVERRIDE_PERIME', o.id, 'L’override ne vise pas la version courante du template.'));
  }
  const permis = new Set(extensibles(args.champsExtensibles, o.templateKey));
  for (const [champ, valeur] of Object.entries(o.champs)) {
    if (!permis.has(champ)) {
      sortie.push(constat('CHAMP_NON_EXTENSIBLE', `${o.id}/champs/${champ}`, `« ${champ} » n’est pas déclaré extensible pour ${o.templateKey}.`));
      continue;
    }
    const attendu = (t as unknown as Record<string, unknown>)[champ];
    if (typeof valeur !== typeof attendu || Array.isArray(valeur) !== Array.isArray(attendu)) sortie.push(constat('CHAMP_TYPE', `${o.id}/champs/${champ}`, `« ${champ} » doit garder le type du template.`));
    if (typeof valeur === 'string' && /\{\{|\}\}/.test(valeur)) sortie.push(constat('VARIABLE_HORS_GABARIT', `${o.id}/champs/${champ}`, 'Un override ne porte aucune variable.'));
  }
  if (Object.keys(o.champs).length === 0) sortie.push(constat('OVERRIDE_VIDE', o.id, 'Un override sans champ ne surcharge rien.'));
  return sortie;
}

export interface TraceResolution {
  niveau: 'marque' | 'espace' | 'plateforme';
  releaseId: string;
  releaseHash: string;
  templateKey: string;
  templateVersion: string;
  /** Empreinte du template global de la release. */
  baseContentHash: string;
  /** Empreinte du template effectivement utilisé (égale à la base sans override). */
  contentHash: string;
  overrideId: string | null;
  /** Overrides écartés, et pourquoi · rien n'est ignoré en silence. */
  ecartes: Constat[];
}

export type ResultatResolution =
  | { ok: true; template: TemplatePrompt; trace: TraceResolution }
  | { ok: false; constats: Constat[] };

/**
 * Résout le template d'une opération pour (espace, marque).
 * `contenus` restitue le texte complet des templates par `clé@version`.
 */
export function resoudreTemplate(args: {
  templateKey: string;
  espaceId: string;
  marqueId: string;
  /** Release désignée par le pointeur GLOBAL au moment de la résolution (ou épinglée au devis). */
  release: Release | undefined;
  contenus: ReadonlyMap<string, TemplatePrompt>;
  overrides: ReadonlyArray<Override>;
  champsExtensibles: ChampsExtensibles;
}): ResultatResolution {
  const r = args.release;
  if (!r || r.portee.niveau !== 'plateforme' || (r.statut !== 'active' && r.statut !== 'retired')) {
    return { ok: false, constats: [constat('RELEASE_ACTIVE_ABSENTE', args.templateKey, 'Aucune release globale publiée · aucun prompt de repli.')] };
  }
  if (r.revocation) return { ok: false, constats: [constat('RELEASE_REVOQUEE', r.id, `Release révoquée · ${r.revocation.motif}`)] };
  const entree = r.templates.find((e) => e.cle === args.templateKey);
  if (!entree) return { ok: false, constats: [constat('OPERATION_HORS_RELEASE', args.templateKey, 'Opération absente de la release · aucun prompt de repli.')] };
  const base = args.contenus.get(`${entree.cle}@${entree.version}`);
  if (!base || empreinteContenu(base as unknown as Record<string, unknown>) !== entree.contentHash) {
    return { ok: false, constats: [constat('EMPREINTE_FAUSSE', `${entree.cle}@${entree.version}`, 'Contenu du template absent ou différent de la release.')] };
  }

  const ecartes: Constat[] = [];
  const permis = new Set(extensibles(args.champsExtensibles, args.templateKey));
  const candidats = args.overrides.filter((o) => o.templateKey === args.templateKey && o.statut === 'approuve');
  const niveaux: Array<{ niveau: 'marque' | 'espace'; portee: Portee }> = [
    { niveau: 'marque', portee: { niveau: 'marque', espaceId: args.espaceId, marqueId: args.marqueId } },
    { niveau: 'espace', portee: { niveau: 'espace', espaceId: args.espaceId } },
  ];
  for (const n of niveaux) {
    const ici = candidats.filter((o) => memePortee(o.portee, n.portee));
    if (ici.length > 1) return { ok: false, constats: [constat('OVERRIDE_AMBIGU', args.templateKey, `${ici.length} overrides approuvés au niveau ${n.niveau} · un seul est admis.`)] };
    const o = ici[0];
    if (!o) continue;
    if (o.origine !== 'admin') { ecartes.push(constat('OVERRIDE_ORIGINE_INTERDITE', o.id, 'Override non issu de l’ADMIN · écarté.')); continue; }
    if (o.baseVersion !== base.version || o.baseContentHash !== entree.contentHash) { ecartes.push(constat('OVERRIDE_PERIME', o.id, 'Override conçu pour une autre version du template · écarté.')); continue; }
    const horsChamp = Object.keys(o.champs).filter((c) => !permis.has(c));
    if (horsChamp.length > 0 || Object.keys(o.champs).length === 0) { ecartes.push(constat('CHAMP_NON_EXTENSIBLE', o.id, `Champs non extensibles · ${horsChamp.join(', ') || 'aucun champ'} · écarté.`)); continue; }
    const effectif = { ...base, ...(o.champs as Partial<TemplatePrompt>) } as TemplatePrompt;
    const contentHash = empreinteContenu({ ...effectif, contentHash: undefined } as unknown as Record<string, unknown>);
    const template = { ...effectif, contentHash };
    return {
      ok: true, template,
      trace: { niveau: n.niveau, releaseId: r.id, releaseHash: r.hash, templateKey: base.key, templateVersion: base.version, baseContentHash: entree.contentHash, contentHash, overrideId: o.id, ecartes },
    };
  }
  return {
    ok: true, template: base,
    trace: { niveau: 'plateforme', releaseId: r.id, releaseHash: r.hash, templateKey: base.key, templateVersion: base.version, baseContentHash: entree.contentHash, contentHash: entree.contentHash, overrideId: null, ecartes },
  };
}

export interface Couche {
  couche: CoucheResolution;
  ids: string[];
  empreinte: string;
}

/**
 * La pile de résolution d'une requête, dans l'ordre du cahier, pour la trace
 * du PromptRun. Les empreintes portent sur les données (mode « js »).
 */
export function couchesResolution(args: { politique: { id: string; version: string; texte: string }; trace: TraceResolution; entree: EntreeTache }): Couche[] {
  const c = args.entree.context;
  const couches: Couche[] = [
    { couche: 'politique_fixe', ids: [`${args.politique.id}@${args.politique.version}`], empreinte: sha256Texte(args.politique.texte) },
    { couche: 'release', ids: [args.trace.releaseId, `${args.trace.templateKey}@${args.trace.templateVersion}`, ...(args.trace.overrideId ? [args.trace.overrideId] : [])], empreinte: empreinteJson({ releaseHash: args.trace.releaseHash, contentHash: args.trace.contentHash }, 'js') },
    { couche: 'contraintes_projet', ids: [...(c.projectVersionId ? [c.projectVersionId] : []), ...c.selectionIds], empreinte: empreinteJson({ invariants: c.invariants, allowedPaths: c.allowedPaths, projectVersionId: c.projectVersionId, selectionIds: c.selectionIds }, 'js') },
    { couche: 'connaissances', ids: [...c.knowledgeVersionIds], empreinte: empreinteJson(c.knowledgeExcerpts, 'js') },
    { couche: 'faits_produit', ids: c.facts.map((f) => f.id), empreinte: empreinteJson(c.facts, 'js') },
    { couche: 'references', ids: [...c.references.map((r) => `${r.assetId}@${r.assetVersion}`), ...c.resolvedDocuments.map((d) => `${d.id}@${d.version}`), ...c.mediaBindings.map((m) => m.bindingId)], empreinte: empreinteJson({ references: c.references, resolvedDocuments: c.resolvedDocuments, mediaBindings: c.mediaBindings, sourceExcerpts: c.sourceExcerpts }, 'js') },
    { couche: 'demande', ids: [], empreinte: empreinteJson({ taskInputs: args.entree.taskInputs, historySummary: c.historySummary }, 'js') },
  ];
  return couches;
}
