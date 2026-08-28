'use server';

import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { falFromEnv, falGenerateImage, type FalAspect } from '@tiktrends/integrations';
import { enhanceImagePrompt, suggestImageBrief } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { listBrandAssetImageUrls } from './assets';
import { resolveProductImage, probeProductImage } from '../../lib/product-image';
import { logAndTranslate } from '../../lib/error-log';
import { guardedAnthropic, guardFixedCost } from '../../lib/spend-guard';

export interface ImageResult { error?: string; images?: string[]; prompt?: string; generationId?: string }
export interface BrandImage { id: string; prompt: string; url: string | null; createdAt: string; rating?: import('./creatives').Rating }

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
  // Débit atomique AVANT l'appel Fal (remboursé si la génération échoue) : vérifier
  // puis débiter en deux temps laissait deux lancements simultanés passer pour un débit.
  const cost = costFor('image', count);
  const unlimited = unlimitedCredits(s.user.email);
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · image IA'))) {
    return { error: `Crédits insuffisants (${cost} requis pour ${count} image(s)).` };
  }

  const brand = await getActiveBrand(s.workspaceId);

  // Contexte marque (DA) + produit sélectionné, pour ancrer la génération.
  let da: { colors?: string[] | null; tone?: string | null; usp?: string | null; description?: string | null; creativeRules?: string | null } = {};
  let product: { name: string; description: string | null; imageUrl: string | null } | null = null;
  if (db && brand) {
    const [row] = await db.select({ colors: schema.brands.colors, tone: schema.brands.tone, usp: schema.brands.usp, description: schema.brands.description, creativeRules: schema.brands.creativeRules })
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

  // Bibliothèque Assets : à défaut de source produit, l'IA s'appuie sur les images marque/communes.
  const assetRefUrls = (db && brand && !sourceImage) ? await listBrandAssetImageUrls(s.workspaceId, brand.id, 3) : [];
  const useAssetRefs = !sourceImage && assetRefUrls.length > 0;

  // Optimisation du prompt par Claude (ancrée marque + produit + texte).
  let prompt = desc;
  if (input.enhance) {
    const client = guardedAnthropic({ action: 'image' });
    if (client) {
      try {
        prompt = await enhanceImagePrompt(client, desc, {
          brand: brand?.name, tone: da.tone ?? undefined, colors: da.colors ?? undefined, usp: da.usp ?? undefined,
          productName: product?.name, productDesc: product?.description ?? undefined,
          withText: input.withText, headline: input.headline?.trim() || undefined, product: editMode, edit: editMode,
          edenRules: da.creativeRules ?? undefined,
        });
      } catch { /* on garde la description brute */ }
    }
  }

  // Références marque venant de la bibliothèque (quand pas de source produit).
  const finalPrompt = useAssetRefs
    ? `${prompt}\nUse the provided images as brand reference material (style, palette, materials, authenticity); do not copy any text or logo from them.`
    : prompt;

  try {
    // Barrière de dépense réelle · la génération d'image est facturée au coup.
    await guardFixedCost('fal_image', { action: 'image', workspaceId: s.workspaceId, units: count });
    const { images } = await falGenerateImage(cfg, { prompt: finalPrompt, aspectRatio: input.aspectRatio ?? '1:1', imageUrl: sourceImage, imageUrls: useAssetRefs ? assetRefUrls : undefined, withText: input.withText, count, edit: editMode || useAssetRefs });
    let generationId: string | undefined;
    if (db) {
      if (brand) {
        try { const [g] = await db.insert(schema.generations).values({ brandId: brand.id, kind: 'image', input: { prompt, aspectRatio: input.aspectRatio ?? '1:1' }, status: 'completed', assetUrls: images, creditsCost: unlimited ? 0 : cost }).returning({ id: schema.generations.id }); generationId = g?.id; } catch { /* ignore */ }
      }
    }
    return { images, prompt, generationId };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · image IA');
    return { error: logAndTranslate('image:generate', e, { subject: 'la génération', workspaceId: s.workspaceId }) };
  }
}

/** Propose une description d'image ancrée sur la marque + produit sélectionné. */
export async function suggestImageBriefAction(input: { productId?: string }): Promise<{ text?: string; error?: string }> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée.' };
  const client = guardedAnthropic({ action: 'image' });
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };

  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('suggest');
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · brief image suggéré'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }

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
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · brief image');
    return { error: logAndTranslate('image:brief', e, { subject: 'la proposition de brief', workspaceId: s.workspaceId }) };
  }
}

/** Enregistre (ou retire) la photo réelle d'un produit · réutilisée pour la mise en scène. */
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
  await db.update(schema.products).set({ imageUrl, imageUrls: imageUrl ? [imageUrl] : null }).where(eq(schema.products.id, input.productId));
  return { ok: true, imageUrl };
}

