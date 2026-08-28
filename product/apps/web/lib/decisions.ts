import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  buildDecisions, findGaps, iterationParentSet, DEFAULT_VERDICT_CONFIG,
  type DecisionAd, type DecisionBatch, type DecisionGap,
  type VerdictConfig, type GraphNodeShape,
} from '@tiktrends/core';

/**
 * ADSMAP · calcul et persistance de la file de décisions (§10).
 *
 * Vit ici plutôt que dans l'action serveur pour une raison précise : la synchro
 * nocturne doit pouvoir rafraîchir la file SANS session. Une file recalculée
 * seulement quand quelqu'un ouvre l'écran arriverait toujours en retard sur la
 * mesure · or c'est la mesure qui la remplit.
 *
 * La file est RECALCULÉE, pas accumulée. Une décision résolue par les faits (l'ad
 * a été coupée, le verdict arbitré) disparaît d'elle-même · une file qui garde
 * des tâches devenues sans objet cesse d'être lue plus vite qu'une table.
 *
 * Le tri et les plafonds sont purs et vivent dans `@tiktrends/core`.
 */

const jours = (d: Date | null): number | null =>
  d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : null;

/** Lit l'état de la marque et le réduit à ce qui décide. */
async function readState(workspaceId: string, brandId: string) {
  const cfgRow = await db!.select({ config: schema.verdictConfigs.config })
    .from(schema.verdictConfigs).where(eq(schema.verdictConfigs.brandId, brandId)).limit(1);
  const cfg: VerdictConfig = { ...DEFAULT_VERDICT_CONFIG, ...((cfgRow[0]?.config as Partial<VerdictConfig>) ?? {}) };

  const adRows = await db!.select({
    id: schema.ads.id,
    variantCode: schema.ads.variantCode,
    concept: schema.concepts.title,
    conceptId: schema.ads.conceptId,
    angleId: schema.concepts.angleId,
    desireId: schema.angles.desireId,
    personaId: schema.desires.personaId,
    status: schema.ads.status,
    externalIds: schema.ads.externalIds,
    launchedAt: schema.ads.launchedAt,
    verdict: schema.verdicts.computed,
    validated: schema.verdicts.validated,
    verdictStatus: schema.verdicts.status,
    killFlag: schema.verdicts.killFlag,
    metricsAgg: schema.verdicts.metricsAgg,
  })
    .from(schema.ads)
    .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
    .where(and(eq(schema.ads.workspaceId, workspaceId), eq(schema.personas.brandId, brandId)))
    .limit(1500);

  const ids = adRows.map((r) => r.id);
  const arcs = ids.length
    ? await db!.select({ parentAdId: schema.iterationEdges.parentAdId })
        .from(schema.iterationEdges).where(inArray(schema.iterationEdges.parentAdId, ids))
    : [];
  const parents = new Set(arcs.map((a) => a.parentAdId));

  const ads: DecisionAd[] = adRows.map((r) => {
    const agg = (r.metricsAgg ?? null) as { spend?: number } | null;
    const ext = (r.externalIds ?? null) as { ad_id?: string } | null;
    return {
      id: r.id,
      label: `${r.variantCode} · ${r.concept}`,
      status: r.status,
      // Le verdict humain fait foi quand il existe : c'est lui qui a été arbitré.
      verdict: r.validated ?? r.verdict ?? null,
      verdictStatus: r.verdictStatus ?? null,
      killFlag: r.killFlag ?? null,
      spend: typeof agg?.spend === 'number' ? agg.spend : null,
      matched: !!ext?.ad_id,
      hasIteration: parents.has(r.id),
      daysSinceLaunch: jours(r.launchedAt as Date | null),
    };
  });

  const batchRows = await db!.select({
    id: schema.batches.id, number: schema.batches.number, status: schema.batches.status,
    protocolCheck: schema.batches.protocolCheck,
  }).from(schema.batches).where(eq(schema.batches.brandId, brandId));

  const [proto] = await db!.select().from(schema.testProtocols)
    .where(eq(schema.testProtocols.brandId, brandId)).limit(1);
  const budgetParAd = proto?.dailyBudgetPerAd ?? 20;
  const duree = proto?.durationDays ?? 7;
  // Même calcul que l'écran de lot · un lot qui n'atteint pas le seuil rendra
  // « non concluant » après avoir tout dépensé.
  const sousFinance = budgetParAd * duree < cfg.minSpendMultiple * cfg.targetCpa;

  const depenseParLot = new Map<string, number>();
  const batchIds = batchRows.map((b) => b.id);
  if (batchIds.length) {
    const parLot = await db!.select({ batchId: schema.ads.batchId, agg: schema.verdicts.metricsAgg })
      .from(schema.ads)
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(inArray(schema.ads.batchId, batchIds));
    for (const r of parLot) {
      const agg = (r.agg ?? null) as { spend?: number } | null;
      if (!r.batchId || typeof agg?.spend !== 'number') continue;
      depenseParLot.set(r.batchId, (depenseParLot.get(r.batchId) ?? 0) + agg.spend);
    }
  }

  const batches: DecisionBatch[] = batchRows.map((b) => {
    const c = (b.protocolCheck ?? null) as { compliant?: boolean; summary?: string } | null;
    return {
      id: b.id, number: b.number, status: b.status,
      compliant: typeof c?.compliant === 'boolean' ? c.compliant : null,
      protocolSummary: c?.summary ?? null,
      spend: depenseParLot.get(b.id) ?? null,
      underfunded: sousFinance,
    };
  });

  // Les branches mortes viennent de la même lecture que le canvas · une seule
  // définition de « manque », pas deux qui divergeraient.
  const [desires, angles, concepts] = await Promise.all([
    db!.select({ id: schema.desires.id, label: schema.desires.label })
      .from(schema.desires)
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(eq(schema.personas.brandId, brandId)),
    db!.select({ id: schema.angles.id, label: schema.angles.label, desireId: schema.angles.desireId })
      .from(schema.angles)
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(eq(schema.personas.brandId, brandId)),
    db!.select({ id: schema.concepts.id, title: schema.concepts.title, angleId: schema.concepts.angleId })
      .from(schema.concepts)
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(eq(schema.personas.brandId, brandId)),
  ]);

  const nodes: GraphNodeShape[] = [
    ...desires.map((d): GraphNodeShape => ({
      id: d.id, kind: 'desire', parentId: null,
      childCount: angles.filter((a) => a.desireId === d.id).length,
    })),
    ...angles.map((a): GraphNodeShape => ({
      id: a.id, kind: 'angle', parentId: a.desireId,
      childCount: concepts.filter((c) => c.angleId === a.id).length,
    })),
    ...concepts.map((c): GraphNodeShape => ({
      id: c.id, kind: 'concept', parentId: c.angleId,
      childCount: adRows.filter((r) => r.conceptId === c.id).length,
    })),
  ];
  const libelle = new Map<string, string>([
    ...desires.map((d) => [d.id, d.label] as const),
    ...angles.map((a) => [a.id, a.label] as const),
    ...concepts.map((c) => [c.id, c.title] as const),
  ]);

  const gaps: DecisionGap[] = findGaps(nodes, iterationParentSet([]))
    .filter((g) => g.kind !== 'winner_no_iteration')   // déjà couvert par les ads
    .map((g) => ({
      nodeId: g.nodeId,
      kind: g.kind === 'desire_no_angle' ? 'desire' : g.kind === 'angle_no_concept' ? 'angle' : 'concept',
      label: libelle.get(g.nodeId) ?? '—',
    }));

  return { ads, batches, gaps, evaluationWindowDays: cfg.evaluationWindowDays };
}


