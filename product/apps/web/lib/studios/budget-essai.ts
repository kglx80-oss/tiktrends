import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema, budgetEssaiDe, cleBudgetEssai, decisionBudgetEssai, depenseEspaceDepuis, type BaseDepense, type BudgetEssai } from '@tiktrends/db';

/**
 * Budget d'ESSAI d'un espace pilote (mandat du 10/10) · côté serveur.
 *
 * La barrière elle-même vit dans `reserverDepense` (`packages/db/src/plafond-depense.ts`) :
 * chaque appel payant de l'espace, site ou worker, relit ce budget sous le
 * verrou commun et refuse AVANT d'écrire. Ce module ne fait que le POSER
 * (plateforme seulement, motif, audit) et le LIRE pour l'écran.
 */

/** Borne de saisie · un budget d'essai, pas un budget d'exploitation (le plafond global reste au-dessus). */
export const PLAFOND_ESSAI_MAX_USD = 50;

export interface VueBudgetEssai { budget: BudgetEssai; engageUsd: number; restantUsd: number }

export async function vueBudgetEssai(workspaceId: string): Promise<VueBudgetEssai | null> {
  if (!db) return null;
  const base = db as unknown as BaseDepense;
  const budget = await budgetEssaiDe(base, workspaceId);
  if (!budget) return null;
  const engageUsd = await depenseEspaceDepuis(base, workspaceId, budget.depuis);
  return { budget, engageUsd, restantUsd: decisionBudgetEssai(engageUsd, 0, budget.plafondUsd).restantUsd };
}

export async function enregistrerBudgetEssai(
  acteur: { userId: string | null; roleEffectif: string; traceId: string },
  e: { workspaceId: unknown; plafondUsd: unknown; depuis?: unknown; motif: unknown },
  maintenant = new Date(),
): Promise<{ ok: true } | { ok: false; raisons: string[] }> {
  if (!db) return { ok: false, raisons: ['base indisponible'] };
  const ws = typeof e.workspaceId === 'string' ? e.workspaceId : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ws)) return { ok: false, raisons: ['espace inconnu'] };
  const plafond = typeof e.plafondUsd === 'number' ? e.plafondUsd : Number(String(e.plafondUsd ?? '').replace(',', '.'));
  if (!Number.isFinite(plafond) || plafond < 0 || plafond > PLAFOND_ESSAI_MAX_USD) return { ok: false, raisons: [`plafond entre 0 et ${PLAFOND_ESSAI_MAX_USD} $`] };
  const depuis = typeof e.depuis === 'string' && e.depuis.trim() ? new Date(e.depuis) : maintenant;
  if (Number.isNaN(depuis.getTime()) || depuis.getTime() > maintenant.getTime()) return { ok: false, raisons: ['date de début illisible ou future'] };
  const motif = typeof e.motif === 'string' ? e.motif.trim() : '';
  if (motif.length < 3) return { ok: false, raisons: ['motif obligatoire (3 caractères au moins) · il est écrit au journal'] };
  const [w] = await db.select({ id: schema.workspaces.id }).from(schema.workspaces).where(eq(schema.workspaces.id, ws)).limit(1);
  if (!w) return { ok: false, raisons: ['espace inconnu'] };
  const A = schema.appSettings;
  const cle = cleBudgetEssai(ws);
  const valeur = { plafondUsd: plafond, depuis: depuis.toISOString(), motif, par: acteur.userId, le: maintenant.toISOString() };
  await db.transaction(async (tx) => {
    const [avant] = await tx.select({ value: A.value }).from(A).where(eq(A.key, cle)).limit(1).for('update');
    await tx.insert(A).values({ key: cle, value: valeur }).onConflictDoUpdate({ target: A.key, set: { value: valeur, updatedAt: maintenant } });
    const resume = (x: unknown) => { const o = x as { plafondUsd?: unknown; depuis?: unknown } | null; return o ? `${o.plafondUsd} $ depuis ${o.depuis}` : null; };
    await tx.insert(schema.studioAuditEvents).values({
      actorId: acteur.userId, effectiveRole: acteur.roleEffectif, workspaceId: ws, brandId: null,
      action: 'studios.budget_essai', targetType: 'workspace', targetId: ws,
      versionBefore: avant ? resume(avant.value) : null, versionAfter: resume(valeur),
      reason: motif.slice(0, 2000), traceId: acteur.traceId, details: { avant: avant?.value ?? null, apres: valeur },
    });
  });
  return { ok: true };
}
