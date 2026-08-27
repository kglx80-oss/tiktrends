'use server';

import { and, desc, eq, or, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { higgsfieldFromEnv, hfSubmitVideo, hfSubmitImageVideo, hfGetJob, falFromEnv, falSubmitVideo, falGetVideo, isFalJob } from '@tiktrends/integrations';
import { anthropicFromEnv, suggestVideoBrief } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits } from '../../lib/credits';

/** Fournisseur vidéo actif : Fal (Kling) en priorité, sinon Higgsfield. */
function videoReady(): boolean { return !!falFromEnv() || !!higgsfieldFromEnv(); }

export interface VideoStart { error?: string; jobId?: string; generationId?: string }
export interface VideoStatus { status: 'queued' | 'processing' | 'completed' | 'failed' | 'unknown'; videoUrl?: string; error?: string }
export interface BrandVideo { id: string; prompt: string; mode: string; status: string; jobId: string | null; videoUrl: string | null; error?: string; createdAt: string; rating?: import('./creatives').Rating }

async function debitAndRecord(
  workspaceId: string, brandId: string | null, cost: number,
  input: Record<string, unknown>, jobId: string, unlimited = false,
): Promise<string | undefined> {
  let generationId: string | undefined;
  if (!db) return undefined;
  if (brandId) {
    const [g] = await db.insert(schema.generations).values({
      brandId, kind: 'video', input, jobId, status: 'processing', creditsCost: unlimited ? 0 : cost,
    }).returning();
    generationId = g?.id;
  }
  if (!unlimited) {
    try {
      const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
      await db.update(schema.workspaces).set({ creditsBalance: sql`greatest(0, ${schema.workspaces.creditsBalance} - ${cost})` }).where(eq(schema.workspaces.id, workspaceId));
      await db.insert(schema.creditLedger).values({ workspaceId, delta: -cost, reason: 'Studio · vidéo IA' });
    } catch { /* débit best-effort */ }
  }
  return generationId;
}

async function ensureCredits(workspaceId: string, cost: number): Promise<string | null> {
  if (!db) return null;
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  if ((w?.c ?? 0) < cost) return `Crédits insuffisants (${cost} requis pour une vidéo).`;
  return null;
}

/** Texte → vidéo (gated + débit crédits). */
export async function startVideoAction(input: { prompt: string; aspectRatio?: '9:16' | '1:1' | '16:9'; durationS?: number }): Promise<VideoStart> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée, reconnecte-toi.' };
  const prompt = input.prompt?.trim();
  if (!prompt) return { error: 'Décris la vidéo à générer.' };

  const fal = falFromEnv();
  const hf = fal ? null : higgsfieldFromEnv();
  if (!fal && !hf) return { error: "La vidéo IA n'est pas encore activée (clé serveur manquante)." };

  const cost = costFor('video');
  const unlimited = unlimitedCredits(s.user.email);
  const short = unlimited ? null : await ensureCredits(s.workspaceId, cost);
  if (short) return { error: short };

  try {
    const { jobId } = fal
      ? await falSubmitVideo(fal, { prompt, aspectRatio: input.aspectRatio ?? '9:16', durationS: input.durationS ?? 5 })
      : await hfSubmitVideo(hf!, { prompt, aspectRatio: input.aspectRatio ?? '9:16', durationS: input.durationS ?? 5 });
    const brand = await getActiveBrand(s.workspaceId);
    const generationId = await debitAndRecord(s.workspaceId, brand?.id ?? null, cost, { mode: 't2v', prompt, aspectRatio: input.aspectRatio ?? '9:16' }, jobId, unlimited);
    return { jobId, generationId };
  } catch (e) {
    return { error: 'Échec du lancement : ' + (e as Error).message };
  }
}

