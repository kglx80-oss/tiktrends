'use server';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { invalidateJarvisMemory, briefConceptBeforeLaunch } from '../../lib/jarvis-memory';
import { ensureGraphPath } from '../../lib/adsmap-path';

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

const guard = adsmapGuard;

export interface BridgeResult { ok?: true; adId?: string; conceptId?: string; prelaunch?: string; error?: string; /** La génération était déjà suivie · fiche existante renvoyée (lot 17). */ dejaSuivie?: true }

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
