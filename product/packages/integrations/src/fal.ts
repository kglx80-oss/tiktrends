/**
 * Intégration Fal.ai · génération d'images (et, plus tard, vidéos) IA.
 *
 * Fal expose une API synchrone simple : POST https://fal.run/{model} avec la clé
 * en en-tête « Authorization: Key <FAL_KEY> ». Les images reviennent directement.
 *
 * Configurable par variables d'environnement :
 *   FAL_KEY              (obligatoire pour activer)
 *   FAL_BASE_URL         (def: https://fal.run)
 *   FAL_IMAGE_MODEL      (def: fal-ai/nano-banana-2)        · texte -> image (réaliste)
 *   FAL_IMAGE_MODEL_I2I  (def: fal-ai/flux/dev/image-to-image) · image -> image
 *   FAL_IMAGE_MODEL_TEXT (def: fal-ai/ideogram/v3)         · image avec texte lisible
 *   FAL_IMAGE_MODEL_EDIT (def: fal-ai/nano-banana-2/edit)  · édition produit fidèle (proportions + réalisme)
 */

export interface FalConfig {
  apiKey: string;
  baseUrl: string;
  queueUrl: string;
  imageModel: string;
  imageModelI2I: string;
  imageModelText: string;
  imageModelEdit: string;
  videoModel: string;
  videoModelI2V: string;
}

export type FalAspect = '9:16' | '1:1' | '16:9' | '4:5';
export interface FalImageInput { prompt: string; aspectRatio?: FalAspect; imageUrl?: string; imageUrls?: string[]; withText?: boolean; count?: number; edit?: boolean; model?: string; params?: Record<string, string | number> }
export interface FalImageResult { images: string[] }

export function falFromEnv(): FalConfig | null {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.FAL_BASE_URL || 'https://fal.run',
    queueUrl: process.env.FAL_QUEUE_URL || 'https://queue.fal.run',
    // Catalogue réduit : Nano Banana 2 (défaut, fidélité produit) + GPT Image (texte net).
    imageModel: process.env.FAL_IMAGE_MODEL || 'fal-ai/nano-banana-2',
    imageModelI2I: process.env.FAL_IMAGE_MODEL_I2I || 'fal-ai/nano-banana-2/edit',
    imageModelText: process.env.FAL_IMAGE_MODEL_TEXT || 'fal-ai/nano-banana-2',
    imageModelEdit: process.env.FAL_IMAGE_MODEL_EDIT || 'fal-ai/nano-banana-2/edit',
    videoModel: process.env.FAL_VIDEO_MODEL || 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    videoModelI2V: process.env.FAL_VIDEO_MODEL_I2V || 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
  };
}

export function falConfigured(): boolean {
  return Boolean(process.env.FAL_KEY);
}

// Correspondance ratio -> image_size Fal (Flux/Ideogram).
const IMAGE_SIZE: Record<FalAspect, string> = {
  '9:16': 'portrait_16_9', '4:5': 'portrait_4_3', '1:1': 'square_hd', '16:9': 'landscape_16_9',
};
// Nano Banana / modèles récents : ratio natif (le modèle choisit la résolution -> proportions respectées).
const ASPECT_STR: Record<FalAspect, string> = { '9:16': '9:16', '4:5': '4:5', '1:1': '1:1', '16:9': '16:9' };
const isNano = (model: string) => /nano-banana/i.test(model);
/**
 * Les deux générations de GPT Image ne parlent pas la même langue.
 *
 * GPT Image **1** attend une taille en pixels (`"1024x1536"`). GPT Image **2**
 * attend le vocabulaire habituel de Fal (`portrait_4_3`, `square_hd`…), comme
 * Flux. Envoyer la convention de l'un à l'autre fait refuser la demande · c'est
 * un `4xx`, donc un refus qui se reproduira à l'identique, et l'utilisateur voit
 * « la demande a été refusée par le service » sans savoir pourquoi.
 */
const isGptImage1 = (model: string) => /gpt-image-1/i.test(model);
const isGptImage2 = (model: string) => /gpt-image-2/i.test(model);
// GPT Image 1 attend une taille explicite (et non un image_size Flux).
const GPT_SIZE: Record<FalAspect, string> = {
  '9:16': '1024x1536', '4:5': '1024x1536', '1:1': '1024x1024', '16:9': '1536x1024',
};

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) { const v = obj[k]; if (typeof v === 'string' && v) return v; }
  return undefined;
}