/** Image → vidéo (anime une image de départ). */
export async function startImageVideoAction(input: { prompt: string; imageUrl: string; aspectRatio?: '9:16' | '1:1' | '16:9'; durationS?: number }): Promise<VideoStart> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée, reconnecte-toi.' };
  const prompt = input.prompt?.trim();
  const imageUrl = input.imageUrl?.trim();
  if (!imageUrl) return { error: 'Choisis une image de départ (produit ou pub).' };
  if (!/^https?:\/\//i.test(imageUrl) && !/^data:image\//i.test(imageUrl)) return { error: "L'image doit être un lien http(s) ou une image importée." };

  const fal = falFromEnv();
  const hf = fal ? null : higgsfieldFromEnv();
  if (!fal && !hf) return { error: "La vidéo IA n'est pas encore activée (clé serveur manquante)." };

  const cost = costFor('video');
  const unlimited = unlimitedCredits(s.user.email);
  const short = unlimited ? null : await ensureCredits(s.workspaceId, cost);
  if (short) return { error: short };

  const motion = prompt || 'Anime cette image de façon naturelle et cinématographique.';
  try {
    const { jobId } = fal
      ? await falSubmitVideo(fal, { prompt: motion, imageUrl, aspectRatio: input.aspectRatio ?? '9:16', durationS: input.durationS ?? 5 })
      : await hfSubmitImageVideo(hf!, { prompt: motion, imageUrl, aspectRatio: input.aspectRatio ?? '9:16', durationS: input.durationS ?? 5 });
    const brand = await getActiveBrand(s.workspaceId);
    const generationId = await debitAndRecord(s.workspaceId, brand?.id ?? null, cost, { mode: 'i2v', prompt, imageUrl, aspectRatio: input.aspectRatio ?? '9:16' }, jobId, unlimited);
    return { jobId, generationId };
  } catch (e) {
    return { error: 'Échec du lancement : ' + (e as Error).message };
  }
}

/** Historique des vidéos de la marque active (pour la galerie). */
export async function listBrandVideos(): Promise<BrandVideo[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return [];
  const rows = await db.select().from(schema.generations)
    .where(and(eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'video')))
    .orderBy(desc(schema.generations.createdAt)).limit(24);
  return rows.filter((g) => g.status !== 'archived').map((g) => {
    const input = (g.input ?? {}) as { prompt?: string; mode?: string; rating?: import('./creatives').Rating };
    const output = (g.output ?? {}) as { error?: string };
    return {
      id: g.id, prompt: input.prompt || '(sans description)', mode: input.mode || 't2v',
      status: g.status || 'processing', jobId: g.jobId, videoUrl: (g.assetUrls && g.assetUrls[0]) || null,
      error: output.error, createdAt: (g.createdAt as Date).toISOString(), rating: input.rating ?? null,
    };
  });
}

// Au-delà de ce délai sans complétion, on considère le job perdu (évite le spinner infini).
const STALE_MS = 15 * 60 * 1000;

/** Marque une génération vidéo en échec et rembourse les crédits (une seule fois). */
async function failAndRefund(generationId: string, workspaceId: string, error: string): Promise<void> {
  if (!db) return;
  try {
    const [g] = await db.select({ status: schema.generations.status, cost: schema.generations.creditsCost }).from(schema.generations).where(eq(schema.generations.id, generationId)).limit(1);
    await db.update(schema.generations).set({ status: 'failed', output: { error } }).where(eq(schema.generations.id, generationId));
    // Remboursement uniquement à la 1re bascule en échec, et si des crédits avaient été débités.
    if (g && g.status !== 'failed' && g.status !== 'completed' && (g.cost ?? 0) > 0) {
      const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
      await db.update(schema.workspaces).set({ creditsBalance: (w?.c ?? 0) + (g.cost ?? 0) }).where(eq(schema.workspaces.id, workspaceId));
      await db.insert(schema.creditLedger).values({ workspaceId, delta: g.cost ?? 0, reason: 'Studio · vidéo échouée (remboursement)' });
    }
  } catch { /* best-effort */ }
}

/** Interroge le statut d'un job vidéo (appelé en polling par le client). */
export async function pollVideoAction(jobId: string, generationId?: string): Promise<VideoStatus> {
  const s = await getSession();
  if (!s) return { status: 'unknown', error: 'Session expirée.' };
  try {
    let job: VideoStatus;
    if (isFalJob(jobId)) {
      const fal = falFromEnv();
      if (!fal) return { status: 'unknown', error: 'Vidéo IA non configurée.' };
      job = await falGetVideo(fal, jobId);
    } else {
      const hf = higgsfieldFromEnv();
      if (!hf) return { status: 'unknown', error: 'Vidéo IA non configurée.' };
      job = await hfGetJob(hf, jobId);
    }

    // Garde-fou anti-blocage : un job « en cours » trop vieux est déclaré en échec.
    if ((job.status === 'processing' || job.status === 'queued' || job.status === 'unknown') && db && generationId) {
      try {
        const [g] = await db.select({ createdAt: schema.generations.createdAt }).from(schema.generations).where(eq(schema.generations.id, generationId)).limit(1);
        const age = g?.createdAt ? Date.now() - new Date(g.createdAt as Date).getTime() : 0;
        if (age > STALE_MS) {
          const error = 'La génération a pris trop de temps et a été interrompue. Crédits remboursés, relance-la.';
          await failAndRefund(generationId, s.workspaceId, error);
          return { status: 'failed', error };
        }
      } catch { /* best-effort */ }
    }

    if (db && generationId && job.status === 'failed') {
      await failAndRefund(generationId, s.workspaceId, job.error || 'La génération vidéo a échoué.');
      return { status: 'failed', error: (job.error ? job.error + ' · ' : '') + 'Crédits remboursés.' };
    }
    if (db && generationId && job.status === 'completed') {
      try {
        await db.update(schema.generations)
          .set({ status: 'completed', assetUrls: job.videoUrl ? [job.videoUrl] : [] })
          .where(eq(schema.generations.id, generationId));
      } catch { /* best-effort */ }
    }
    return { status: job.status, videoUrl: job.videoUrl, error: job.error };
  } catch (e) {
    return { status: 'unknown', error: (e as Error).message };
  }
}

