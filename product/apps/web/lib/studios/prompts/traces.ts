/**
 * Traces d'exécution (`studio_prompt_runs`) · ce qui s'écrit, et ce qui se
 * montre. PUR.
 *
 * ── Ce que la trace garde, et ce qu'elle ne garde JAMAIS ─────────────────────
 *
 * Elle garde de quoi EXPLIQUER une sortie (PROMPT-10) : release et empreinte,
 * template et version, empreinte du message compilé et du snapshot de
 * contexte, couches de résolution, rapport de budget, sources retenues (type,
 * identifiant, version, titre), modèle, latence, coût, statut, codes de refus.
 *
 * Elle ne garde ni le texte du prompt compilé, ni le message de l'utilisateur,
 * ni la sortie du modèle, ni un secret : seulement leurs empreintes. Les
 * sources sont immuables par version (connaissances versionnées, versions du
 * registre figées) : l'identifiant et la version suffisent à retrouver
 * l'extrait exact, sous les droits de qui le consulte. C'est l'expurgation par
 * construction · cahier §12 « logs structurés expurgés, aucune copie durable de
 * secrets ».
 *
 * `expurgerRun` est la seule vue montrée en ADMIN (`run.inspect_redacted`) :
 * une liste blanche de champs, rien d'autre ne traverse, même si une ligne
 * contenait autre chose.
 */

export interface SourceTrace { type: 'connaissance' | 'source' | 'memoire' | 'regles' | 'identite'; id: string; version: string; titre: string }

export interface LigneRun {
  id: string;
  workspaceId: string;
  brandId: string;
  projectId: string | null;
  jobId: string | null;
  templateKey: string;
  promptVersionId: string | null;
  promptReleaseId: string | null;
  compiledHash: string;
  contextSnapshotHash: string;
  sourceRefs: unknown;
  model: string;
  config: unknown;
  documentVersionId: string | null;
  outputHash: string | null;
  latencyMs: number | null;
  costUsdMicros: number | null;
  credits: number | null;
  status: string;
  traceId: string | null;
  createdAt: Date | string;
}

/** Champs de `config` qu'on accepte de montrer · liste blanche. */
const CONFIG_VISIBLE = [
  'releaseHash', 'packHash', 'templateVersion', 'templateContentHash', 'politique', 'commonSystemHash', 'taskInputsHash',
  'couches', 'budget', 'adaptateur', 'simule', 'modelProfile', 'constats', 'epinglee', 'environnement', 'conversation', 'jetons',
  'evaluation', 'mediaBindings',
] as const;

/** Le marquage « exécution d'évaluation » (F-D) tel que l'ADMIN le voit · trois champs, rien d'autre. */
export interface EvaluationTrace { mode: string; approbationId: string; releaseStatut: string }

/**
 * Une pièce native réellement envoyée (F-D, `CorrespondancePiece`) telle que
 * l'ADMIN la voit · identifiants, empreinte, index, type, taille, dimensions,
 * borne de jetons. Jamais d'octets, d'adresse ni de clé de stockage.
 */
export interface PieceTrace {
  bindingId: string; assetId: string; assetVersion: string; sha256: string; nativeAttachmentIndex: number;
  mime: string; octets: number | null; largeur: number | null; hauteur: number | null; jetonsMax: number | null;
}

/**
 * Un identifiant montrable · court, sans espace ni barre oblique (« / » ou inverse), jamais une
 * adresse ni une donnée encodée. Une URL (`https://…`), une clé de stockage
 * (`studios/<espace>/<job>/…`), une `data:` URI ou des octets en base64 ne
 * passent pas : la valeur est remplacée par une chaîne vide.
 */
function identifiant(v: unknown): string {
  if (typeof v !== 'string' || !/^[^\s/\\]{1,160}$/.test(v) || /^data:/i.test(v)) return '';
  return v;
}
const entierOuNul = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
const MIMES_TRACE = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** `config.evaluation` · `null` hors évaluation ; seuls `mode`, `approbationId`, `releaseStatut` traversent. */
export function expurgerEvaluation(v: unknown): EvaluationTrace | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const e = v as Record<string, unknown>;
  return { mode: identifiant(e.mode), approbationId: identifiant(e.approbationId), releaseStatut: identifiant(e.releaseStatut) };
}

