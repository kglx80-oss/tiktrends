/**
 * Contrôles sémantiques des 22 templates · ce que le JSON Schema ne voit pas.
 *
 * ── Ce que ce module tranche ─────────────────────────────────────────────────
 *
 * Une sortie peut être conforme au schéma et pourtant fausse : citer une source
 * inexistante, inventer un identifiant, réécrire la narration, viser un chemin
 * protégé, dépasser le lot autorisé. Le pack déclare six contrôles communs pour
 * chaque template (`semanticChecks`) ; le cahier §8 et le plan §5/§8 en ajoutent
 * par tâche. Chacun est ici une règle qui rend un `Constat` { code, cible }.
 *
 * Deux moments :
 *
 *  - AVANT l'appel (`controlerEntree`) : sources et connaissances autorisées,
 *    documents référencés présents et valides pour leur `schemaKey`, médias
 *    réellement joints, capacité attestée. Un constat ici = `blocked` sans
 *    appel modèle (PROMPT-04), jamais un repli.
 *  - APRÈS l'appel (`controlerSortie`) : cohérence ready/blocked, sources et
 *    identifiants cités, invariants, chemins de patch, règles de tâche. Un
 *    constat ici = sortie rejetée même si le JSON est valide (PROMPT-03).
 *
 * Correspondance avec les six contrôles déclarés par le pack :
 *
 *  1. « IDs/sourceRefs présents et autorisés » → SOURCE_INEXISTANTE,
 *     SOURCE_NON_AUTORISEE, REFERENCE_NON_AUTORISEE, CIBLE_*.
 *  2. « Aucun invariant protégé modifié » → INVARIANT_PERDU, REFERENCE_ALTEREE,
 *     COMPOSANT_*, CHEMIN_*, NARRATION_REECRITE, VERSION_DE_BASE_ALTEREE.
 *  3. « Sortie ready non nulle ; blocked avec question et result null » →
 *     SORTIE_READY_*, SORTIE_BLOCKED_*, QUESTION_VIDE.
 *  4. « Aucun outil/action exécuté par le modèle » → ACTION_INDISPONIBLE (et
 *     `allowedTools` vide, refusé à l'import dans `pack.ts`).
 *  5. « Documents référencés présents et validés par schemaKey avant appel » →
 *     REFERENCE_NON_RESOLUE, DOCUMENT_SCHEMA_INCONNU, DOCUMENT_INVALIDE.
 *  6. « Nouveaux IDs issus de allocatedIds ; références/hashes copiés » →
 *     ID_NON_ALLOUE, ID_DOUBLON, EMPREINTE_INVENTEE.
 *
 * Les fonctions supposent l'entrée et la sortie DÉJÀ conformes au schéma
 * (`evaluerSortie` enchaîne les deux) ; elles restent défensives et ne lèvent
 * jamais sur une forme inattendue.
 */

import type { ValidateurContrats } from './contrats';
import { constat, type Constat, type ContexteTache, type EntreeTache, type SortieTache } from './types';

/* -------------------------------------------------------------------------- */
/*  Options                                                                   */
/* -------------------------------------------------------------------------- */

/** Verdict d'un validateur de document métier pour un `schemaKey`. */
export type VerdictDocument = 'ok' | 'invalide' | 'inconnu';

export interface OptionsSemantiques {
  /**
   * Validation d'un document résolu selon son `schemaKey`. OBLIGATOIRE : un
   * document qu'on ne sait pas valider bloque (« inconnu »), il ne passe pas.
   */
  validerDocument: (schemaKey: string, content: unknown) => VerdictDocument;
  /** Capacités ATTESTÉES par le registre fournisseur · absentes = non disponibles. */
  capacites?: { lipsync?: boolean };
  /**
   * Mode sans texte imposé par le serveur. Si absent, il se déduit du brief
   * résolu : `content.texts` présent et vide (« vide signifie vide pour texts »).
   */
  sansTexte?: boolean;
}

/**
 * Validateur de documents fondé sur les `$defs` du schéma de contrats.
 * `correspondance` associe un `schemaKey` à une définition ; un `schemaKey`
 * absent de la table est « inconnu », donc bloquant.
 */
export function validateurDocumentsParDefinitions(
  validateur: Pick<ValidateurContrats, 'validerDefinition' | 'defs'>,
  correspondance: Readonly<Record<string, string>> = { Shot: 'Shot', Style: 'Style', Fact: 'Fact', Reference: 'Reference' },
): (schemaKey: string, content: unknown) => VerdictDocument {
  return (schemaKey, content) => {
    const def = Object.prototype.hasOwnProperty.call(correspondance, schemaKey) ? correspondance[schemaKey] : undefined;
    if (!def || !validateur.defs.has(def)) return 'inconnu';
    return validateur.validerDefinition(def, content).ok ? 'ok' : 'invalide';
  };
}

/* -------------------------------------------------------------------------- */
/*  Ensembles tirés du contexte                                               */
/* -------------------------------------------------------------------------- */

interface Ensembles {
  sources: Set<string>;
  connaissances: Set<string>;
  faits: Set<string>;
  documents: Map<string, ContexteTache['resolvedDocuments'][number]>;
  references: Map<string, ContexteTache['references'][number]>;
  medias: Map<string, ContexteTache['mediaBindings'][number][]>;
  alloues: Map<string, Set<string>>;
  selection: Set<string>;
  /** Ce qu'une sortie peut citer comme source d'un fait ou d'une observation. */
  citables: Set<string>;
  /** Tout identifiant fourni par le serveur · bornage des `evidenceIds`. */
  connus: Set<string>;
  /** Empreintes fournies · une sortie ne peut recopier que celles-ci. */
  empreintes: Set<string>;
}

