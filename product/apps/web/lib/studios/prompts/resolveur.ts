import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  allouerContexte, compilerRequete, constat, couchesResolution, empreinteJson, evaluerSortie, releaseDuJob, resoudreTemplate,
  sha256Texte, POLITIQUE_SERVEUR,
  type Constat, type EntreeTache, type SortieTache, type TemplatePrompt, type RapportBudget, type Couche,
} from './noyau';
import { releaseActive, releaseChargee, type ReleaseChargee } from './depot-prompts';
import { construireContexte, type EntreeContexte, type SourceSnapshot } from './contexte';
import { CLE_CONVERSATION_JARVIS, validerPolitiqueConversation, type PolitiqueConversation } from './conversation';
import { POLITIQUE_JARVIS_1_0_0 } from './complement-tiktrends';
import { chargerSource } from './source';
import { microsUsd, type SourceTrace } from './traces';
import type { AdaptateurModele } from './adaptateur';
import type { EnvironnementPrompts } from './environnement';

/**
 * PromptResolver serveur UNIQUE · tous les studios et Jarvis passent ici
 * (cahier §8.3). Aucun texte de prompt n'est écrit dans ce fichier : tout vient
 * de la release (registre) ou de la politique serveur fixe du noyau.
 *
 * Chaîne d'une tâche structurée (`executerTache`) :
 *
 *   release (pointeur global, ou release ÉPINGLÉE au devis/job)
 *   → resoudreTemplate (portée, overrides fermés tant que rien n'est déclaré extensible)
 *   → ContextResolver (connaissances publiées et autorisées, sources `untrusted_data`)
 *   → allouerContexte (budget, troncature signalée, blocage si l'obligatoire ne tient pas)
 *   → compilerRequete (variables, schéma d'entrée, contrôles sémantiques, trois messages)
 *   → adaptateur (barrière de dépense en production, simulé en test seulement)
 *   → evaluerSortie (JSON, schéma de sortie, contrôles sémantiques)
 *   → `studio_prompt_runs` (release, version, empreintes, sources, modèle, latence, coût, statut)
 *
 * Chaîne de la conversation Jarvis (`resoudreConversationJarvis` puis
 * `consignerRunConversation`) : même pointeur, même release, politique de
 * conversation du registre, même table de traces. L'appel en flux reste dans
 * la route (une action serveur ne diffuse pas), par la même barrière de
 * dépense qu'avant.
 */

const PORTEE_DEFAUT_BUDGET = { budgetJetons: 24000, reserveJetons: 4000 } as const;
/** Plafond de sortie d'une tâche structurée · le schéma borne déjà chaque champ. */
const MAX_JETONS_SORTIE = 4000;

export interface DemandeTache {
  templateKey: string;
  portee: { workspaceId: string; brandId: string };
  acteur: { userId: string | null; traceId: string };
  taskInputs: Record<string, unknown>;
  contexte: EntreeContexte;
  /** Release épinglée au devis · le job l'exécute même si le pointeur a bougé (PROMPT-06). */
  epinglage?: { promptReleaseId: string } | null;
  liens?: { projectId?: string | null; jobId?: string | null; documentVersionId?: string | null };
  adaptateur: AdaptateurModele;
  environnement: EnvironnementPrompts;
  budget?: { budgetJetons: number; reserveJetons: number };
  capacites?: { lipsync?: boolean };
  sansTexte?: boolean;
}

export type ResultatTache =
  | { ok: true; sortie: SortieTache; runId: string; releaseId: string; releaseHash: string; compiledHash: string; sources: string[] }
  | { ok: false; statut: 'blocked' | 'erreur'; code: string; constats: Constat[]; runId: string | null; releaseId: string | null };

interface Trace {
  release: ReleaseChargee;
  template: TemplatePrompt;
  versionId: string | null;
  couches?: Couche[];
  budget?: RapportBudget;
  sources: SourceSnapshot[];
  contextSnapshotHash: string;
  taskInputsHash: string;
  epinglee: boolean;
}

