'use server';

import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { higgsfieldFromEnv, hfSubmitVideo, hfSubmitImageVideo, hfGetJob } from '@tiktrends/integrations';
import { costFor } from '@tiktrends/core';

export interface VideoStart { error?: string; jobId?: string; generationId?: string }
export interface VideoStatus { status: 'queued' | 'processing' | 'completed' | 'failed' | 'unknown'; videoUrl?: string; error?: string }
export interface BrandVideo { id: string; prompt: string; mode: string; status: string; jobId: string | null; videoUrl: string | null; createdAt: string }

async function debitAndRecord(
  workspaceId: string, brandId: string | null, cost: number,
  input: Record<string, unknown>, jobId: string,
): Promise<string | undefined> {
  let generationId: string | undefined;
  if (!db) return undefined;
  if (brandId) {
    const [g] = await db.insert(schema.generations).values({
      brandId, kind: 'video', input, jobId, status: 'processing', creditsCost: cost,
    }).returning();
    generationId = g?.id;
  }
  try {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
    await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, (w?.c ?? 0) - cost) }).where(eq(schema.workspaces.id, workspaceId));
    await db.insert(schema.creditLedger).values({ workspaceId, delta: -cost, reason: 'Studio — vidéo IA' });
  } catch { /* débit best-effort */ }
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

  const cfg = higgsfieldFromEnv();
  if (!cfg) return { error: "La vidéo IA n'est pas encore activée (clé serveur manquante)." };

  const cost = costFor('video');
  const short = await ensureCredits(s.workspaceId, cost);
  if (short) return { error: short };

  try {
    const { jobId } = await hfSubmitVideo(cfg, { prompt, aspectRatio: input.aspectRatio ?? '9:16', durationS: input.durationS ?? 5 });
    const brand = await getActiveBrand(s.workspaceId);
    const generationId = await debitAndRecord(s.workspaceId, brand?.id ?? null, cost, { mode: 't2v', prompt, aspectRatio: input.aspectRatio ?? '9:16' }, jobId);
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
  if (!imageUrl) return { error: "Ajoute l'URL d'une image de départ." };
  if (!/^https?:\/\//i.test(imageUrl)) return { error: "L'URL de l'image doit commencer par http(s)." };

  const cfg = higgsfieldFromEnv();
  if (!cfg) return { error: "La vidéo IA n'est pas encore activée (clé serveur manquante)." };

  const cost = costFor('video');
  const short = await ensureCredits(s.workspaceId, cost);
  if (short) return { error: short };

  try {
    const { jobId } = await hfSubmitImageVideo(cfg, { prompt: prompt || 'Anime cette image de façon naturelle et cinématographique.', imageUrl, aspectRatio: input.aspectRatio ?? '9:16', durationS: input.durationS ?? 5 });
    const brand = await getActiveBrand(s.workspaceId);
    const generationId = await debitAndRecord(s.workspaceId, brand?.id ?? null, cost, { mode: 'i2v', prompt, imageUrl, aspectRatio: input.aspectRatio ?? '9:16' }, jobId);
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
  return rows.map((g) => {
    const input = (g.input ?? {}) as { prompt?: string; mode?: string };
    return {
      id: g.id, prompt: input.prompt || '(sans description)', mode: input.mode || 't2v',
      status: g.status || 'processing', jobId: g.jobId, videoUrl: (g.assetUrls && g.assetUrls[0]) || null,
      createdAt: (g.createdAt as Date).toISOString(),
    };
  });
}

/** Interroge le statut d'un job vidéo (appelé en polling par le client). */
export async function pollVideoAction(jobId: string, generationId?: string): Promise<VideoStatus> {
  const s = await getSession();
  if (!s) return { status: 'unknown', error: 'Session expirée.' };
  const cfg = higgsfieldFromEnv();
  if (!cfg) return { status: 'unknown', error: 'Vidéo IA non configurée.' };
  try {
    const job = await hfGetJob(cfg, jobId);
    if (db && generationId && (job.status === 'completed' || job.status === 'failed')) {
      try {
        await db.update(schema.generations)
          .set({ status: job.status, assetUrls: job.videoUrl ? [job.videoUrl] : [] })
          .where(eq(schema.generations.id, generationId));
      } catch { /* best-effort */ }
    }
    return { status: job.status, videoUrl: job.videoUrl, error: job.error };
  } catch (e) {
    return { status: 'unknown', error: (e as Error).message };
  }
}