function liste<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function texte(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function objet(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function ensembles(ctx: ContexteTache): Ensembles {
  const versionsConnaissance = new Set(liste<string>(ctx.knowledgeVersionIds));
  const sources = new Set(liste<string>(ctx.authorizedSourceIds));
  const connaissances = new Set(liste<ContexteTache['knowledgeExcerpts'][number]>(ctx.knowledgeExcerpts).filter((k) => versionsConnaissance.has(k.version)).map((k) => k.sourceId));
  const faits = new Set(liste<ContexteTache['facts'][number]>(ctx.facts).map((f) => f.id));
  const documents = new Map(liste<ContexteTache['resolvedDocuments'][number]>(ctx.resolvedDocuments).map((d) => [d.id, d]));
  const references = new Map(liste<ContexteTache['references'][number]>(ctx.references).map((r) => [r.assetId, r]));
  const medias = new Map<string, ContexteTache['mediaBindings'][number][]>();
  for (const m of liste<ContexteTache['mediaBindings'][number]>(ctx.mediaBindings)) medias.set(m.assetId, [...(medias.get(m.assetId) ?? []), m]);
  const alloues = new Map<string, Set<string>>();
  for (const a of liste<ContexteTache['allocatedIds'][number]>(ctx.allocatedIds)) {
    const s = alloues.get(a.entityType) ?? new Set<string>();
    s.add(a.id);
    alloues.set(a.entityType, s);
  }
  const selection = new Set(liste<string>(ctx.selectionIds));
  const citables = new Set([...sources, ...connaissances, ...faits, ...documents.keys(), ...references.keys(), ...medias.keys()]);
  const connus = new Set([...citables, ...selection, ...[...alloues.values()].flatMap((s) => [...s]), ...liste<ContexteTache['mediaBindings'][number]>(ctx.mediaBindings).map((m) => m.bindingId)]);
  const empreintes = new Set([
    ...[...references.values()].map((r) => r.sha256),
    ...liste<ContexteTache['mediaBindings'][number]>(ctx.mediaBindings).map((m) => m.sha256),
    ...[...documents.values()].map((d) => d.sha256),
  ]);
  return { sources, connaissances, faits, documents, references, medias, alloues, selection, citables, connus, empreintes };
}

function alloues(e: Ensembles, type: string): Set<string> {
  return e.alloues.get(type) ?? new Set();
}

/** Mode sans texte · imposé, sinon déduit du brief résolu (`texts: []`). */
function modeSansTexte(e: Ensembles, briefId: unknown, options: OptionsSemantiques): boolean {
  if (options.sansTexte !== undefined) return options.sansTexte;
  const doc = typeof briefId === 'string' ? e.documents.get(briefId) : undefined;
  const textes = doc ? doc.content.texts : undefined;
  return Array.isArray(textes) && textes.length === 0;
}

/* -------------------------------------------------------------------------- */
/*  Chemins de patch                                                          */
/* -------------------------------------------------------------------------- */

/** Segments qui ouvrent une pollution de prototype · interdits partout. */
export const SEGMENTS_INTERDITS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** Segments d'un JSON Pointer (RFC 6901), ou `null` s'il est mal formé. */
export function segmentsPointeur(chemin: string): string[] | null {
  if (!chemin.startsWith('/')) return null;
  const segments: string[] = [];
  for (const brut of chemin.slice(1).split('/')) {
    if (/~[^01]|~$/.test(brut)) return null;
    segments.push(brut.replace(/~1/g, '/').replace(/~0/g, '~'));
  }
  return segments;
}

/**
 * Contrôle un chemin de patch · le code du premier défaut, ou `null`.
 * Racine refusée (ce serait un document complet de remplacement), segments de
 * prototype refusés, index positionnels refusés (les collections sont indexées
 * par IDs stables), et le chemin doit être un chemin autorisé ou en descendre.
 */
export function defautChemin(chemin: string, autorises: ReadonlyArray<string>): 'CHEMIN_INVALIDE' | 'CHEMIN_INTERDIT' | 'CHEMIN_POSITIONNEL' | 'CHEMIN_NON_AUTORISE' | null {
  const segments = segmentsPointeur(chemin);
  if (!segments || segments.length === 0 || segments.some((s) => s.length === 0)) return 'CHEMIN_INVALIDE';
  if (segments.some((s) => SEGMENTS_INTERDITS.has(s))) return 'CHEMIN_INTERDIT';
  if (segments.some((s) => /^\d+$/.test(s) || s === '-')) return 'CHEMIN_POSITIONNEL';
  if (!autorises.some((a) => chemin === a || chemin.startsWith(a.endsWith('/') ? a : `${a}/`))) return 'CHEMIN_NON_AUTORISE';
  return null;
}

const MOTIF_CONTENU_ACTIF = /<\s*\/?\s*[a-z][^>]*>|javascript\s*:|\b[a-z][a-z0-9+.-]*:\/\//i;

/** Une valeur de patch ne transporte ni clé de prototype, ni HTML, script ou URL. */
function defautsValeur(valeur: unknown, cible: string, sortie: Constat[]): void {
  if (typeof valeur === 'string') {
    if (MOTIF_CONTENU_ACTIF.test(valeur)) sortie.push(constat('VALEUR_ACTIVE_INTERDITE', cible, 'HTML, script ou URL dans une valeur de patch · refusé.'));
    return;
  }
  if (Array.isArray(valeur)) {
    valeur.forEach((v, i) => defautsValeur(v, `${cible}/${i}`, sortie));
    return;
  }
  if (typeof valeur === 'object' && valeur !== null) {
    for (const k of Object.keys(valeur)) {
      if (SEGMENTS_INTERDITS.has(k)) sortie.push(constat('VALEUR_CLE_INTERDITE', `${cible}/${k}`, `Clé « ${k} » interdite dans une valeur.`));
      defautsValeur((valeur as Record<string, unknown>)[k], `${cible}/${k}`, sortie);
    }
  }
}

function controlerPatch(changes: unknown, autorises: string[], selection: string[], cible: string, sortie: Constat[]): void {
  const vus = new Set<string>();
  liste<Record<string, unknown>>(changes).forEach((c, i) => {
    const ci = `${cible}/${i}`;
    const chemin = texte(c.path);
    const defaut = defautChemin(chemin, autorises);
    if (defaut) sortie.push(constat(defaut, `${ci}/path`, `Chemin « ${chemin} » refusé (${defaut}).`));
    if (vus.has(chemin)) sortie.push(constat('CHEMIN_DOUBLON', `${ci}/path`, `Chemin « ${chemin} » modifié deux fois dans le même patch.`));
    vus.add(chemin);
    if (c.op === 'remove' && c.newValue !== null) sortie.push(constat('SUPPRESSION_AVEC_VALEUR', `${ci}/newValue`, 'remove exige newValue=null.'));
    if (selection.length > 0 && !defaut) {
      const segments = segmentsPointeur(chemin) ?? [];
      if (!segments.some((s) => selection.includes(s))) sortie.push(constat('CHEMIN_HORS_SELECTION', `${ci}/path`, 'Le chemin ne vise aucun identifiant sélectionné.'));
    }
    defautsValeur(c.newValue, `${ci}/newValue`, sortie);
  });
}

/* -------------------------------------------------------------------------- */
/*  Contrôles d'ENTRÉE (avant appel)                                          */
/* -------------------------------------------------------------------------- */

type ControleEntree = (ti: Record<string, unknown>, e: Ensembles, ctx: ContexteTache, options: OptionsSemantiques, sortie: Constat[]) => void;

function exigerDocument(e: Ensembles, id: unknown, cible: string, sortie: Constat[]): void {
  if (typeof id !== 'string' || !e.documents.has(id)) sortie.push(constat('REFERENCE_NON_RESOLUE', cible, `« ${String(id)} » n'a pas de document résolu · un ID seul ne suffit pas.`));
}
function exigerReference(e: Ensembles, id: unknown, cible: string, sortie: Constat[]): void {
  if (typeof id !== 'string' || !e.references.has(id)) sortie.push(constat('REFERENCE_NON_AUTORISEE', cible, `Référence « ${String(id)} » absente des références autorisées.`));
}
function exigerSource(e: Ensembles, id: unknown, cible: string, sortie: Constat[]): void {
  if (typeof id !== 'string' || !e.sources.has(id)) sortie.push(constat('SOURCE_NON_AUTORISEE', cible, `Source « ${String(id)} » non autorisée pour cette tâche.`));
}
function exigerMedia(e: Ensembles, id: unknown, cible: string, sortie: Constat[]): void {
  if (typeof id !== 'string' || !e.medias.has(id)) sortie.push(constat('MEDIA_NON_JOINT', cible, `Média « ${String(id)} » sans pièce native jointe · il ne peut pas être observé.`));
}
function exigerReferenceOuMedia(e: Ensembles, id: unknown, cible: string, sortie: Constat[]): void {
  if (typeof id !== 'string' || (!e.references.has(id) && !e.medias.has(id))) sortie.push(constat('REFERENCE_NON_AUTORISEE', cible, `Asset « ${String(id)} » ni référencé ni joint.`));
}
function cheminsAutorisesEntree(ti: Record<string, unknown>, ctx: ContexteTache, sortie: Constat[]): void {
  const ctxChemins = new Set(liste<string>(ctx.allowedPaths));
  liste<string>(ti.allowedPaths).forEach((p, i) => {
    if (!ctxChemins.has(p)) sortie.push(constat('CHEMIN_NON_AUTORISE', `/taskInputs/allowedPaths/${i}`, `« ${p} » n'est pas un chemin autorisé par le contexte serveur.`));
    const segments = segmentsPointeur(p);
    if (!segments || segments.some((s) => SEGMENTS_INTERDITS.has(s))) sortie.push(constat('CHEMIN_INTERDIT', `/taskInputs/allowedPaths/${i}`, `« ${p} » est un chemin invalide ou interdit.`));
  });
}

const ENTREES: Record<string, ControleEntree> = {
  'jarvis.route': (ti, e, ctx, _o, s) => {
    if (ti.selectionId !== null && ti.selectionId !== undefined && !e.selection.has(texte(ti.selectionId)) && !e.documents.has(texte(ti.selectionId))) {
      s.push(constat('REFERENCE_NON_RESOLUE', '/taskInputs/selectionId', 'Sélection inconnue du contexte serveur.'));
    }
    void ctx;
  },
  'brand.extract': (ti, e, _c, _o, s) => {
    liste<string>(ti.sourceIds).forEach((id, i) => exigerSource(e, id, `/taskInputs/sourceIds/${i}`, s));
    liste<Record<string, unknown>>(ti.declaredFacts).forEach((f, i) =>
      liste<string>(f.sourceIds).forEach((id, j) => {
        if (!e.citables.has(id)) s.push(constat('SOURCE_NON_AUTORISEE', `/taskInputs/declaredFacts/${i}/sourceIds/${j}`, `Source « ${id} » non autorisée.`));
      }));
  },
  'source.analyze': (ti, e, ctx, _o, s) => {
    liste<string>(ti.sourceIds).forEach((id, i) => exigerSource(e, id, `/taskInputs/sourceIds/${i}`, s));
    const modalites = new Set(liste<ContexteTache['mediaBindings'][number]>(ctx.mediaBindings).map((m) => m.modality));
    liste<string>(ti.availableModalities).forEach((m, i) => {
      if (m !== 'text' && !modalites.has(m as never)) s.push(constat('MODALITE_ABSENTE', `/taskInputs/availableModalities/${i}`, `Modalité « ${m} » annoncée sans média joint de ce type.`));
    });
  },
  'test.hypothesize': (ti, e, _c, _o, s) => {
    liste<string>(ti.observationIds).forEach((id, i) => {
      if (!e.faits.has(id) && !e.documents.has(id)) s.push(constat('REFERENCE_NON_RESOLUE', `/taskInputs/observationIds/${i}`, `Observation « ${id} » sans fait ni document résolu.`));
    });
  },
  'brief.build': (ti, e, _c, _o, s) => {
    if (ti.hypothesisId !== null && ti.hypothesisId !== undefined) exigerDocument(e, ti.hypothesisId, '/taskInputs/hypothesisId', s);
    liste<Record<string, unknown>>(ti.selectedReferences).forEach((r, i) => {
      const ref = e.references.get(texte(r.assetId));
      if (!ref) s.push(constat('REFERENCE_NON_AUTORISEE', `/taskInputs/selectedReferences/${i}`, `Référence « ${texte(r.assetId)} » absente du contexte.`));
      else if (ref.assetVersion !== r.assetVersion || ref.sha256 !== r.sha256) s.push(constat('REFERENCE_ALTEREE', `/taskInputs/selectedReferences/${i}`, 'Version ou empreinte différente de la référence autorisée.'));
    });
  },
  'concept.plan': (ti, e, _c, _o, s) => exigerDocument(e, ti.briefId, '/taskInputs/briefId', s),
  'text.write': (ti, e, _c, _o, s) => exigerDocument(e, ti.briefId, '/taskInputs/briefId', s),
  'style.describe': (ti, e, _c, _o, s) => {
    liste<string>(ti.referenceIds).forEach((id, i) => {
      exigerReference(e, id, `/taskInputs/referenceIds/${i}`, s);
      exigerMedia(e, id, `/taskInputs/referenceIds/${i}`, s);
    });
  },
  'character.spec': (ti, e, _c, _o, s) => liste<string>(ti.referenceIds).forEach((id, i) => exigerReference(e, id, `/taskInputs/referenceIds/${i}`, s)),
  'storyboard.plan': (ti, e, _c, _o, s) => exigerDocument(e, ti.briefId, '/taskInputs/briefId', s),
  'image.compile': (ti, e, _c, _o, s) => {
    exigerDocument(e, ti.briefId, '/taskInputs/briefId', s);
    exigerDocument(e, ti.conceptId, '/taskInputs/conceptId', s);
    liste<string>(ti.referenceIds).forEach((id, i) => exigerReference(e, id, `/taskInputs/referenceIds/${i}`, s));
  },
  'shot.image': (ti, e, _c, _o, s) => {
    exigerDocument(e, ti.shotId, '/taskInputs/shotId', s);
    liste<string>(ti.referenceIds).forEach((id, i) => exigerReference(e, id, `/taskInputs/referenceIds/${i}`, s));
  },
  'edit.mask': (ti, e, _c, _o, s) => {
    exigerReferenceOuMedia(e, ti.assetId, '/taskInputs/assetId', s);
    exigerReferenceOuMedia(e, ti.maskAssetId, '/taskInputs/maskAssetId', s);
  },
  'document.patch': (ti, e, ctx, _o, s) => {
    cheminsAutorisesEntree(ti, ctx, s);
    if (ctx.projectVersionId !== null && ti.baseVersion !== ctx.projectVersionId) s.push(constat('VERSION_CONFLICT', '/taskInputs/baseVersion', 'Version de base différente de la version projet du contexte.'));
    liste<string>(ti.selectedIds).forEach((id, i) => {
      if (!e.selection.has(id)) s.push(constat('REFERENCE_NON_AUTORISEE', `/taskInputs/selectedIds/${i}`, `« ${id} » n'est pas dans la sélection serveur.`));
    });
  },
  'animation.compile': (ti, e, _c, o, s) => {
    exigerDocument(e, ti.shotId, '/taskInputs/shotId', s);
    exigerReferenceOuMedia(e, ti.keyframeAssetId, '/taskInputs/keyframeAssetId', s);
    if (ti.audioAssetId !== null && ti.audioAssetId !== undefined) exigerReferenceOuMedia(e, ti.audioAssetId, '/taskInputs/audioAssetId', s);
    if (ti.speechMode === 'lipsync') {
      if (o.capacites?.lipsync !== true) s.push(constat('LIPSYNC_SANS_CAPACITE', '/taskInputs/speechMode', 'Parole synchronisée demandée sans capacité fournisseur attestée.'));
      if (ti.audioAssetId === null || ti.audioAssetId === undefined) s.push(constat('LIPSYNC_SANS_AUDIO', '/taskInputs/audioAssetId', 'Parole synchronisée sans audio précis.'));
    }
  },
  'quality.visual': (ti, e, _c, _o, s) => {
    liste<string>(ti.outputAssetIds).forEach((id, i) => exigerMedia(e, id, `/taskInputs/outputAssetIds/${i}`, s));
    liste<string>(ti.referenceIds).forEach((id, i) => exigerReference(e, id, `/taskInputs/referenceIds/${i}`, s));
  },
  'quality.consistency': (ti, e, _c, _o, s) => {
    liste<string>(ti.targetIds).forEach((id, i) => {
      if (!e.documents.has(id) && !e.selection.has(id)) s.push(constat('REFERENCE_NON_RESOLUE', `/taskInputs/targetIds/${i}`, `Cible « ${id} » sans document résolu.`));
    });
    liste<Record<string, unknown>>(ti.validatedFacts).forEach((f, i) => {
      if (!e.faits.has(texte(f.id))) s.push(constat('REFERENCE_NON_RESOLUE', `/taskInputs/validatedFacts/${i}`, `Fait « ${texte(f.id)} » absent des faits du contexte.`));
    });
  },
  'learning.review': (ti, e, _c, _o, s) => {
    exigerDocument(e, ti.testId, '/taskInputs/testId', s);
    exigerDocument(e, ti.hypothesisId, '/taskInputs/hypothesisId', s);
    liste<string>(ti.metricSnapshotIds).forEach((id, i) => exigerDocument(e, id, `/taskInputs/metricSnapshotIds/${i}`, s));
  },
  'batch.plan': (ti, e, _c, _o, s) => liste<string>(ti.conceptIds).forEach((id, i) => exigerDocument(e, id, `/taskInputs/conceptIds/${i}`, s)),
  'format.adapt': (ti, _e, ctx, _o, s) => {
    cheminsAutorisesEntree(ti, ctx, s);
    if (ctx.projectVersionId !== null && ti.documentVersion !== ctx.projectVersionId) s.push(constat('VERSION_CONFLICT', '/taskInputs/documentVersion', 'Version de document différente de la version projet du contexte.'));
  },
};

/**
 * Contrôles AVANT appel modèle. Liste vide = la tâche peut partir ; sinon elle
 * est `blocked` sans appel, avec ces constats comme motifs.
 */
export function controlerEntree(key: string, entree: EntreeTache, options: OptionsSemantiques): Constat[] {
  const sortie: Constat[] = [];
  const ctx = entree.context;
  const e = ensembles(ctx);

  liste<ContexteTache['sourceExcerpts'][number]>(ctx.sourceExcerpts).forEach((x, i) => {
    if (!e.sources.has(x.sourceId)) sortie.push(constat('SOURCE_NON_AUTORISEE', `/context/sourceExcerpts/${i}`, `Extrait de « ${x.sourceId} » hors des sources autorisées.`));
    if (x.trust !== 'untrusted_data') sortie.push(constat('SOURCE_NON_MARQUEE', `/context/sourceExcerpts/${i}/trust`, 'Un extrait est toujours une donnée non fiable.'));
  });
  const versions = new Set(liste<string>(ctx.knowledgeVersionIds));
  liste<ContexteTache['knowledgeExcerpts'][number]>(ctx.knowledgeExcerpts).forEach((x, i) => {
    if (!versions.has(x.version)) sortie.push(constat('CONNAISSANCE_NON_AUTORISEE', `/context/knowledgeExcerpts/${i}`, `Version « ${x.version} » de connaissance non retenue pour ce contexte.`));
    if (x.trust !== 'untrusted_data') sortie.push(constat('SOURCE_NON_MARQUEE', `/context/knowledgeExcerpts/${i}/trust`, 'Une connaissance est toujours une donnée non fiable.'));
  });
  liste<ContexteTache['facts'][number]>(ctx.facts).forEach((f, i) => {
    liste<string>(f.sourceIds).forEach((id, j) => {
      if (!e.sources.has(id) && !e.connaissances.has(id) && !e.documents.has(id) && !e.references.has(id)) {
        sortie.push(constat('SOURCE_INEXISTANTE', `/context/facts/${i}/sourceIds/${j}`, `Le fait cite « ${id} », absent des sources fournies.`));
      }
    });
    if ((f.kind === 'observed' || f.kind === 'measured') && liste(f.sourceIds).length === 0) sortie.push(constat('FAIT_SANS_SOURCE', `/context/facts/${i}`, 'Un fait observé ou mesuré porte une source.'));
  });
  const idsDocs = new Set<string>();
  liste<ContexteTache['resolvedDocuments'][number]>(ctx.resolvedDocuments).forEach((d, i) => {
    if (idsDocs.has(d.id)) sortie.push(constat('DOCUMENT_DOUBLON', `/context/resolvedDocuments/${i}`, `Document « ${d.id} » présent deux fois.`));
    idsDocs.add(d.id);
    const verdict = options.validerDocument(d.schemaKey, d.content);
    if (verdict === 'inconnu') sortie.push(constat('DOCUMENT_SCHEMA_INCONNU', `/context/resolvedDocuments/${i}/schemaKey`, `Aucun schéma métier connu pour « ${d.schemaKey} » · le document ne peut pas être validé.`));
    else if (verdict === 'invalide') sortie.push(constat('DOCUMENT_INVALIDE', `/context/resolvedDocuments/${i}/content`, `Le document « ${d.id} » ne respecte pas le schéma « ${d.schemaKey} ».`));
  });
  const idsAlloues = new Set<string>();
  liste<ContexteTache['allocatedIds'][number]>(ctx.allocatedIds).forEach((a, i) => {
    if (idsAlloues.has(a.id)) sortie.push(constat('ID_ALLOUE_DOUBLON', `/context/allocatedIds/${i}`, `Identifiant « ${a.id} » alloué deux fois.`));
    idsAlloues.add(a.id);
  });
  const index = new Set<number>();
  liste<ContexteTache['mediaBindings'][number]>(ctx.mediaBindings).forEach((m, i) => {
    if (index.has(m.nativeAttachmentIndex)) sortie.push(constat('MEDIA_INDEX_DOUBLON', `/context/mediaBindings/${i}`, 'Deux médias sur la même pièce native.'));
    index.add(m.nativeAttachmentIndex);
  });

  const specifique = ENTREES[key];
  if (specifique) specifique(objet(entree.taskInputs), e, ctx, options, sortie);
  return sortie;
}

/* -------------------------------------------------------------------------- */
/*  Contrôles de SORTIE (après appel)                                         */
/* -------------------------------------------------------------------------- */

type ControleSortie = (r: Record<string, unknown>, ti: Record<string, unknown>, e: Ensembles, ctx: ContexteTache, options: OptionsSemantiques, sortie: Constat[]) => void;

function idsAlloues(items: unknown, champ: string, permis: Set<string>, cible: string, sortie: Constat[]): void {
  const vus = new Set<string>();
  liste<Record<string, unknown>>(items).forEach((x, i) => {
    const id = texte(x[champ]);
    if (!permis.has(id)) sortie.push(constat('ID_NON_ALLOUE', `${cible}/${i}/${champ}`, `Identifiant « ${id} » inventé · il doit venir de allocatedIds.`));
    if (vus.has(id)) sortie.push(constat('ID_DOUBLON', `${cible}/${i}/${champ}`, `Identifiant « ${id} » utilisé deux fois.`));
    vus.add(id);
  });
}

function sousEnsemble(valeurs: unknown, permis: ReadonlySet<string>, code: string, cible: string, quoi: string, sortie: Constat[]): void {
  liste<string>(valeurs).forEach((v, i) => {
    if (!permis.has(v)) sortie.push(constat(code, `${cible}/${i}`, `${quoi} « ${v} » hors de ce que la tâche a fourni.`));
  });
}

function composantsRequis(e: Ensembles, referenceIds: unknown): string[] {
  return liste<string>(referenceIds).flatMap((id) => e.references.get(id)?.requiredComponents ?? []);
}

function composantsProteges(r: Record<string, unknown>, e: Ensembles, referenceIds: unknown, sortie: Constat[]): void {
  const proteges = new Set(liste<string>(r.protectedComponents));
  for (const c of composantsRequis(e, referenceIds)) {
    if (!proteges.has(c)) sortie.push(constat('COMPOSANT_NON_PROTEGE', '/result/protectedComponents', `Composant requis « ${c} » absent des composants protégés.`));
  }
  const permis = new Set(liste<string>(referenceIds));
  liste<Record<string, unknown>>(r.referenceBindings).forEach((b, i) => {
    if (!permis.has(texte(b.referenceId))) sortie.push(constat('REFERENCE_HORS_TACHE', `/result/referenceBindings/${i}/referenceId`, `Référence « ${texte(b.referenceId)} » non fournie à la tâche.`));
  });
}

function verdictCoherent(r: Record<string, unknown>, sortie: Constat[]): void {
  if (r.verdict !== 'passed') return;
  if (liste<Record<string, unknown>>(r.issues).some((i) => i.severity === 'blocking')) sortie.push(constat('VERDICT_INCOHERENT', '/result/verdict', 'passed avec un défaut bloquant.'));
  if (liste(r.unverifiable).length > 0) sortie.push(constat('VERDICT_INCOHERENT', '/result/verdict', 'passed alors qu’une dimension est invérifiable · requires_review attendu.'));
}

const SORTIES: Record<string, ControleSortie> = {
  'jarvis.route': (r, ti, e, _c, _o, s) => {
    const actions = new Set(liste<string>(ti.availableActions));
    const suivant = texte(r.nextTemplateKey);
    if (suivant !== '' && !actions.has(suivant)) s.push(constat('ACTION_INDISPONIBLE', '/result/nextTemplateKey', `« ${suivant} » n'est pas une action disponible.`));
    const permises = new Set([...e.selection, ...e.sources, ...(typeof ti.selectionId === 'string' ? [ti.selectionId] : [])]);
    sousEnsemble(r.targetIds, permises, 'CIBLE_NON_SELECTIONNEE', '/result/targetIds', 'Cible', s);
  },
  'brand.extract': (r, ti, e, _c, _o, s) => {
    idsAlloues(r.facts, 'id', new Set([...alloues(e, 'fact'), ...e.faits, ...liste<Record<string, unknown>>(ti.declaredFacts).map((f) => texte(f.id))]), '/result/facts', s);
  },
  'source.analyze': (r, ti, e, _c, _o, s) => {
    idsAlloues(r.observations, 'id', new Set([...alloues(e, 'fact'), ...e.faits]), '/result/observations', s);
    const permis = new Set(liste<string>(ti.sourceIds));
    liste<Record<string, unknown>>(r.observations).forEach((o, i) => sousEnsemble(o.sourceIds, permis, 'SOURCE_HORS_TACHE', `/result/observations/${i}/sourceIds`, 'Source', s));
  },
  'test.hypothesize': (r, ti, e, _c, _o, s) => {
    idsAlloues(r.hypotheses, 'id', alloues(e, 'hypothesis'), '/result/hypotheses', s);
    const metriques = new Set(liste<string>(ti.availableMetrics));
    liste<Record<string, unknown>>(r.hypotheses).forEach((h, i) => {
      if (!metriques.has(texte(h.metric))) s.push(constat('METRIQUE_INDISPONIBLE', `/result/hypotheses/${i}/metric`, `Métrique « ${texte(h.metric)} » absente des métriques disponibles.`));
    });
  },
  'brief.build': (r, ti, e, ctx, _o, s) => {
    const hypothese = ti.hypothesisId ?? null;
    if ((r.hypothesisId ?? null) !== hypothese) s.push(constat('HYPOTHESE_ALTEREE', '/result/hypothesisId', 'Le brief doit conserver l’hypothèse transmise.'));
    const selection = liste<Record<string, unknown>>(ti.selectedReferences);
    const sortieRefs = liste<Record<string, unknown>>(r.references);
    sortieRefs.forEach((ref, i) => {
      const src = selection.find((x) => x.assetId === ref.assetId);
      if (!src || src.assetVersion !== ref.assetVersion || src.sha256 !== ref.sha256) s.push(constat('REFERENCE_ALTEREE', `/result/references/${i}`, `Référence « ${texte(ref.assetId)} » absente de la sélection ou modifiée.`));
      else {
        const gardes = new Set(liste<string>(ref.requiredComponents));
        for (const c of liste<string>(src.requiredComponents)) if (!gardes.has(c)) s.push(constat('COMPOSANT_RETIRE', `/result/references/${i}/requiredComponents`, `Composant requis « ${c} » retiré.`));
      }
    });
    selection.forEach((src, i) => {
      if (!sortieRefs.some((x) => x.assetId === src.assetId)) s.push(constat('REFERENCE_PERDUE', `/taskInputs/selectedReferences/${i}`, `La référence sélectionnée « ${texte(src.assetId)} » n’est plus dans le brief.`));
    });
    const invariants = new Set(liste<string>(r.invariants));
    liste<string>(ctx.invariants).forEach((inv, i) => {
      if (!invariants.has(inv)) s.push(constat('INVARIANT_PERDU', `/context/invariants/${i}`, `Invariant validé absent du brief : « ${inv.slice(0, 80)} ».`));
    });
    idsAlloues(r.facts, 'id', new Set([...alloues(e, 'fact'), ...e.faits]), '/result/facts', s);
  },
  'concept.plan': (r, ti, e, _c, _o, s) => {
    idsAlloues(r.concepts, 'conceptId', alloues(e, 'concept'), '/result/concepts', s);
    const concepts = liste<Record<string, unknown>>(r.concepts);
    const angles = new Set(concepts.map((c) => texte(c.angle)));
    if (typeof ti.angleCount === 'number' && angles.size > ti.angleCount) s.push(constat('ANGLES_EXCEDENTAIRES', '/result/concepts', `${angles.size} angles pour ${ti.angleCount} demandés.`));
    const formats = new Set(liste<string>(ti.formats));
    if (formats.size > 0) concepts.forEach((c, i) => {
      if (!formats.has(texte(c.format))) s.push(constat('FORMAT_NON_DEMANDE', `/result/concepts/${i}/format`, `Format « ${texte(c.format)} » non demandé.`));
    });
  },
  'text.write': (r, ti, e, _c, _o, s) => {
    idsAlloues(r.variants, 'id', alloues(e, 'variant'), '/result/variants', s);
    const variantes = liste<Record<string, unknown>>(r.variants);
    if (typeof ti.variantCount === 'number' && variantes.length > ti.variantCount) s.push(constat('VARIANTES_EXCEDENTAIRES', '/result/variants', `${variantes.length} variantes pour ${ti.variantCount} demandées.`));
    variantes.forEach((v, i) => {
      const n = [...texte(v.text)].length;
      if (typeof ti.maxCharacters === 'number' && n > ti.maxCharacters) s.push(constat('TEXTE_TROP_LONG', `/result/variants/${i}/text`, `${n} caractères pour ${ti.maxCharacters} au plus.`));
    });
  },
  'style.describe': (r, ti, e, _c, _o, s) => {
    const portee = ti.allowedScope;
    const style = objet(r.style);
    if (portee !== 'global' && style.scope !== portee) s.push(constat('PORTEE_ELARGIE', '/result/style/scope', `Portée « ${String(style.scope)} » au-delà de la portée autorisée « ${String(portee)} ».`));
    idsAlloues(r.referenceObservations, 'id', new Set([...alloues(e, 'fact'), ...e.faits]), '/result/referenceObservations', s);
  },
  'character.spec': (r, ti, e, _c, _o, s) => {
    const id = texte(r.identityId);
    if (!alloues(e, 'identity').has(id) && !e.documents.has(id)) s.push(constat('ID_NON_ALLOUE', '/result/identityId', `Identité « ${id} » ni allouée ni résolue.`));
    sousEnsemble(r.referenceIds, new Set(liste<string>(ti.referenceIds)), 'REFERENCE_HORS_TACHE', '/result/referenceIds', 'Référence', s);
    const demandees = new Set(liste<string>(ti.requiredViews));
    const rendues = new Set(liste<string>(r.requiredViews));
    for (const v of demandees) if (!rendues.has(v)) s.push(constat('VUES_ALTEREES', '/result/requiredViews', `Vue demandée « ${v} » absente.`));
    for (const v of rendues) if (!demandees.has(v)) s.push(constat('VUES_ALTEREES', '/result/requiredViews', `Vue « ${v} » non demandée.`));
  },
  'storyboard.plan': (r, ti, e, _c, o, s) => {
    const permis = new Set([...alloues(e, 'shot'), ...[...e.documents.values()].filter((d) => d.schemaKey === 'Shot').map((d) => d.id)]);
    idsAlloues(r.shots, 'shotId', permis, '/result/shots', s);
    const plans = liste<Record<string, unknown>>(r.shots);
    if (typeof ti.shotCount === 'number' && plans.length > ti.shotCount) s.push(constat('PLANS_EXCEDENTAIRES', '/result/shots', `${plans.length} plans pour ${ti.shotCount} demandés.`));
    const sansTexte = modeSansTexte(e, ti.briefId, o);
    let total = 0;
    plans.forEach((p, i) => {
      liste<string>(p.referenceIds).forEach((id, j) => {
        if (!e.references.has(id) && !e.documents.has(id)) s.push(constat('REFERENCE_NON_AUTORISEE', `/result/shots/${i}/referenceIds/${j}`, `Référence « ${id} » non fournie.`));
      });
      if (sansTexte && liste(p.onScreenText).length > 0) s.push(constat('TEXTE_EN_MODE_SANS_TEXTE', `/result/shots/${i}/onScreenText`, 'Mode sans texte · onScreenText doit rester vide.'));
      if (ti.speechMode !== 'lipsync' && p.speechMode === 'lipsync') s.push(constat('LIPSYNC_NON_DEMANDE', `/result/shots/${i}/speechMode`, 'Mouvement labial demandé hors mode parole synchronisée.'));
      total += typeof p.estimatedDurationMs === 'number' ? p.estimatedDurationMs : 0;
    });
    if (typeof r.estimatedTotalMs === 'number' && r.estimatedTotalMs !== total) s.push(constat('DUREE_TOTALE_INCOHERENTE', '/result/estimatedTotalMs', `Total ${r.estimatedTotalMs} ms ≠ somme des plans ${total} ms.`));
  },
  'image.compile': (r, ti, e, _c, o, s) => {
    composantsProteges(r, e, ti.referenceIds, s);
    if (modeSansTexte(e, ti.briefId, o) && r.needsDeterministicOverlay === true) s.push(constat('TEXTE_EN_MODE_SANS_TEXTE', '/result/needsDeterministicOverlay', 'Mode sans texte · aucun calque de texte.'));
  },
  'shot.image': (r, ti, e, _c, _o, s) => composantsProteges(r, e, ti.referenceIds, s),
  'document.patch': (r, ti, e, ctx, _o, s) => {
    if (r.baseVersion !== ti.baseVersion) s.push(constat('VERSION_DE_BASE_ALTEREE', '/result/baseVersion', 'Le patch doit porter la version de base transmise.'));
    const ctxChemins = new Set(liste<string>(ctx.allowedPaths));
    controlerPatch(r.changes, liste<string>(ti.allowedPaths).filter((p) => ctxChemins.has(p)), liste<string>(ti.selectedIds), '/result/changes', s);
    void e;
  },
  'format.adapt': (r, ti, _e, ctx, _o, s) => {
    if (r.baseVersion !== ti.documentVersion) s.push(constat('VERSION_DE_BASE_ALTEREE', '/result/baseVersion', 'Le patch doit porter la version de document transmise.'));
    const ctxChemins = new Set(liste<string>(ctx.allowedPaths));
    controlerPatch(r.changes, liste<string>(ti.allowedPaths).filter((p) => ctxChemins.has(p)), [], '/result/changes', s);
  },
  'voice.prepare': (r, ti, _e, _c, _o, s) => {
    if (r.spokenText !== ti.narrationText) s.push(constat('NARRATION_REECRITE', '/result/spokenText', 'spokenText doit être strictement égal à narrationText.'));
    if (r.voiceId !== ti.voiceId) s.push(constat('VOIX_REMPLACEE', '/result/voiceId', 'La voix sélectionnée ne se remplace pas.'));
    if (r.language !== ti.language) s.push(constat('LANGUE_ALTEREE', '/result/language', 'La langue transmise ne se change pas.'));
  },
  'animation.compile': (r, ti, _e, _c, _o, s) => {
    if (r.audioRequired !== (ti.speechMode === 'lipsync')) s.push(constat('AUDIO_REQUIS_INCOHERENT', '/result/audioRequired', 'audioRequired vaut vrai en parole synchronisée, faux sinon.'));
  },
  'music.prepare': (r, ti, _e, _c, _o, s) => {
    if (r.instrumental !== ti.instrumental) s.push(constat('INSTRUMENTAL_ALTERE', '/result/instrumental', 'Le choix instrumental transmis ne se change pas.'));
    if (r.durationMs !== ti.durationMs) s.push(constat('DUREE_ALTEREE', '/result/durationMs', 'La durée ciblée ne se change pas.'));
    sousEnsemble(r.suggestedAssetIds, new Set(liste<string>(ti.licensedAssetIds)), 'MUSIQUE_NON_LICENCIEE', '/result/suggestedAssetIds', 'Musique', s);
  },
  'quality.visual': (r, ti, _e, _c, _o, s) => {
    verdictCoherent(r, s);
    const permis = new Set([...liste<string>(ti.outputAssetIds), ...liste<string>(ti.referenceIds)]);
    liste<Record<string, unknown>>(r.issues).forEach((x, i) => {
      if (!permis.has(texte(x.targetId))) s.push(constat('CIBLE_HORS_TACHE', `/result/issues/${i}/targetId`, `Cible « ${texte(x.targetId)} » hors des médias contrôlés.`));
    });
  },
  'quality.consistency': (r, ti, _e, _c, _o, s) => {
    verdictCoherent(r, s);
    const permis = new Set(liste<string>(ti.targetIds));
    liste<Record<string, unknown>>(r.issues).forEach((x, i) => {
      if (!permis.has(texte(x.targetId))) s.push(constat('CIBLE_HORS_TACHE', `/result/issues/${i}/targetId`, `Cible « ${texte(x.targetId)} » hors des cibles contrôlées.`));
    });
  },
  'learning.review': (r, _ti, e, _c, _o, s) => {
    idsAlloues(r.observations, 'id', new Set([...alloues(e, 'fact'), ...e.faits]), '/result/observations', s);
  },
  'batch.plan': (r, ti, e, _c, _o, s) => {
    const items = liste<Record<string, unknown>>(r.items);
    idsAlloues(items, 'itemId', alloues(e, 'batch_item'), '/result/items', s);
    if (typeof ti.maxOutputs === 'number' && items.length > ti.maxOutputs) s.push(constat('LOT_DEPASSE', '/result/items', `${items.length} sorties pour ${ti.maxOutputs} au plus.`));
    if (r.count !== items.length) s.push(constat('LOT_COMPTE_FAUX', '/result/count', `count=${String(r.count)} pour ${items.length} lignes.`));
    const concepts = new Set(liste<string>(ti.conceptIds));
    const formats = new Set(liste<string>(ti.formats));
    const combinaisons = new Set<string>();
    items.forEach((x, i) => {
      if (!concepts.has(texte(x.conceptId))) s.push(constat('CONCEPT_HORS_LOT', `/result/items/${i}/conceptId`, `Concept « ${texte(x.conceptId)} » non fourni.`));
      if (formats.size > 0 && !formats.has(texte(x.format))) s.push(constat('FORMAT_NON_DEMANDE', `/result/items/${i}/format`, `Format « ${texte(x.format)} » non demandé.`));
      const combo = JSON.stringify([texte(x.conceptId), texte(x.format), texte(x.variation).trim().toLowerCase()]);
      if (combinaisons.has(combo)) s.push(constat('LOT_DOUBLON', `/result/items/${i}`, 'Même concept, format et variation qu’une ligne précédente.'));
      combinaisons.add(combo);
    });
  },
};

/** Parcourt le résultat · sources citées, faits sans source, empreintes recopiées. */
function controlerCitations(valeur: unknown, chemin: string, e: Ensembles, sortie: Constat[]): void {
  if (Array.isArray(valeur)) {
    valeur.forEach((v, i) => controlerCitations(v, `${chemin}/${i}`, e, sortie));
    return;
  }
  if (typeof valeur !== 'object' || valeur === null) return;
  const o = valeur as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    const c = `${chemin}/${k}`;
    if (k === 'sourceIds' || k === 'claimSourceIds') {
      liste<string>(v).forEach((id, i) => {
        if (!e.citables.has(id)) sortie.push(constat('SOURCE_INEXISTANTE', `${c}/${i}`, `Source citée « ${id} » absente des sources fournies et autorisées.`));
      });
    } else if (k === 'evidenceIds') {
      liste<string>(v).forEach((id, i) => {
        if (!e.connus.has(id)) sortie.push(constat('SOURCE_INEXISTANTE', `${c}/${i}`, `Preuve « ${id} » inconnue du contexte.`));
      });
    } else if (k === 'sha256' && typeof v === 'string' && !e.empreintes.has(v)) {
      sortie.push(constat('EMPREINTE_INVENTEE', c, 'Empreinte absente du contexte · elle se recopie, elle ne s’invente pas.'));
    } else {
      controlerCitations(v, c, e, sortie);
    }
  }
  if (typeof o.claim === 'string' && (o.kind === 'observed' || o.kind === 'measured') && liste(o.sourceIds).length === 0) {
    sortie.push(constat('FAIT_SANS_SOURCE', chemin, 'Un fait observé ou mesuré porte une source existante.'));
  }
}

/**
 * Contrôles APRÈS appel · liste vide = sortie acceptable. Sinon la sortie est
 * rejetée, même conforme au schéma.
 */
export function controlerSortie(key: string, entree: EntreeTache, sortie: SortieTache, options: OptionsSemantiques): Constat[] {
  const constats: Constat[] = [];
  const ctx = entree.context;
  const ti = objet(entree.taskInputs);
  const e = ensembles(ctx);
  const questions = liste<string>(sortie.questions);

  if (sortie.status === 'ready') {
    if (sortie.result === null || typeof sortie.result !== 'object') constats.push(constat('SORTIE_READY_SANS_RESULTAT', '/result', 'ready exige un résultat non nul.'));
    if (questions.length > 0) constats.push(constat('SORTIE_READY_AVEC_QUESTIONS', '/questions', 'ready exige une liste de questions vide.'));
  } else if (sortie.status === 'blocked') {
    if (sortie.result !== null) constats.push(constat('SORTIE_BLOCKED_AVEC_RESULTAT', '/result', 'blocked exige result=null.'));
    if (questions.length === 0) constats.push(constat('SORTIE_BLOCKED_SANS_QUESTION', '/questions', 'blocked exige au moins une question ciblée.'));
  } else {
    constats.push(constat('SORTIE_STATUT_INCONNU', '/status', 'Statut ready ou blocked attendu.'));
  }
  questions.forEach((q, i) => {
    if (q.trim().length === 0) constats.push(constat('QUESTION_VIDE', `/questions/${i}`, 'Une question vide ne cible rien.'));
  });
  liste<string>(sortie.evidenceIds).forEach((id, i) => {
    if (!e.connus.has(id)) constats.push(constat('SOURCE_INEXISTANTE', `/evidenceIds/${i}`, `Preuve « ${id} » inconnue du contexte.`));
  });

  // Ce qui DOIT être bloqué, quoi que dise le modèle.
  if (key === 'animation.compile' && ti.speechMode === 'lipsync' && sortie.status === 'ready') {
    if (options.capacites?.lipsync !== true) constats.push(constat('LIPSYNC_SANS_CAPACITE', '/status', 'Parole synchronisée sans capacité attestée · blocked attendu.'));
    if (ti.audioAssetId === null || ti.audioAssetId === undefined) constats.push(constat('LIPSYNC_SANS_AUDIO', '/status', 'Parole synchronisée sans audio · blocked attendu.'));
  }

  if (sortie.status === 'ready' && sortie.result && typeof sortie.result === 'object') {
    controlerCitations(sortie.result, '/result', e, constats);
    const specifique = SORTIES[key];
    if (specifique) specifique(sortie.result, ti, e, ctx, options, constats);
  }
  return constats;
}

/* -------------------------------------------------------------------------- */
/*  Chaîne complète d'une sortie modèle                                       */
/* -------------------------------------------------------------------------- */

export type ResultatSortie =
  | { ok: true; sortie: SortieTache }
  | { ok: false; code: 'SORTIE_JSON_INVALIDE' | 'INVALID_SCHEMA' | 'SEMANTIQUE'; constats: Constat[]; reparationPossible: boolean };

/**
 * Juge une sortie modèle brute (texte ou objet) : JSON lisible, schéma de
 * sortie du template, puis contrôles sémantiques. `reparationPossible` dit si
 * une tentative de réparation reste dans le plafond du template
 * (`maximumRepairAttempts`, une au plus) · au-delà, erreur explicite.
 */
export function evaluerSortie(
  key: string,
  entree: EntreeTache,
  brut: unknown,
  validateur: Pick<ValidateurContrats, 'validerSortie'>,
  options: OptionsSemantiques,
  reparation: { faites: number; maximum: number },
): ResultatSortie {
  const reparationPossible = reparation.faites < reparation.maximum;
  let valeur = brut;
  if (typeof brut === 'string') {
    try {
      valeur = JSON.parse(brut);
    } catch {
      return { ok: false, code: 'SORTIE_JSON_INVALIDE', constats: [constat('SORTIE_JSON_INVALIDE', '', 'La sortie n’est pas un JSON lisible.')], reparationPossible };
    }
  }
  const schema = validateur.validerSortie(key, valeur);
  if (!schema.ok) {
    return {
      ok: false, code: 'INVALID_SCHEMA', reparationPossible,
      constats: schema.erreurs.map((x) => constat('INVALID_SCHEMA', x.chemin, `${x.motCle}${x.propriete ? ` (${x.propriete})` : ''} · ${x.message}`)),
    };
  }
  const constats = controlerSortie(key, entree, valeur as SortieTache, options);
  return constats.length > 0 ? { ok: false, code: 'SEMANTIQUE', constats, reparationPossible } : { ok: true, sortie: valeur as SortieTache };
}
