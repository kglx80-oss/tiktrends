/**
 * Intégration Fal.ai — génération d'images (et, plus tard, vidéos) IA.
 *
 * Fal expose une API synchrone simple : POST https://fal.run/{model} avec la clé
 * en en-tête « Authorization: Key <FAL_KEY> ». Les images reviennent directement.
 *
 * Configurable par variables d'environnement :
 *   FAL_KEY              (obligatoire pour activer)
 *   FAL_BASE_URL         (def: https://fal.run)
 *   FAL_IMAGE_MODEL      (def: fal-ai/flux/dev)            — texte -> image
 *   FAL_IMAGE_MODEL_I2I  (def: fal-ai/flux/dev/image-to-image) — image -> image
 *   FAL_IMAGE_MODEL_TEXT (def: fal-ai/ideogram/v3)         — image avec texte lisible
 */

export interface FalConfig {
  apiKey: string;
  baseUrl: string;
  imageModel: string;
  imageModelI2I: string;
  imageModelText: string;
}

export type FalAspect = '9:16' | '1:1' | '16:9' | '4:5';
export interface FalImageInput { prompt: string; aspectRatio?: FalAspect; imageUrl?: string; withText?: boolean; count?: number }
export interface FalImageResult { images: string[] }

export function falFromEnv(): FalConfig | null {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.FAL_BASE_URL || 'https://fal.run',
    imageModel: process.env.FAL_IMAGE_MODEL || 'fal-ai/flux/dev',
    imageModelI2I: process.env.FAL_IMAGE_MODEL_I2I || 'fal-ai/flux/dev/image-to-image',
    imageModelText: process.env.FAL_IMAGE_MODEL_TEXT || 'fal-ai/ideogram/v3',
  };
}

export function falConfigured(): boolean {
  return Boolean(process.env.FAL_KEY);
}

// Correspondance ratio -> image_size Fal (Flux/Ideogram).
const IMAGE_SIZE: Record<FalAspect, string> = {
  '9:16': 'portrait_16_9', '4:5': 'portrait_4_3', '1:1': 'square_hd', '16:9': 'landscape_16_9',
};

function collectUrls(data: Record<string, unknown>): string[] {
  const imgs = (data.images ?? data.image ?? []) as unknown;
  const arr = Array.isArray(imgs) ? imgs : imgs ? [imgs] : [];
  return arr.map((x) => (typeof x === 'string' ? x : (x as { url?: string })?.url)).filter((u): u is string => !!u);
}

/** Génère une ou plusieurs images. Choisit le modèle selon le besoin (image de départ / texte lisible). */
export async function falGenerateImage(cfg: FalConfig, input: FalImageInput): Promise<FalImageResult> {
  const model = input.imageUrl ? cfg.imageModelI2I : input.withText ? cfg.imageModelText : cfg.imageModel;
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    image_size: IMAGE_SIZE[input.aspectRatio ?? '1:1'],
    num_images: Math.min(4, Math.max(1, input.count ?? 1)),
  };
  if (input.imageUrl) body.image_url = input.imageUrl;

  const res = await fetch(`${cfg.baseUrl}/${model}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Key ${cfg.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`Source image : ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as Record<string, unknown>;
  const images = collectUrls(data);
  if (images.length === 0) throw new Error("Réponse inattendue de la source image (aucune image renvoyée).");
  return { images };
}