/** Éléments à animer (image → vidéo) : photos produit + scènes de pubs + bibliothèque Assets. */
export interface AnimatableAsset { url: string; label: string; kind: 'product' | 'ad' | 'asset' }
export async function listAnimatableAssets(): Promise<AnimatableAsset[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return [];
  const out: AnimatableAsset[] = [];

  // Bibliothèque Assets : images (marque + communes) utilisables par l'IA, en URL http (i2v).
  const libImgs = await db.select({ name: schema.assets.name, url: schema.assets.url })
    .from(schema.assets)
    .where(and(
      eq(schema.assets.workspaceId, s.workspaceId),
      eq(schema.assets.kind, 'image'),
      eq(schema.assets.useForAi, true),
      or(eq(schema.assets.brandId, brand.id), isNull(schema.assets.brandId)),
    ))
    .orderBy(desc(schema.assets.createdAt)).limit(24);
  for (const a of libImgs) {
    if (a.url && /^https?:\/\//.test(a.url)) out.push({ url: a.url, label: a.name, kind: 'asset' });
  }

  const prods = await db.select({ name: schema.products.name, imageUrl: schema.products.imageUrl, imageUrls: schema.products.imageUrls })
    .from(schema.products).where(eq(schema.products.brandId, brand.id));
  for (const p of prods) {
    const url = (p.imageUrls && p.imageUrls[0]) || p.imageUrl;
    if (url) out.push({ url, label: p.name, kind: 'product' });
  }

  const ads = await db.select({ input: schema.generations.input, assetUrls: schema.generations.assetUrls })
    .from(schema.generations)
    .where(and(eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad')))
    .orderBy(desc(schema.generations.createdAt)).limit(12);
  for (const a of ads) {
    const url = a.assetUrls && a.assetUrls[0];
    if (url && /^https?:\/\//.test(url)) {
      const rec = (a.input ?? {}) as { headline?: string };
      out.push({ url, label: rec.headline || 'Scène de pub', kind: 'ad' });
    }
  }
  return out;
}

/** Propose une consigne de mouvement (ancrée marque/produit) pour la vidéo. */
export async function suggestVideoBriefAction(input: { productId?: string; fromImage?: boolean }): Promise<{ text?: string; error?: string }> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée.' };
  const client = anthropicFromEnv();
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };
  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('suggest');
  if (!unlimited && db) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    if ((w?.c ?? 0) < cost) return { error: `Crédits insuffisants (${cost} requis).` };
  }
  const brand = await getActiveBrand(s.workspaceId);
  let tone: string | null = null;
  let creativeRules: string | null = null;
  let product: { name: string; description: string | null } | null = null;
  if (db && brand) {
    const [row] = await db.select({ tone: schema.brands.tone, creativeRules: schema.brands.creativeRules }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
    tone = row?.tone ?? null;
    creativeRules = row?.creativeRules ?? null;
    if (input.productId) {
      const [p] = await db.select({ name: schema.products.name, description: schema.products.description })
        .from(schema.products).where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
      if (p) product = p;
    }
  }
  try {
    const text = await suggestVideoBrief(client, { brand: brand?.name, tone: tone ?? undefined, productName: product?.name, productDesc: product?.description ?? undefined, fromImage: input.fromImage, edenRules: creativeRules ?? undefined });
    if (!unlimited && db) {
      const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
      await db.update(schema.workspaces).set({ creditsBalance: sql`greatest(0, ${schema.workspaces.creditsBalance} - ${cost})` }).where(eq(schema.workspaces.id, s.workspaceId));
    }
    return { text: text || undefined };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Supprime une vidéo (rendu raté ou bloqué) de la galerie de la marque. */
export async function deleteVideoAction(id: string): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };
  await db.delete(schema.generations)
    .where(and(eq(schema.generations.id, id), eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'video')));
  return { ok: true };
}
