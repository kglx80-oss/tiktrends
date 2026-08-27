'use server';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { buildImportPlan, type ImportPlan, type ImportReport } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { roleAtLeast } from '../../lib/rbac';
import { logAndTranslate } from '../../lib/error-log';

/**
 * ADSMAP · import du Google Sheet historique (§13).
 *
 * Deux temps volontairement séparés : on prévisualise, on relit le rapport, puis
 * on applique. Un import de 134 lignes qui écrit d'abord et explique ensuite est
 * un import qu'on n'ose pas relancer.
 *
 * L'analyse elle-même est pure et vit dans `@tiktrends/core` · ici il n'y a que
 * l'écriture.
 */

const MAX_CSV_BYTES = 4_000_000;

async function guard() {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' as const };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'L’import est réservé aux administrateurs de l’espace.' as const };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne la marque dans laquelle importer.' as const };
  return { s, brand };
}

export interface PreviewResult {
  report?: ImportReport;
  /** Aperçu des premières lignes, pour vérifier d'un coup d'œil que rien n'a glissé. */
  sample?: Array<{ concept: string; angle: string; desire: string; variant: string; status: string; verdict: string | null; date: string | null }>;
  error?: string;
}

/** Analyse le fichier et rend le rapport · n'écrit rien. */
export async function previewImportAction(csvText: string): Promise<PreviewResult> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  if (!csvText?.trim()) return { error: 'Le fichier est vide.' };
  if (csvText.length > MAX_CSV_BYTES) return { error: 'Fichier trop volumineux (4 Mo maximum).' };

  try {
    const plan = buildImportPlan(csvText);
    if (plan.report.rowsRead === 0) {
      return { error: 'Aucune ligne exploitable trouvée. Vérifie que le fichier contient bien les colonnes « Status » et « Ad Concept ».' };
    }
    const byKey = new Map(plan.concepts.map((c) => [c.key, c]));
    return {
      report: plan.report,
      sample: plan.ads.slice(0, 12).map((a) => {
        const c = byKey.get(a.conceptKey);
        const angle = plan.angles.find((x) => x.label === c?.angleLabel);
        return {
          concept: c?.title ?? '—', angle: c?.angleLabel ?? '—', desire: angle?.desireLabel ?? '—',
          variant: a.variantCode, status: a.status, verdict: a.verdict, date: a.launchedAt,
        };
      }),
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:preview', e, { subject: 'la lecture du fichier', workspaceId: g.s.workspaceId }) };
  }
}

export interface ApplyResult { report?: ImportReport; error?: string }

/**
 * Écrit le plan en base.
 *
 * Tout arrive en « proposé » : l'import ne décide pas de la taxonomie de la
 * marque, il la propose. Un persona d'attente porte les désirs, faute de colonne
 * avatar dans le fichier · le rapport le dit et invite à le scinder.
 */
