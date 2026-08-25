'use server';

import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { falFromEnv, falGenerateImage } from '@tiktrends/integrations';
import { anthropicFromEnv, generateAdConcepts, cloneAdFromReference, suggestAdAngles, AD_TEMPLATES, VISUAL_UNIVERSES, type AdTemplate, type AdConcept, type CloneRefImage, type AdAngle } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits } from '../../lib/credits';
import type { AdRecipe } from '../../lib/ad-render';

export interface AdItem { id: string; template: AdTemplate; headline: string; url: string; createdAt: string }
export interface AdsResult { error?: string; ads?: AdItem[] }

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
function pickAccent(colors?: string[] | null): string { return pickAccents(colors)[0]!; }

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

function scenePrompt(c: AdConcept, editMode: boolean, universePrompt?: string): string {
  const base = c.sceneBrief.slice(0, 700);
  // Cadrage pensé pour l'overlay : sujet dans les 2/3 hauts, bas plus calme/sombre pour le texte.
  const framing = 'Composition: keep the main subject in the upper two thirds; keep the lower third calmer and less busy so a text panel can sit there. Vertical 4:5 framing, high-end commercial look, crisp focus, natural depth of field.';
  const realism = 'Ultra realistic, photorealistic, true-to-life scale and proportions: the product is shown at its real-world size relative to hands, people and objects, correct perspective, no distortion, no warping, no stretching, accurate label and cap proportions, physically plausible lighting, shadows and reflections.';
  const uni = universePrompt ? `Art direction / visual universe: ${universePrompt}` : '';
  const noText = 'Absolutely NO text, NO words, NO captions, NO logos, NO watermark, NO UI added to the image.';
  if (editMode) {
    return `Place the product from the reference image into a new scene, keeping it EXACTLY identical (same packaging shape, label, logo, text, colors AND real proportions · do not resize, stretch or reshape it). New scene: ${base}. ${uni} ${realism} Premium advertising photography. ${framing} ${noText}`;
  }
  return `${base}. ${uni} ${realism} Premium advertising photography. ${framing} ${noText}`;
}

