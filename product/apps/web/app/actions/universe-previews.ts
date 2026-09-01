'use server';

import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { VISUAL_UNIVERSES } from '@tiktrends/ai';
import {
  planUniversePreviews, imageModelByKey, falModelFor,
  UNIVERSE_PREVIEW_STATUS, type PreviewPlan,
} from '@tiktrends/core';
import { falFromEnv, falGenerateImage } from '@tiktrends/integrations';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { roleAtLeast } from '../../lib/rbac';
import { reserveCredits, refundCredits, unlimitedCredits } from '../../lib/credits';
import { guardFixedCost } from '../../lib/spend-guard';
import { listBrandAssetImageUrls } from './assets';
import { logAndTranslate, logFailure } from '../../lib/error-log';
import { GUARD } from '../../lib/guard-error';

/**
 * Fabriquer les aperçus d'univers de la marque.
 *
 * ── Pourquoi ça n'arrive jamais tout seul ────────────────────────────────────
 *
 * Ces images coûtent. Rien ici ne part sans un clic, et le clic connaît le prix
 * · le plan est calculé, montré, et seulement ensuite exécuté. Aucune
 * fabrication n'est déclenchée par un chargement de page.
 *
 * ── Le brief est le MÊME pour les huit ───────────────────────────────────────
 *
 * C'est ce qui rend les vignettes comparables. Si la scène changeait en même
 * temps que l'univers, on ne saurait pas ce qui a produit la différence, et
 * choisir « à l'œil » reviendrait à choisir au hasard avec une illustration.
 *
 * Seul le paragraphe de direction artistique change.
 */

/** Un brief neutre · le produit, bien posé, sans mise en scène narrative. */
const BRIEF = 'Product presentation shot. The product is centred and clearly readable, '
  + 'filling most of the frame, sharp focus, no text, no logo, no watermark, no people speaking to camera.';

export interface UniversePreviewsView {
  /** Clé d'univers → URL de l'aperçu fabriqué. */
  previews: Record<string, string>;
  plan: PreviewPlan;
  /** Crédits par image sur le moteur retenu · sert à afficher le prix. */
  creditsPerImage: number;
  /** Faux quand la clé Fal manque · le bouton n'a alors rien à proposer. */
  ready: boolean;
  error?: string;
}

/** Le moteur des aperçus · le moins cher qui tienne, ils ne sont pas la créa finale. */
const MODELE_APERCU = 'nano';

/* -------------------------------------------------------------------------- */

async function lireApercus(brandId: string): Promise<Record<string, string>> {
  if (!db) return {};
  const rows = await db.select({ input: schema.generations.input, assetUrls: schema.generations.assetUrls })
    .from(schema.generations)
    .where(and(
      eq(schema.generations.brandId, brandId),
      eq(schema.generations.kind, 'image'),
      eq(schema.generations.status, UNIVERSE_PREVIEW_STATUS),
    ))
    .orderBy(desc(schema.generations.createdAt))
    .limit(60);

  const out: Record<string, string> = {};
  for (const r of rows) {
    const key = (r.input as { universePreview?: string } | null)?.universePreview;
    const url = r.assetUrls?.[0];
    // Le plus récent gagne · on parcourt du plus récent au plus ancien et on ne
    // réécrit pas, pour qu'un « refaire » remplace vraiment ce qui s'affiche.
    if (key && url && !out[key]) out[key] = url;
  }
  return out;
}

/** L'état, sans rien fabriquer · c'est ce que la page lit au chargement. */
export async function universePreviewsAction(): Promise<UniversePreviewsView> {
  const spec = imageModelByKey(MODELE_APERCU);
  const vide = (error?: string): UniversePreviewsView => ({
    previews: {}, creditsPerImage: spec.credits, ready: false, error,
    plan: planUniversePreviews({ all: [], existing: [], creditsPerImage: spec.credits }),
  });

  const s = await getSession();
  if (!s || !db) return vide();
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return vide();

  try {
    const previews = await lireApercus(brand.id);
    return {
      previews,
      creditsPerImage: spec.credits,
      ready: !!falFromEnv(),
      plan: planUniversePreviews({
        all: VISUAL_UNIVERSES.map((u) => u.key),
        existing: Object.keys(previews),
        creditsPerImage: spec.credits,
      }),
    };
  } catch (e) {
    return vide(logAndTranslate('universe-previews:read', e, { subject: 'les aperçus d’univers', workspaceId: s.workspaceId }));
  }
}

