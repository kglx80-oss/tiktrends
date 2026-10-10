import 'server-only';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { objetDansPortee, erreurStudio, type ErreurStudio } from '@tiktrends/core';
import type { ContexteStudio } from '../garde';

/**
 * Outils partagés des commandes L4-C · MÊME double garde que `depot.ts` et
 * `execution/commandes.ts` : chaque requête filtre `workspace_id` ET
 * `brand_id IN (marques visibles)`, chaque ligne revenue est revérifiée par la
 * règle pure `objetDansPortee`. Hors portée ⇒ `NOT_FOUND` neutre.
 *
 * `porteeSql` est recopié (4 lignes) faute d'export dans `depot.ts` (fichier
 * L1 en lecture seule) · même besoin que L3 (`L3-EXECUTION.md` §8 point 6).
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

export function porteeSql(t: { workspaceId: PgColumn; brandId: PgColumn }, ctx: ContexteStudio): SQL {
  if (ctx.marques.length === 0) return sql`false`;
  return and(eq(t.workspaceId, ctx.workspaceId), inArray(t.brandId, ctx.marques))!;
}

export function horsPortee(ctx: ContexteStudio, l: { workspaceId: string; brandId: string | null } | undefined | null): boolean {
  return !l || !l.brandId || !objetDansPortee(
    { workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque },
    { workspaceId: l.workspaceId, brandId: l.brandId },
  );
}

export const introuvable = (ctx: ContexteStudio): ErreurStudio => erreurStudio('NOT_FOUND', { traceId: ctx.traceId });

export function echecPersistance(ctx: ContexteStudio, e: unknown): ErreurStudio {
  // Trace côté serveur avec l'identifiant de trace ; jamais de détail SQL au client.
  console.error(`[studios:l4c] ${ctx.traceId} persistance`, e instanceof Error ? e.message : e);
  return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
}

/** Échec métier dans une transaction · la transaction est annulée, l'erreur rendue. */
export class Refus extends Error {
  constructor(public readonly erreur: ErreurStudio) { super(erreur.code); }
}

/** Violation d'unicité Postgres (postgres-js comme pglite exposent `code`). */
export function violationUnicite(e: unknown): string | null {
  for (let x: unknown = e, i = 0; x && i < 4; x = (x as { cause?: unknown }).cause, i++) {
    const o = x as { code?: unknown; constraint_name?: unknown; constraint?: unknown; message?: unknown };
    if (o.code === '23505') return String(o.constraint_name ?? o.constraint ?? o.message ?? '');
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const estUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x);

export const iso = (d: Date | string | null | undefined): string | null => (d ? (d instanceof Date ? d.toISOString() : new Date(d).toISOString()) : null);
