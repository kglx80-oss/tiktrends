'use server';

import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  attributionStats, attributionByPart, memoryOrigin, creativeTrend, PART_LABEL,
  lireEssais, cumulEssais, bilanNotes, defautsConnus,
  type AttributedAd, type AttributionResult, type MemoryUse, type PartResult, type TrendResult,
  type AdEssai, type EssaiLu, type CumulEssais, type VariableEssai,
  type BilanNotes, type NoteLue,
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


/* -------------------------------------------------------------------------- */
/*  Ce que les lots d'essai ont répondu                                        */
/* -------------------------------------------------------------------------- */

/**
 * Le retour de la mesure vers le studio.
 *
 * ── Ce qui manquait ──────────────────────────────────────────────────────────
 *
 * Chaque publicité d'un lot d'essai porte ce que le lot testait · la variable
 * et le groupe. Personne ne le lisait. On avait donc un plan expérimental
 * propre, tenu à la génération, dont les résultats n'étaient jamais rendus.
 *
 * Un essai qu'on ne relit pas est un rangement, pas une mesure.
 *
 * ── Le chemin de la donnée ───────────────────────────────────────────────────
 *
 * verdict → ad → `source_ref.generationId` → `generations.input.essai`.
 *
 * C'est le même pont que l'attribution, posé sur l'ad et non sur le concept ·
 * les variantes d'un même concept sont exactement ce qu'un essai produit, et
 * un lien porté par le concept les mélangerait toutes.
 */

export interface EssaisView {
  /** Chaque lot, lu · le plus récent d'abord. */
  lots: EssaiLu[];
  /** Le cumul par variable · seul endroit où un chiffre devient une mesure. */
  cumuls: CumulEssais[];
}

export async function essaisViewAction(): Promise<{ view?: EssaisView; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    const rows = await db!.select({
      adRef: schema.ads.sourceRef,
      computed: schema.verdicts.computed,
      validated: schema.verdicts.validated,
    })
      .from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(and(
        eq(schema.ads.workspaceId, g.s.workspaceId),
        eq(schema.personas.brandId, g.brand.id),
      ))
      .limit(800);

    const gid = (ref: unknown) => (ref as { generationId?: string } | null)?.generationId ?? null;
    const parGen = new Map<string, { computed: string | null; validated: string | null }>();
    for (const r of rows) {
      const id = gid(r.adRef);
      // Une seule ad par génération · si deux la revendiquent, on garde la
      // première plutôt que de compter la même créa deux fois dans un bras.
      if (id && !parGen.has(id)) parGen.set(id, { computed: r.computed, validated: r.validated });
    }
    if (!parGen.size) return { view: { lots: [], cumuls: [] } };

    const gens = await db!.select({ id: schema.generations.id, input: schema.generations.input })
      .from(schema.generations)
      .where(inArray(schema.generations.id, [...parGen.keys()]));

    const ads: AdEssai[] = [];
    for (const gen of gens) {
      const rec = (gen.input ?? {}) as {
        essai?: { variable?: string; groupe?: string } | null;
        headline?: string; layout?: string; universe?: string | null;
      };
      const v = rec.essai?.variable as VariableEssai | undefined;
      const groupe = rec.essai?.groupe;
      if (!v || !groupe) continue;
      // La valeur du bras EST ce que la variable fait varier · la lire ailleurs
      // ferait comparer des choses qui n'ont pas été testées.
      const valeur = v === 'accroche' ? (rec.headline ?? '') : v === 'mise_en_page' ? (rec.layout ?? '') : (rec.universe ?? '');
      if (!valeur) continue;
      const verdict = parGen.get(gen.id)!;
      ads.push({
        groupe, variable: v, valeur,
        // Le verdict humain fait foi quand il existe · c'est lui qui a été validé.
        verdict: (verdict.validated ?? verdict.computed ?? null) as AdEssai['verdict'],
      });
    }

    const lots = lireEssais(ads);
    return {
      view: {
        lots,
        cumuls: (['mise_en_page', 'univers'] as VariableEssai[]).map((v) => cumulEssais(lots, v)),
      },
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:essais', e, { subject: 'les résultats des lots d’essai', workspaceId: g.s.workspaceId }) };
  }
}


/* -------------------------------------------------------------------------- */
/*  Le bilan des notes                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Ce que vingt notes disent ensemble.
 *
 * ── Ce qu'on payait sans le lire ─────────────────────────────────────────────
 *
 * Le Score Jarvis coûte deux crédits et regarde une créa. Vingt notes, c'est
 * quarante crédits, et rien n'en faisait la somme · chaque note servait une
 * fois, à la carte qui l'avait demandée.
 *
 * ── Pourquoi ça ne passe pas par les verdicts ────────────────────────────────
 *
 * Une note est un PRONOSTIC · ce qu'un directeur créatif pense de la créa avant
 * qu'elle tourne. Elle vit donc sur la génération, pas sur la carte, et ce bloc
 * n'a rien à demander aux verdicts. Confondre les deux ferait passer un avis
 * pour un résultat.
 */
export async function bilanNotesAction(): Promise<{ bilan?: BilanNotes; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    const rows = await db!.select({ input: schema.generations.input })
      .from(schema.generations)
      .where(and(
        eq(schema.generations.brandId, g.brand.id),
        eq(schema.generations.kind, 'ad'),
      ))
      .orderBy(desc(schema.generations.createdAt))
      .limit(400);

    const notes: NoteLue[] = [];
    for (const r of rows) {
      const rec = (r.input ?? {}) as {
        jarvisScore?: { score?: number; defauts?: string[]; vu?: boolean };
        template?: string; layout?: string; universe?: string | null; model?: string;
      };
      const note = rec.jarvisScore;
      if (!note || typeof note.score !== 'number') continue;
      notes.push({
        score: note.score,
        // Filtré par le noyau · un modèle rend parfois un raté hors vocabulaire,
        // et le compter fausserait le classement des types.
        defauts: defautsConnus(note.defauts),
        // Les notes d'avant n'ont pas regardé l'image · les compter comme
        // « sans défaut » diluerait le taux avec des notes aveugles.
        vu: note.vu === true,
        cles: {
          gabarit: rec.template || undefined,
          coquille: rec.layout || undefined,
          ambiance: rec.universe || undefined,
          moteur: rec.model || undefined,
        },
      });
    }

    return { bilan: bilanNotes(notes) };
  } catch (e) {
    return { error: logAndTranslate('adsmap:bilan-notes', e, { subject: 'le bilan des notes', workspaceId: g.s.workspaceId }) };
  }
}
