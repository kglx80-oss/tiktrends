'use server';

import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  checkIteration, checkVerdictValidation, checkVerdictComparability,
  formatViolations, type VerdictValue, type TestedVariable,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { invalidateJarvisMemory } from '../../lib/jarvis-memory';
import { GUARD } from '../../lib/guard-error';

/**
 * ADSMAP · arbitrage d'un test et itération (§2.4, §6.7, §11).
 *
 * La mesure quotidienne calcule des verdicts. Elle ne les CLÔT pas, et c'est
 * voulu : un chiffre ne dit pas pourquoi. Le §2.4 pose l'invariant qui donne sa
 * valeur au module · **un verdict validé s'appuie sur au moins un apprentissage**.
 * Un test sans enseignement retiré est un budget dépensé pour rien, et c'est
 * exactement ce que la plupart des équipes font sans s'en rendre compte.
 *
 * L'écran refuse donc de valider à vide. Ce n'est pas une formalité : c'est
 * l'apprentissage, pas le verdict, que Jarvis relit avant d'écrire la créa
 * suivante.
 *
 * Et on n'itère que sur un gagnant · repartir d'un perdant reproduit ce qui n'a
 * pas marché, en plus cher.
 */

/* -------------------------------------------------------------------------- */
/*  Lecture                                                                   */
/* -------------------------------------------------------------------------- */

