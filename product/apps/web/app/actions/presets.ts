'use server';

import { and, asc, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  validatePreset, normalizePreset, presetPerformance, memoryOrigin,
  type PresetInput, type PresetPerformance, type PresetUsageRow,
} from '@tiktrends/core';
import { VISUAL_UNIVERSES } from '@tiktrends/ai';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { roleAtLeast } from '../../lib/rbac';
import { logAndTranslate } from '../../lib/error-log';
import { revalidatePath } from 'next/cache';
import { GUARD } from '../../lib/guard-error';

/**
 * Tes prompts, et ce qu'ils valent.
 *
 * ── Le bilan ne s'invente pas une plomberie ─────────────────────────────────
 *
 * On remonte exactement le même chemin que l'attribution : la génération
 * consigne le preset utilisé dans `input.presetId`, la passerelle Studio →
 * ADSMAP écrit `ads.source_ref.generationId`, et le verdict pend à l'ad.
 *
 * Réutiliser ce pont plutôt que d'en poser un second garantit qu'un preset et
 * la mémoire de Jarvis parlent des mêmes tests · deux chemins finiraient par
 * donner deux chiffres, et personne ne saurait lequel croire.
 */

export interface PresetRow {
  id: string;
  name: string;
  kind: string;
  prompt: string;
  negative: string | null;
  /** `null` = disponible pour toutes les marques de l'espace. */
  brandId: string | null;
  builtin: boolean;
  performance: PresetPerformance | null;
}

export interface PresetsView {
  mine: PresetRow[];
  /** Les huit univers fournis · gardés, mais ils ne sont plus le seul choix. */
  builtin: PresetRow[];
}

/* -------------------------------------------------------------------------- */
/*  Lecture                                                                   */
/* -------------------------------------------------------------------------- */

export async function listPresetsAction(): Promise<{ view?: PresetsView; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const brand = await getActiveBrand(s.workspaceId);

  try {
    const rows = await db.select()
      .from(schema.creativePresets)
      .where(and(
        eq(schema.creativePresets.workspaceId, s.workspaceId),
        eq(schema.creativePresets.archived, false),
        // Ceux de la marque active, plus ceux qui valent pour tout l'espace.
        brand
          ? or(isNull(schema.creativePresets.brandId), eq(schema.creativePresets.brandId, brand.id))
          : isNull(schema.creativePresets.brandId),
      ))
      .orderBy(asc(schema.creativePresets.name))
      .limit(60);

    const usage = brand ? await usageRows(s.workspaceId, brand.id) : [];

    return {
      view: {
        mine: rows.map((r) => ({
          id: r.id, name: r.name, kind: r.kind, prompt: r.prompt,
          negative: r.negative, brandId: r.brandId, builtin: false,
          performance: presetPerformance(r.id, usage),
        })),
        builtin: VISUAL_UNIVERSES.map((u) => ({
          id: `builtin:${u.key}`, name: u.label, kind: 'image',
          prompt: u.prompt, negative: null, brandId: null, builtin: true,
          performance: null,
        })),
      },
    };
  } catch (e) {
    return { error: logAndTranslate('presets:list', e, { subject: 'tes prompts', workspaceId: s.workspaceId }) };
  }
}

/**
 * Les créas nées d'un preset, avec leur verdict.
 *
 * Une seule requête pour toute la marque · calculer preset par preset ferait
 * autant d'allers-retours qu'il y a de prompts, pour la même donnée.
 *
 * ── Le lien se lit sur l'ad ──────────────────────────────────────────────────
 *
 * Il se lisait sur le concept, où plusieurs ads le partagent · un preset héritait
 * alors des verdicts de variantes qu'il n'avait pas produites, et le classement
 * « quel prompt gagne » notait le mauvais prompt. Le concept ne sert plus que de
 * repli, et seulement quand une seule ad y pend.
 */
