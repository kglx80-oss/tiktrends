'use server';

import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { falFromEnv, falGenerateImage, type FalConfig } from '@tiktrends/integrations';
import { anthropicFromEnv, generateAdConcepts, cloneAdFromReference, suggestAdAngles, AD_TEMPLATES, VISUAL_UNIVERSES, type AdTemplate, type AdConcept, type CloneRefImage, type AdAngle } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits } from '../../lib/credits';
import { listBrandAssetImageUrls, resolveAssetImageUrls } from './assets';
import type { AdRecipe } from '../../lib/ad-render';

export interface AdItem { id: string; template: AdTemplate; headline: string; url: string; createdAt: string }
export interface AdsResult { error?: string; ads?: AdItem[]; requested?: number }

/** Ordonne les couleurs d'accent lisibles (bouton/CTA) de la DA ; défaut si aucune. */
function pickAccents(colors?: string[] | null): string[] {
  const list = (colors ?? []).filter((c) => /^#?[0-9a-fA-F]{6}$/.test(c.trim())).map((c) => '#' + c.trim().replace('#', ''));
  const lumOf = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  const vivid = list.filter((h) => { const l = lumOf(h); return l > 0.18 && l < 0.82; });
  const ordered = [...vivid, ...list.filter((h) => !vivid.includes(h))];
  return ordered.length ? Array.from(new Set(ordered)) : ['#2563EB'];
}

/** Rassemble des extraits de copy de pubs sauvegardées (veille) pour inspirer les angles. */
function copyFromSnapshot(snap: unknown): string | null {
  if (!snap || typeof snap !== 'object') return null;
  const o = snap as Record<string, unknown>;
  const c = (o.copy && typeof o.copy === 'object' ? o.copy as Record<string, unknown> : {});
  const parts = [o.primaryText, o.headline, o.title, o.text, o.body, o.description, c.primaryText, c.headline, c.title, c.body]
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  const t = parts.join(' · ').trim();
  return t ? t.slice(0, 240) : null;
}

/** Extrait une URL d'image exploitable d'un snapshot de pub sauvegardée (veille). */
function imageUrlFromSnapshot(snap: unknown): string | null {
  if (!snap || typeof snap !== 'object') return null;
  const o = snap as Record<string, unknown>;
  const media = Array.isArray(o.media) ? o.media : [];
  const first = media.find((m) => typeof m === 'string') as string | undefined;
  const cand = [o.imageUrl, o.thumbnailUrl, o.thumbUrl, o.mediaUrl, o.image, o.creativeUrl, o.previewUrl, first]
    .find((x): x is string => typeof x === 'string' && /^https?:\/\//.test(x));
  return cand ?? null;
}

/** Télécharge une image et la convertit en référence base64 pour l'analyse vision. */
async function refFromUrl(url: string): Promise<CloneRefImage | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    const ct = (res.headers.get('content-type') || '').split(';')[0]!.trim();
    if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(ct)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 6_000_000) return null;
    return { mediaType: ct as CloneRefImage['mediaType'], base64: buf.toString('base64') };
  } catch { return null; }
}

