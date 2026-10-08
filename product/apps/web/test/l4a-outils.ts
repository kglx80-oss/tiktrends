import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import { empreinteContenu, SCHEMA_VERSION_CONTENU, type ContenuVersion } from '@tiktrends/core';
import { contexteDepuisSession, type ContexteStudio } from '../lib/studios/garde';
import { session, type IdsStudios } from './studios-semis';
import type { BaseStudio } from '../lib/studios/execution/types';
import { contenuVideo } from '../../../packages/core/test/studios-fixtures';

/**
 * Outils des tests L4-A (propositions) · contexte de session, projet de
 * démonstration, et COMPTES RÉELS en base des tables qu'une proposition ne
 * doit jamais toucher (devis, jobs, registres, débits).
 */

export function ctxDe(ids: IdsStudios, qui: 'ua' | 'uv' | 'ur' | 'ub', restrictions?: string[]): ContexteStudio {
  const s = session(ids, qui);
  const marques = qui === 'ub' ? [ids.brandB1] : [ids.brandA1, ids.brandA2];
  return contexteDepuisSession(s, marques, restrictions ?? (qui === 'ur' ? [ids.brandA1] : []), `st_l4a_${randomUUID()}`);
}

export async function projetVideo(base: BaseStudio, ids: IdsStudios, brandId: string, userId: string, contenu: ContenuVersion = contenuVideo()): Promise<{ projectId: string; versionId: string }> {
  const ws = brandId === ids.brandB1 ? ids.wsB : ids.wsA;
  const [p] = await base.insert(schema.studioProjects).values({ workspaceId: ws, brandId, kind: 'video', title: `Projet ${randomUUID().slice(0, 6)}`, ownerId: userId }).returning();
  const [v] = await base.insert(schema.studioProjectVersions).values({
    projectId: p!.id, workspaceId: ws, brandId, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: userId, reason: 'test',
  }).returning();
  await base.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  return { projectId: p!.id, versionId: v!.id };
}

const TABLES = {
  propositions: 'studio_proposals', plans: 'studio_impact_plans', versions: 'studio_project_versions', devis: 'studio_quotes',
  approbations: 'studio_approvals', jobs: 'studio_jobs', registre: 'studio_budget_ledger', outbox: 'studio_outbox',
  credits: 'credit_ledger', depenses: 'ai_spend', audit: 'studio_audit_events', runs: 'studio_prompt_runs',
} as const;

export type Comptes = Record<keyof typeof TABLES, number>;

export async function compter(base: BaseStudio): Promise<Comptes> {
  const out = {} as Comptes;
  for (const [k, t] of Object.entries(TABLES)) {
    const r = await base.execute(sql.raw(`select count(*)::int as n from ${t}`));
    const rows = (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<{ n: number }>;
    out[k as keyof Comptes] = Number(rows[0]!.n);
  }
  return out;
}

/** Ce qu'une proposition ne touche JAMAIS · devis, approbations, jobs, registres, débits, dépenses, outbox. */
export const SANS_EFFET_FINANCIER = ['devis', 'approbations', 'jobs', 'registre', 'outbox', 'credits', 'depenses'] as const;

export function delta(avant: Comptes, apres: Comptes): Partial<Comptes> {
  const d: Partial<Comptes> = {};
  for (const k of Object.keys(avant) as Array<keyof Comptes>) if (apres[k] !== avant[k]) d[k] = apres[k] - avant[k];
  return d;
}

/** Sortie `document_patch_output` ready, sur la base donnée. */
export function sortiePatch(baseVersion: string, changes: unknown[], o: { impactSummary?: string; preservedIds?: string[] } = {}) {
  return {
    status: 'ready', questions: [], warnings: [], evidenceIds: [],
    result: { baseVersion, changes, preservedIds: o.preservedIds ?? [], impactSummary: o.impactSummary ?? 'Seul le plan visé change.' },
  };
}