/** `config.mediaBindings` · liste blanche par pièce ; une entrée qui n'est pas un objet est ignorée. */
export function expurgerPieces(v: unknown): PieceTrace[] {
  if (!Array.isArray(v)) return [];
  return v.filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null && !Array.isArray(p)).slice(0, 32).map((p) => ({
    bindingId: identifiant(p.bindingId), assetId: identifiant(p.assetId), assetVersion: identifiant(p.assetVersion),
    sha256: typeof p.sha256 === 'string' && /^[0-9a-f]{64}$/.test(p.sha256) ? p.sha256 : '',
    nativeAttachmentIndex: entierOuNul(p.nativeAttachmentIndex) ?? -1,
    mime: typeof p.mime === 'string' && MIMES_TRACE.has(p.mime) ? p.mime : '',
    octets: entierOuNul(p.octets), largeur: entierOuNul(p.largeur), hauteur: entierOuNul(p.hauteur), jetonsMax: entierOuNul(p.jetonsMax),
  }));
}

/**
 * Les deux champs de F-D portent des objets construits par le serveur ; on ne
 * les recopie pas tels quels (une ligne pourrait contenir autre chose) : chacun
 * passe par sa propre liste blanche.
 */
const EXPURGEURS: Partial<Record<(typeof CONFIG_VISIBLE)[number], (v: unknown) => unknown>> = {
  evaluation: expurgerEvaluation,
  mediaBindings: expurgerPieces,
};

export interface RunExpurge {
  id: string;
  quand: string;
  espace: string;
  marque: string;
  templateKey: string;
  statut: string;
  modele: string;
  releaseId: string | null;
  versionId: string | null;
  compiledHash: string;
  contextSnapshotHash: string;
  outputHash: string | null;
  latenceMs: number | null;
  coutUsd: number | null;
  sources: SourceTrace[];
  config: Record<string, unknown>;
  traceId: string | null;
  projetId: string | null;
  jobId: string | null;
}

function lireSources(brut: unknown): SourceTrace[] {
  if (!Array.isArray(brut)) return [];
  return brut.filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null).map((s) => ({
    type: (['connaissance', 'source', 'memoire', 'regles', 'identite'].includes(String(s.type)) ? s.type : 'source') as SourceTrace['type'],
    id: String(s.id ?? '').slice(0, 160), version: String(s.version ?? '').slice(0, 160), titre: String(s.titre ?? '').slice(0, 200),
  }));
}

export function expurgerRun(l: LigneRun): RunExpurge {
  const brute = (typeof l.config === 'object' && l.config !== null ? l.config : {}) as Record<string, unknown>;
  const config: Record<string, unknown> = {};
  for (const k of CONFIG_VISIBLE) if (k in brute) config[k] = EXPURGEURS[k] ? EXPURGEURS[k]!(brute[k]) : brute[k];
  return {
    id: l.id, quand: new Date(l.createdAt).toISOString(), espace: l.workspaceId, marque: l.brandId, templateKey: l.templateKey,
    statut: l.status, modele: l.model, releaseId: l.promptReleaseId, versionId: l.promptVersionId,
    compiledHash: l.compiledHash, contextSnapshotHash: l.contextSnapshotHash, outputHash: l.outputHash,
    latenceMs: l.latencyMs, coutUsd: l.costUsdMicros === null ? null : l.costUsdMicros / 1e6,
    sources: lireSources(l.sourceRefs), config, traceId: l.traceId, projetId: l.projectId, jobId: l.jobId,
  };
}

/** Ce que l'UTILISATEUR voit d'une trace · le nom des sources utiles, rien d'autre. */
export function nomsSourcesUtiles(sources: ReadonlyArray<SourceTrace>): string[] {
  return [...new Set(sources.filter((s) => s.type === 'connaissance' || s.type === 'source').map((s) => s.titre).filter(Boolean))];
}

/** Coût en micro-dollars entiers (colonne `cost_usd_micros`). */
export function microsUsd(usd: number): number {
  return Math.max(0, Math.round(usd * 1e6));
}
