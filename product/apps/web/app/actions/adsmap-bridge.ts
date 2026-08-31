'use server';

import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { invalidateJarvisMemory, briefConceptBeforeLaunch } from '../../lib/jarvis-memory';
import { ensureGraphPath, nextVariant } from '../../lib/adsmap-path';

/**
 * Passerelles entre le reste du produit et ADSMAP.
 *
 * Sans elles, ADSMAP serait un tableur de plus : on génère dans le Studio, on
 * repère une pub dans la Veille, et il faudrait tout ressaisir pour la suivre.
 * La boucle du cahier des charges (concept → ad → test → verdict → itération) ne
 * se referme que si l'entrée dans la carte coûte un clic.
 *
 * Principe commun : la créa entre en `draft`, pas en `ready`. L'invariant §2.4
 * exige hypothèse, variable, offre et page de destination avant le test · on ne
 * les invente pas ici, on amène la créa jusqu'à la porte.
 */

/** Gabarit du Studio → mécanisme d'angle ADSMAP. */
const TEMPLATE_MECHANISM: Record<string, string> = {
  problem_solution: 'problem_agitate',
  before_after: 'comparison',
  testimonial: 'social_proof',
  social_proof: 'social_proof',
  benefit_stack: 'listicle',
  listicle: 'listicle',
  demo: 'demo',
  offer: 'scarcity',
  comparison: 'comparison',
  story: 'story',
  ugc: 'story',
  stat: 'statistic_shock',
};

const guard = adsmapGuard;

export interface BridgeResult { ok?: true; adId?: string; conceptId?: string; prelaunch?: string; error?: string }

/**
 * Studio → ADSMAP · une créa générée devient une ad suivie.
 *
 * C'est la passerelle qui referme la boucle : sans elle, on génère d'un côté et
 * on mesure de l'autre, sans jamais relier la proposition au résultat.
 */
export async function trackGeneratedAdAction(generationId: string): Promise<BridgeResult> {
  const g = await guard();
  if ('error' in g) return { error: g.error };

  try {
    const [gen] = await db!.select({ id: schema.generations.id, input: schema.generations.input, assetUrls: schema.generations.assetUrls, brandId: schema.generations.brandId })
      .from(schema.generations)
      .where(and(eq(schema.generations.id, generationId), eq(schema.generations.brandId, g.brand.id), eq(schema.generations.kind, 'ad')))
      .limit(1);
    if (!gen) return { error: 'Créa introuvable dans cette marque.' };

    const r = (gen.input ?? {}) as {
      template?: string; headline?: string; kicker?: string; subhead?: string; cta?: string;
      personaId?: string; objective?: string; adsmapAdId?: string;
    };
    // Déjà suivie : on renvoie vers l'existant plutôt que de créer un doublon.
    if (r.adsmapAdId) return { ok: true, adId: r.adsmapAdId, error: undefined };

    const titre = (r.headline || 'Créa Studio').slice(0, 160);
    const angleLabel = (r.kicker || r.objective || titre).slice(0, 160);
    const mechanism = TEMPLATE_MECHANISM[r.template ?? ''] ?? 'demo';

    const path = await ensureGraphPath({
      workspaceId: g.s.workspaceId, brandId: g.brand.id, personaId: r.personaId ?? null,
      desireLabel: 'À qualifier (Studio)', angleLabel, mechanism,
    });
    if (!path) return { error: 'Rattachement impossible.' };

    // Un concept par titre+angle · une seconde variante du même concept s'y ajoute.
    const [c0] = await db!.select({ id: schema.concepts.id }).from(schema.concepts)
      .where(and(eq(schema.concepts.angleId, path.angleId), eq(schema.concepts.title, titre))).limit(1);
    const conceptId = c0?.id ?? (await db!.insert(schema.concepts).values({
      workspaceId: g.s.workspaceId, angleId: path.angleId, title: titre,
      callout: r.kicker ?? null, valueBlock: r.subhead ?? null, cta: r.cta ?? null,
      adType: 'ideation', status: 'proposed', sourceRef: { generationId: gen.id },
    }).returning({ id: schema.concepts.id }))[0]!.id;

    const [ad] = await db!.insert(schema.ads).values({
      workspaceId: g.s.workspaceId, conceptId,
      variantCode: await nextVariant(conceptId),
      format: 'static', adType: 'ideation', status: 'draft',
      assetUrl: (gen.assetUrls && gen.assetUrls[0]) || `/api/ad/${gen.id}`,
    }).returning({ id: schema.ads.id });
    if (!ad) return { error: 'Création impossible.' };

    // Trace le lien dans la génération · évite un doublon au second clic.
    await db!.update(schema.generations)
      .set({ input: sql`coalesce(${schema.generations.input}, '{}'::jsonb) || ${JSON.stringify({ adsmapAdId: ad.id })}::jsonb` })
      .where(eq(schema.generations.id, gen.id));

    invalidateJarvisMemory(g.brand.id);
    // L'avis complet plutôt que le seul score : c'est l'accroche qui porte le
    // signal le plus fort, et elle est ici sous la main.
    const avis = await briefConceptBeforeLaunch(g.brand.id, g.s.workspaceId, {
      mechanism, format: 'static', candidateHook: r.headline ?? null,
    });
    return { ok: true, adId: ad.id, conceptId, prelaunch: avis.summary };
  } catch (e) {
    return { error: logAndTranslate('adsmap:track-generated', e, { subject: 'le rattachement à la carte', workspaceId: g.s.workspaceId }) };
  }
}