/* -------------------------------------------------------------------------- */

export interface PreviewRunResult { made?: number; failed?: number; error?: string }

/**
 * Fabrique les aperçus manquants.
 *
 * ── L'ordre des opérations protège la facture ────────────────────────────────
 *
 * Le plan est **recalculé ici**, jamais reçu du navigateur · sinon un second
 * onglet, un double clic ou une requête forgée referait ce qui existe déjà.
 *
 * Les crédits sont réservés en bloc AVANT, puis ce qui n'a pas abouti est
 * remboursé · vérifier puis débiter en deux temps laisserait deux lancements
 * simultanés passer pour un seul.
 */
export async function generateUniversePreviewsAction(input?: { force?: boolean }): Promise<PreviewRunResult> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  // Fabriquer coûte · un rôle qui ne peut pas générer ne peut pas dépenser ici.
  if (!roleAtLeast(s.role, 'member')) return { error: 'Ton rôle ne permet pas de lancer une fabrication.' };

  const cfg = falFromEnv();
  if (!cfg) return { error: "La génération d'image n'est pas activée (clé Fal manquante)." };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };

  const spec = imageModelByKey(MODELE_APERCU);

  try {
    const existants = await lireApercus(brand.id);
    const plan = planUniversePreviews({
      all: VISUAL_UNIVERSES.map((u) => u.key),
      existing: Object.keys(existants),
      creditsPerImage: spec.credits,
      force: !!input?.force,
    });
    if (!plan.missing.length) return { error: plan.blocked ?? 'Rien à fabriquer.' };

    const unlimited = unlimitedCredits(s.user.email);
    if (!unlimited && !(await reserveCredits(s.workspaceId, plan.credits, 'Aperçus d’univers'))) {
      return { error: `Crédits insuffisants (${plan.credits} requis pour ${plan.missing.length} aperçu(s)).` };
    }

    // La photo produit rend l'aperçu utile · sans elle on montrerait une ambiance
    // sur un objet quelconque, c'est-à-dire à peu près ce qu'on devine déjà en
    // lisant le nom de l'univers.
    const [produit] = await db.select({ imageUrl: schema.products.imageUrl, imageUrls: schema.products.imageUrls })
      .from(schema.products).where(eq(schema.products.brandId, brand.id)).limit(1);
    const photos = (produit?.imageUrls?.length ? produit.imageUrls : produit?.imageUrl ? [produit.imageUrl] : [])
      .slice(0, 2);
    const refs = photos.length ? photos : await listBrandAssetImageUrls(s.workspaceId, brand.id, 2);

    let made = 0;
    for (const key of plan.missing) {
      const uni = VISUAL_UNIVERSES.find((u) => u.key === key);
      if (!uni) continue;
      try {
        await guardFixedCost('fal_image', { action: 'universe:preview', workspaceId: s.workspaceId, units: 1 });
        const { images } = await falGenerateImage(cfg, {
          prompt: `${BRIEF}\n\nArt direction / visual universe: ${uni.prompt}`,
          aspectRatio: '4:5',
          imageUrls: refs.length ? refs : undefined,
          edit: refs.length > 0,
          count: 1,
          model: falModelFor(spec, refs.length > 0),
          params: spec.params,
        });
        const url = images[0];
        if (!url) continue;

        await db.insert(schema.generations).values({
          brandId: brand.id, kind: 'image',
          // Le statut range l'image hors de la galerie de la marque · sans lui
          // elle y apparaîtrait comme si quelqu'un l'avait demandée.
          status: UNIVERSE_PREVIEW_STATUS,
          input: { universePreview: key, prompt: uni.label, model: spec.key },
          assetUrls: [url],
          creditsCost: unlimited ? 0 : spec.credits,
        });
        made++;
      } catch (e) {
        // Un échec sur un univers ne condamne pas les sept autres · il est
        // journalisé, remboursé, et l'univers gardera son dégradé.
        logFailure(`universe:preview:${key}`, e, s.workspaceId);
      }
    }

    if (!unlimited) {
      const rendu = plan.credits - spec.credits * made;
      if (rendu > 0) await refundCredits(s.workspaceId, rendu, 'Remboursement · aperçus non fabriqués');
    }

    return { made, failed: plan.missing.length - made };
  } catch (e) {
    return { error: logAndTranslate('universe-previews:run', e, { subject: 'la fabrication des aperçus', workspaceId: s.workspaceId }) };
  }
}
