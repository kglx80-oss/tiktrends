import 'server-only';
import { db, schema } from '@tiktrends/db';
import type { ContexteStudio } from './garde';

/**
 * Journal d'audit des studios · AJOUT SEUL.
 *
 * La base refuse toute modification ou suppression (déclencheur
 * `studio_audit_events_ajout_seul`) : ce module n'expose donc qu'un ajout.
 * Il s'écrit dans la MÊME transaction que le changement qu'il décrit, pour
 * qu'un changement sans trace (ou une trace sans changement) soit impossible.
 */

export interface EvenementAudit {
  action: string;
  brandId: string | null;
  targetType: string;
  targetId: string;
  versionBefore?: string | null;
  versionAfter?: string | null;
  reason?: string;
  details?: Record<string, unknown> | null;
}

/** `db` ou une transaction drizzle ouverte sur `db`. */
export type Executeur = Pick<typeof db, 'insert'>;

export async function ajouterAudit(ex: Executeur, ctx: ContexteStudio, e: EvenementAudit): Promise<void> {
  await ex.insert(schema.studioAuditEvents).values({
    actorId: ctx.userId,
    effectiveRole: ctx.roleEffectif,
    workspaceId: ctx.workspaceId,
    brandId: e.brandId,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    versionBefore: e.versionBefore ?? null,
    versionAfter: e.versionAfter ?? null,
    reason: (e.reason ?? '').slice(0, 2000),
    traceId: ctx.traceId,
    details: e.details ?? null,
  });
}