/**
 * Veille → ADSMAP · une pub concurrente sauvegardée devient un concept `imitation`.
 *
 * Le cahier des charges type ces ads à part (§5) : on ne reprend pas une pub
 * concurrente comme une idée maison, on assume qu'on en reprend la structure, et
 * le verdict dira si elle transpose.
 */
export async function trackSavedAdAction(ref: { platform: string; externalId: string }): Promise<BridgeResult> {
  const g = await guard();
  if ('error' in g) return { error: g.error };

  try {
    // Repérée par (plateforme, identifiant externe) : c'est ce que porte l'écran
    // de veille, et c'est la clé unique de la table.
    const [saved] = await db!.select({ id: schema.savedAds.id, snapshot: schema.savedAds.snapshot, platform: schema.savedAds.platform })
      .from(schema.savedAds)
      .where(and(
        eq(schema.savedAds.workspaceId, g.s.workspaceId),
        eq(schema.savedAds.platform, ref.platform),
        eq(schema.savedAds.externalId, ref.externalId),
      ))
      .limit(1);
    if (!saved) return { error: 'Pub sauvegardée introuvable.' };

    const snap = (saved.snapshot ?? {}) as { advertiserName?: string; body?: string; callToAction?: string; id?: string };
    const annonceur = (snap.advertiserName || 'Concurrent').slice(0, 80);
    const copy = (snap.body || '').replace(/\s+/g, ' ').trim();
    const titre = `Imitation · ${annonceur}${copy ? ` — ${copy.slice(0, 90)}` : ''}`.slice(0, 160);

    const path = await ensureGraphPath({
      workspaceId: g.s.workspaceId, brandId: g.brand.id,
      desireLabel: 'À qualifier (veille)', angleLabel: `Structure reprise de ${annonceur}`,
      mechanism: 'comparison',
    });
    if (!path) return { error: 'Rattachement impossible.' };

    const [c0] = await db!.select({ id: schema.concepts.id }).from(schema.concepts)
      .where(and(eq(schema.concepts.angleId, path.angleId), eq(schema.concepts.title, titre))).limit(1);
    if (c0) return { ok: true, conceptId: c0.id, error: undefined };

    const [concept] = await db!.insert(schema.concepts).values({
      workspaceId: g.s.workspaceId, angleId: path.angleId, title: titre,
      valueBlock: copy ? copy.slice(0, 900) : null, cta: snap.callToAction ?? null,
      adType: 'imitation', status: 'proposed',
      sourceRef: { savedAdId: saved.id, platform: saved.platform, externalId: snap.id ?? null },
    }).returning({ id: schema.concepts.id });
    if (!concept) return { error: 'Création impossible.' };

    const [ad] = await db!.insert(schema.ads).values({
      workspaceId: g.s.workspaceId, conceptId: concept.id, variantCode: 'v1',
      format: 'video_ugc', adType: 'imitation', status: 'draft',
      platform: saved.platform === 'tiktok' ? 'tiktok' : 'meta',
    }).returning({ id: schema.ads.id });

    invalidateJarvisMemory(g.brand.id);
    const avis = await briefConceptBeforeLaunch(g.brand.id, g.s.workspaceId, {
      mechanism: 'comparison', format: 'video_ugc', candidateHook: copy || null,
    });
    return { ok: true, adId: ad?.id, conceptId: concept.id, prelaunch: avis.summary };
  } catch (e) {
    return { error: logAndTranslate('adsmap:track-saved', e, { subject: 'le rattachement à la carte', workspaceId: g.s.workspaceId }) };
  }
}

/**
 * ADSMAP → Studio · le brief d'un concept, prêt à générer.
 * Renvoie de quoi pré-remplir le Studio plutôt que de forcer une navigation
 * aveugle : l'angle et le call-out sont ce que le générateur attend.
 */
export async function conceptBriefAction(conceptId: string): Promise<{ angle?: string; objective?: string; title?: string; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  try {
    const [c] = await db!.select({
      title: schema.concepts.title, callout: schema.concepts.callout, valueBlock: schema.concepts.valueBlock,
      angleLabel: schema.angles.label, desireLabel: schema.desires.label,
    })
      .from(schema.concepts)
      .leftJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .leftJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .where(and(eq(schema.concepts.id, conceptId), eq(schema.concepts.workspaceId, g.s.workspaceId)))
      .limit(1);
    if (!c) return { error: 'Concept introuvable.' };
    return {
      title: c.title,
      angle: [c.angleLabel, c.callout].filter(Boolean).join(' · ') || c.title,
      objective: c.desireLabel ?? undefined,
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:concept-brief', e, { subject: 'la lecture du concept', workspaceId: g.s.workspaceId }) };
  }
}