/** Enregistre plusieurs photos de référence produit (glisser-déposer). La 1re sert d'aperçu. */
export async function setProductImagesAction(input: { productId: string; dataUris: string[]; append?: boolean }): Promise<{ ok?: true; imageUrls?: string[]; imageUrl?: string | null; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };

  const [p] = await db.select({ id: schema.products.id, imageUrls: schema.products.imageUrls }).from(schema.products)
    .where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
  if (!p) return { error: 'Produit introuvable.' };

  const clean = (input.dataUris || []).map((u) => u.trim()).filter(Boolean);
  for (const u of clean) {
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(u)) return { error: 'Formats acceptés : jpg, png, webp.' };
    if (u.length > 6_000_000) return { error: 'Une image est trop lourde (max ~4 Mo chacune).' };
  }
  const base = input.append ? (p.imageUrls ?? []) : [];
  const imageUrls = [...base, ...clean].slice(0, 6);
  const imageUrl = imageUrls[0] ?? null;
  await db.update(schema.products).set({ imageUrl, imageUrls: imageUrls.length ? imageUrls : null }).where(eq(schema.products.id, input.productId));
  return { ok: true, imageUrls, imageUrl };
}

/** Récupère automatiquement la photo du produit depuis sa fiche (og:image), et l'enregistre. */
export async function importProductImageAction(input: { productId: string }): Promise<{ ok?: true; imageUrl?: string; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };

  const [p] = await db.select({ id: schema.products.id, name: schema.products.name, url: schema.products.url })
    .from(schema.products).where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
  if (!p) return { error: 'Produit introuvable.' };

  const [b] = await db.select({ url: schema.brands.url }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  if (!p.url && !b?.url) return { error: "Ni le produit ni la marque n'ont d'URL de site. Ajoute l'URL sur la marque, ou importe la photo manuellement." };

  const img = await resolveProductImage({ productName: p.name, productUrl: p.url, siteUrl: b?.url });
  if (!img) return { error: "Aucune image exploitable trouvée sur le site. Importe-la manuellement." };

  await db.update(schema.products).set({ imageUrl: img }).where(eq(schema.products.id, input.productId));
  return { ok: true, imageUrl: img };
}

/** Récupère en masse les photos de tous les produits (sans photo) depuis leurs fiches / le site de la marque. */
export async function importAllProductImagesAction(): Promise<{ updated: number; total: number; updatedIds: string[]; note?: string; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { updated: 0, total: 0, updatedIds: [], error: 'Session expirée.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { updated: 0, total: 0, updatedIds: [], error: 'Aucune marque active.' };

  const [b] = await db.select({ url: schema.brands.url }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  const rows = await db.select({ id: schema.products.id, name: schema.products.name, url: schema.products.url, imageUrl: schema.products.imageUrl })
    .from(schema.products).where(eq(schema.products.brandId, brand.id));

  const withUrl = rows.filter((r) => r.url).length;
  const diag = `site marque : ${b?.url ? 'oui' : 'non'} · produits avec URL de fiche : ${withUrl}/${rows.length}`;

  const todo = rows.filter((r) => !r.imageUrl && (r.url || b?.url));
  if (!todo.length) {
    const alreadyDone = rows.filter((r) => r.imageUrl).length === rows.length && rows.length > 0;
    return { updated: 0, total: rows.length, updatedIds: [], note: alreadyDone ? undefined : `Rien à récupérer (${diag}). Ajoute l'URL du site sur la marque.` };
  }

  const results = await Promise.all(todo.map(async (r) => {
    const img = await resolveProductImage({ productName: r.name, productUrl: r.url, siteUrl: b?.url });
    if (!img) return null;
    try { await db!.update(schema.products).set({ imageUrl: img }).where(eq(schema.products.id, r.id)); return r.id; }
    catch { return null; }
  }));
  const updatedIds = results.filter((x): x is string => !!x);
  let note: string | undefined;
  if (updatedIds.length === 0) {
    const first = todo[0]!;
    const pr = await probeProductImage({ productName: first.name, productUrl: first.url, siteUrl: b?.url });
    note = `Diag ${pr.host ?? '?'} : page=${pr.pageStatus}${pr.ct ? ` (${pr.ct})` : ''}, og:image=${pr.htmlOg ? 'oui' : 'non'}, img DOM=${pr.htmlImg ? 'oui' : 'non'}, JSON fiche=${pr.productJson ? 'oui' : 'non'}, catalogue Shopify=${pr.catalog ? 'oui' : 'non'}.`;
  }
  return { updated: updatedIds.length, total: rows.length, updatedIds, note };
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
    if (g.status === 'archived') continue; // masquer les rendus archivés
    const input = (g.input ?? {}) as { prompt?: string; rating?: import('./creatives').Rating };
    for (const url of g.assetUrls ?? []) out.push({ id: g.id + ':' + url, prompt: input.prompt || '', url, createdAt: (g.createdAt as Date).toISOString(), rating: input.rating ?? null });
  }
  return out;
}