/** Compose une série : scènes (univers variés) + enregistrement + débit. Mutualisé par génération et clone. */
async function composeBatch(o: {
  cfg: FalConfig; brandId: string; brandName: string; colors?: string[] | null; logoUrl?: string | null;
  productImageUrls: string[] | null; editMode: boolean; concepts: AdConcept[]; universe?: string;
  assetRefUrls?: string[]; // images de la bibliothèque Assets (références marque pour l'IA)
  cloneRefUrl?: string; // référence à répliquer visuellement (mode clone)
  workspaceId: string; unlimited: boolean; credits: number; reason: string;
  productId?: string; personaId?: string; objective?: string;
}): Promise<AdItem[]> {
  const accents = pickAccents(o.colors);
  const chosen = o.universe && o.universe !== 'auto' ? VISUAL_UNIVERSES.find((u) => u.key === o.universe) : null;
  const offset = Math.floor(Date.now() / 1000) % VISUAL_UNIVERSES.length;
  const universeFor = (i: number) => chosen ? chosen.prompt : VISUAL_UNIVERSES[(offset + i) % VISUAL_UNIVERSES.length]!.prompt;
  const hasProduct = !!(o.productImageUrls && o.productImageUrls.length);
  const assetRefs = o.assetRefUrls ?? [];
  const hasAssetRef = assetRefs.length > 0;
  // Références marque venant de la bibliothèque Assets, ajoutées en note quand on s'en sert.
  const assetNote = hasAssetRef ? ' Additional images are brand reference material (real brand/product shots from the asset library) · draw visual style, palette and authenticity from them, but do not copy any text or layout.' : '';

  const genScene = async (c: AdConcept, i: number): Promise<string | null> => {
    // Clone : on donne la référence EN PREMIER puis nos images produit -> Nano recompose la mise en page.
    // Sinon : produit (edit) et/ou images de la bibliothèque Assets comme références marque.
    let imageUrls: string[] | undefined;
    let prompt: string;
    let edit: boolean;
    if (o.cloneRefUrl) {
      imageUrls = [o.cloneRefUrl, ...(o.productImageUrls ?? [])];
      prompt = scenePromptClone(c, hasProduct);
      edit = true;
    } else if (o.editMode) {
      imageUrls = [...(o.productImageUrls ?? []), ...assetRefs].slice(0, 8);
      prompt = scenePrompt(c, true, universeFor(i)) + assetNote;
      edit = true;
    } else if (hasAssetRef) {
      // Pas de photo produit mais la bibliothèque est remplie -> l'IA s'en sert comme références marque.
      imageUrls = assetRefs.slice(0, 8);
      prompt = scenePromptBrandRef(c, universeFor(i));
      edit = true;
    } else {
      imageUrls = undefined;
      prompt = scenePrompt(c, false, universeFor(i));
      edit = false;
    }
    for (let attempt = 0; attempt < 2; attempt++) { // 1 réessai sur échec transitoire (rate-limit)
      try {
        const { images } = await falGenerateImage(o.cfg, { prompt, aspectRatio: '4:5', imageUrls, edit, count: 1 });
        if (images[0]) return images[0];
      } catch { /* réessai */ }
    }
    return null;
  };

  // Génération par petits lots (max 3 en parallèle) pour éviter les rate-limits qui font perdre des pubs.
  const scenes: (string | null)[] = new Array(o.concepts.length).fill(null);
  const LOT = 3;
  for (let start = 0; start < o.concepts.length; start += LOT) {
    const slice = o.concepts.slice(start, start + LOT);
    const done = await Promise.all(slice.map((c, k) => genScene(c, start + k)));
    done.forEach((url, k) => { scenes[start + k] = url; });
  }

  const ads: AdItem[] = [];
  for (let i = 0; i < o.concepts.length; i++) {
    const sceneUrl = scenes[i]; const c = o.concepts[i];
    if (!sceneUrl || !c) continue;
    const recipe: AdRecipe = {
      template: c.template, sceneUrl, kicker: c.kicker, headline: c.headline, subhead: c.subhead, cta: c.cta,
      badge: c.badge, quote: c.quote, author: c.author, rating: c.rating, benefits: c.benefits, stat: c.stat, statLabel: c.statLabel,
      accent: accents[i % accents.length]!, variant: i % 3, brandName: o.brandName, logoUrl: o.logoUrl ?? null,
      productId: o.productId, personaId: o.personaId, objective: o.objective,
    };
    try {
      const [row] = await db!.insert(schema.generations).values({
        brandId: o.brandId, kind: 'ad', input: recipe as unknown as Record<string, unknown>,
        status: 'completed', assetUrls: [sceneUrl], creditsCost: o.unlimited ? 0 : costFor('image', 1),
      }).returning({ id: schema.generations.id, createdAt: schema.generations.createdAt });
      if (row) ads.push({ id: row.id, template: c.template, headline: c.headline, url: `/api/ad/${row.id}`, createdAt: (row.createdAt as Date).toISOString() });
    } catch { /* ignore */ }
  }

  if (ads.length && !o.unlimited) {
    const realCost = costFor('image', ads.length);
    try {
      await db!.update(schema.workspaces).set({ creditsBalance: Math.max(0, o.credits - realCost) }).where(eq(schema.workspaces.id, o.workspaceId));
      await db!.insert(schema.creditLedger).values({ workspaceId: o.workspaceId, delta: -realCost, reason: o.reason });
    } catch { /* best-effort */ }
  }
  return ads;
}

