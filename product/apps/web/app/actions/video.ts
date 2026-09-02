'use server';

import { and, desc, eq, or, isNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { higgsfieldFromEnv, hfSubmitVideo, hfSubmitImageVideo, hfGetJob, falFromEnv, falSubmitVideo, falGetVideo, isFalJob } from '@tiktrends/integrations';
import { suggestVideoBrief } from '@tiktrends/ai';
import { costFor, safeVideoDuration, videoUnits } from '@tiktrends/core';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { logAndTranslate } from '../../lib/error-log';
import { guardedAnthropic, guardFixedCost } from '../../lib/spend-guard';
import { GUARD } from '../../lib/guard-error';
import { resolvePreset } from './presets';
import { jarvisMemoryWithUse } from '../../lib/jarvis-memory';

/**
 * Ce que Jarvis sait, versé dans le brief vidéo.
 *
 * ── Le format le plus cher était le seul aveugle ─────────────────────────────
 *
 * Les pubs et les images reçoivent la mémoire mesurée de la marque · la vidéo
 * partait avec la seule phrase tapée. C'est pourtant le poste où une créa ratée
 * coûte le plus : plusieurs fois une image, et par tranches de cinq secondes.
 *
 * ── Ce qu'on injecte, et ce qu'on n'injecte pas ──────────────────────────────
 *
 * Les chiffres mesurés de la marque, coupés court. Pas les accroches mot pour
 * mot · une vidéo n'a pas d'accroche incrustée, leur place serait dans le script
 * et il n'y a pas de script ici.
 *
 * `memoryUse` est consigné dans la génération, comme pour les pubs · c'est ce
 * qui permettra un jour de dire si la mémoire aide AUSSI en vidéo. Sans cette
 * trace, la question ne se poserait jamais faute de données.
 */
async function avecMemoire(prompt: string, brandId: string | null, workspaceId: string) {
  if (!brandId) return { brief: prompt, use: undefined };
  try {
    const m = await jarvisMemoryWithUse(brandId, workspaceId);
    const texte = m.text?.trim();
    if (!texte) return { brief: prompt, use: m.use };
    return {
      brief: `${prompt}\n\nCe que cette marque a MESURÉ sur ses propres tests (applique-le, ne le cite pas) :\n${texte.slice(0, 1200)}`,
      use: m.use,
    };
  } catch {
    // Une mémoire illisible ne doit pas empêcher de générer · on part sans.
    return { brief: prompt, use: undefined };
  }
}

/**
 * Applique le prompt maison au brief vidéo.
 *
 * ── Le défaut que ça répare ──────────────────────────────────────────────────
 *
 * `presetId` était **consigné dans la génération et jamais appliqué**. Choisir
 * une scène enregistrée ne changeait donc rien à la vidéo produite.
 *
 * C'est pire que de ne rien faire : la génération portait quand même le preset,
 * et le classement « quel prompt gagne » lui attribuait des verdicts qu'il
 * n'avait pas produits. On mesurait l'effet d'un réglage inopérant.
 *
 * ── Le prompt maison passe APRÈS la demande ──────────────────────────────────
 *
 * La description est ce que la personne veut voir ; le prompt maison est une
 * direction artistique. Le mettre devant ferait de la demande une nuance de la
 * DA, alors que c'est l'inverse.
 */
function avecPreset(prompt: string, preset: { prompt: string; negative: string | null } | null): string {
  if (!preset) return prompt;
  const da = preset.prompt.trim();
  const sans = preset.negative?.trim();
  return [prompt, da ? `Art direction: ${da}` : '', sans ? `Avoid: ${sans}` : '']
    .filter(Boolean).join('\n\n');
}

export interface VideoStart { error?: string; jobId?: string; generationId?: string }

export interface VideoStatus { status: 'queued' | 'processing' | 'completed' | 'failed' | 'unknown'; videoUrl?: string; error?: string }
export interface BrandVideo { id: string; prompt: string; mode: string; status: string; jobId: string | null; videoUrl: string | null; error?: string; createdAt: string; rating?: import('./creatives').Rating }

/**
 * Trace la génération vidéo. Le débit, lui, est fait AVANT la soumission du job
 * (reserveCredits) : une vidéo lancée est un coût déjà engagé chez le fournisseur.
 */
async function recordGeneration(
  brandId: string | null, cost: number,
  input: Record<string, unknown>, jobId: string, unlimited = false,
): Promise<string | undefined> {
  if (!db || !brandId) return undefined;
  const [g] = await db.insert(schema.generations).values({
    brandId, kind: 'video', input, jobId, status: 'processing', creditsCost: unlimited ? 0 : cost,
  }).returning();
  return g?.id;
}

/** Texte → vidéo (gated + débit crédits). */
export async function startVideoAction(input: { prompt: string; aspectRatio?: '9:16' | '1:1' | '16:9'; durationS?: number; presetId?: string }): Promise<VideoStart> {
  const s = await getSession();
  if (!s) return { error: GUARD.session() };
  const prompt = input.prompt?.trim();
  if (!prompt) return { error: 'Décris la vidéo à générer.' };

  const fal = falFromEnv();
  const hf = fal ? null : higgsfieldFromEnv();
  if (!fal && !hf) return { error: "La vidéo IA n'est pas encore activée (clé serveur manquante)." };

  const duree = safeVideoDuration(input.durationS);
  const cost = costFor('video') * videoUnits(duree);
  const unlimited = unlimitedCredits(s.user.email);
  // Débit atomique avant la soumission (remboursé si le lancement échoue).
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · vidéo IA'))) {
    return { error: `Crédits insuffisants (${cost} requis pour une vidéo de ${duree} s).` };
  }

  try {
    // La vidéo est le poste qui peut faire déraper une facture en quelques clics ·
    // le forfait appliqué est nettement supérieur à celui d'une image, et il
    // compte en unités de cinq secondes.
    await guardFixedCost('fal_video', { action: 'video:t2v', workspaceId: s.workspaceId, units: videoUnits(duree) });
    // La marque est lue AVANT la soumission · sa mémoire doit entrer dans le
    // brief, pas être consignée après coup sur une vidéo qui n'en a rien su.
    const brand = await getActiveBrand(s.workspaceId);
    const memo = await avecMemoire(prompt, brand?.id ?? null, s.workspaceId);
    const briefT2v = avecPreset(memo.brief, await resolvePreset(s.workspaceId, input.presetId));
    const { jobId } = fal
      ? await falSubmitVideo(fal, { prompt: briefT2v, aspectRatio: input.aspectRatio ?? '9:16', durationS: duree })
      : await hfSubmitVideo(hf!, { prompt: briefT2v, aspectRatio: input.aspectRatio ?? '9:16', durationS: duree });
    const generationId = await recordGeneration(brand?.id ?? null, cost, { mode: 't2v', prompt, aspectRatio: input.aspectRatio ?? '9:16', durationS: duree, ...(memo.use ? { memoryUse: memo.use } : {}), ...(input.presetId ? { presetId: input.presetId } : {}) }, jobId, unlimited);
    return { jobId, generationId };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · vidéo non lancée');
    return { error: logAndTranslate('video:start', e, { subject: 'le lancement de la vidéo', workspaceId: s.workspaceId }) };
  }
}