function collectUrls(data: Record<string, unknown>): string[] {
  const imgs = (data.images ?? data.image ?? []) as unknown;
  const arr = Array.isArray(imgs) ? imgs : imgs ? [imgs] : [];
  return arr.map((x) => (typeof x === 'string' ? x : (x as { url?: string })?.url)).filter((u): u is string => !!u);
}

/** Génère une ou plusieurs images. Choisit le modèle selon le besoin (image de départ / texte lisible). */
export async function falGenerateImage(cfg: FalConfig, input: FalImageInput): Promise<FalImageResult> {
  // Références produit : liste (jusqu'à plusieurs angles) ou image unique.
  const refs = (input.imageUrls && input.imageUrls.length ? input.imageUrls : (input.imageUrl ? [input.imageUrl] : [])).slice(0, 8);
  const hasRef = refs.length > 0;
  // Modèle : override explicite (choix utilisateur) sinon sélection auto selon le contexte.
  const model = input.model
    || (hasRef
      ? (input.edit ? cfg.imageModelEdit : cfg.imageModelI2I)
      : input.withText ? cfg.imageModelText : cfg.imageModel);
  const ratio = input.aspectRatio ?? '1:1';
  const num = Math.min(4, Math.max(1, input.count ?? 1));
  const body: Record<string, unknown> = { prompt: input.prompt, num_images: num };
  if (isNano(model)) {
    // Ratio natif : le modèle calcule la résolution -> pas de déformation.
    body.aspect_ratio = ASPECT_STR[ratio];
    if (hasRef) body.image_urls = refs; // Nano Banana : plusieurs références possibles
  } else if (isGptImage1(model)) {
    // GPT Image 1 : taille explicite en pixels + références multiples.
    body.image_size = GPT_SIZE[ratio];
    if (hasRef) body.image_urls = refs;
  } else if (isGptImage2(model)) {
    // GPT Image 2 : vocabulaire de tailles habituel de Fal.
    body.image_size = IMAGE_SIZE[ratio];
    if (hasRef) body.image_urls = refs;
  } else {
    body.image_size = IMAGE_SIZE[ratio];
    body.output_format = 'jpeg';
    if (hasRef) body.image_url = refs[0]; // Flux i2i : une seule image de départ
  }

  // Paramètres propres à la variante choisie (ex : resolution 2K sur Nano Banana).
  const extras = input.params && Object.keys(input.params).length ? input.params : null;
  if (extras) Object.assign(body, extras);

  const call = (payload: Record<string, unknown>) => fetch(`${cfg.baseUrl}/${model}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Key ${cfg.apiKey}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  });

  /**
   * Repli progressif sur un refus de la demande.
   *
   * Un modèle qui n'accepte pas un réglage optionnel ne doit jamais coûter la
   * génération à l'utilisateur · on retire d'abord les paramètres de variante,
   * puis la taille, avant d'abandonner. Ce qui reste (la description et les
   * références) est le strict nécessaire, et tous les modèles l'acceptent.
   *
   * Chaque repli est tenté UNE fois · au-delà on ne s'acharne pas, le refus
   * porte alors sur autre chose que ces réglages.
   */
  let res = await call(body);
  const refuse = () => !res.ok && (res.status === 422 || res.status === 400);

  if (refuse() && extras) {
    const sansExtras = { ...body };
    for (const k of Object.keys(extras)) delete sansExtras[k];
    res = await call(sansExtras);
  }
  if (refuse() && (body.image_size || body.aspect_ratio)) {
    const minimal = { ...body };
    if (extras) for (const k of Object.keys(extras)) delete minimal[k];
    delete minimal.image_size;
    delete minimal.aspect_ratio;
    res = await call(minimal);
  }

  if (!res.ok) {
    // Le corps de la réponse dit CE QUI a été refusé · sans lui, « 422 » ne
    // permet ni de corriger le catalogue, ni de savoir quel réglage retirer.
    throw new Error(`Source image (${model}) : ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const images = collectUrls(data);
  if (images.length === 0) throw new Error("Réponse inattendue de la source image (aucune image renvoyée).");
  return { images };
}

/* ------------------------------- Vidéo (Kling 2, async) ------------------------------- */
export interface FalVideoInput { prompt: string; imageUrl?: string; aspectRatio?: FalAspect; durationS?: number }
export interface FalVideoJob { status: 'queued' | 'processing' | 'completed' | 'failed'; videoUrl?: string; error?: string }

// jobId : on encode les URLs de suivi renvoyées par Fal (« falq|statusUrl|responseUrl »),
// c'est la seule méthode fiable ; sinon rétro-compat « model::id ».
const encodeJob = (model: string, id: string) => `${model}::${id}`;
export function isFalJob(jobId: string): boolean { return jobId.startsWith('falq|') || jobId.includes('::'); }

/** Soumet une génération vidéo (Kling via file d'attente Fal) → renvoie le jobId. */
export async function falSubmitVideo(cfg: FalConfig, input: FalVideoInput): Promise<{ jobId: string }> {
  const model = input.imageUrl ? cfg.videoModelI2V : cfg.videoModel;
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: String(input.durationS ?? 5),
  };
  // aspect_ratio uniquement en texte -> vidéo (en image -> vidéo, Kling déduit le ratio de l'image).
  if (input.imageUrl) body.image_url = input.imageUrl;
  else body.aspect_ratio = input.aspectRatio ?? '9:16';

  const res = await fetch(`${cfg.queueUrl}/${model}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Key ${cfg.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Source vidéo : ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as Record<string, unknown>;
  // Fal renvoie les URLs exactes de suivi : on les utilise telles quelles (fiable, pas de reconstruction).
  const statusUrl = pickString(data, ['status_url']);
  const responseUrl = pickString(data, ['response_url']);
  if (statusUrl && responseUrl) return { jobId: `falq|${statusUrl}|${responseUrl}` };
  const id = pickString(data, ['request_id', 'requestId', 'id']);
  if (!id) throw new Error("Réponse inattendue de la source vidéo (identifiant absent).");
  return { jobId: encodeJob(model, id) };
}

/** Interroge un job vidéo Fal. */
export async function falGetVideo(cfg: FalConfig, jobId: string): Promise<FalVideoJob> {
  let statusUrl: string, responseUrl: string;
  if (jobId.startsWith('falq|')) {
    const parts = jobId.split('|');
    if (!parts[1] || !parts[2]) return { status: 'failed', error: 'Job invalide.' };
    statusUrl = parts[1]; responseUrl = parts[2];
  } else {
    const [model, id] = jobId.split('::');
    if (!model || !id) return { status: 'failed', error: 'Job invalide.' };
    // Rétro-compat : le suivi Fal se fait sur l'app de base (2 premiers segments), pas le chemin complet.
    const app = model.split('/').slice(0, 2).join('/');
    statusUrl = `${cfg.queueUrl}/${app}/requests/${encodeURIComponent(id)}/status`;
    responseUrl = `${cfg.queueUrl}/${app}/requests/${encodeURIComponent(id)}`;
  }

  const st = await fetch(statusUrl, { headers: { authorization: `Key ${cfg.apiKey}` }, signal: AbortSignal.timeout(20000) });
  // Job introuvable/expiré (404/410/422) : on considère l'échec plutôt que de tourner en rond.
  if (st.status === 404 || st.status === 410 || st.status === 422) return { status: 'failed', error: 'Job introuvable ou expiré côté fournisseur.' };
  if (!st.ok) return { status: 'processing' }; // erreur transitoire : on réessaiera
  const sd = (await st.json()) as Record<string, unknown>;
  const raw = (pickString(sd, ['status']) ?? 'IN_PROGRESS').toUpperCase();
  if (/ERROR|FAIL|CANCEL/.test(raw)) return { status: 'failed', error: 'La génération vidéo a échoué côté fournisseur.' };
  if (/QUEUE/.test(raw)) return { status: 'queued' };
  if (!/COMPLET/.test(raw)) return { status: 'processing' };

  const rr = await fetch(responseUrl, { headers: { authorization: `Key ${cfg.apiKey}` }, signal: AbortSignal.timeout(20000) });
  if (!rr.ok) return { status: 'failed', error: `La vidéo n'a pas pu être récupérée (${rr.status}).` };
  const rd = (await rr.json()) as Record<string, unknown>;
  const nested = (rd.video ?? rd.output ?? rd.data ?? {}) as Record<string, unknown>;
  const videoUrl = pickString(rd, ['video_url', 'url']) ?? pickString(nested, ['url', 'video_url'])
    ?? (Array.isArray(rd.videos) ? pickString((rd.videos[0] ?? {}) as Record<string, unknown>, ['url', 'video_url']) : undefined);
  return videoUrl ? { status: 'completed', videoUrl } : { status: 'failed', error: 'Vidéo introuvable dans la réponse.' };
}
