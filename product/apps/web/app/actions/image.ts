'use server';

import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { falFromEnv, falGenerateImage, type FalAspect } from '@tiktrends/integrations';
import { enhanceImagePrompt, suggestImageBrief, scoreCreative } from '@tiktrends/ai';
import { costFor, imageModelByKey, falModelFor, UNIVERSE_PREVIEW_STATUS, fenetrePage, borneConsultation, TAILLE_PAGE_GALERIE, promptImage, noteImage, type NoteImage, messageServiceInactif } from '@tiktrends/core';
import { imageJointe } from '../../lib/image-jointe';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { listBrandAssetImageUrls, resolveAssetImageUrls } from './assets';
import { resolveProductImage, probeProductImage } from '../../lib/product-image';
import { logAndTranslate } from '../../lib/error-log';
import { guardedAnthropic, sousPlafond } from '../../lib/spend-guard';
import { GUARD } from '../../lib/guard-error';
import { resolvePreset } from './presets';

export interface ImageResult { error?: string; images?: string[]; prompt?: string; generationId?: string }
export interface BrandImage { id: string; prompt: string; url: string | null; createdAt: string; rating?: import('./creatives').Rating }

export async function generateImageAction(input: {
  prompt: string; aspectRatio?: FalAspect; imageUrl?: string; withText?: boolean; enhance?: boolean; count?: number;
  productId?: string; headline?: string; useProductImage?: boolean;
  /**
   * La scène enregistrée d'où vient cette description, si elle en vient d'une.
   * Consignée dans `generations.input` · c'est par là que le bilan d'une scène
   * remonte (génération → concept → ad → verdict). Sans elle, une scène
   * reprise cent fois afficherait encore « jamais utilisée ».
   */
  presetId?: string;
  /** Direction artistique choisie (catalogue `ad-directions`) · composée dans le
   *  prompt FINAL uniquement, jamais dans la légende affichée/stockée. */
  directionKey?: string;
  /** Assets choisis explicitement comme références · à défaut, la bibliothèque
   *  de la marque est utilisée automatiquement. */
  assetIds?: string[];
  /** Moteur d'image choisi · le studio Image ne pouvait pas en changer. */
  model?: string;
}): Promise<ImageResult> {
  const s = await getSession();
  if (!s) return { error: GUARD.session() };
  const desc = input.prompt?.trim();
  if (!desc) return { error: "Décris l'image à générer." };

  const cfg = falFromEnv();
  if (!cfg) return { error: "La génération d'image n'est pas activée (clé Fal manquante)." };

  const count = Math.min(4, Math.max(1, input.count ?? 1));
  // Le moteur choisi porte son propre tarif · facturer `costFor('image')` quel
  // que soit le modèle reviendrait à vendre GPT Image 2 au prix de Nano Banana.
  const spec = imageModelByKey(input.model);
  // Débit atomique AVANT l'appel Fal (remboursé si la génération échoue) : vérifier
  // puis débiter en deux temps laissait deux lancements simultanés passer pour un débit.
  const cost = spec.credits * count;
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
  // Références marque · les assets choisis explicitement priment, sinon la
  // bibliothèque de la marque est utilisée automatiquement.
  const assetRefUrls = (db && brand && !sourceImage)
    ? (input.assetIds?.length ? await resolveAssetImageUrls(s.workspaceId, input.assetIds) : await listBrandAssetImageUrls(s.workspaceId, brand.id, 3))
    : [];
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

  // Le prompt maison · il était CONSIGNÉ dans la génération et jamais appliqué.
  //
  // Choisir une scène enregistrée ne changeait donc rien à l'image produite, et
  // c'est pire que de ne rien faire : la génération portait quand même le
  // preset, et le classement « quel prompt gagne » lui attribuait des verdicts
  // qu'il n'avait pas produits.
  //
  // Il passe APRÈS la description · celle-ci est ce que la personne veut voir,
  // le preset est une direction artistique. L'ordre inverse ferait de la demande
  // une nuance de la DA.
  const preset = await resolvePreset(s.workspaceId, input.presetId);
  const avecDa = preset
    ? [prompt, preset.prompt.trim() ? `Art direction: ${preset.prompt.trim()}` : '',
       preset.negative?.trim() ? `Avoid: ${preset.negative.trim()}` : ''].filter(Boolean).join('\n\n')
    : prompt;

  // Direction artistique · scène/lumière/finition (et typo/disposition si texte)
  // du catalogue mesuré. Composée dans le prompt FINAL seulement · la légende
  // affichée et stockée reste la description de la personne, pas le bloc anglais.
  const avecDirection = promptImage(avecDa, input.directionKey, !!input.withText);

  // Références marque venant de la bibliothèque (quand pas de source produit).
  const finalPrompt = useAssetRefs
    ? `${avecDirection}\nUse the provided images as brand reference material (style, palette, materials, authenticity); do not copy any text or logo from them.`
    : avecDirection;

  try {
    // Barrière de dépense réelle · la génération d'image est facturée au coup.
    const aRef = !!sourceImage || useAssetRefs;
    const { images } = await sousPlafond('fal_image', { action: 'image', workspaceId: s.workspaceId, units: count }, () => falGenerateImage(cfg, {
      prompt: finalPrompt, aspectRatio: input.aspectRatio ?? '1:1',
      imageUrl: sourceImage, imageUrls: useAssetRefs ? assetRefUrls : undefined,
      withText: input.withText, count, edit: editMode || useAssetRefs,
      model: falModelFor(spec, aRef), params: spec.params,
    }));
    let generationId: string | undefined;
    if (db) {
      if (brand) {
        try { const [g] = await db.insert(schema.generations).values({ brandId: brand.id, kind: 'image', input: { prompt, aspectRatio: input.aspectRatio ?? '1:1', model: spec.key, ...(input.presetId ? { presetId: input.presetId } : {}) }, status: 'completed', assetUrls: images, creditsCost: unlimited ? 0 : cost }).returning({ id: schema.generations.id }); generationId = g?.id; } catch { /* ignore */ }
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
  if (!s) return { error: GUARD.session() };
  const client = guardedAnthropic({ action: 'image' });
  if (!client) return { error: GUARD.aiOff() };

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
  if (!s || !db) return { error: GUARD.session() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };

  const [p] = await db.select({ id: schema.products.id }).from(schema.products)
    .where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
  if (!p) return { error: GUARD.notFound('ce produit') };

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
  if (!s || !db) return { error: GUARD.session() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };

  const [p] = await db.select({ id: schema.products.id, imageUrls: schema.products.imageUrls }).from(schema.products)
    .where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
  if (!p) return { error: GUARD.notFound('ce produit') };

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

/** Une page de la galerie Image · lot 13 (voir core/galerie-pagination). */
export interface PageImages {
  items: BrandImage[];
  page: number;
  pages: number;
  de: number;
  a: number;
  /** Visuels produits (une génération Image en produit plusieurs). */
  sorties: number;
  /** Générations ayant produit au moins un visuel. */
  generations: number;
  /** Notes sur TOUTES les sorties (débrief), pas seulement la page. */
  notes: { up: number; down: number };
  /** Borne de la consultation (ISO) · à renvoyer pour paginer sans décalage. */
  jusqua: string;
}

const PAGE_IMAGES_VIDE = (jusqua: string): PageImages => ({ items: [], page: 0, pages: 1, de: 0, a: 0, sorties: 0, generations: 0, notes: { up: 0, down: 0 }, jusqua });

/**
 * Une page de la galerie Image de la marque active · lecture seule.
 *
 * Lot 13 · on chargeait les 24 dernières générations puis on paginait ce
 * reliquat côté client · les plus anciennes devenaient inaccessibles. Ici, la
 * pagination porte sur TOUTES les sorties (une ligne par visuel, `unnest` avec
 * son rang), triées de façon stable (date ↓, id ↓, rang ↑), sous la borne de
 * consultation · jamais plus de TAILLE_PAGE_GALERIE lignes chargées.
 */
export async function pageImagesMarque(p: { page?: number; jusqua?: string } = {}): Promise<PageImages> {
  const borne = borneConsultation(p.jusqua, new Date());
  const iso = borne.toISOString();
  const s = await getSession();
  if (!s || !db) return PAGE_IMAGES_VIDE(iso);
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return PAGE_IMAGES_VIDE(iso);
  const g = schema.generations;
  // Mêmes exclusions qu'avant (archivés, aperçus d'univers), APPLIQUÉES AVANT le
  // découpage · elles l'étaient après le `limit(24)`.
  const visible = sql`${g.brandId} = ${brand.id} and ${g.kind} = 'image' and coalesce(${g.status}, '') not in ('archived', ${UNIVERSE_PREVIEW_STATUS}) and ${g.createdAt} <= ${iso}`;
  const [c] = (await db.execute(sql`
    select count(*)::int as sorties, count(distinct ${g.id})::int as generations,
      count(*) filter (where ${g.input}->>'rating' = 'up')::int as up,
      count(*) filter (where ${g.input}->>'rating' = 'down')::int as down
    from ${g} cross join lateral unnest(${g.assetUrls}) as u(url)
    where ${visible}`)) as unknown as Array<{ sorties: number; generations: number; up: number; down: number }>;
  const f = fenetrePage(c?.sorties ?? 0, p.page ?? 0, TAILLE_PAGE_GALERIE);
  const rows = (await db.execute(sql`
    select ${g.id} as id, ${g.input} as input, ${g.createdAt} as created_at, u.url as url, u.ord as ord
    from ${g} cross join lateral unnest(${g.assetUrls}) with ordinality as u(url, ord)
    where ${visible}
    order by ${g.createdAt} desc, ${g.id} desc, u.ord asc
    limit ${TAILLE_PAGE_GALERIE} offset ${f.offset}`)) as unknown as Array<{ id: string; input: unknown; created_at: Date | string; url: string; ord: number }>;
  const items: BrandImage[] = rows.map((r) => {
    const input = (r.input ?? {}) as { prompt?: string; rating?: import('./creatives').Rating };
    return { id: r.id + ':' + r.url, prompt: input.prompt || '', url: r.url, createdAt: new Date(r.created_at).toISOString(), rating: input.rating ?? null };
  });
  return { items, page: f.page, pages: f.pages, de: f.de, a: f.a, sorties: c?.sorties ?? 0, generations: c?.generations ?? 0, notes: { up: c?.up ?? 0, down: c?.down ?? 0 }, jusqua: iso };
}

/**
 * Relire un visuel · le « score Jarvis », appliqué au studio Image.
 *
 * Le studio Image n'avait aucune relecture automatique · on réutilise le scoring
 * de créa (qui sait regarder l'image) et on le lit en une note affichable
 * (`noteImage`, core · plafonnée par les ratés rédhibitoires). Le modèle regarde,
 * le noyau décide · la note n'invente rien qu'un raté visible contredirait.
 */
export async function scoreImageAction(input: { url: string; prompt?: string }): Promise<{ note?: NoteImage; error?: string }> {
  const s = await getSession();
  if (!s) return { error: GUARD.session() };
  const client = guardedAnthropic({ action: 'image:score', workspaceId: s.workspaceId });
  // Copie client · aucun nom de clé ni de « serveur » (recette #106b).
  if (!client) return { error: messageServiceInactif('relecture_image') };
  const img = await imageJointe(input.url);
  if (!img) return { error: 'Visuel illisible · impossible de le relire.' };

  const brand = await getActiveBrand(s.workspaceId);
  let ctx: { brand?: string; tone?: string; usp?: string } = {};
  if (db && brand) {
    const [row] = await db.select({ tone: schema.brands.tone, usp: schema.brands.usp })
      .from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
    ctx = { brand: brand.name, tone: row?.tone ?? undefined, usp: row?.usp ?? undefined };
  }
  try {
    const sc = await scoreCreative(client, ctx, {
      headline: input.prompt?.trim() || 'Visuel',
      image: { mediaType: img.mediaType as 'image/png' | 'image/jpeg' | 'image/webp', base64: img.base64 },
    });
    const note = noteImage(sc);
    if (!note) return { error: "La relecture n'a rien pu conclure." };
    return { note };
  } catch (e) {
    return { error: logAndTranslate('image:score', e, { subject: 'la relecture du visuel', workspaceId: s.workspaceId }) };
  }
}