/** Prompt « références marque » : composer une nouvelle scène inspirée des assets de la bibliothèque. */
function scenePromptBrandRef(c: AdConcept, universePrompt?: string): string {
  const base = c.sceneBrief.slice(0, 650);
  const uni = universePrompt ? `Art direction / visual universe: ${universePrompt}` : '';
  return `The provided images are brand reference material (real brand/product/lifestyle shots). Compose a NEW premium advertising scene INSPIRED by their look, palette, materials and authenticity · do not copy them literally and do not reproduce any text or logo from them. New scene: ${base}. ${uni} Ultra realistic, photorealistic, true-to-life proportions, correct perspective, no distortion. Premium advertising photography. Composition: keep the main subject in the upper two thirds; keep the lower third calmer so a text panel can sit there. Vertical 4:5. Absolutely NO text, NO words, NO captions, NO logos, NO watermark added to the image.`;
}

/** Prompt de clonage : recomposer la mise en page de la référence avec NOTRE produit. */
function scenePromptClone(c: AdConcept, hasProduct: boolean): string {
  const base = c.sceneBrief.slice(0, 500);
  const product = hasProduct
    ? 'The FIRST image is a winning reference ad. The OTHER image(s) show OUR product. Recreate the reference ad\'s exact composition, framing, camera angle, background, lighting and overall mood, but REPLACE its product with OUR product, keeping our product EXACTLY identical (same packaging shape, label, logo, text, colors and real proportions · do not distort it).'
    : 'The image is a winning reference ad. Recreate its exact composition, framing, background, lighting and mood, adapted to our brand.';
  return `${product} Scene notes: ${base}. Ultra realistic, photorealistic, true-to-life proportions, correct perspective, no distortion. Premium advertising photography. Absolutely NO text, NO words, NO captions, NO logos, NO watermark added to the image.`;
}

function scenePrompt(c: AdConcept, editMode: boolean, universePrompt?: string): string {
  const base = c.sceneBrief.slice(0, 700);
  // Cadrage pensé pour l'overlay : sujet dans les 2/3 hauts, bas plus calme/sombre pour le texte.
  const framing = 'Composition: keep the main subject in the upper two thirds; keep the lower third calmer and less busy so a text panel can sit there. Vertical 4:5 framing, high-end commercial look, crisp focus, natural depth of field.';
  const realism = 'Ultra realistic, photorealistic, true-to-life scale and proportions. The product must be at a believable real-world size (a supplement bottle is roughly 12 cm tall): never gigantic, never tiny, never floating. Hands, fingers and faces must be anatomically correct. Correct perspective and grounding (real contact shadow), no distortion, no warping, no stretching, no duplicated or extra objects, accurate label and cap proportions, physically plausible lighting, shadows and reflections.';
  const uni = universePrompt ? `Art direction / visual universe: ${universePrompt}` : '';
  const noText = 'Absolutely NO text, NO words, NO captions, NO logos, NO watermark, NO UI added to the image.';
  if (editMode) {
    return `Place the product from the reference image into a new scene, keeping it EXACTLY identical (same packaging shape, label, logo, text, colors AND real proportions · do not resize, stretch or reshape it). New scene: ${base}. ${uni} ${realism} Premium advertising photography. ${framing} ${noText}`;
  }
  return `${base}. ${uni} ${realism} Premium advertising photography. ${framing} ${noText}`;
}

