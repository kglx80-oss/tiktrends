/**
 * Intégration Higgsfield · génération de vidéos IA (CDC §F9 bis).
 *
 * Contrat d'API asynchrone : on POST une génération (prompt + options) → on reçoit
 * un identifiant de job → on interroge le statut jusqu'à obtenir l'URL de la vidéo.
 *
 * Tout est configurable par variables d'environnement pour brancher la clé demain
 * sans redéployer de code :
 *   HIGGSFIELD_API_KEY      (obligatoire pour activer)
 *   HIGGSFIELD_API_SECRET   (optionnel · auth « Key id:secret » si fourni)
 *   HIGGSFIELD_BASE_URL     (def: https://platform.higgsfield.ai)
 *   HIGGSFIELD_T2V_PATH     (def: /v1/text2video)
 *   HIGGSFIELD_I2V_PATH     (def: /v1/image2video)
 *   HIGGSFIELD_JOB_PATH     (def: /v1/jobs)   -> {JOB_PATH}/{id}
 *   HIGGSFIELD_MODEL        (optionnel)
 */

export interface HiggsfieldConfig {
  apiKey: string;
  apiSecret?: string;
  baseUrl?: string;
  t2vPath?: string;
  i2vPath?: string;
  jobPath?: string;
  model?: string;
}

export interface VideoJob { id: string; status: 'queued' | 'processing' | 'completed' | 'failed'; videoUrl?: string; thumbnailUrl?: string; error?: string }
export interface VideoInput { prompt: string; durationS?: number; aspectRatio?: '9:16' | '1:1' | '16:9'; seed?: number }
export interface ImageVideoInput extends VideoInput { imageUrl: string }

/** Construit la config depuis l'environnement (null si la clé est absente). */
export function higgsfieldFromEnv(): HiggsfieldConfig | null {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    apiSecret: process.env.HIGGSFIELD_API_SECRET || undefined,
    baseUrl: process.env.HIGGSFIELD_BASE_URL || 'https://platform.higgsfield.ai',
    t2vPath: process.env.HIGGSFIELD_T2V_PATH || '/v1/text2video',
    i2vPath: process.env.HIGGSFIELD_I2V_PATH || '/v1/image2video',
    jobPath: process.env.HIGGSFIELD_JOB_PATH || '/v1/jobs',
    model: process.env.HIGGSFIELD_MODEL || undefined,
  };
}

export function higgsfieldConfigured(): boolean {
  return Boolean(process.env.HIGGSFIELD_API_KEY);
}

function authHeader(cfg: HiggsfieldConfig): string {
  // Deux formats répandus : « Key id:secret » (doc officielle) ou « Bearer key ».
  return cfg.apiSecret ? `Key ${cfg.apiKey}:${cfg.apiSecret}` : `Bearer ${cfg.apiKey}`;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) { const v = obj[k]; if (typeof v === 'string' && v) return v; }
  return undefined;
}

/** Soumet une génération vidéo → renvoie l'identifiant de job. */
export async function hfSubmitVideo(cfg: HiggsfieldConfig, input: VideoInput): Promise<{ jobId: string }> {
  const url = `${cfg.baseUrl}${cfg.t2vPath}`;
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: input.durationS ?? 5,
    aspect_ratio: input.aspectRatio ?? '9:16',
  };
  if (input.seed != null) body.seed = input.seed;
  if (cfg.model) body.model = cfg.model;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader(cfg) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Source vidéo : ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as Record<string, unknown>;
  const jobId = pickString(data, ['id', 'job_id', 'jobId', 'request_id', 'requestId']);
  if (!jobId) throw new Error("Réponse inattendue de la source vidéo (identifiant de job absent).");
  return { jobId };
}

/** Soumet une génération image → vidéo (anime une image de départ). */
export async function hfSubmitImageVideo(cfg: HiggsfieldConfig, input: ImageVideoInput): Promise<{ jobId: string }> {
  const url = `${cfg.baseUrl}${cfg.i2vPath}`;
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    image_url: input.imageUrl,
    duration: input.durationS ?? 5,
    aspect_ratio: input.aspectRatio ?? '9:16',
  };
  if (input.seed != null) body.seed = input.seed;
  if (cfg.model) body.model = cfg.model;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader(cfg) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Source vidéo : ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as Record<string, unknown>;
  const jobId = pickString(data, ['id', 'job_id', 'jobId', 'request_id', 'requestId']);
  if (!jobId) throw new Error("Réponse inattendue de la source vidéo (identifiant de job absent).");
  return { jobId };
}

/** Interroge le statut d'un job vidéo. */
export async function hfGetJob(cfg: HiggsfieldConfig, jobId: string): Promise<VideoJob> {
  const url = `${cfg.baseUrl}${cfg.jobPath}/${encodeURIComponent(jobId)}`;
  const res = await fetch(url, {
    headers: { authorization: authHeader(cfg) },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Source vidéo : ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  const raw = (pickString(data, ['status', 'state']) ?? 'processing').toLowerCase();
  const status: VideoJob['status'] =
    /(complete|success|done|finished)/.test(raw) ? 'completed'
    : /(fail|error|cancel)/.test(raw) ? 'failed'
    : /(queue|pending)/.test(raw) ? 'queued'
    : 'processing';

  // L'URL de la vidéo peut être à la racine ou dans un sous-objet result/output.
  const nested = (data.result ?? data.output ?? data.data ?? {}) as Record<string, unknown>;
  const videoUrl = pickString(data, ['video_url', 'videoUrl', 'url'])
    ?? pickString(nested, ['video_url', 'videoUrl', 'url']);
  const thumbnailUrl = pickString(data, ['thumbnail_url', 'thumbnailUrl', 'preview_url'])
    ?? pickString(nested, ['thumbnail_url', 'thumbnailUrl', 'preview_url']);

  return { id: jobId, status, videoUrl, thumbnailUrl, error: pickString(data, ['error', 'message']) };
}
