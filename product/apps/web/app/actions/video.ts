'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { higgsfieldFromEnv, hfSubmitVideo, hfGetJob } from '@tiktrends/integrations';
import { costFor } from '@tiktrends/core';

export interface VideoStart { error?: string; jobId?: string; generationId?: string }
export interface VideoStatus { status: 'queued' | 'processing' | 'completed' | 'failed' | 'unknown'; videoUrl?: string; error?: string }

/** Lance une génération vidéo Higgsfield (gated + débit crédits). */
export async function startVideoAction(input: { prompt: string; aspectRatio?: '9:16' | '1:1' | '16:9'; durationS?: number }): Promise<VideoStart> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée, reconnecte-toi.' };
  const prompt = input.prompt?.trim();
  if (!prompt) return { error: 'Décris la vidéo à générer.' };

  const cfg = higgsfieldFromEnv();
  if (!cfg) return { error: "La vidéo IA n'est pas encore activée (clé serveur manquante)." };

  const cost = costFor('video');
  let credits = 0;
  if (db) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    credits = w?.c ?? 0;
    if (credits < cost) return { error: `Crédits insuffisants (${cost} requis pour une vidéo).` };
  }

  try {
    const { jobId } = await hfSubmitVideo(cfg, { prompt, aspectRatio: input.aspectRatio ?? '9:16', durationS: input.durationS ?? 5 });
    let generationId: string | undefined;
    if (db) {
      const brand = await getActiveBrand(s.workspaceId);
      if (brand) {
        const [g] = await db.insert(schema.generations).values({
          brandId: brand.id, kind: 'video', input: { prompt, aspectRatio: input.aspectRatio ?? '9:16' },
          jobId, status: 'processing', creditsCost: cost,
        }).returning();
        generationId = g?.id;
      }
      try {
        await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, credits - cost) }).where(eq(schema.workspaces.id, s.workspaceId));
        await db.insert(schema.creditLedger).values({ workspaceId: s.workspaceId, delta: -cost, reason: 'Studio — vidéo IA' });
      } catch { /* débit best-effort */ }
    }
    return { jobId, generationId };
  } catch (e) {
    return { error: 'Échec du lancement : ' + (e as Error).message };
  }
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
