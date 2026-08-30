'use server';

import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { resolvePreset } from './presets';
import { falFromEnv, falGenerateImage, type FalConfig } from '@tiktrends/integrations';
import { safeFetch } from '@tiktrends/integrations/src/safe-fetch';
import { generateAdConcepts, cloneAdFromReference, suggestAdAngles, scoreCreative, AD_TEMPLATES, VISUAL_UNIVERSES, type AdTemplate, type AdConcept, type CloneRefImage, type AdAngle, type CreativeScore } from '@tiktrends/ai';
import { costFor, imageModelByKey } from '@tiktrends/core';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { jarvisFullMemory, jarvisMemoryWithUse } from '../../lib/jarvis-memory';
import { listBrandAssetImageUrls, resolveAssetImageUrls } from './assets';
import type { AdRecipe } from '../../lib/ad-render';
import { logAndTranslate } from '../../lib/error-log';
import { guardedAnthropic, guardFixedCost } from '../../lib/spend-guard';

export interface AdItem { id: string; template: AdTemplate; headline: string; url: string; createdAt: string; rating?: import('./creatives').Rating; score?: number }
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
  // L'URL vient d'un snapshot de pub, donc d'une source externe : safeFetch refuse
  // les adresses internes et revalide chaque redirection (sinon un 302 vers
  // 127.0.0.1 suffit à faire relayer une réponse interne par notre serveur).
  const res = await safeFetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, timeoutMs: 15_000, maxBytes: 6_000_000 });
  if (!res || !/^image\/(jpeg|png|webp)$/.test(res.contentType)) return null;
  return { mediaType: res.contentType as CloneRefImage['mediaType'], base64: res.body.toString('base64') };
}

/**
 * Version d'un rendu, dérivée de ses textes. Elle est collée à l'URL de l'aperçu
 * (?v=) pour que le navigateur recharge l'image dès qu'un texte change : sans ça,
 * le `cache-control: max-age=86400` de /api/ad servait l'ancienne composition
 * pendant 24 h dans la grille et dans le téléchargement.
 */
