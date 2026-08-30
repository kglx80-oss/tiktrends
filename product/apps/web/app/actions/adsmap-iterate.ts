'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  iterationPlan, proposeIterations, checkIteration, wouldCreateCycle,
  MODE_LABEL, MODE_HINT, VARIABLE_LABEL, STAGE_LABEL,
  type IterationInput, type IterationTask, type TestedVariable, type FunnelStage, type VerdictValue,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { revalidatePath } from 'next/cache';

/**
 * Ce qu'on fait des tests une fois qu'ils ont rendu leur verdict.
 *
 * ── Le trou que ça comble ────────────────────────────────────────────────────
 *
 * La carte savait déjà qu'une gagnante n'avait jamais été itérée · elle le disait
 * dans la file de décisions et ne proposait rien. « Crée l'itération : une
 * variable, une hypothèse » demande à l'utilisateur de refaire le raisonnement
 * que la mesure vient pourtant de faire à sa place.
 *
 * Le moteur pur (`iterate.ts`) tient ce raisonnement. Ce fichier lui donne à
 * manger et écrit le résultat.
 *
 * ── La lignée, et pourquoi elle compte ───────────────────────────────────────
 *
 * Une proposition sans mémoire de lignée reproposerait indéfiniment « change
 * l'accroche » à une lignée qui a déjà changé d'accroche deux fois. On remonte
 * donc la filiation pour savoir ce qui a déjà été essayé · c'est la différence
 * entre un conseil et un disque rayé.
 *
 * ── L'invariant qu'on ne contourne pas ───────────────────────────────────────
 *
 * On n'itère pas sur une perdante (§2.4). Quand la meilleure action part d'une
 * perdante — corriger l'offre d'une créa dont le hook a marché, typiquement — la
 * proposition reste affichée mais s'enregistre en NOUVEAU concept, sans arête.
 * Le conseil est le même, le graphe reste honnête.
 */

const NON_CONCLUANTS = new Set<VerdictValue>(['inconclusive', 'insufficient_delivery']);

export interface IterationRow extends IterationTask {
  modeLabel: string;
  modeHint: string;
  variableLabel: string;
  stageLabel: string | null;
  freezeLabels: string[];
  conceptTitle: string;
  parentVerdict: VerdictValue;
}

export interface IterationPlanView {
  rows: IterationRow[];
  /** Ads arbitrées examinées · dit sur quoi le plan est fondé. */
  examined: number;
  summary: string;
}

/* -------------------------------------------------------------------------- */
/*  Lecture                                                                   */
/* -------------------------------------------------------------------------- */