async function ecrireRun(d: DemandeTache, t: Trace, r: {
  statut: 'succeeded' | 'failed' | 'blocked'; compiledHash: string; modele: string; outputHash?: string | null;
  latenceMs?: number | null; coutUsd?: number | null; jetons?: { entree: number; sortie: number } | null; constats?: Constat[];
}): Promise<string> {
  const [l] = await db.insert(schema.studioPromptRuns).values({
    workspaceId: d.portee.workspaceId, brandId: d.portee.brandId,
    projectId: d.liens?.projectId ?? null, jobId: d.liens?.jobId ?? null, documentVersionId: d.liens?.documentVersionId ?? null,
    templateKey: t.template.key, promptVersionId: t.versionId, promptReleaseId: t.release.ligne.id,
    compiledHash: r.compiledHash, contextSnapshotHash: t.contextSnapshotHash,
    sourceRefs: t.sources.map((s): SourceTrace => ({ type: s.type, id: s.id, version: s.version, titre: s.titre })),
    model: r.modele,
    config: {
      releaseHash: t.release.ligne.releaseHash, packHash: t.release.entrees.packHash,
      templateVersion: t.template.version, templateContentHash: t.template.contentHash,
      politique: { id: POLITIQUE_SERVEUR.id, version: POLITIQUE_SERVEUR.version, hash: sha256Texte(POLITIQUE_SERVEUR.texte) },
      taskInputsHash: t.taskInputsHash, couches: t.couches ?? [], budget: t.budget ?? null,
      adaptateur: d.adaptateur.nom, simule: d.adaptateur.simule, modelProfile: t.template.modelProfile,
      constats: (r.constats ?? []).map((c) => ({ code: c.code, cible: c.cible })), epinglee: t.epinglee, environnement: d.environnement,
      jetons: r.jetons ?? null,
    },
    outputHash: r.outputHash ?? null, latencyMs: r.latenceMs ?? null,
    costUsdMicros: r.coutUsd === null || r.coutUsd === undefined ? null : microsUsd(r.coutUsd),
    status: r.statut, traceId: d.acteur.traceId,
  }).returning({ id: schema.studioPromptRuns.id });
  return l!.id;
}

/** La release qui sert cette tâche · épinglée si un devis l'a fixée, sinon le pointeur. */
async function releaseDeLaTache(d: DemandeTache): Promise<{ ok: true; release: ReleaseChargee; epinglee: boolean } | { ok: false; constats: Constat[] }> {
  if (d.epinglage) {
    const c = await releaseChargee(d.epinglage.promptReleaseId);
    if (!c) return { ok: false, constats: [constat('RELEASE_INTROUVABLE', d.epinglage.promptReleaseId, 'Release épinglée introuvable.')] };
    const r = releaseDuJob({ promptReleaseId: c.noyau.id, releaseHash: c.noyau.hash }, [c.noyau]);
    return r.ok ? { ok: true, release: c, epinglee: true } : r;
  }
  const c = await releaseActive();
  if (!c) return { ok: false, constats: [constat('RELEASE_ACTIVE_ABSENTE', d.templateKey, 'Aucune release globale publiée · aucun prompt de repli.')] };
  if (c.noyau.revocation) return { ok: false, constats: [constat('RELEASE_REVOQUEE', c.ligne.id, `Release active révoquée · ${c.noyau.revocation.motif}`)] };
  return { ok: true, release: c, epinglee: false };
}

/**
 * Exécute une tâche structurée du registre. Écrit une trace pour chaque
 * tentative résolue (réussie, rejetée ou bloquée avant appel).
 */
