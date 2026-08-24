'use server';

import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { falFromEnv, falGenerateImage } from '@tiktrends/integrations';
import { anthropicFromEnv, generateAdConcepts, AD_TEMPLATES, type AdTemplate, type AdConcept } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits } from '../../lib/credits';
import type { AdRecipe } from '../../lib/ad-render';

export interface AdItem { id: string; template: AdTemplate; headline: string; url: string; createdAt: string }
export interface AdsResult { error?: string; ads?: AdItem[] }

/** Choisit une couleur d'accent lisible (bouton/CTA) dans la DA, sinon un bleu par défaut. */
function pickAccent(colors?: string[] | null): string {
  const list = (colors ?? []).filter((c) => /^#?[0-9a-fA-F]{6}$/.test(c.trim()));
  for (const raw of list) {
    const hex = raw.trim().replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; // ni trop sombre ni trop clair
    if (lum > 0.18 && lum < 0.82) return '#' + hex;
  }
  return list[0] ? '#' + list[0].trim().replace('#', '') : '#2563EB';
}

function scenePrompt(c: AdConcept, editMode: boolean): string {
  const base = c.sceneBrief.slice(0, 700);
  // Cadrage pensé pour l'overlay : sujet dans les 2/3 hauts, bas plus calme/sombre pour le texte.
  const framing = 'Composition: keep the main subject in the upper two thirds; keep the lower third calmer and less busy so a text panel can sit there. Vertical 4:5 framing, high-end commercial look, crisp focus, natural depth of field.';
  const noText = 'Absolutely NO text, NO words, NO captions, NO logos, NO watermark, NO UI in the image.';
  if (editMode) {
    return `Keep the product EXACTLY as in the input photo (same packaging, label, logo, text, colors, proportions). Only restyle the surrounding scene: ${base}. Premium advertising photography, photoreal, soft studio lighting. ${framing} ${noText}`;
  }
  return `${base}. Premium advertising photography, photoreal, cinematic lighting. ${framing} ${noText}`;
}

export async function generateAdsAction(input: {
  productId?: string; personaId?: string; objective?: string; templates?: AdTemplate[];
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

  const templates = (input.templates && input.templates.length ? input.templates : AD_TEMPLATES).slice(0, 4);
  const cost = costFor('image', templates.length);
  const unlimited = unlimitedCredits(s.user.email);
  let credits = 0;
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
  credits = w?.c ?? 0;
  if (!unlimited && credits < cost) return { error: `Crédits insuffisants (${cost} requis pour ${templates.length} pub(s)).` };

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
  const accent = pickAccent(da?.colors);

  // 1) Concepts (Claude) — un par gabarit.
  let concepts: AdConcept[];
  try {
    concepts = await generateAdConcepts(client, {
      brand: brand.name, tone: da?.tone ?? undefined, colors: da?.colors ?? undefined, usp: da?.usp ?? undefined,
      audience: da?.audience ?? undefined, category: da?.category ?? undefined,
      productName: product?.name, productDesc: product?.description ?? undefined, productUsp: product?.usp ?? undefined,
      hasProductPhoto: editMode,
      persona: persona ? { name: persona.name, pains: persona.pains ?? undefined, desires: persona.desires ?? undefined } : undefined,
      objective: input.objective,
    }, { templates });
  } catch (e) {
    return { error: 'Écriture des concepts impossible : ' + (e as Error).message };
  }
  if (!concepts.length) return { error: "Aucun concept n'a pu être généré. Réessaie." };

  // 2) Scènes (Fal) — en parallèle.
  const scenes = await Promise.all(concepts.map(async (c) => {
    try {
      const { images } = await falGenerateImage(cfg, {
        prompt: scenePrompt(c, editMode), aspectRatio: '4:5',
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
      badge: c.badge, quote: c.quote, author: c.author, rating: c.rating, benefits: c.benefits,
      accent, brandName: brand.name, logoUrl: da?.logoUrl ?? null,
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
      await db.insert(schema.creditLedger).values({ workspaceId: s.workspaceId, delta: -realCost, reason: 'Studio — pubs IA' });
    } catch { /* best-effort */ }
  }

  return { ads };
}

/** Liste les publicités déjà composées pour la marque active. */
export async function listBrandAds(): Promise<AdItem[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return [];
  const rows = await db.select({ id: schema.generations.id, input: schema.generations.input, createdAt: schema.generations.createdAt })
    .from(schema.generations)
    .where(and(eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad')))
    .orderBy(desc(schema.generations.createdAt)).limit(30);
  return rows.map((r) => {
    const rec = (r.input ?? {}) as Partial<AdRecipe>;
    return { id: r.id, template: (rec.template ?? 'problem_solution') as AdTemplate, headline: rec.headline ?? '', url: `/api/ad/${r.id}`, createdAt: (r.createdAt as Date).toISOString() };
  });
}