/**
 * Recalcule la file d'une marque et la persiste.
 *
 * Idempotent par (marque, type, cible) : une décision déjà ouverte n'est pas
 * dupliquée, et celles dont l'objet a disparu sont supprimées. Ce qu'un humain a
 * explicitement écarté est RESPECTÉ · le reproposer chaque nuit serait la
 * meilleure façon de faire fermer l'écran.
 */
export async function refreshDecisions(workspaceId: string, brandId: string): Promise<number> {
  if (!db) return 0;

  const etat = await readState(workspaceId, brandId);
  const voulues = buildDecisions(etat);

  const existantes = await db.select().from(schema.decisionItems)
    .where(eq(schema.decisionItems.brandId, brandId));

  const cle = (t: string, id: string) => `${t}::${id}`;
  const cibleDe = (e: typeof existantes[number]) => ((e.payload ?? {}) as { targetId?: string }).targetId ?? '';
  const parCle = new Map(existantes.map((e) => [cle(e.type, cibleDe(e)), e]));
  const vivantes = new Set(voulues.map((d) => cle(d.type, d.targetId)));
  const ecartees = new Set(
    existantes.filter((e) => e.status === 'dismissed').map((e) => cle(e.type, cibleDe(e))),
  );

  let ouvertes = 0;
  for (const d of voulues) {
    const k = cle(d.type, d.targetId);
    if (ecartees.has(k)) continue;
    const payload = { targetId: d.targetId, targetKind: d.targetKind, title: d.title, action: d.action };
    const deja = parCle.get(k);
    if (deja) {
      // Le texte peut avoir changé (la dépense a monté) · on rafraîchit sans
      // remettre le compteur d'ancienneté à zéro.
      await db.update(schema.decisionItems)
        .set({ priority: d.priority, spendAtStake: d.spendAtStake, payload })
        .where(eq(schema.decisionItems.id, deja.id));
    } else {
      await db.insert(schema.decisionItems).values({
        workspaceId, brandId,
        type: d.type as typeof schema.decisionItems.$inferInsert.type,
        priority: d.priority, spendAtStake: d.spendAtStake, payload, status: 'open',
      });
    }
    ouvertes++;
  }

  const mortes = existantes.filter((e) => e.status !== 'dismissed' && !vivantes.has(cle(e.type, cibleDe(e))));
  if (mortes.length) {
    await db.delete(schema.decisionItems).where(inArray(schema.decisionItems.id, mortes.map((m) => m.id)));
  }
  return ouvertes;
}
