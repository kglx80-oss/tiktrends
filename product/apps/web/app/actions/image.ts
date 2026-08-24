'use server';

import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { falFromEnv, falGenerateImage, type FalAspect } from '@tiktrends/integrations';
import { anthropicFromEnv, enhanceImagePrompt } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits } from '../../lib/credits';

export interface ImageResult { error?: string; images?: string[]; prompt?: string }
export interface BrandImage { id: string; prompt: string; url: string | null; createdAt: string }

export async function generateImageAction(input: {
  prompt: string; aspectRatio?: FalAspect; imageUrl?: string; withText?: boolean; enhance?: boolean; count?: number;
  productId?: string; headline?: string;
}): Promise<ImageResult> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée, reconnecte-toi.' };
  const desc = input.prompt?.trim();
  if (!desc) return { error: "Décris l'image à générer." };

  const cfg = falFromEnv();
  if (!cfg) return { error: "La génération d'image n'est pas activée (clé Fal manquante)." };

  const count = Math.min(4, Math.max(1, input.count ?? 1));
  const cost = costFor('image', count);
  const unlimited = unlimitedCredits(s.user.email);
  let credits = 0;
  if (db) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    credits = w?.c ?? 0;
    if (!unlimited && credits < cost) return { error: `Crédits insuffisants (${cost} requis pour ${count} image(s)).` };
  }

  const brand = await getActiveBrand(s.workspaceId);

  // Contexte marque (DA) + produit sélectionné, pour ancrer la génération.
  let da: { colors?: string[] | null; tone?: string | null; usp?: string | null; description?: string | null } = {};
  let product: { name: string; description: string | null } | null = null;
  if (db && brand) {
    const [row] = await db.select({ colors: schema.brands.colors, tone: schema.brands.tone, usp: schema.brands.usp, description: schema.brands.description })
      .from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
    da = row ?? {};
    if (input.productId) {
      const [p] = await db.select({ name: schema.products.name, description: schema.products.description })
        .from(schema.products).where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
      if (p) product = p;
    }
  }

  // Optimisation du prompt par Claude (ancrée marque + produit + texte).
  let prompt = desc;
  if (input.enhance) {
    const client = anthropicFromEnv();
    if (client) {
      try {
        prompt = await enhanceImagePrompt(client, desc, {
          brand: brand?.name, tone: da.tone ?? undefined, colors: da.colors ?? undefined, usp: da.usp ?? undefined,
          productName: product?.name, productDesc: product?.description ?? undefined,
          withText: input.withText, headline: input.headline?.trim() || undefined, product: !!input.imageUrl,
        });
      } catch { /* on garde la description brute */ }
    }
  }

  try {
    const { images } = await falGenerateImage(cfg, { prompt, aspectRatio: input.aspectRatio ?? '1:1', imageUrl: input.imageUrl, withText: input.withText, count });
    if (db) {
      if (brand) {
        try { await db.insert(schema.generations).values({ brandId: brand.id, kind: 'image', input: { prompt, aspectRatio: input.aspectRatio ?? '1:1' }, status: 'completed', assetUrls: images, creditsCost: unlimited ? 0 : cost }); } catch { /* ignore */ }
      }
      if (!unlimited) {
        try {
          await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, credits - cost) }).where(eq(schema.workspaces.id, s.workspaceId));
          await db.insert(schema.creditLedger).values({ workspaceId: s.workspaceId, delta: -cost, reason: 'Studio — image IA' });
        } catch { /* débit best-effort */ }
      }
    }
    return { images, prompt };
  } catch (e) {
    const msg = (e as Error).message || '';
    if (/image_load_error|Failed to load the image|422/.test(msg) && input.imageUrl) {
      return { error: "Impossible de charger l'image de départ. L'URL doit pointer vers un fichier image direct (jpg, png, webp) et être public — pas une page produit. Astuce : clic droit sur l'image du produit → « Copier l'adresse de l'image »." };
    }
    return { error: 'Échec de la génération : ' + msg };
  }
}

export async function listBrandImages(): Promise<BrandImage[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return [];
  const rows = await db.select().from(schema.generations)
    .where(and(eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'image')))
    .orderBy(desc(schema.generations.createdAt)).limit(24);
  const out: BrandImage[] = [];
  for (const g of rows) {
    const input = (g.input ?? {}) as { prompt?: string };
    for (const url of g.assetUrls ?? []) out.push({ id: g.id + ':' + url, prompt: input.prompt || '', url, createdAt: (g.createdAt as Date).toISOString() });
  }
  return out;
}