export async function generateAdsAction(input: {
  productId?: string; personaId?: string; objective?: string; templates?: AdTemplate[]; angle?: string; universe?: string; count?: number;
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
  }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);

  let product: { name: string; description: string | null; usp: string | null; imageUrl: string | null } | null = null;
  if (input.productId) {
    const [p] = await db.select({ name: schema.products.name, description: schema.products.description, usp: schema.products.usp, imageUrl: schema.products.imageUrl })
      .from(schema.products).where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
    if (p) product = p;
  }
  let persona: { name: string; pains: string[] | null; desires: string[] | null } | null = null;
  if (input.personaId) {
    const [p] = await db.select({ name: schema.personas.name, pains: schema.personas.pains, desires: schema.personas.desires })
      .from(schema.personas).where(and(eq(schema.personas.id, input.personaId), eq(schema.personas.brandId, brand.id))).limit(1);
    if (p) persona = p;
  }

  const editMode = !!product?.imageUrl;
  const accents = pickAccents(da?.colors);

  // 1) Concepts (Claude) · un par gabarit, tous au service de l'angle si fourni.
  let concepts: AdConcept[];
  try {
    concepts = await generateAdConcepts(client, {
      brand: brand.name, tone: da?.tone ?? undefined, colors: da?.colors ?? undefined, usp: da?.usp ?? undefined,
      audience: da?.audience ?? undefined, category: da?.category ?? undefined,
      productName: product?.name, productDesc: product?.description ?? undefined, productUsp: product?.usp ?? undefined,
      hasProductPhoto: editMode,
      persona: persona ? { name: persona.name, pains: persona.pains ?? undefined, desires: persona.desires ?? undefined } : undefined,
      objective: input.objective, angle: input.angle?.trim() || undefined,
    }, { templates });
  } catch (e) {
    return { error: 'Écriture des concepts impossible : ' + (e as Error).message };
  }
  if (!concepts.length) return { error: "Aucun concept n'a pu être généré. Réessaie." };

  // Univers visuel : soit imposé, soit varié automatiquement (chaque visuel un univers différent).
  const chosen = input.universe && input.universe !== 'auto' ? VISUAL_UNIVERSES.find((u) => u.key === input.universe) : null;
  const offset = Math.floor(Date.now() / 1000) % VISUAL_UNIVERSES.length;
  const universeFor = (i: number) => chosen ? chosen.prompt : VISUAL_UNIVERSES[(offset + i) % VISUAL_UNIVERSES.length]!.prompt;

  // 2) Scènes (Fal) · en parallèle, chacune dans son univers.
  const scenes = await Promise.all(concepts.map(async (c, i) => {
    try {
      const { images } = await falGenerateImage(cfg, {
        prompt: scenePrompt(c, editMode, universeFor(i)), aspectRatio: '4:5',
        imageUrl: editMode ? product!.imageUrl! : undefined, edit: editMode, count: 1,
      });
      return images[0] || null;
    } catch { return null; }
  }));

  // 3) Enregistrement des recettes (rendu PNG à la demande via /api/ad/[id]).
  const ads: AdItem[] = [];
  for (let i = 0; i < concepts.length; i++) {
    const sceneUrl = scenes[i];
    const c = concepts[i];
    if (!sceneUrl || !c) continue;
    const recipe: AdRecipe = {
      template: c.template, sceneUrl, kicker: c.kicker, headline: c.headline, subhead: c.subhead, cta: c.cta,
      badge: c.badge, quote: c.quote, author: c.author, rating: c.rating, benefits: c.benefits, stat: c.stat, statLabel: c.statLabel,
      accent: accents[i % accents.length]!, brandName: brand.name, logoUrl: da?.logoUrl ?? null,
      productId: input.productId, personaId: input.personaId, objective: input.objective,
    };
    try {
      const [row] = await db.insert(schema.generations).values({
        brandId: brand.id, kind: 'ad', input: recipe as unknown as Record<string, unknown>,
        status: 'completed', assetUrls: [sceneUrl], creditsCost: unlimited ? 0 : costFor('image', 1),
      }).returning({ id: schema.generations.id, createdAt: schema.generations.createdAt });
      if (!row) continue;
      ads.push({ id: row.id, template: c.template, headline: c.headline, url: `/api/ad/${row.id}`, createdAt: (row.createdAt as Date).toISOString() });
    } catch { /* ignore */ }
  }

  if (!ads.length) return { error: "Les scènes n'ont pas pu être générées. Réessaie." };

  // Débit crédits (best-effort), au prorata des pubs réellement produites.
  if (!unlimited) {
    const realCost = costFor('image', ads.length);
    try {
      await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, credits - realCost) }).where(eq(schema.workspaces.id, s.workspaceId));
      await db.insert(schema.creditLedger).values({ workspaceId: s.workspaceId, delta: -realCost, reason: 'Studio · pubs IA' });
    } catch { /* best-effort */ }
  }

  return { ads };
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

  let product: { name: string; description: string | null; usp: string | null; imageUrl: string | null } | null = null;
  if (productId) {
    const [p] = await db!.select({ name: schema.products.name, description: schema.products.description, usp: schema.products.usp, imageUrl: schema.products.imageUrl })
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

/** Clone une pub gagnante : analyse l'image de référence (vision) puis recompose avec ton produit. */
export async function cloneAdAction(input: {
  referenceDataUri: string; productId?: string; personaId?: string; objective?: string;
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

  const m = DATA_URI.exec(input.referenceDataUri?.trim() || '');
  if (!m || !m[1] || !m[2]) return { error: 'Ajoute une image de pub de référence (jpg, png ou webp).' };
  const ref: CloneRefImage = { mediaType: m[1] as CloneRefImage['mediaType'], base64: m[2] };

  const cost = costFor('image', 1);
  const unlimited = unlimitedCredits(s.user.email);
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
  const credits = w?.c ?? 0;
  if (!unlimited && credits < cost) return { error: `Crédits insuffisants (${cost} requis).` };

  const { da, product, persona } = await loadAdContext(brand.id, input.productId, input.personaId);
  const editMode = !!product?.imageUrl;
  const accent = pickAccent(da?.colors);

  let concept: AdConcept | null;
  try {
    concept = await cloneAdFromReference(client, ref, {
      brand: brand.name, tone: da?.tone ?? undefined, colors: da?.colors ?? undefined, usp: da?.usp ?? undefined,
      audience: da?.audience ?? undefined, category: da?.category ?? undefined,
      productName: product?.name, productDesc: product?.description ?? undefined, productUsp: product?.usp ?? undefined,
      hasProductPhoto: editMode,
      persona: persona ? { name: persona.name, pains: persona.pains ?? undefined, desires: persona.desires ?? undefined } : undefined,
      objective: input.objective,
    });
  } catch (e) {
    return { error: "Analyse de la référence impossible : " + (e as Error).message };
  }
  if (!concept) return { error: "La pub de référence n'a pas pu être interprétée. Réessaie." };

  let sceneUrl: string | null = null;
  try {
    const { images } = await falGenerateImage(cfg, {
      prompt: scenePrompt(concept, editMode), aspectRatio: '4:5',
      imageUrl: editMode ? product!.imageUrl! : undefined, edit: editMode, count: 1,
    });
    sceneUrl = images[0] || null;
  } catch { /* échec scène */ }
  if (!sceneUrl) return { error: "La scène n'a pas pu être générée. Réessaie." };

  const recipe: AdRecipe = {
    template: concept.template, sceneUrl, kicker: concept.kicker, headline: concept.headline, subhead: concept.subhead, cta: concept.cta,
    badge: concept.badge, quote: concept.quote, author: concept.author, rating: concept.rating, benefits: concept.benefits, stat: concept.stat, statLabel: concept.statLabel,
    accent, brandName: brand.name, logoUrl: da?.logoUrl ?? null,
    productId: input.productId, personaId: input.personaId, objective: input.objective,
  };
  let ad: AdItem;
  try {
    const [row] = await db.insert(schema.generations).values({
      brandId: brand.id, kind: 'ad', input: recipe as unknown as Record<string, unknown>,
      status: 'completed', assetUrls: [sceneUrl], creditsCost: unlimited ? 0 : cost,
    }).returning({ id: schema.generations.id, createdAt: schema.generations.createdAt });
    if (!row) return { error: "Enregistrement impossible. Réessaie." };
    ad = { id: row.id, template: concept.template, headline: concept.headline, url: `/api/ad/${row.id}`, createdAt: (row.createdAt as Date).toISOString() };
  } catch (e) {
    return { error: 'Enregistrement impossible : ' + (e as Error).message };
  }

  if (!unlimited) {
    try {
      await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, credits - cost) }).where(eq(schema.workspaces.id, s.workspaceId));
      await db.insert(schema.creditLedger).values({ workspaceId: s.workspaceId, delta: -cost, reason: 'Studio · clone de pub' });
    } catch { /* best-effort */ }
  }
  return { ads: [ad] };
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