export async function executerTache(d: DemandeTache): Promise<ResultatTache> {
  if (d.adaptateur.simule && d.environnement !== 'test') {
    return { ok: false, statut: 'erreur', code: 'ADAPTATEUR_SIMULE_INTERDIT', constats: [constat('ADAPTATEUR_SIMULE_INTERDIT', d.adaptateur.nom, 'Un fournisseur simulé ne sert jamais hors de l’environnement de test.')], runId: null, releaseId: null };
  }
  const rel = await releaseDeLaTache(d);
  if (!rel.ok) return { ok: false, statut: 'erreur', code: rel.constats[0]!.code, constats: rel.constats, runId: null, releaseId: null };
  const { release } = rel;
  const contenus = new Map(release.contenu.templates.map((t) => [`${t.key}@${t.version}`, t]));
  const res = resoudreTemplate({ templateKey: d.templateKey, espaceId: d.portee.workspaceId, marqueId: d.portee.brandId, release: { ...release.noyau, statut: release.noyau.statut === 'staged' ? 'active' : release.noyau.statut }, contenus, overrides: [], champsExtensibles: {} });
  if (!res.ok) return { ok: false, statut: 'erreur', code: res.constats[0]!.code, constats: res.constats, runId: null, releaseId: release.ligne.id };
  const template = res.template;
  const versionId = release.versionIds.get(`template:${template.key}@${template.version}`) ?? null;

  const { contexte, sources } = await construireContexte(d.portee, d.contexte);
  const entree: EntreeTache = { context: contexte, taskInputs: d.taskInputs };
  const trace: Trace = { release, template, versionId, sources, contextSnapshotHash: empreinteJson(contexte, 'js'), taskInputsHash: empreinteJson(d.taskInputs, 'js'), epinglee: rel.epinglee };
  const bloque = async (code: string, constats: Constat[]): Promise<ResultatTache> => {
    const compiledHash = empreinteJson({ blocage: code, releaseHash: release.ligne.releaseHash, templateContentHash: template.contentHash, contextSnapshotHash: trace.contextSnapshotHash, taskInputsHash: trace.taskInputsHash }, 'js');
    const runId = await ecrireRun(d, trace, { statut: 'blocked', compiledHash, modele: 'aucun-appel', constats });
    return { ok: false, statut: 'blocked', code, constats, runId, releaseId: release.ligne.id };
  };

  const modele = d.adaptateur.modelePour(template.modelProfile);
  if (!modele) return bloque('UNSUPPORTED_CAPABILITY', [constat('UNSUPPORTED_CAPABILITY', template.modelProfile, `Profil « ${template.modelProfile} » non routé dans ce lot · aucun fournisseur de repli.`)]);

  const budget = allouerContexte(entree, d.budget ?? PORTEE_DEFAUT_BUDGET);
  if (!budget.ok) return bloque(budget.code, budget.constats);
  trace.budget = budget.rapport;
  trace.contextSnapshotHash = empreinteJson(budget.entree.context, 'js');
  trace.sources = sources.filter((s) => {
    const champ = s.type === 'connaissance' ? budget.entree.context.knowledgeExcerpts : budget.entree.context.sourceExcerpts;
    return champ.some((x) => x.sourceId === s.id && x.version === s.version);
  });

  const s = chargerSource();
  const socle = { commonSystemInstructions: release.contenu.commonSystemInstructions, commonSystemHash: release.entrees.socle.contentHash };
  const semantique = { validerDocument: s.validerDocument, ...(d.capacites ? { capacites: d.capacites } : {}), ...(d.sansTexte !== undefined ? { sansTexte: d.sansTexte } : {}) };
  const comp = compilerRequete({ politique: POLITIQUE_SERVEUR, socle, rendu: release.contenu.rendering, template, entree: budget.entree, validateur: s.validateur, semantique });
  if (!comp.ok) {
    if (comp.statut === 'blocked') return bloque(comp.code, comp.constats);
    return { ok: false, statut: 'erreur', code: comp.code, constats: comp.constats, runId: null, releaseId: release.ligne.id };
  }
  const req = comp.requete;
  trace.couches = couchesResolution({ politique: POLITIQUE_SERVEUR, trace: res.trace, entree: budget.entree });
  trace.taskInputsHash = req.taskInputsHash;

  const debut = Date.now();
  let reponse: Awaited<ReturnType<AdaptateurModele['appeler']>>;
  try {
    reponse = await d.adaptateur.appeler({ profil: template.modelProfile, messages: req.messages, maxJetonsSortie: MAX_JETONS_SORTIE, workspaceId: d.portee.workspaceId, action: `studio-prompt:${template.key}` });
  } catch (e) {
    const code = (e as Error).name === 'SpendBlockedError' ? 'BUDGET_EXCEEDED' : 'PROVIDER_ERROR';
    const constats = [constat(code, template.key, code === 'BUDGET_EXCEEDED' ? 'Plafond de dépense atteint · rien n’est parti.' : 'Le fournisseur n’a pas répondu.')];
    const runId = await ecrireRun(d, trace, { statut: 'failed', compiledHash: req.compiledHash, modele, latenceMs: Date.now() - debut, constats });
    return { ok: false, statut: 'erreur', code, constats, runId, releaseId: release.ligne.id };
  }
  const latenceMs = Date.now() - debut;
  const juge = evaluerSortie(template.key, budget.entree, reponse.texte, s.validateur, semantique, { faites: 0, maximum: 0 });
  const commun = { compiledHash: req.compiledHash, modele: reponse.modele, outputHash: sha256Texte(reponse.texte), latenceMs, coutUsd: reponse.coutUsd, jetons: { entree: reponse.jetonsEntree, sortie: reponse.jetonsSortie } };
  if (!juge.ok) {
    const runId = await ecrireRun(d, trace, { ...commun, statut: 'failed', constats: juge.constats });
    return { ok: false, statut: 'erreur', code: juge.code, constats: juge.constats, runId, releaseId: release.ligne.id };
  }
  const runId = await ecrireRun(d, trace, { ...commun, statut: 'succeeded' });
  return { ok: true, sortie: juge.sortie, runId, releaseId: release.ligne.id, releaseHash: release.ligne.releaseHash, compiledHash: req.compiledHash, sources: [...new Set(trace.sources.map((x) => x.titre))] };
}