function adVersion(r: Partial<AdRecipe>): string {
  const t = `${r.headline ?? ''}|${r.subhead ?? ''}|${r.cta ?? ''}|${r.kicker ?? ''}|${r.badge ?? ''}|${r.sceneUrl ?? ''}`;
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** URL d'aperçu versionnée d'un rendu de pub. (Non exportée : un module
 *  « use server » ne peut exposer que des fonctions async.) */
function adUrl(id: string, recipe: Partial<AdRecipe>): string {
  return `/api/ad/${id}?v=${adVersion(recipe)}`;
}

/** Compose une série : scènes (univers variés) + enregistrement + débit. Mutualisé par génération et clone. */
async function composeBatch(o: {
  cfg: FalConfig; brandId: string; brandName: string; colors?: string[] | null; logoUrl?: string | null;
  /** Ce dont la génération a bénéficié · consigné pour mesurer si la mémoire aide (§attribution). */
  memoryUse?: { measured: boolean; market: boolean; hooks: number };
  productImageUrls: string[] | null; editMode: boolean; concepts: AdConcept[]; universe?: string;
  assetRefUrls?: string[]; // images de la bibliothèque Assets (références marque pour l'IA)
  cloneRefUrl?: string; // référence à répliquer visuellement (mode clone)
  workspaceId: string; unlimited: boolean;
  reservedCredits: number; // deja debite par l'appelant : on rembourse ce qui n'a pas ete produit
  falModel?: string; falParams?: Record<string, string | number>; creditsPerImage: number; // modèle choisi (+ ses paramètres) et crédits par variante
  productId?: string; personaId?: string; objective?: string;
  /** Prompt maison · remplace l'univers fourni quand il est choisi. */
  preset?: { id: string; prompt: string; negative: string | null } | null;
}): Promise<AdItem[]> {
  const accents = pickAccents(o.colors);
  const chosen = o.universe && o.universe !== 'auto' ? VISUAL_UNIVERSES.find((u) => u.key === o.universe) : null;
  const offset = Math.floor(Date.now() / 1000) % VISUAL_UNIVERSES.length;
  // Un prompt maison l'emporte sur les univers fournis · c'est la direction
  // artistique de la marque, elle ne se fait pas alterner avec la nôtre.
  const universeFor = (i: number) => o.preset
    ? o.preset.prompt
    : chosen ? chosen.prompt : VISUAL_UNIVERSES[(offset + i) % VISUAL_UNIVERSES.length]!.prompt;
  // Les exclusions ferment la consigne · un moteur qui les ignore n'est pas gêné,
  // un moteur qui les lit les retient mieux en fin de prompt.
  const exclusions = o.preset?.negative?.trim() ? `\n\nAvoid: ${o.preset.negative.trim()}` : '';
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
      prompt = scenePrompt(c, true, universeFor(i)) + assetNote + exclusions;
      edit = true;
    } else if (hasAssetRef) {
      // Pas de photo produit mais la bibliothèque est remplie -> l'IA s'en sert comme références marque.
      imageUrls = assetRefs.slice(0, 8);
      prompt = scenePromptBrandRef(c, universeFor(i)) + exclusions;
      edit = true;
    } else {
      imageUrls = undefined;
      prompt = scenePrompt(c, false, universeFor(i)) + exclusions;
      edit = false;
    }
    for (let attempt = 0; attempt < 2; attempt++) { // 1 réessai sur échec transitoire (rate-limit)
      try {
        await guardFixedCost('fal_image', { action: 'ads:image', units: 1 });
        const { images } = await falGenerateImage(o.cfg, { prompt, aspectRatio: '4:5', imageUrls, edit, count: 1, model: o.falModel, params: o.falParams });
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
      // Consigné AU MOMENT de générer · reconstruire après coup ce que Jarvis
      // savait ce jour-là est impossible, la mémoire ayant changé depuis.
      memoryUse: o.memoryUse,
      presetId: o.preset?.id ?? null,
    };
    try {
      const [row] = await db!.insert(schema.generations).values({
        brandId: o.brandId, kind: 'ad', input: recipe as unknown as Record<string, unknown>,
        status: 'completed', assetUrls: [sceneUrl], creditsCost: o.unlimited ? 0 : o.creditsPerImage,
      }).returning({ id: schema.generations.id, createdAt: schema.generations.createdAt });
      if (row) ads.push({ id: row.id, template: c.template, headline: c.headline, url: adUrl(row.id, recipe), createdAt: (row.createdAt as Date).toISOString() });
    } catch { /* ignore */ }
  }

  // Les crédits ont été réservés en bloc avant la génération (débit atomique) : on
  // ne facture au final que les visuels réellement produits et on rend le reste.
  if (!o.unlimited) {
    const unused = o.reservedCredits - o.creditsPerImage * ads.length;
    if (unused > 0) await refundCredits(o.workspaceId, unused, 'Remboursement · pubs non générées');
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

/**
 * Distille les notes de pertinence (👍/👎) du client en consignes pour Jarvis :
 * apprentissage en contexte, par marque · « ce qui plaît / ne plaît pas ».
 */
async function learnedPreferences(brandId: string): Promise<string | undefined> {
  if (!db) return undefined;
  const rows = await db.select({ input: schema.generations.input })
    .from(schema.generations)
    .where(and(eq(schema.generations.brandId, brandId), eq(schema.generations.kind, 'ad')))
    .orderBy(desc(schema.generations.createdAt)).limit(80);
  const liked: string[] = [], disliked: string[] = [];
  for (const r of rows) {
    const rec = (r.input ?? {}) as { rating?: 'up' | 'down'; headline?: string; template?: string };
    if (!rec.rating || !rec.headline) continue;
    const line = `${rec.template ? '[' + rec.template + '] ' : ''}${rec.headline}`.slice(0, 120);
    (rec.rating === 'up' ? liked : disliked).push(line);
    if (liked.length >= 8 && disliked.length >= 8) break;
  }
  if (!liked.length && !disliked.length) return undefined;
  const parts: string[] = [];
  if (liked.length) parts.push("Créas jugées PERTINENTES par le client (reprends l'esprit, l'angle, le ton) :\n- " + liked.slice(0, 8).join('\n- '));
  if (disliked.length) parts.push('Créas jugées NON pertinentes (évite ces angles/formulations) :\n- ' + disliked.slice(0, 8).join('\n- '));
  return parts.join('\n\n');
}

export async function generateAdsAction(input: {
  productId?: string; personaId?: string; objective?: string; templates?: AdTemplate[]; angle?: string; universe?: string; count?: number; assetIds?: string[]; offer?: string; model?: string;
  /** Identifiant d'un prompt maison · prime sur `universe`. */
  presetId?: string;
}): Promise<AdsResult> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée, reconnecte-toi.' };

  const cfg = falFromEnv();
  if (!cfg) return { error: "La génération d'image n'est pas activée (clé Fal manquante)." };
  const client = guardedAnthropic({ action: 'ads' });
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };
  if (!db) return { error: 'Base de données indisponible.' };

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };

  // Pool de gabarits autorisés + quantité voulue -> liste ordonnée (avec répétitions).
  const pool = (input.templates && input.templates.length ? input.templates : AD_TEMPLATES);
  const count = Math.min(8, Math.max(1, Math.round(input.count ?? pool.length)));
  const templates = Array.from({ length: count }, (_, i) => pool[i % pool.length]!);
  const modelSpec = imageModelByKey(input.model);
  const cost = modelSpec.credits * count;
  const unlimited = unlimitedCredits(s.user.email);
  // Débit atomique en bloc avant la génération ; composeBatch rembourse les visuels
  // qui n'ont pas abouti. Vérifier puis débiter en deux temps laissait deux lots
  // lancés simultanément passer pour un seul débit.
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · pubs IA'))) {
    return { error: `Crédits insuffisants (${cost} requis pour ${count} pub(s)).` };
  }

  // Contexte marque + produit + persona.
  const [da] = await db.select({
    colors: schema.brands.colors, tone: schema.brands.tone, usp: schema.brands.usp,
    audience: schema.brands.audience, category: schema.brands.category, logoUrl: schema.brands.logoUrl,
    creativeRules: schema.brands.creativeRules, jarvisLearnings: schema.brands.jarvisLearnings,
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

  // Apprentissage Jarvis : notes de pertinence du client (👍/👎) + learnings existants.
  // Ordre d'autorité, du plus fort au plus faible : ce que la marque a MESURÉ
  // (verdicts ADSMAP), puis ce qu'elle a distillé de la veille, puis les créas
  // notées au pouce. Le premier bloc n'existe qu'à partir de vrais verdicts.
  const [memoire, prefs] = await Promise.all([
    jarvisMemoryWithUse(brand.id, s.workspaceId),
    learnedPreferences(brand.id),
  ]);
  const winningPatterns = [memoire.text, da?.jarvisLearnings, prefs].filter(Boolean).join('\n\n') || undefined;

  // 1) Concepts (Claude) · un par gabarit, tous au service de l'angle si fourni.
  let concepts: AdConcept[];
  try {
    concepts = await generateAdConcepts(client, {
      brand: brand.name, tone: da?.tone ?? undefined, colors: da?.colors ?? undefined, usp: da?.usp ?? undefined,
      audience: da?.audience ?? undefined, category: da?.category ?? undefined,
      productName: product?.name, productDesc: product?.description ?? undefined, productUsp: product?.usp ?? undefined,
      hasProductPhoto: editMode,
      persona: persona ? { name: persona.name, pains: persona.pains ?? undefined, desires: persona.desires ?? undefined } : undefined,
      objective: input.objective, angle: input.angle?.trim() || undefined, offer: input.offer?.trim() || undefined, creativeRules: da?.creativeRules ?? undefined, winningPatterns,
    }, { templates, winningCopy, competitors: brow?.competitors ?? undefined });
  } catch (e) {
    return { error: logAndTranslate('ads:concepts', e, { subject: "l'écriture des concepts", workspaceId: s.workspaceId }) };
  }
  if (!concepts.length) return { error: "Aucun concept n'a pu être généré. Réessaie." };

  // Le prompt maison est résolu une fois pour tout le lot · le relire par visuel
  // ferait autant de requêtes que d'images, pour la même réponse.
  const resolu = await resolvePreset(s.workspaceId, input.presetId);
  const presetChoisi = resolu && input.presetId ? { id: input.presetId, ...resolu } : null;

  const ads = await composeBatch({
    cfg, brandId: brand.id, brandName: brand.name, colors: da?.colors, logoUrl: da?.logoUrl,
    productImageUrls, editMode, assetRefUrls, concepts, universe: input.universe,
    preset: presetChoisi,
    workspaceId: s.workspaceId, unlimited, reservedCredits: unlimited ? 0 : cost,
    falModel: modelSpec.falModel, falParams: modelSpec.params, creditsPerImage: modelSpec.credits,
    productId: input.productId, personaId: input.personaId, objective: input.objective,
    memoryUse: memoire.use,
  });
  if (!ads.length) return { error: "Les scènes n'ont pas pu être générées. Réessaie." };
  return { ads, requested: count };
}

/** Propose des angles précis en s'appuyant sur la marque + les sauvegardes de veille + les concurrents. */
export async function suggestAnglesAction(input: { productId?: string }): Promise<{ angles?: AdAngle[]; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const client = guardedAnthropic({ action: 'ads' });
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };

  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('suggest');
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · angles suggérés'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }

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
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · angles suggérés');
    return { error: logAndTranslate('ads:angles', e, { subject: 'la proposition d’angles', workspaceId: s.workspaceId }) };
  }
}

