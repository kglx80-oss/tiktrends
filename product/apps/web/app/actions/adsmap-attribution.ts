'use server';

import { and, count, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  attributionStats, attributionByPart, memoryOrigin, creativeTrend, PART_LABEL,
  type AttributedAd, type AttributionResult, type MemoryUse, type PartResult, type TrendResult,
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
 * mesurée, arbitrée. Le pont entre les deux est `ads.source_ref`, écrit par la
 * passerelle Studio → ADSMAP.
 *
 * On remonte donc : verdict → ad → génération → ce que Jarvis savait ce jour-là.
 *
 * ── Le pont a changé de niveau ───────────────────────────────────────────────
 *
 * Il vivait sur le CONCEPT. Plusieurs ads pendent au même concept · les
 * variantes v1, v2, v3 sont exactement ça, et la passerelle réutilise un concept
 * quand le titre coïncide. Les variantes héritaient donc de la mémoire de la
 * première génération.
 *
 * Comme les concepts anciens sont ceux d'avant la mémoire, chaque variante
 * récente tombait dans le groupe témoin · le calcul était biaisé contre la
 * réponse qu'il cherchait. Le lien est maintenant posé sur l'ad, et le concept
 * ne sert plus que de repli quand une seule ad y pend.
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
      conceptId: schema.ads.conceptId,
      adRef: schema.ads.sourceRef,
      conceptRef: schema.concepts.sourceRef,
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

    // Combien d'ads pendent à chaque concept · c'est ce qui décide si le lien
    // porté par le concept reste sans ambiguïté. Compté sur TOUTES les ads du
    // concept, pas seulement celles qui ont un verdict : une variante non encore
    // arbitrée rend le lien tout aussi indécidable.
    const conceptIds = [...new Set(ads.map((a) => a.conceptId))];
    const compte = conceptIds.length
      ? await db!.select({ conceptId: schema.ads.conceptId, n: count() })
          .from(schema.ads)
          .where(inArray(schema.ads.conceptId, conceptIds))
          .groupBy(schema.ads.conceptId)
      : [];
    const parConcept = new Map(compte.map((c) => [c.conceptId, Number(c.n ?? 0)]));

    const gid = (ref: unknown) => (ref as { generationId?: string } | null)?.generationId ?? null;

    const origines = ads.map((a) => ({
      ad: a,
      ...memoryOrigin({
        adGenerationId: gid(a.adRef),
        conceptGenerationId: gid(a.conceptRef),
        adsUnderConcept: parConcept.get(a.conceptId) ?? 1,
      }),
    }));

    const genIds = origines.map((o) => o.generationId).filter((x): x is string => !!x);
    const gens = genIds.length
      ? await db!.select({ id: schema.generations.id, input: schema.generations.input })
          .from(schema.generations)
          .where(inArray(schema.generations.id, [...new Set(genIds)]))
      : [];
    const parGen = new Map(gens.map((x) => [x.id, x.input as { memoryUse?: MemoryUse } | null]));

    const attribues: AttributedAd[] = origines.map((o) => ({
      // `null` quand rien n'a été consigné · une ad importée ou saisie à la
      // main n'a pas de mémoire à son actif, et compte comme témoin. C'est
      // `origin` qui distingue ce cas-là de « on ne sait pas ».
      memory: (o.generationId ? parGen.get(o.generationId) : null)?.memoryUse ?? null,
      verdict: o.ad.validated ?? null,
      origin: o.origin,
    }));

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


/* -------------------------------------------------------------------------- */

/**
 * Est-ce que ça marche mieux qu'avant ?
 *
 * ── Ce que ça répond, et ce que ça ne prétend pas ────────────────────────────
 *
 * Les trente derniers jours contre les trente précédents, sur les ads arbitrées
 * de la marque. Deux fenêtres glissantes, pas une date de sortie · caler la
 * coupure sur un déploiement laisserait croire que l'écart mesure CE
 * changement-là, alors que tout bouge en même temps.
 *
 * La question devient « est-ce que ça va mieux », pas « grâce à quoi ». C'est
 * moins flatteur et c'est vrai.
 *
 * On date sur la CRÉATION de l'ad, pas sur son verdict · c'est la date à
 * laquelle le produit l'a fabriquée, donc celle qui porte l'effet d'un
 * changement de produit. Dater sur le verdict décalerait tout du temps qu'un
 * test met à conclure.
 */
export async function creativeTrendAction(days = 30): Promise<{ trend?: TrendResult; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    const rows = await db!.select({
      at: schema.ads.createdAt,
      computed: schema.verdicts.computed,
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
      ))
      .limit(800);

    return {
      trend: creativeTrend(
        // Le verdict humain fait foi quand il existe · c'est lui qui a été validé.
        rows.map((r) => ({ at: (r.at as Date).getTime(), verdict: r.validated ?? r.computed ?? null })),
        Date.now(),
        days,
      ),
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:trend', e, { subject: 'la tendance', workspaceId: g.s.workspaceId }) };
  }
}