export async function generateAdsAction(input: {
  productId?: string; personaId?: string; objective?: string; templates?: AdTemplate[]; angle?: string; universe?: string; count?: number; assetIds?: string[];
}): Promise<AdsResult> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée, reconnecte-toi.' };

  const cfg = falFromEnv();
  if (!cfg) return { error: "La génération d'image n'est pas activée (clé Fal manquante)." };
  const client = anthropicFromEnv();
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };
  if (!db) return { error: 'Base de données indisponible.' };

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };

  // Pool de gabarits autorisés + quantité voulue -> liste ordonnée (avec répétitions).
  const pool = (input.templates && input.templates.length ? input.templates : AD_TEMPLATES);
  const count = Math.min(8, Math.max(1, Math.round(input.count ?? pool.length)));
  const templates = Array.from({ length: count }, (_, i) => pool[i % pool.length]!);
  const cost = costFor('image', count);
  const unlimited = unlimitedCredits(s.user.email);
  let credits = 0;
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
  credits = w?.c ?? 0;
  if (!unlimited && credits < cost) return { error: `Crédits insuffisants (${cost} requis pour ${count} pub(s)).` };

  // Contexte marque + produit + persona.
  const [da] = await db.select({
    colors: schema.brands.colors, tone: schema.brands.tone, usp: schema.brands.usp,
    audience: schema.brands.audience, category: schema.brands.category, logoUrl: schema.brands.logoUrl,
    creativeRules: schema.brands.creativeRules,
  }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);

  let product: { name: string; description: string | null; usp: string | null; imageUrl: string | null; imageUrls: string[] | null } | null = null;
  if (input.productId) {
    const [p] = await db.select({ name: schema.products.name, description: schema.products.description, usp: schema.products.usp, imageUrl: schema.products.imageUrl, imageUrls: schema.products.imageUrls })
      .from(schema.products).where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
    if (p) product = p;
  }
  let persona: { name: string; pains: string[] | null; desires: string[] | null } | null = null;
  if (input.personaId) {
    const [p] = await db.select({ name: schema.personas.name, pains: schema.personas.pains, desires: schema.personas.desires })
      .from(schema.personas).where(and(eq(schema.personas.id, input.personaId), eq(schema.personas.brandId, brand.id))).limit(1);
    if (p) persona = p;
  }

  const productImageUrls = product ? (product.imageUrls && product.imageUrls.length ? product.imageUrls : (product.imageUrl ? [product.imageUrl] : null)) : null;
  const editMode = !!(productImageUrls && productImageUrls.length);
  // Bibliothèque Assets : sélection explicite si fournie, sinon auto (images marque/communes).
  const assetRefUrls = input.assetIds && input.assetIds.length
    ? await resolveAssetImageUrls(s.workspaceId, input.assetIds, 6)
    : await listBrandAssetImageUrls(s.workspaceId, brand.id, 4);

  // Inspiration « ce qui fonctionne » : concurrents de la marque + copy des pubs sauvegardées (veille).
  const [brow] = await db.select({ competitors: schema.brands.competitors }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  const saved = await db.select({ snapshot: schema.savedAds.snapshot }).from(schema.savedAds).where(eq(schema.savedAds.workspaceId, s.workspaceId)).limit(20);
  const winningCopy = saved.map((r) => copyFromSnapshot(r.snapshot)).filter((x): x is string => !!x);

  // 1) Concepts (Claude) · un par gabarit, tous au service de l'angle si fourni.
  let concepts: AdConcept[];
  try {
    concepts = await generateAdConcepts(client, {
      brand: brand.name, tone: da?.tone ?? undefined, colors: da?.colors ?? undefined, usp: da?.usp ?? undefined,
      audience: da?.audience ?? undefined, category: da?.category ?? undefined,
      productName: product?.name, productDesc: product?.description ?? undefined, productUsp: product?.usp ?? undefined,
      hasProductPhoto: editMode,
      persona: persona ? { name: persona.name, pains: persona.pains ?? undefined, desires: persona.desires ?? undefined } : undefined,
      objective: input.objective, angle: input.angle?.trim() || undefined, creativeRules: da?.creativeRules ?? undefined,
    }, { templates, winningCopy, competitors: brow?.competitors ?? undefined });
  } catch (e) {
    return { error: 'Écriture des concepts impossible : ' + (e as Error).message };
  }
  if (!concepts.length) return { error: "Aucun concept n'a pu être généré. Réessaie." };

  const ads = await composeBatch({
    cfg, brandId: brand.id, brandName: brand.name, colors: da?.colors, logoUrl: da?.logoUrl,
    productImageUrls, editMode, assetRefUrls, concepts, universe: input.universe,
    workspaceId: s.workspaceId, unlimited, credits, reason: 'Studio · pubs IA',
    productId: input.productId, personaId: input.personaId, objective: input.objective,
  });
  if (!ads.length) return { error: "Les scènes n'ont pas pu être générées. Réessaie." };
  return { ads, requested: count };
}

/** Propose des angles précis en s'appuyant sur la marque + les sauvegardes de veille + les concurrents. */
export async function suggestAnglesAction(input: { productId?: string }): Promise<{ angles?: AdAngle[]; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const client = anthropicFromEnv();
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };

  const { da, product } = await loadAdContext(brand.id, input.productId);

  // Concurrents (DA) + copy des pubs sauvegardées (veille).
  const [brow] = await db.select({ competitors: schema.brands.competitors }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  const saved = await db.select({ snapshot: schema.savedAds.snapshot })
    .from(schema.savedAds).where(eq(schema.savedAds.workspaceId, s.workspaceId)).limit(20);
  const winningCopy = saved.map((r) => copyFromSnapshot(r.snapshot)).filter((x): x is string => !!x);

  try {
    const angles = await suggestAdAngles(client, {
      brand: brand.name, tone: da?.tone ?? undefined, colors: da?.colors ?? undefined, usp: da?.usp ?? undefined,
      audience: da?.audience ?? undefined, category: da?.category ?? undefined,
      productName: product?.name, productDesc: product?.description ?? undefined, productUsp: product?.usp ?? undefined,
    }, { winningCopy, competitors: brow?.competitors ?? undefined });
    return { angles };
  } catch (e) {
    return { error: 'Proposition d’angles impossible : ' + (e as Error).message };
  }
}