/** Contexte marque + produit + persona (mutualisé par génération et clone). */
async function loadAdContext(brandId: string, productId?: string, personaId?: string) {
  const [da] = await db!.select({
    colors: schema.brands.colors, tone: schema.brands.tone, usp: schema.brands.usp,
    audience: schema.brands.audience, category: schema.brands.category, logoUrl: schema.brands.logoUrl,
    // Le clone en a besoin comme la génération : les règles maison et les patterns
    // distillés ne doivent pas dépendre du chemin emprunté.
    creativeRules: schema.brands.creativeRules, jarvisLearnings: schema.brands.jarvisLearnings,
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
  productId?: string; personaId?: string; objective?: string; universe?: string; count?: number; model?: string;
}): Promise<AdsResult> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée, reconnecte-toi.' };
  const cfg = falFromEnv();
  if (!cfg) return { error: "La génération d'image n'est pas activée (clé Fal manquante)." };
  const client = guardedAnthropic({ action: 'ads' });
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
  const modelSpec = imageModelByKey(input.model);
  const cost = modelSpec.credits * count;
  const unlimited = unlimitedCredits(s.user.email);
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · clone de pub'))) {
    return { error: `Crédits insuffisants (${cost} requis pour ${count} pub(s)).` };
  }

  const { da, product, persona } = await loadAdContext(brand.id, input.productId, input.personaId);
  const productImageUrls = product ? (product.imageUrls && product.imageUrls.length ? product.imageUrls : (product.imageUrl ? [product.imageUrl] : null)) : null;
  const editMode = !!(productImageUrls && productImageUrls.length);
  // Le clone bénéficie de la même mémoire mesurée : reproduire une pub qui a
  // marché ailleurs sans tenir compte de ce qui marche ICI serait une régression.
  const [mesureClone, prefsClone] = await Promise.all([
    jarvisMemoryWithUse(brand.id, s.workspaceId),
    learnedPreferences(brand.id),
  ]);
  const ctx = {
    brand: brand.name, tone: da?.tone ?? undefined, colors: da?.colors ?? undefined, usp: da?.usp ?? undefined,
    audience: da?.audience ?? undefined, category: da?.category ?? undefined,
    productName: product?.name, productDesc: product?.description ?? undefined, productUsp: product?.usp ?? undefined,
    hasProductPhoto: editMode,
    persona: persona ? { name: persona.name, pains: persona.pains ?? undefined, desires: persona.desires ?? undefined } : undefined,
    objective: input.objective,
    creativeRules: da?.creativeRules ?? undefined,
    winningPatterns: [mesureClone.text, da?.jarvisLearnings, prefsClone].filter(Boolean).join('\n\n') || undefined,
  };

  // 1) Analyse de la référence -> gabarit + angle à répliquer.
  let base: AdConcept | null;
  try { base = await cloneAdFromReference(client, ref, ctx); }
  catch (e) { return { error: logAndTranslate('ads:ref', e, { subject: 'l’analyse de la pub de référence', workspaceId: s.workspaceId }) }; }
  if (!base) return { error: "La pub de référence n'a pas pu être interprétée. Réessaie." };
  const angle = [base.kicker, base.headline].filter(Boolean).join(' · ') || base.headline;

  // 2) N variations sur ce même angle + gabarit (moteur « Depuis la marque »).
  let concepts: AdConcept[];
  try {
    concepts = await generateAdConcepts(client, { ...ctx, angle }, { templates: Array.from({ length: count }, () => base!.template) });
  } catch (e) {
    return { error: logAndTranslate('ads:clone', e, { subject: 'l’écriture des variations', workspaceId: s.workspaceId }) };
  }
  if (!concepts.length) concepts = [base]; // repli : au moins la reproduction directe

  const ads = await composeBatch({
    cfg, brandId: brand.id, brandName: brand.name, colors: da?.colors, logoUrl: da?.logoUrl,
    productImageUrls, editMode, concepts, universe: input.universe, cloneRefUrl: refForModel || undefined,
    workspaceId: s.workspaceId, unlimited, reservedCredits: unlimited ? 0 : cost,
    falModel: modelSpec.falModel, falParams: modelSpec.params, creditsPerImage: modelSpec.credits,
    productId: input.productId, personaId: input.personaId, objective: input.objective,
    memoryUse: mesureClone.use,
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
    .orderBy(desc(schema.generations.createdAt)).limit(240);
  return rows
    .filter((r) => (r.status === 'archived') === wantArchived)
    .map((r) => {
      const rec = (r.input ?? {}) as Partial<AdRecipe> & { rating?: import('./creatives').Rating; jarvisScore?: CreativeScore };
      return { id: r.id, template: (rec.template ?? 'problem_solution') as AdTemplate, headline: rec.headline ?? '', url: adUrl(r.id, rec), createdAt: (r.createdAt as Date).toISOString(), rating: rec.rating ?? null, score: rec.jarvisScore?.score };
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

export interface AdText { kicker?: string; headline?: string; subhead?: string; cta?: string; badge?: string }

/** Lit les textes éditables d'une pub (accroche, sous-titre, CTA…). */
export async function getAdTextAction(id: string): Promise<{ text?: AdText; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };
  const [g] = await db.select({ input: schema.generations.input }).from(schema.generations)
    .where(and(eq(schema.generations.id, id), eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad'))).limit(1);
  if (!g) return { error: 'Rendu introuvable.' };
  const r = (g.input ?? {}) as Partial<AdRecipe>;
  return { text: { kicker: r.kicker ?? '', headline: r.headline ?? '', subhead: r.subhead ?? '', cta: r.cta ?? '', badge: r.badge ?? '' } };
}

/**
 * Met à jour les textes d'une pub SANS régénérer l'image (l'overlay est recomposé à la volée) :
 * aucun crédit débité. Renvoie une version pour rafraîchir l'aperçu (cache-bust).
 */
export async function updateAdTextAction(id: string, text: AdText): Promise<{ ok?: true; url?: string; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };
  const [g] = await db.select({ input: schema.generations.input }).from(schema.generations)
    .where(and(eq(schema.generations.id, id), eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad'))).limit(1);
  if (!g) return { error: 'Rendu introuvable.' };
  const r = (g.input ?? {}) as Record<string, unknown>;
  const clean = (v?: string) => (typeof v === 'string' ? v.trim() : undefined);
  const next = {
    ...r,
    kicker: clean(text.kicker) || undefined,
    headline: clean(text.headline) || (r.headline as string) || '',
    subhead: clean(text.subhead) || undefined,
    cta: clean(text.cta) || (r.cta as string) || '',
    badge: clean(text.badge) || undefined,
  };
  await db.update(schema.generations).set({ input: next as Record<string, unknown> }).where(eq(schema.generations.id, id));
  // La version suit le contenu (et non l'horloge) : la grille, l'aperçu et le
  // téléchargement pointent tous sur la même URL fraîche.
  return { ok: true, url: adUrl(id, next as Partial<AdRecipe>) };
}

/**
 * Score Jarvis · évalue le POTENTIEL DE PERFORMANCE d'une créa (scroll-stop, clarté, adéquation),
 * en s'appuyant sur les règles maison + les patterns gagnants appris. Débite 2 crédits.
 */
export async function scoreCreativeAction(id: string, opts?: { force?: boolean }): Promise<{ score?: CreativeScore; cost?: number; cached?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const client = guardedAnthropic({ action: 'ads' });
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' };

  const [g] = await db.select({ input: schema.generations.input }).from(schema.generations)
    .where(and(eq(schema.generations.id, id), eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad'))).limit(1);
  if (!g) return { error: 'Rendu introuvable.' };
  const r = (g.input ?? {}) as Partial<AdRecipe> & { jarvisScore?: CreativeScore };

  // Score déjà calculé : on le renvoie sans redébiter (sauf nouvelle analyse demandée).
  if (r.jarvisScore && !opts?.force) return { score: r.jarvisScore, cost: 0, cached: true };

  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('score');
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Jarvis · analyse de créa'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }

  const [da] = await db.select({
    tone: schema.brands.tone, usp: schema.brands.usp, audience: schema.brands.audience, category: schema.brands.category,
    creativeRules: schema.brands.creativeRules, jarvisLearnings: schema.brands.jarvisLearnings,
  }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);

  // La note s'appuie sur ce que la marque a mesuré, pas seulement sur son ton :
  // sans ça, Jarvis évalue une créa à l'aune de règles générales de copywriting.
  const mesureScore = await jarvisFullMemory(brand.id, s.workspaceId);

  try {
    const score = await scoreCreative(client, {
      brand: brand.name, tone: da?.tone ?? undefined, usp: da?.usp ?? undefined, audience: da?.audience ?? undefined,
      category: da?.category ?? undefined, objective: r.objective, creativeRules: da?.creativeRules ?? undefined,
      winningPatterns: [mesureScore, da?.jarvisLearnings].filter(Boolean).join('\n\n') || undefined,
    }, { template: r.template, kicker: r.kicker, headline: r.headline ?? '', subhead: r.subhead, cta: r.cta, badge: r.badge });
    if (!score) {
      if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · analyse de créa');
      return { error: "Score indisponible, réessaie." };
    }
    // Mémorise le score (affichage direct sur la carte, pas de re-débit).
    // Fusion côté SQL : l'analyse dure plusieurs secondes, une note ou une édition de
    // texte faite pendant ce temps ne doit pas être écrasée par un instantané périmé.
    try {
      await db.update(schema.generations)
        .set({ input: sql`coalesce(${schema.generations.input}, '{}'::jsonb) || ${JSON.stringify({ jarvisScore: score })}::jsonb` })
        .where(eq(schema.generations.id, id));
    } catch { /* best-effort */ }
    return { score, cost: unlimited ? 0 : cost };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · analyse de créa');
    return { error: logAndTranslate('ads:score', e, { subject: 'l’analyse de la créa', workspaceId: s.workspaceId }) };
  }
}