export interface AdDetail {
  id: string;
  concept: string;
  conceptId: string;
  angle: string | null;
  desire: string | null;
  persona: string | null;
  variantCode: string;
  status: string;
  adType: string;
  format: string;
  hypothesis: string | null;
  testedVariable: string | null;
  variableValue: string | null;
  launchedAt: string | null;
  batchNumber: number | null;
  /** Résumé du contrôle de protocole du lot · dit ce que le verdict peut affirmer. */
  protocolSummary: string | null;
  // Verdict
  computed: VerdictValue | null;
  validated: VerdictValue | null;
  verdictStatus: 'computed' | 'validated' | null;
  comparable: boolean;
  failedStage: string | null;
  killFlag: string | null;
  reason: string | null;
  computedAt: string | null;
  metrics: { spend: number | null; impressions: number | null; purchases: number | null; cpa: number | null; cpaHi: number | null; hookRate: number | null; holdRate: number | null; ctr: number | null };
  // Graphe
  learnings: Array<{ id: string; statement: string; confidence: number; status: string; scope: string }>;
  parent: { adId: string; variantCode: string; concept: string; changedVariable: string; mode: string } | null;
  children: Array<{ adId: string; variantCode: string; changedVariable: string; mode: string; verdict: string | null }>;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Fiche complète d'une ad · tout ce qu'il faut pour arbitrer, en un aller-retour. */
export async function adDetailAction(adId: string): Promise<{ detail?: AdDetail; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    const [row] = await db!.select({
      ad: schema.ads,
      conceptTitle: schema.concepts.title,
      angleLabel: schema.angles.label,
      desireLabel: schema.desires.label,
      personaName: schema.personas.name,
      batchNumber: schema.batches.number,
      protocolCheck: schema.batches.protocolCheck,
      verdict: schema.verdicts,
    })
      .from(schema.ads)
      .leftJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .leftJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .leftJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .leftJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .leftJoin(schema.batches, eq(schema.ads.batchId, schema.batches.id))
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(and(eq(schema.ads.id, adId), eq(schema.ads.workspaceId, g.s.workspaceId)))
      .limit(1);
    if (!row) return { error: GUARD.notFound('cette ad') };

    const [apprentissages, edges] = await Promise.all([
      db!.select({
        id: schema.learnings.id, statement: schema.learnings.statement,
        confidence: schema.learnings.confidence, status: schema.learnings.status, scope: schema.learnings.scope,
      })
        .from(schema.learnings)
        .where(and(eq(schema.learnings.adId, adId), eq(schema.learnings.refuted, false)))
        .orderBy(desc(schema.learnings.createdAt)),
      db!.select({
        childAdId: schema.iterationEdges.childAdId,
        parentAdId: schema.iterationEdges.parentAdId,
        changedVariable: schema.iterationEdges.changedVariable,
        mode: schema.iterationEdges.mode,
      })
        .from(schema.iterationEdges)
        .where(or(eq(schema.iterationEdges.childAdId, adId), eq(schema.iterationEdges.parentAdId, adId))),
    ]);

    // Une seule requête pour les ads voisines · parent et enfants ensemble.
    const voisins = edges.flatMap((e) => [e.childAdId, e.parentAdId]).filter((x) => x !== adId);
    const infos = voisins.length
      ? await db!.select({
          id: schema.ads.id, variantCode: schema.ads.variantCode,
          concept: schema.concepts.title, verdict: schema.verdicts.computed, validated: schema.verdicts.validated,
        })
          .from(schema.ads)
          .leftJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
          .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
          .where(inArray(schema.ads.id, voisins))
      : [];
    const parId = new Map(infos.map((i) => [i.id, i]));

    const arcParent = edges.find((e) => e.childAdId === adId);
    const p = arcParent ? parId.get(arcParent.parentAdId) : undefined;

    const agg = (row.verdict?.metricsAgg ?? {}) as Record<string, unknown>;
    const proto = (row.protocolCheck ?? null) as { summary?: string } | null;

    return {
      detail: {
        id: row.ad.id,
        concept: row.conceptTitle ?? '(concept supprimé)',
        conceptId: row.ad.conceptId,
        angle: row.angleLabel ?? null,
        desire: row.desireLabel ?? null,
        persona: row.personaName ?? null,
        variantCode: row.ad.variantCode,
        status: row.ad.status,
        adType: row.ad.adType,
        format: row.ad.format,
        hypothesis: row.ad.hypothesis,
        testedVariable: row.ad.testedVariable,
        variableValue: row.ad.variableValue,
        launchedAt: row.ad.launchedAt ? (row.ad.launchedAt as Date).toISOString() : null,
        batchNumber: row.batchNumber ?? null,
        protocolSummary: proto?.summary ?? null,
        computed: (row.verdict?.computed ?? null) as VerdictValue | null,
        validated: (row.verdict?.validated ?? null) as VerdictValue | null,
        verdictStatus: (row.verdict?.status ?? null) as 'computed' | 'validated' | null,
        comparable: !!row.verdict?.comparable,
        failedStage: row.verdict?.failedStage ?? null,
        killFlag: row.verdict?.killFlag ?? null,
        reason: typeof agg.reason === 'string' ? agg.reason : null,
        computedAt: row.verdict?.computedAt ? (row.verdict.computedAt as Date).toISOString() : null,
        metrics: {
          spend: num(agg.spend), impressions: num(agg.impressions), purchases: num(agg.purchases),
          cpa: num(agg.cpa), cpaHi: num(agg.cpaHi),
          hookRate: num(agg.hookRate), holdRate: num(agg.holdRate), ctr: num(agg.ctr),
        },
        learnings: apprentissages,
        parent: arcParent && p
          ? { adId: p.id, variantCode: p.variantCode, concept: p.concept ?? '—', changedVariable: arcParent.changedVariable, mode: arcParent.mode }
          : null,
        children: edges.filter((e) => e.parentAdId === adId).map((e) => {
          const c = parId.get(e.childAdId);
          return {
            adId: e.childAdId, variantCode: c?.variantCode ?? '—',
            changedVariable: e.changedVariable, mode: e.mode,
            verdict: c?.validated ?? c?.verdict ?? null,
          };
        }),
      },
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:detail', e, { subject: 'la lecture de l’ad', workspaceId: g.s.workspaceId }) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Validation d'un verdict                                                   */
/* -------------------------------------------------------------------------- */

export interface ValidateInput {
  adId: string;
  /** Le verdict retenu · par défaut celui qui a été calculé. */
  value: VerdictValue;
  /** Obligatoire dès qu'on s'écarte du calcul · ce qui a été vu et que le chiffre ignore. */
  overrideReason?: string;
  learning: { statement: string; scope: 'ad' | 'concept' | 'angle' | 'desire' | 'avatar' | 'format' | 'landing' | 'offer'; confidence: number; stage?: string | null };
}

export async function validateVerdictAction(input: ValidateInput): Promise<{ ok?: true; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  const enonce = input.learning?.statement?.trim() ?? '';
  if (enonce.length < 15) {
    return { error: 'L’apprentissage doit dire ce qu’on a compris, pas seulement « ok » : une phrase complète, réutilisable sur la prochaine créa.' };
  }
  if (enonce.length > 600) return { error: 'Resserre l’apprentissage à 600 caractères · au-delà, ce n’est plus un enseignement mais un compte rendu.' };

  try {
    const [row] = await db!.select({
      adId: schema.ads.id, conceptId: schema.ads.conceptId, personaBrand: schema.personas.brandId,
      computed: schema.verdicts.computed, comparable: schema.verdicts.comparable, angleId: schema.concepts.angleId,
    })
      .from(schema.ads)
      .leftJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .leftJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .leftJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .leftJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(and(eq(schema.ads.id, input.adId), eq(schema.ads.workspaceId, g.s.workspaceId)))
      .limit(1);
    if (!row) return { error: GUARD.notFound('cette ad') };
    if (!row.computed) return { error: 'Aucun verdict calculé pour cette ad · lance « Mesurer maintenant » avant d’arbitrer.' };

    // Un verdict hors protocole ne peut pas devenir un gagnant absolu, même à la
    // main : ce n'est pas une question de confiance dans l'humain, c'est que la
    // donnée ne permet pas de l'affirmer.
    const comparabilite = checkVerdictComparability({ comparable: row.comparable ?? false, computed: input.value });
    if (comparabilite.length) return { error: formatViolations(comparabilite)! };

    // S'écarter du calcul se justifie · sinon le verdict calculé perd tout sens
    // et l'historique ne dit plus pourquoi les chiffres et la décision divergent.
    const ecart = input.value !== row.computed;
    const motif = input.overrideReason?.trim() ?? '';
    if (ecart && motif.length < 10) {
      return { error: 'Tu retiens un verdict différent du calcul : dis en une phrase ce que tu as vu et que le chiffre ignore.' };
    }

    const conf = Math.min(5, Math.max(1, Math.round(input.learning.confidence || 3)));
    const scope = input.learning.scope;

    // Apprentissage et verdict tombent ensemble ou pas du tout. Sans transaction,
    // un échec sur la seconde écriture laisserait un apprentissage rattaché à un
    // verdict non validé · il s'afficherait comme un enseignement acquis, alors
    // que la décision qui le fonde n'a jamais été prise.
    await db!.transaction(async (tx) => {
      await tx.insert(schema.learnings).values({
        workspaceId: g.s.workspaceId,
        brandId: row.personaBrand ?? g.brand.id,
        adId: input.adId,
        conceptId: scope === 'concept' ? row.conceptId : null,
        angleId: scope === 'angle' ? row.angleId : null,
        scope,
        stage: (input.learning.stage || null) as typeof schema.learnings.$inferInsert.stage,
        statement: enonce,
        confidence: conf,
        status: 'validated',
        evidence: {
          source: 'arbitrage',
          verdictCalcule: row.computed,
          verdictRetenu: input.value,
          motif: ecart ? motif : null,
        },
      });

      // L'invariant §2.4 est vérifié APRÈS l'écriture, sur le compte réel : c'est
      // la seule façon d'être sûr qu'un apprentissage existe bien. Dans la
      // transaction, un échec annule aussi l'insertion qui précède.
      const [compte] = await tx.select({ n: sql<number>`count(*)` })
        .from(schema.learnings)
        .where(and(
          eq(schema.learnings.adId, input.adId),
          eq(schema.learnings.status, 'validated'),
          eq(schema.learnings.refuted, false),
        ));
      const manque = checkVerdictValidation({ status: 'validated', validatedLearnings: Number(compte?.n ?? 0) });
      if (manque.length) throw new Error(formatViolations(manque)!);

      await tx.update(schema.verdicts).set({
        validated: input.value,
        status: 'validated',
        validatedBy: g.s.user.id,
        overrideReason: ecart ? motif : null,
      }).where(eq(schema.verdicts.adId, input.adId));

      // L'ad a livré son enseignement · elle sort de la file d'arbitrage.
      await tx.update(schema.ads).set({ status: 'done', updatedAt: new Date() }).where(eq(schema.ads.id, input.adId));
    });

    invalidateJarvisMemory(row.personaBrand ?? g.brand.id);
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('adsmap:validate', e, { subject: 'la validation du verdict', workspaceId: g.s.workspaceId }) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Itération                                                                 */
/* -------------------------------------------------------------------------- */

export interface IterateInput {
  parentAdId: string;
  mode: 'more' | 'better' | 'new';
  changedVariable: TestedVariable;
  variableValue?: string;
  hypothesis?: string;
  rationale?: string;
  stageTargeted?: string | null;
}

/**
 * Crée l'itération d'une gagnante · l'enfant naît en brouillon.
 *
 * Il n'entre pas en `ready` : l'invariant §2.4 réclame hypothèse, variable,
 * offre et page de destination, et l'offre comme la page sont héritées du parent
 * précisément pour qu'il ne manque plus que ce qui change vraiment.
 */
export async function createIterationAction(input: IterateInput): Promise<{ ok?: true; adId?: string; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    const [parent] = await db!.select({
      ad: schema.ads,
      brandId: schema.personas.brandId,
      computed: schema.verdicts.computed,
      validated: schema.verdicts.validated,
    })
      .from(schema.ads)
      .leftJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .leftJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .leftJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .leftJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(and(eq(schema.ads.id, input.parentAdId), eq(schema.ads.workspaceId, g.s.workspaceId)))
      .limit(1);
    if (!parent) return { error: GUARD.notFound('l’ad parente') };

    // Le verdict humain fait foi quand il existe : c'est lui qui a été arbitré.
    const verdictParent = (parent.validated ?? parent.computed ?? null) as VerdictValue | null;

    // L'enfant n'existe pas encore : on lui donne un identifiant provisoire pour
    // que les règles qui ne portent PAS sur lui (parent gagnant, variable réelle)
    // tranchent avant qu'on écrive quoi que ce soit.
    //
    // La règle de cycle, elle, n'est pas contrôlée ici et ce n'est pas un oubli :
    // une ad qu'on vient de créer n'a aucun enfant, donc remonter sa filiation ne
    // peut pas retomber sur elle. `wouldCreateCycle` sert au RE-rattachement d'une
    // ad existante, pas à la création.
    const violations = checkIteration({
      childAdType: 'iteration',
      parentVerdict: verdictParent,
      changedVariable: input.changedVariable,
      childAdId: '__nouveau__',
      parentAdId: input.parentAdId,
    });
    if (violations.length) return { error: formatViolations(violations)! };

    // L'ad et son arête tombent ensemble ou pas du tout · une itération orpheline
    // apparaîtrait dans la carte sans parent, et le graphe mentirait sur son origine.
    const adId = await db!.transaction(async (tx) => {
      const [compte] = await tx.select({ n: sql<number>`count(*)` })
        .from(schema.ads).where(eq(schema.ads.conceptId, parent.ad.conceptId));

      const [enfant] = await tx.insert(schema.ads).values({
        workspaceId: g.s.workspaceId,
        conceptId: parent.ad.conceptId,
        // Pas de lot : l'itération rejoindra le prochain, pas celui qui est clos.
        batchId: null,
        variantCode: `v${Number(compte?.n ?? 0) + 1}`,
        format: parent.ad.format,
        adType: input.mode === 'new' ? 'new' : 'iteration',
        status: 'draft',
        hypothesis: input.hypothesis?.trim().slice(0, 900) || null,
        testedVariable: input.changedVariable,
        variableValue: input.variableValue?.trim().slice(0, 300) || null,
        // Héritées : ce qui ne change pas ne doit pas être ressaisi, et c'est ce
        // qui permet à l'enfant d'atteindre « prêt » sans repartir de zéro.
        offerId: parent.ad.offerId,
        landingPageId: parent.ad.landingPageId,
        platform: parent.ad.platform,
      }).returning({ id: schema.ads.id });
      if (!enfant) throw new Error('Création impossible.');

      await tx.insert(schema.iterationEdges).values({
        workspaceId: g.s.workspaceId,
        childAdId: enfant.id,
        parentAdId: input.parentAdId,
        mode: input.mode,
        changedVariable: input.changedVariable,
        stageTargeted: (input.stageTargeted || null) as typeof schema.iterationEdges.$inferInsert.stageTargeted,
        rationale: input.rationale?.trim().slice(0, 600) || null,
      });
      return enfant.id;
    });

    invalidateJarvisMemory(parent.brandId ?? g.brand.id);
    return { ok: true, adId };
  } catch (e) {
    return { error: logAndTranslate('adsmap:iterate', e, { subject: 'la création de l’itération', workspaceId: g.s.workspaceId }) };
  }
}