async function usageRows(workspaceId: string, brandId: string): Promise<PresetUsageRow[]> {
  if (!db) return [];

  const gens = await db.select({ id: schema.generations.id, input: schema.generations.input })
    .from(schema.generations)
    .where(eq(schema.generations.brandId, brandId))
    .limit(1500);

  const presetDe = new Map<string, string>();
  for (const g of gens) {
    const p = (g.input as { presetId?: string } | null)?.presetId;
    if (p) presetDe.set(g.id, p);
  }
  if (!presetDe.size) return [];

  // Les ads issues de ces générations · le pont est `ads.source_ref`.
  const ads = await db.select({
    conceptId: schema.ads.conceptId,
    adRef: schema.ads.sourceRef,
    conceptRef: schema.concepts.sourceRef,
    validated: schema.verdicts.validated,
  })
    .from(schema.ads)
    .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .leftJoin(schema.verdicts, and(
      eq(schema.verdicts.adId, schema.ads.id),
      eq(schema.verdicts.status, 'validated'),
    ))
    .where(eq(schema.ads.workspaceId, workspaceId))
    .limit(1200);

  const conceptIds = [...new Set(ads.map((a) => a.conceptId))];
  const compte = conceptIds.length
    ? await db.select({ conceptId: schema.ads.conceptId, n: count() })
        .from(schema.ads)
        .where(inArray(schema.ads.conceptId, conceptIds))
        .groupBy(schema.ads.conceptId)
    : [];
  const parConcept = new Map(compte.map((c) => [c.conceptId, Number(c.n ?? 0)]));
  const ref = (x: unknown) => (x as { generationId?: string } | null)?.generationId ?? null;

  const out: PresetUsageRow[] = [];
  for (const a of ads) {
    const { generationId } = memoryOrigin({
      adGenerationId: ref(a.adRef),
      conceptGenerationId: ref(a.conceptRef),
      adsUnderConcept: parConcept.get(a.conceptId) ?? 1,
    });
    const preset = generationId ? presetDe.get(generationId) : undefined;
    if (preset) out.push({ presetId: preset, verdict: a.validated ?? null });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Écriture                                                                  */
/* -------------------------------------------------------------------------- */

export async function savePresetAction(input: PresetInput & { id?: string; scope?: 'brand' | 'workspace' }): Promise<{ id?: string; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  if (!roleAtLeast(s.role, 'member')) return { error: 'Ton rôle ne permet pas d’écrire des prompts.' };

  const violations = validatePreset(input);
  if (violations.length) return { error: violations[0]!.message };
  const p = normalizePreset(input);

  const brand = await getActiveBrand(s.workspaceId);
  // Par défaut, le prompt suit la marque active · une DA se partage sur demande,
  // pas par défaut, sinon on la retrouve appliquée à une marque sans rapport.
  const brandId = input.scope === 'workspace' ? null : brand?.id ?? null;

  try {
    if (input.id) {
      await db.update(schema.creativePresets)
        .set({ name: p.name, prompt: p.prompt, negative: p.negative, kind: p.kind!, updatedAt: new Date() })
        .where(and(
          eq(schema.creativePresets.id, input.id),
          eq(schema.creativePresets.workspaceId, s.workspaceId),
        ));
      revalidatePath('/studio/prompts');
      return { id: input.id };
    }

    const [row] = await db.insert(schema.creativePresets).values({
      workspaceId: s.workspaceId, brandId,
      name: p.name, kind: p.kind!, prompt: p.prompt, negative: p.negative,
      createdBy: s.user.id,
    }).returning({ id: schema.creativePresets.id });

    revalidatePath('/studio/prompts');
    return { id: row?.id };
  } catch (e) {
    const m = (e as Error).message ?? '';
    if (m.includes('creative_presets_name')) {
      return { error: 'Un prompt porte déjà ce nom · choisis-en un autre pour les distinguer dans la liste.' };
    }
    return { error: logAndTranslate('presets:save', e, { subject: 'l’enregistrement du prompt', workspaceId: s.workspaceId }) };
  }
}

/**
 * Archive un prompt.
 *
 * On n'efface pas · les créas déjà produites pointent dessus, et un bilan qui
 * perd son intitulé devient illisible six mois plus tard.
 */
export async function archivePresetAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  if (!roleAtLeast(s.role, 'member')) return { error: 'Ton rôle ne permet pas cette action.' };
  try {
    await db.update(schema.creativePresets)
      .set({ archived: true, updatedAt: new Date() })
      .where(and(
        eq(schema.creativePresets.id, id),
        eq(schema.creativePresets.workspaceId, s.workspaceId),
      ));
    revalidatePath('/studio/prompts');
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('presets:archive', e, { subject: 'l’archivage du prompt', workspaceId: s.workspaceId }) };
  }
}

/** Le prompt à appliquer, résolu · `null` pour un univers fourni ou un id inconnu. */
export async function resolvePreset(workspaceId: string, id?: string | null): Promise<{ prompt: string; negative: string | null } | null> {
  if (!db || !id || id.startsWith('builtin:')) return null;
  const [row] = await db.select({ prompt: schema.creativePresets.prompt, negative: schema.creativePresets.negative })
    .from(schema.creativePresets)
    .where(and(eq(schema.creativePresets.id, id), eq(schema.creativePresets.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

/** Compte les prompts maison · sert l'état des couches de Jarvis. */
export async function countPresets(workspaceId: string): Promise<number> {
  if (!db) return 0;
  const [r] = await db.select({ n: sql<number>`count(*)` })
    .from(schema.creativePresets)
    .where(and(eq(schema.creativePresets.workspaceId, workspaceId), eq(schema.creativePresets.archived, false)));
  return Number(r?.n ?? 0);
}
