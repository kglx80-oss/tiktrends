'use server';

import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { falFromEnv, falGenerateImage, type FalAspect } from '@tiktrends/integrations';
import { anthropicFromEnv, enhanceImagePrompt, suggestImageBrief } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits } from '../../lib/credits';

export interface ImageResult { error?: string; images?: string[]; prompt?: string }
export interface BrandImage { id: string; prompt: string; url: string | null; createdAt: string }

export async function generateImageAction(input: {
  prompt: string; aspectRatio?: FalAspect; imageUrl?: string; withText?: boolean; enhance?: boolean; count?: number;
  productId?: string; headline?: string; useProductImage?: boolean;
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
  let product: { name: string; description: string | null; imageUrl: string | null } | null = null;
  if (db && brand) {
    const [row] = await db.select({ colors: schema.brands.colors, tone: schema.brands.tone, usp: schema.brands.usp, description: schema.brands.description })
      .from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
    da = row ?? {};
    if (input.productId) {
      const [p] = await db.select({ name: schema.products.name, description: schema.products.description, imageUrl: schema.products.imageUrl })
        .from(schema.products).where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
      if (p) product = p;
    }
  }

  // Source produit : photo fournie (upload ponctuel) OU photo enregistrée sur le produit (si autorisée).
  // Si l'une des deux existe, on passe en édition fidèle (Kontext) pour garder le vrai packaging.
  const sourceImage = input.imageUrl?.trim() || (input.useProductImage ? product?.imageUrl || undefined : undefined);
  const editMode = !!sourceImage;

  // Optimisation du prompt par Claude (ancrée marque + produit + texte).
  let prompt = desc;
  if (input.enhance) {
    const client = anthropicFromEnv();
    if (client) {
      try {
        prompt = await enhanceImagePrompt(client, desc, {
          brand: brand?.name, tone: da.tone ?? undefined, colors: da.colors ?? undefined, usp: da.usp ?? undefined,
          productName: product?.name, productDesc: product?.description ?? undefined,
          withText: input.withText, headline: input.headline?.trim() || undefined, product: editMode, edit: editMode,
        });
      } catch { /* on garde la description brute */ }
    }
  }

  try {
    const { images } = await falGenerateImage(cfg, { prompt, aspectRatio: input.aspectRatio ?? '1:1', imageUrl: sourceImage, withText: input.withText, count, edit: editMode });
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
    if (/image_load_error|Failed to load the image|422/.test(msg) && sourceImage) {
      return { error: "Impossible de charger l'image de départ. L'URL doit pointer vers un fichier image direct (jpg, png, webp) et être public — pas une page produit. Astuce : clic droit sur l'image du produit → « Copier l'adresse de l'image »." };
    }
    return { error: 'Échec de la génération : ' + msg };
  }
}

/** Propose une description d'image ancrée sur la marque + produit sélectionné. */
export async function suggestImageBriefAction(input: { productId?: string }): Promise<{ text?: string; error?: string }> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée.' };
  const client = anthropicFromEnv();
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };

  const brand = await getActiveBrand(s.workspaceId);
  let da: { colors?: string[] | null; tone?: string | null; usp?: string | null; audience?: string | null } = {};
  let product: { name: string; description: string | null } | null = null;
  if (db && brand) {
    const [row] = await db.select({ colors: schema.brands.colors, tone: schema.brands.tone, usp: schema.brands.usp, audience: schema.brands.audience })
      .from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
    da = row ?? {};
    if (input.productId) {
      const [p] = await db.select({ name: schema.products.name, description: schema.products.description })
        .from(schema.products).where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
      if (p) product = p;
    }
  }
  try {
    const text = await suggestImageBrief(client, {
      brand: brand?.name, tone: da.tone ?? undefined, colors: da.colors ?? undefined,
      usp: da.usp ?? undefined, audience: da.audience ?? undefined,
      productName: product?.name, productDesc: product?.description ?? undefined,
    });
    return { text: text || undefined };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Enregistre (ou retire) la photo réelle d'un produit — réutilisée pour la mise en scène. */
export async function setProductImageAction(input: { productId: string; dataUri?: string | null }): Promise<{ ok?: true; imageUrl?: string | null; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };

  const [p] = await db.select({ id: schema.products.id }).from(schema.products)
    .where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
  if (!p) return { error: 'Produit introuvable.' };

  const uri = input.dataUri?.trim() || '';
  if (uri) {
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(uri)) return { error: 'Format non pris en charge (jpg, png ou webp).' };
    // ~6 Mo de data URI max (garde-fou taille de ligne).
    if (uri.length > 6_000_000) return { error: 'Image trop lourde. Réduis la taille (max ~4 Mo).' };
  }
  const imageUrl = uri || null;
  await db.update(schema.products).set({ imageUrl }).where(eq(schema.products.id, input.productId));
  return { ok: true, imageUrl };
}

/** Récupère automatiquement la photo du produit depuis sa fiche (og:image), et l'enregistre. */
export async function importProductImageAction(input: { productId: string }): Promise<{ ok?: true; imageUrl?: string; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };

  const [p] = await db.select({ id: schema.products.id, url: schema.products.url })
    .from(schema.products).where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
  if (!p) return { error: 'Produit introuvable.' };

  const [b] = await db.select({ url: schema.brands.url }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  const pageUrl = (p.url || b?.url || '').trim();
  if (!pageUrl) return { error: "Ce produit n'a pas d'URL de fiche. Ajoute-la sur la marque, ou importe la photo manuellement." };

  let html = '';
  try {
    const res = await fetch(pageUrl, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; TikTrendsBot/1.0)' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { error: `La fiche produit a répondu ${res.status}.` };
    html = await res.text();
  } catch { return { error: 'Impossible de charger la fiche produit.' }; }

  // og:image / twitter:image / link image_src (l'ordre des attributs peut varier).
  const pick = (re: RegExp) => { const m = re.exec(html); return m?.[1]?.trim(); };
  let img =
    pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
  if (!img) return { error: "Aucune image trouvée sur la fiche. Importe-la manuellement." };

  try { img = new URL(img, pageUrl).toString(); } catch { return { error: 'Image de fiche invalide.' }; }

  // Vérifie que l'URL pointe bien vers un fichier image accessible.
  try {
    const head = await fetch(img, { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    const ct = head.headers.get('content-type') || '';
    if (!head.ok || !/^image\//.test(ct)) return { error: "L'image de la fiche n'est pas accessible. Importe-la manuellement." };
  } catch { return { error: "L'image de la fiche n'est pas accessible. Importe-la manuellement." }; }

  await db.update(schema.products).set({ imageUrl: img }).where(eq(schema.products.id, input.productId));
  return { ok: true, imageUrl: img };
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