/** Épingle au devis la release que le pointeur désigne À CET INSTANT. */
export async function epinglerDevis(): Promise<{ ok: true; promptReleaseId: string; releaseHash: string } | { ok: false; constats: Constat[] }> {
  const c = await releaseActive();
  if (!c) return { ok: false, constats: [constat('RELEASE_ACTIVE_ABSENTE', '', 'Aucune release active · aucun repli.')] };
  if (c.noyau.revocation) return { ok: false, constats: [constat('RELEASE_REVOQUEE', c.ligne.id, `Release active révoquée · ${c.noyau.revocation.motif}`)] };
  return { ok: true, promptReleaseId: c.ligne.id, releaseHash: c.ligne.releaseHash };
}

/* ─────────────────────────── Conversation Jarvis ───────────────────────── */

export type ResolutionConversation =
  | { ok: true; origine: 'release'; release: ReleaseChargee; politique: PolitiqueConversation; versionId: string | null; contentHash: string }
  | { ok: true; origine: 'repli_1_0_0' | 'repli_revocation'; release: null; politique: PolitiqueConversation; versionId: null; contentHash: string }
  | { ok: false; code: 'POLITIQUE_ABSENTE' | 'REPLI_INVALIDE' };

/**
 * La politique de conversation de la release active.
 *
 * ── Sans release publiée : la version 1.0.0 migrée, jamais une coupure ──────
 *
 * Publier une release exige en production un benchmark approuvé, donc un budget
 * que personne n'a encore autorisé. Couper Jarvis jusque-là retirerait une
 * fonction en service (cahier : « ne supprime pas les fonctions existantes »).
 * Tant qu'AUCUNE release n'est publiée, la conversation garde donc la version
 * 1.0.0 du complément · le texte même que le code envoyait, prouvé identique au
 * caractère près (`l2-jarvis-equivalence`). Ce repli n'invente rien et se voit :
 * la trace porte `origine: 'repli_1_0_0'`, sans release. Dès qu'une release est
 * publiée, elle seule fait foi. Une release publiée SANS politique Jarvis reste
 * une erreur de configuration et coupe la conversation (aucun repli silencieux
 * sur un choix explicite de l'ADMIN).
 */