/** Contexte marque + produit + persona (mutualisé par génération et clone). */
async function loadAdContext(brandId: string, productId?: string, personaId?: string) {
  const [da] = await db!.select({
    colors: schema.brands.colors, tone: schema.brands.tone, usp: schema.brands.usp,
    audience: schema.brands.audience, category: schema.brands.category, logoUrl: schema.brands.logoUrl,
  }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);

  let product: { name: string; description: string | null; usp: string | null; imageUrl: string | null; imageUrls: string[] | null } | null = null;
  if (productId) {
    const [p] = await db!.select({ name: schema.products.name, description: schema.products.description, usp: schema.products.usp, imageUrl: schema.products.imageUrl, imageUrls: schema.products.imageUrls })
      .from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.brandId, brandId))).limit(1);
    if (p) product = p;
  }
  let persona: { name: string; pains: string[] | null; desires: string[] | null } | null = null;
  if (personaId) {
    const [p] = await db!.select({ name: schema.personas.name, pains: schema.personas.pains, desires: schema.personas.desires })
      .from(schema.personas).where(and(eq(schema.personas.id, personaId), eq(schema.personas.brandId, brandId))).limit(1);
    if (p) persona = p;
  }
  return { da, product, persona };
}

const DATA_URI = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;

/** Références de pubs gagnantes issues de la veille (pour le mode Clone). */
export interface SavedAdRef { id: string; imageUrl: string; brandName: string | null }
export async function listSavedAdRefs(): Promise<SavedAdRef[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const rows = await db.select({ id: schema.savedAds.id, snapshot: schema.savedAds.snapshot })
    .from(schema.savedAds).where(eq(schema.savedAds.workspaceId, s.workspaceId)).orderBy(desc(schema.savedAds.createdAt)).limit(40);
  const out: SavedAdRef[] = [];
  for (const r of rows) {
    const img = imageUrlFromSnapshot(r.snapshot);
    const snap = (r.snapshot ?? {}) as Record<string, unknown>;
    if (img) out.push({ id: r.id, imageUrl: img, brandName: typeof snap.brandName === 'string' ? snap.brandName : (typeof snap.advertiser === 'string' ? snap.advertiser : null) });
  }
  return out;
}

/**
 * Clone une pub gagnante : analyse la référence (vision), en déduit l'angle + le gabarit,
 * puis produit N variations sur ta marque/produit (même moteur que « Depuis la marque »).
 */
