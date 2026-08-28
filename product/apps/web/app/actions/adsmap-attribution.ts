'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  attributionStats, attributionByPart, PART_LABEL,
  type AttributedAd, type AttributionResult, type PartResult,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';

/**
 * Est-ce que la mémoire de Jarvis améliore vraiment les résultats ?
 *
 * C'est la question qui manquait, et elle est plus importante qu'elle n'en a
 * l'air : sans elle, on empile des mémoires sur la foi qu'elles aident. Un outil
 * qui ne vérifie pas ses propres règles n'apprend pas, il accumule.
 *
 * ── Le chemin de la donnée ───────────────────────────────────────────────────
 *
 * Au moment de générer, on consigne dans la génération ce que Jarvis lui a donné
 * (`input.memoryUse`). Plus tard, la créa est poussée dans la carte, testée,
 * mesurée, arbitrée. Le pont entre les deux est `concepts.source_ref`, écrit par
 * la passerelle Studio → ADSMAP.
 *
 * On remonte donc : verdict → ad → concept → génération → ce que Jarvis savait
 * ce jour-là.
 *
 * ── Ce qu'on ne prétend pas ──────────────────────────────────────────────────
 *
 * Ce n'est pas une expérience contrôlée, et le fichier ne fait pas semblant. Le
 * groupe témoin est historiquement plus ancien · une marque qui progresse
 * progresserait de toute façon. Le calcul pur exige donc un effectif minimal ET
 * des intervalles disjoints avant de conclure quoi que ce soit.
 */

export interface AttributionView {
  overall: AttributionResult;
  parts: Array<PartResult & { label: string }>;
  /** Ads issues du Studio et arbitrées · le vivier de la comparaison. */
  total: number;
}

export async function attributionViewAction(): Promise<{ view?: AttributionView; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    // Ads de la marque qui ont un verdict ARBITRÉ · un verdict calculé peut
    // encore bouger, et comparer des chiffres provisoires ne prouve rien.
    const ads = await db!.select({
      adId: schema.ads.id,
      sourceRef: schema.concepts.sourceRef,
      validated: schema.verdicts.validated,
    })
      .from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .innerJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(and(
        eq(schema.ads.workspaceId, g.s.workspaceId),
        eq(schema.personas.brandId, g.brand.id),
        eq(schema.verdicts.status, 'validated'),
      ))
      .limit(800);

    if (!ads.length) {
      return {
        view: {
          total: 0,
          overall: attributionStats([]),
          parts: attributionByPart([]).map((p) => ({ ...p, label: PART_LABEL[p.part] })),
        },
      };
    }

    // Le pont Studio → ADSMAP · `sourceRef.generationId` est posé par la passerelle.
    const genIds = ads
      .map((a) => (a.sourceRef as { generationId?: string } | null)?.generationId)
      .filter((x): x is string => !!x);

    const gens = genIds.length
      ? await db!.select({ id: schema.generations.id, input: schema.generations.input })
          .from(schema.generations)
          .where(inArray(schema.generations.id, genIds))
      : [];
    const parGen = new Map(gens.map((x) => [x.id, x.input as { memoryUse?: AttributedAd['memory'] } | null]));

    const attribues: AttributedAd[] = ads.map((a) => {
      const gid = (a.sourceRef as { generationId?: string } | null)?.generationId;
      const input = gid ? parGen.get(gid) : null;
      return {
        // `null` quand rien n'a été consigné · une ad importée ou saisie à la
        // main n'a pas de mémoire à son actif, et compte comme témoin.
        memory: input?.memoryUse ?? null,
        verdict: a.validated ?? null,
      };
    });

    return {
      view: {
        total: attribues.length,
        overall: attributionStats(attribues),
        parts: attributionByPart(attribues).map((p) => ({ ...p, label: PART_LABEL[p.part] })),
      },
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:attribution', e, { subject: 'la mesure de l’effet de Jarvis', workspaceId: g.s.workspaceId }) };
  }
}