/** Image → vidéo (anime une image de départ). */
export async function startImageVideoAction(input: { prompt: string; imageUrl: string; aspectRatio?: '9:16' | '1:1' | '16:9'; durationS?: number; presetId?: string }): Promise<VideoStart> {
  const s = await getSession();
  if (!s) return { error: GUARD.session() };
  const prompt = input.prompt?.trim();
  const imageUrl = input.imageUrl?.trim();
  if (!imageUrl) return { error: 'Choisis une image de départ (produit ou pub).' };
  if (!/^https?:\/\//i.test(imageUrl) && !/^data:image\//i.test(imageUrl)) return { error: "L'image doit être un lien http(s) ou une image importée." };

  const fal = falFromEnv();
  const hf = fal ? null : higgsfieldFromEnv();
  if (!fal && !hf) return { error: "La vidéo IA n'est pas encore activée (clé serveur manquante)." };

  const duree = safeVideoDuration(input.durationS);
  const cost = costFor('video') * videoUnits(duree);
  const unlimited = unlimitedCredits(s.user.email);
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · vidéo IA'))) {
    return { error: `Crédits insuffisants (${cost} requis pour une vidéo de ${duree} s).` };
  }

  const motion = prompt || 'Anime cette image de façon naturelle et cinématographique.';
  try {
    await guardFixedCost('fal_video', { action: 'video:i2v', workspaceId: s.workspaceId, units: videoUnits(duree) });
    const brand = await getActiveBrand(s.workspaceId);
    const memo = await avecMemoire(motion, brand?.id ?? null, s.workspaceId);
    const briefI2v = avecPreset(memo.brief, await resolvePreset(s.workspaceId, input.presetId));
    const { jobId } = fal
      ? await falSubmitVideo(fal, { prompt: briefI2v, imageUrl, aspectRatio: input.aspectRatio ?? '9:16', durationS: duree })
      : await hfSubmitImageVideo(hf!, { prompt: briefI2v, imageUrl, aspectRatio: input.aspectRatio ?? '9:16', durationS: duree });
    const generationId = await recordGeneration(brand?.id ?? null, cost, { mode: 'i2v', prompt, imageUrl, aspectRatio: input.aspectRatio ?? '9:16', durationS: duree, ...(memo.use ? { memoryUse: memo.use } : {}), ...(input.presetId ? { presetId: input.presetId } : {}) }, jobId, unlimited);
    return { jobId, generationId };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · vidéo non lancée');
    return { error: logAndTranslate('video:start', e, { subject: 'le lancement de la vidéo', workspaceId: s.workspaceId }) };
  }
}

/** Historique des vidéos de la marque active (pour la galerie). */
export async function listBrandVideos(): Promise<BrandVideo[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return [];
  const rows = await db.select({
    id: schema.generations.id, input: schema.generations.input, output: schema.generations.output,
    status: schema.generations.status, jobId: schema.generations.jobId,
    assetUrls: schema.generations.assetUrls, createdAt: schema.generations.createdAt,
  }).from(schema.generations)
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
      await refundCredits(workspaceId, g.cost ?? 0, 'Studio · vidéo échouée (remboursement)');
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
    return { status: 'unknown', error: logAndTranslate('video:poll', e, { subject: 'le suivi du rendu', workspaceId: s.workspaceId }) };
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
  if (!s) return { error: GUARD.session() };
  const client = guardedAnthropic({ action: 'video' });
  if (!client) return { error: GUARD.aiOff() };
  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('suggest');
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · consigne vidéo suggérée'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
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
    return { text: text || undefined };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · consigne vidéo');
    return { error: logAndTranslate('video:brief', e, { subject: 'la proposition de consigne', workspaceId: s.workspaceId }) };
  }
}

/** Supprime une vidéo (rendu raté ou bloqué) de la galerie de la marque. */
export async function deleteVideoAction(id: string): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };
  await db.delete(schema.generations)
    .where(and(eq(schema.generations.id, id), eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'video')));
  return { ok: true };
}