export async function cloneAdAction(input: {
  referenceDataUri?: string; savedAdId?: string;
  productId?: string; personaId?: string; objective?: string; universe?: string; count?: number;
}): Promise<AdsResult> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée, reconnecte-toi.' };
  const cfg = falFromEnv();
  if (!cfg) return { error: "La génération d'image n'est pas activée (clé Fal manquante)." };
  const client = anthropicFromEnv();
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };
  if (!db) return { error: 'Base de données indisponible.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };

  // Référence : upload direct OU pub sauvegardée de la veille.
  // ref = base64 (analyse vision) ; refForModel = URL/data URI donnée au modèle image pour répliquer la mise en page.
  let ref: CloneRefImage | null = null;
  let refForModel = '';
  if (input.savedAdId) {
    const [row] = await db.select({ snapshot: schema.savedAds.snapshot }).from(schema.savedAds)
      .where(and(eq(schema.savedAds.id, input.savedAdId), eq(schema.savedAds.workspaceId, s.workspaceId))).limit(1);
    const url = row ? imageUrlFromSnapshot(row.snapshot) : null;
    if (url) { ref = await refFromUrl(url); refForModel = url; }
    if (!ref) return { error: "Impossible de charger l'image de cette pub sauvegardée. Utilise l'upload." };
  } else {
    const uri = input.referenceDataUri?.trim() || '';
    const m = DATA_URI.exec(uri);
    if (!m || !m[1] || !m[2]) return { error: 'Ajoute une pub de référence (upload ou depuis la veille).' };
    ref = { mediaType: m[1] as CloneRefImage['mediaType'], base64: m[2] };
    refForModel = uri;
  }

  const count = Math.min(8, Math.max(1, Math.round(input.count ?? 4)));
  const cost = costFor('image', count);
  const unlimited = unlimitedCredits(s.user.email);
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
  const credits = w?.c ?? 0;
  if (!unlimited && credits < cost) return { error: `Crédits insuffisants (${cost} requis pour ${count} pub(s)).` };

  const { da, product, persona } = await loadAdContext(brand.id, input.productId, input.personaId);
  const productImageUrls = product ? (product.imageUrls && product.imageUrls.length ? product.imageUrls : (product.imageUrl ? [product.imageUrl] : null)) : null;
  const editMode = !!(productImageUrls && productImageUrls.length);
  const ctx = {
    brand: brand.name, tone: da?.tone ?? undefined, colors: da?.colors ?? undefined, usp: da?.usp ?? undefined,
    audience: da?.audience ?? undefined, category: da?.category ?? undefined,
    productName: product?.name, productDesc: product?.description ?? undefined, productUsp: product?.usp ?? undefined,
    hasProductPhoto: editMode,
    persona: persona ? { name: persona.name, pains: persona.pains ?? undefined, desires: persona.desires ?? undefined } : undefined,
    objective: input.objective,
  };

  // 1) Analyse de la référence -> gabarit + angle à répliquer.
  let base: AdConcept | null;
  try { base = await cloneAdFromReference(client, ref, ctx); }
  catch (e) { return { error: "Analyse de la référence impossible : " + (e as Error).message }; }
  if (!base) return { error: "La pub de référence n'a pas pu être interprétée. Réessaie." };
  const angle = [base.kicker, base.headline].filter(Boolean).join(' · ') || base.headline;

  // 2) N variations sur ce même angle + gabarit (moteur « Depuis la marque »).
  let concepts: AdConcept[];
  try {
    concepts = await generateAdConcepts(client, { ...ctx, angle }, { templates: Array.from({ length: count }, () => base!.template) });
  } catch (e) {
    return { error: 'Écriture des variations impossible : ' + (e as Error).message };
  }
  if (!concepts.length) concepts = [base]; // repli : au moins la reproduction directe

  const ads = await composeBatch({
    cfg, brandId: brand.id, brandName: brand.name, colors: da?.colors, logoUrl: da?.logoUrl,
    productImageUrls, editMode, concepts, universe: input.universe, cloneRefUrl: refForModel || undefined,
    workspaceId: s.workspaceId, unlimited, credits, reason: 'Studio · clone de pub',
    productId: input.productId, personaId: input.personaId, objective: input.objective,
  });
  if (!ads.length) return { error: "Les scènes n'ont pas pu être générées. Réessaie." };
  return { ads, requested: count };
}

/** Liste les publicités composées (actives par défaut, ou archivées). */
export async function listBrandAds(opts?: { archived?: boolean }): Promise<AdItem[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return [];
  const wantArchived = !!opts?.archived;
  const rows = await db.select({ id: schema.generations.id, input: schema.generations.input, status: schema.generations.status, createdAt: schema.generations.createdAt })
    .from(schema.generations)
    .where(and(eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad')))
    .orderBy(desc(schema.generations.createdAt)).limit(60);
  return rows
    .filter((r) => (r.status === 'archived') === wantArchived)
    .map((r) => {
      const rec = (r.input ?? {}) as Partial<AdRecipe>;
      return { id: r.id, template: (rec.template ?? 'problem_solution') as AdTemplate, headline: rec.headline ?? '', url: `/api/ad/${r.id}`, createdAt: (r.createdAt as Date).toISOString() };
    });
}

/** Archive (ou restaure) un rendu de pub. */
export async function archiveAdAction(input: { id: string; archived?: boolean }): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };
  const [g] = await db.select({ id: schema.generations.id }).from(schema.generations)
    .where(and(eq(schema.generations.id, input.id), eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad'))).limit(1);
  if (!g) return { error: 'Rendu introuvable.' };
  await db.update(schema.generations).set({ status: input.archived === false ? 'completed' : 'archived' }).where(eq(schema.generations.id, input.id));
  return { ok: true };
}