export async function applyImportAction(csvText: string): Promise<ApplyResult> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  if (!csvText?.trim()) return { error: 'Le fichier est vide.' };
  if (csvText.length > MAX_CSV_BYTES) return { error: 'Fichier trop volumineux (4 Mo maximum).' };

  let plan: ImportPlan;
  try {
    plan = buildImportPlan(csvText);
  } catch (e) {
    return { error: logAndTranslate('adsmap:import-parse', e, { subject: 'la lecture du fichier', workspaceId: g.s.workspaceId }) };
  }
  if (!plan.ads.length) return { error: 'Aucune ligne exploitable dans ce fichier.' };

  const ws = g.s.workspaceId;
  const brandId = g.brand.id;

  try {
    // 1 · Persona d'attente · le fichier n'a pas de colonne avatar.
    const nomPersona = 'À qualifier (import)';
    let [persona] = await db!.select({ id: schema.personas.id }).from(schema.personas)
      .where(and(eq(schema.personas.brandId, brandId), eq(schema.personas.name, nomPersona))).limit(1);
    if (!persona) {
      [persona] = await db!.insert(schema.personas).values({
        brandId, name: nomPersona,
        description: 'Persona provisoire créé à l’import : le tableau d’origine ne portait pas d’avatar. À scinder en avatars réels.',
        status: 'proposed',
      }).returning({ id: schema.personas.id });
    }

    // 2 · Désirs.
    const desireId = new Map<string, string>();
    for (const d of plan.desires) {
      const [row] = await db!.insert(schema.desires).values({
        workspaceId: ws, personaId: persona!.id, label: d.label, status: 'proposed',
      }).returning({ id: schema.desires.id });
      desireId.set(d.label, row!.id);
    }

    // 3 · Angles.
    const angleId = new Map<string, string>();
    for (const a of plan.angles) {
      const dId = desireId.get(a.desireLabel);
      if (!dId) continue;
      const [row] = await db!.insert(schema.angles).values({
        workspaceId: ws, desireId: dId, label: a.label,
        mechanism: a.mechanism as typeof schema.angles.$inferInsert.mechanism,
        status: 'proposed',
      }).returning({ id: schema.angles.id });
      angleId.set(`${a.label}||${a.desireLabel}`, row!.id);
    }

    // 4 · Concepts · un concept par couple (titre, angle).
    const angleByLabel = new Map(plan.angles.map((a) => [a.label, a]));
    const conceptId = new Map<string, string>();
    for (const c of plan.concepts) {
      const a = angleByLabel.get(c.angleLabel);
      const aId = a ? angleId.get(`${a.label}||${a.desireLabel}`) : undefined;
      if (!aId) continue;
      const [row] = await db!.insert(schema.concepts).values({
        workspaceId: ws, angleId: aId, title: c.title, adType: c.adType, status: 'proposed',
      }).returning({ id: schema.concepts.id });
      conceptId.set(c.key, row!.id);
    }

    // 5 · Lots · on ne recrée pas un lot déjà présent.
    const batchId = new Map<number, string>();
    for (const b of plan.batches) {
      const [exist] = await db!.select({ id: schema.batches.id }).from(schema.batches)
        .where(and(eq(schema.batches.brandId, brandId), eq(schema.batches.number, b.number))).limit(1);
      if (exist) { batchId.set(b.number, exist.id); continue; }
      const [row] = await db!.insert(schema.batches).values({
        workspaceId: ws, brandId, number: b.number, status: 'analyzed',
      }).returning({ id: schema.batches.id });
      batchId.set(b.number, row!.id);
    }

    // 6 · Ads, verdicts, apprentissages.
    const adIdByRow = new Map<number, string>();
    for (const a of plan.ads) {
      const cId = conceptId.get(a.conceptKey);
      if (!cId) continue;
      const [ad] = await db!.insert(schema.ads).values({
        workspaceId: ws, conceptId: cId,
        batchId: a.batchNumber !== null ? batchId.get(a.batchNumber) ?? null : null,
        variantCode: a.variantCode,
        format: a.format as typeof schema.ads.$inferInsert.format,
        adType: a.adType,
        status: a.status,
        hypothesis: a.hypothesis,
        testedVariable: a.testedVariable,
        platform: a.platform,
        launchedAt: a.launchedAt ? new Date(a.launchedAt) : null,
        briefUrl: a.briefLabel, assetUrl: a.assetLabel,
        legacyFlags: a.legacyFlags.length ? a.legacyFlags : null,
      }).returning({ id: schema.ads.id });
      if (!ad) continue;
      adIdByRow.set(a.rowIndex, ad.id);

      // Verdict humain repris tel quel · `computed` reste vide : aucun calcul n'a
      // eu lieu, et `comparable` est faux puisqu'on ignore le protocole d'alors.
      if (a.verdict) {
        await db!.insert(schema.verdicts).values({
          adId: ad.id, workspaceId: ws,
          validated: a.verdict as typeof schema.verdicts.$inferInsert.validated,
          status: 'validated', comparable: false,
        });
      }
      if (a.learning) {
        await db!.insert(schema.learnings).values({
          workspaceId: ws, brandId, adId: ad.id, scope: 'ad',
          statement: a.learning, confidence: 2, status: 'validated',
          evidence: { source: 'import Sheet', note: 'Saisi à la main dans le tableau d’origine, sans chiffre associé.' },
        });
      }
    }

    // 7 · Filiations · uniquement celles qui pointent vers un gagnant réel.
    const conceptTitle = new Map(plan.concepts.map((c) => [c.key, c.title]));
    const gagnantParTitre = new Map<string, string>();
    for (const a of plan.ads) {
      if (a.verdict !== 'winner' && a.verdict !== 'baby_winner') continue;
      const t = conceptTitle.get(a.conceptKey);
      const id = adIdByRow.get(a.rowIndex);
      if (t && id) gagnantParTitre.set(t, id);
    }
    for (const a of plan.ads) {
      if (!a.iterationParentTitle || !a.testedVariable) continue;
      const parent = gagnantParTitre.get(a.iterationParentTitle);
      const child = adIdByRow.get(a.rowIndex);
      if (!parent || !child || parent === child) continue;
      await db!.insert(schema.iterationEdges).values({
        workspaceId: ws, childAdId: child, parentAdId: parent,
        mode: 'better', changedVariable: a.testedVariable,
        rationale: a.iterationReason ?? 'Rattachement proposé à l’import · à confirmer.',
      }).onConflictDoNothing();
    }

    return { report: plan.report };
  } catch (e) {
    return { error: logAndTranslate('adsmap:import-apply', e, { subject: 'l’import', workspaceId: ws }) };
  }
}