export async function resoudreConversationJarvis(): Promise<ResolutionConversation> {
  const release = await releaseActive();
  // Aucune release, ou release active RÉVOQUÉE : jamais servie, Jarvis garde
  // la 1.0.0 migrée (recette du 8 octobre · la révocation vaut partout).
  if (!release || release.noyau.revocation) {
    const v = validerPolitiqueConversation(POLITIQUE_JARVIS_1_0_0);
    if (!v.ok) return { ok: false, code: 'REPLI_INVALIDE' };
    return { ok: true, origine: release ? 'repli_revocation' : 'repli_1_0_0', release: null, politique: v.politique, versionId: null, contentHash: v.contentHash };
  }
  const i = release.entrees.conversations.findIndex((c) => c.cle === CLE_CONVERSATION_JARVIS);
  const politique = release.contenu.conversations[i];
  if (i < 0 || !politique) return { ok: false, code: 'POLITIQUE_ABSENTE' };
  const e = release.entrees.conversations[i]!;
  return { ok: true, origine: 'release', release, politique, versionId: release.versionIds.get(`conversation:${e.cle}@${e.version}`) ?? null, contentHash: e.contentHash };
}

export interface RunConversation {
  resolution: Extract<ResolutionConversation, { ok: true }>;
  portee: { workspaceId: string; brandId: string };
  traceId: string;
  modele: string;
  system: string;
  messages: ReadonlyArray<{ role: string; content: string }>;
  /** Empreinte des données de contexte (marque, mémoire, règles, connaissances retenues). */
  contexte: Record<string, unknown>;
  sources: SourceTrace[];
  reponse: string;
  statut: 'succeeded' | 'failed';
  latenceMs: number;
  jetons: { entree: number; sortie: number };
  coutUsd: number;
}

/** Trace d'un tour de conversation · empreintes seulement, ni la question ni la réponse en clair. */
export async function consignerRunConversation(r: RunConversation): Promise<string> {
  const rel = r.resolution.release;
  const [l] = await db.insert(schema.studioPromptRuns).values({
    workspaceId: r.portee.workspaceId, brandId: r.portee.brandId,
    templateKey: CLE_CONVERSATION_JARVIS, promptVersionId: r.resolution.versionId, promptReleaseId: rel?.ligne.id ?? null,
    compiledHash: empreinteJson({ system: r.system, messages: r.messages }, 'js'),
    contextSnapshotHash: empreinteJson(r.contexte, 'js'),
    sourceRefs: r.sources, model: r.modele,
    config: {
      origine: r.resolution.origine, releaseHash: rel?.ligne.releaseHash ?? null, packHash: rel?.entrees.packHash ?? null,
      conversation: { cle: r.resolution.politique.key, version: r.resolution.politique.version, contentHash: r.resolution.contentHash },
      jetons: r.jetons, environnement: 'conversation',
    },
    outputHash: r.reponse ? sha256Texte(r.reponse) : null, latencyMs: Math.max(0, Math.round(r.latenceMs)),
    costUsdMicros: microsUsd(r.coutUsd), status: r.statut, traceId: r.traceId,
  }).returning({ id: schema.studioPromptRuns.id });
  return l!.id;
}

/** Dernières traces · ADMIN seulement (`run.inspect_redacted`, vérifié par l'appelant). */
export async function listerRuns(limite = 50) {
  const t = schema.studioPromptRuns;
  return db.select().from(t).orderBy(desc(t.createdAt)).limit(Math.min(Math.max(1, limite), 200));
}

export async function lireRun(id: string) {
  const t = schema.studioPromptRuns;
  const [l] = await db.select().from(t).where(eq(t.id, id)).limit(1);
  return l ?? null;
}