export async function iterationPlanAction(): Promise<{ view?: IterationPlanView; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    // Uniquement des verdicts ARBITRÉS. Un verdict calculé peut encore bouger ·
    // proposer une itération sur un chiffre provisoire, c'est engager une
    // dépense sur une conclusion qui n'est pas prise.
    const rows = await db!.select({
      adId: schema.ads.id,
      variantCode: schema.ads.variantCode,
      testedVariable: schema.ads.testedVariable,
      conceptTitle: schema.concepts.title,
      validated: schema.verdicts.validated,
      failedStage: schema.verdicts.failedStage,
      killFlag: schema.verdicts.killFlag,
      metricsAgg: schema.verdicts.metricsAgg,
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
      .limit(400);

    const utiles = rows.filter((r) => r.validated && !NON_CONCLUANTS.has(r.validated as VerdictValue));
    if (!utiles.length) {
      return { view: { rows: [], examined: rows.length, summary: resume(0, rows.length) } };
    }

    // Toutes les arêtes de la marque · on remonte les lignées en mémoire plutôt
    // qu'en récursion SQL, le graphe d'une marque tient largement en RAM.
    const arcs = await db!.select({
      childAdId: schema.iterationEdges.childAdId,
      parentAdId: schema.iterationEdges.parentAdId,
      changedVariable: schema.iterationEdges.changedVariable,
    })
      .from(schema.iterationEdges)
      .where(eq(schema.iterationEdges.workspaceId, g.s.workspaceId));

    const parentDe = new Map(arcs.map((a) => [a.childAdId, a.parentAdId]));
    const varDe = new Map(arcs.map((a) => [a.childAdId, a.changedVariable as TestedVariable]));
    // Une ad déjà itérée n'a pas besoin qu'on lui redemande de l'être.
    const dejaItere = new Set(arcs.map((a) => a.parentAdId));

    const entrees: IterationInput[] = [];
    const contexte = new Map<string, { conceptTitle: string; verdict: VerdictValue }>();

    for (const r of utiles) {
      const verdict = r.validated as VerdictValue;
      // Une gagnante déjà déclinée n'est pas une gagnante qui dort · on la laisse.
      if (dejaItere.has(r.adId) && !r.failedStage) continue;

      const { depth, changed } = remonte(r.adId, parentDe, varDe);
      const agg = (r.metricsAgg ?? {}) as { spend?: unknown };
      entrees.push({
        adId: r.adId,
        label: `${r.conceptTitle} · ${r.variantCode}`,
        verdict,
        failedStage: (r.failedStage ?? null) as FunnelStage | null,
        killFlag: (r.killFlag ?? null) as IterationInput['killFlag'],
        testedVariable: (r.testedVariable ?? null) as TestedVariable | null,
        lineageDepth: depth,
        lineageChanged: changed,
        spend: typeof agg.spend === 'number' ? agg.spend : null,
      });
      contexte.set(r.adId, { conceptTitle: r.conceptTitle, verdict });
    }

    const plan = iterationPlan(entrees).slice(0, 30);
    const sorties: IterationRow[] = plan.map((t) => {
      const c = contexte.get(t.adId)!;
      return {
        ...t,
        modeLabel: MODE_LABEL[t.mode],
        modeHint: MODE_HINT[t.mode],
        variableLabel: VARIABLE_LABEL[t.changedVariable],
        stageLabel: t.stageTargeted ? STAGE_LABEL[t.stageTargeted] : null,
        freezeLabels: t.freeze.map((v) => VARIABLE_LABEL[v]),
        conceptTitle: c.conceptTitle,
        parentVerdict: c.verdict,
      };
    });

    return { view: { rows: sorties, examined: utiles.length, summary: resume(sorties.length, utiles.length) } };
  } catch (e) {
    return { error: logAndTranslate('adsmap:iteration-plan', e, { subject: 'le plan d’itération', workspaceId: g.s.workspaceId }) };
  }
}

/** Remonte la filiation d'une ad · sûr même si le graphe contenait un cycle. */
function remonte(
  adId: string,
  parentDe: Map<string, string>,
  varDe: Map<string, TestedVariable>,
): { depth: number; changed: TestedVariable[] } {
  const vus = new Set<string>([adId]);
  const changed: TestedVariable[] = [];
  let depth = 0;
  let cur: string | undefined = adId;
  while (cur) {
    const v = varDe.get(cur);
    if (v) changed.push(v);
    const p: string | undefined = parentDe.get(cur);
    if (!p || vus.has(p)) break;
    vus.add(p);
    depth++;
    cur = p;
  }
  return { depth, changed };
}

function resume(n: number, examinees: number): string {
  if (!examinees) return 'Aucun test arbitré pour l’instant · le plan se remplira au premier verdict validé.';
  if (!n) return `${examinees} test(s) arbitré(s), et rien à itérer : tout ce qui pouvait l’être l’a déjà été.`;
  return `${n} suite(s) proposée(s) sur ${examinees} test(s) arbitré(s) · classées par ce que le prochain euro rapportera.`;
}

/* -------------------------------------------------------------------------- */
/*  Écriture                                                                  */
/* -------------------------------------------------------------------------- */

export interface CreateIterationInput {
  parentAdId: string;
  mode: 'more' | 'better' | 'new';
  changedVariable: TestedVariable;
  stageTargeted?: FunnelStage | null;
  /** Ce que l'itération parie · obligatoire, sinon son résultat n'apprendra rien. */
  hypothesis: string;
}

/**
 * Crée la suite d'un test.
 *
 * L'ad naît en `draft` avec sa variable et son hypothèse déjà renseignées · le
 * reste (brief, asset, lot) se remplit ensuite par le chemin normal. On ne crée
 * pas une ad `ready` : il manque encore l'offre et la page, et les poser d'office
 * reviendrait à hériter en silence de choix qui méritent d'être revus.
 */
export async function createIterationAction(
  input: CreateIterationInput,
): Promise<{ adId?: string; asIteration?: boolean; error?: string }> {
  const g = await adsmapGuard({ minRole: 'member' });
  if ('error' in g) return { error: g.error };

  const hypothese = input.hypothesis.trim();
  if (hypothese.length < 10) {
    return { error: 'Écris l’hypothèse : sans elle, le résultat de ce test n’apprendra rien à personne.' };
  }

  try {
    const [parent] = await db!.select({
      id: schema.ads.id,
      conceptId: schema.ads.conceptId,
      variantCode: schema.ads.variantCode,
      format: schema.ads.format,
      offerId: schema.ads.offerId,
      landingPageId: schema.ads.landingPageId,
      validated: schema.verdicts.validated,
    })
      .from(schema.ads)
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(and(eq(schema.ads.id, input.parentAdId), eq(schema.ads.workspaceId, g.s.workspaceId)))
      .limit(1);

    if (!parent) return { error: 'Ad parente introuvable dans cet espace.' };

    // La filiation n'est légale que sur un parent gagnant · sinon, nouveau concept.
    const violations = checkIteration({
      childAdType: 'iteration',
      parentVerdict: (parent.validated ?? null) as VerdictValue | null,
      changedVariable: input.changedVariable,
      childAdId: 'nouveau',
      parentAdId: parent.id,
    });
    const enIteration = violations.length === 0;

    const freres = await db!.select({ variantCode: schema.ads.variantCode })
      .from(schema.ads)
      .where(eq(schema.ads.conceptId, parent.conceptId));
    const pris = new Set(freres.map((f) => f.variantCode));
    let code = `${parent.variantCode}-i1`;
    for (let i = 1; pris.has(code); i++) code = `${parent.variantCode}-i${i + 1}`;

    const [enfant] = await db!.insert(schema.ads).values({
      workspaceId: g.s.workspaceId,
      conceptId: parent.conceptId,
      variantCode: code,
      format: parent.format,
      adType: enIteration ? 'iteration' : 'new',
      hypothesis: hypothese,
      testedVariable: input.changedVariable,
      // On hérite de l'offre et de la page SAUF si c'est justement ce qu'on change.
      offerId: input.changedVariable === 'offer' ? null : parent.offerId,
      landingPageId: input.changedVariable === 'landing' ? null : parent.landingPageId,
      status: 'draft',
    }).returning({ id: schema.ads.id });

    if (!enfant) return { error: 'La création n’a rien renvoyé.' };

    if (enIteration) {
      // Un cycle rendrait la remontée de filiation infinie · on vérifie avant
      // d'écrire, même si l'enfant vient de naître et ne peut pas en créer.
      const arcs = await db!.select({
        child: schema.iterationEdges.childAdId, parent: schema.iterationEdges.parentAdId,
      }).from(schema.iterationEdges).where(eq(schema.iterationEdges.workspaceId, g.s.workspaceId));

      if (wouldCreateCycle(arcs, { child: enfant.id, parent: parent.id })) {
        await db!.delete(schema.ads).where(eq(schema.ads.id, enfant.id));
        return { error: 'Cette filiation créerait une boucle dans le graphe.' };
      }

      await db!.insert(schema.iterationEdges).values({
        workspaceId: g.s.workspaceId,
        childAdId: enfant.id,
        parentAdId: parent.id,
        mode: input.mode === 'new' ? 'new' : input.mode,
        changedVariable: input.changedVariable,
        stageTargeted: input.stageTargeted ?? null,
        rationale: hypothese,
      });
    }

    revalidatePath('/adsmap');
    return { adId: enfant.id, asIteration: enIteration };
  } catch (e) {
    return { error: logAndTranslate('adsmap:iteration-create', e, { subject: 'la création de l’itération', workspaceId: g.s.workspaceId }) };
  }
}

/** Les suites possibles d'une ad précise · sert au tiroir de détail. */
export async function iterationsForAdAction(adId: string): Promise<{ rows?: IterationRow[]; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    const [r] = await db!.select({
      adId: schema.ads.id,
      variantCode: schema.ads.variantCode,
      testedVariable: schema.ads.testedVariable,
      conceptTitle: schema.concepts.title,
      validated: schema.verdicts.validated,
      failedStage: schema.verdicts.failedStage,
      killFlag: schema.verdicts.killFlag,
      metricsAgg: schema.verdicts.metricsAgg,
    })
      .from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(and(eq(schema.ads.id, adId), eq(schema.ads.workspaceId, g.s.workspaceId)))
      .limit(1);

    if (!r?.validated || NON_CONCLUANTS.has(r.validated as VerdictValue)) return { rows: [] };

    const arcs = await db!.select({
      childAdId: schema.iterationEdges.childAdId,
      parentAdId: schema.iterationEdges.parentAdId,
      changedVariable: schema.iterationEdges.changedVariable,
    }).from(schema.iterationEdges).where(eq(schema.iterationEdges.workspaceId, g.s.workspaceId));

    const { depth, changed } = remonte(
      adId,
      new Map(arcs.map((a) => [a.childAdId, a.parentAdId])),
      new Map(arcs.map((a) => [a.childAdId, a.changedVariable as TestedVariable])),
    );

    const agg = (r.metricsAgg ?? {}) as { spend?: unknown };
    const verdict = r.validated as VerdictValue;
    const props = proposeIterations({
      adId, label: `${r.conceptTitle} · ${r.variantCode}`, verdict,
      failedStage: (r.failedStage ?? null) as FunnelStage | null,
      killFlag: (r.killFlag ?? null) as IterationInput['killFlag'],
      testedVariable: (r.testedVariable ?? null) as TestedVariable | null,
      lineageDepth: depth, lineageChanged: changed,
      spend: typeof agg.spend === 'number' ? agg.spend : null,
    });

    return {
      rows: props.map((t) => ({
        ...t,
        adId, label: `${r.conceptTitle} · ${r.variantCode}`,
        spend: typeof agg.spend === 'number' ? agg.spend : null,
        modeLabel: MODE_LABEL[t.mode], modeHint: MODE_HINT[t.mode],
        variableLabel: VARIABLE_LABEL[t.changedVariable],
        stageLabel: t.stageTargeted ? STAGE_LABEL[t.stageTargeted] : null,
        freezeLabels: t.freeze.map((v) => VARIABLE_LABEL[v]),
        conceptTitle: r.conceptTitle, parentVerdict: verdict,
      })),
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:iteration-ad', e, { subject: 'les suites de ce test', workspaceId: g.s.workspaceId }) };
  }
}

/** Rendu inutile d'exporter les listes deux fois · l'écran lit celles-ci. */
export async function iterationVocabularyAction(): Promise<{ variables: Array<{ key: string; label: string }> }> {
  const cles = Object.keys(VARIABLE_LABEL) as TestedVariable[];
  return { variables: cles.filter((k) => k !== 'none_control').map((k) => ({ key: k, label: VARIABLE_LABEL[k] })) };
}

/** Les ads que ce plan a fait naître · utile pour ne pas reproposer la même suite. */
export async function iterationChildrenAction(parentIds: string[]): Promise<{ ids: string[] }> {
  const g = await adsmapGuard();
  if ('error' in g || !parentIds.length) return { ids: [] };
  const arcs = await db!.select({ parentAdId: schema.iterationEdges.parentAdId })
    .from(schema.iterationEdges)
    .where(and(
      eq(schema.iterationEdges.workspaceId, g.s.workspaceId),
      inArray(schema.iterationEdges.parentAdId, parentIds),
    ));
  return { ids: [...new Set(arcs.map((a) => a.parentAdId))] };
}
