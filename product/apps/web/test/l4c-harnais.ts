import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import { empreinteContenu, SCHEMA_VERSION_CONTENU, type ContenuVersion } from '@tiktrends/core';
import type { ContexteStudio } from '../lib/studios/garde';
import type { BaseStudio } from '../lib/studios/execution/types';
import { creerDevis, approuverEtMettreEnFile } from '../lib/studios/execution/commandes';
import { banc, jusquAuBout } from './l3-harnais';
import { plan } from '../../../packages/core/test/studios-fixtures';

/**
 * Harnais L4-C · projets à brief canonique, lots RÉELS (devis → approbation →
 * worker SIMULÉ L3 → fichiers déposés, relus, reliés). Aucun réseau, aucune
 * dépense : fournisseur et stockage simulés, refusés hors test.
 */

/** Un brief de la forme du contrat `brief_build_output.result` · donnée, pas un type concurrent. */
export function briefCanonique(o: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    objective: 'Faire acheter le sérum', audience: 'Peaux mixtes 25-35 ans', hypothesisId: 'h_douleur', testedVariable: 'hook',
    facts: [
      { id: 'h_douleur', claim: 'Une accroche douleur fait mieux cliquer qu’une accroche bénéfice', sourceIds: ['veille:pub_concurrente_2', 'veille:pub_concurrente_1'], kind: 'hypothesis', confidence: 'medium' },
      { id: 'f_texture', claim: 'Le concurrent montre la texture en gros plan', sourceIds: ['veille:pub_concurrente_1'], kind: 'observed', confidence: 'high' },
    ],
    invariants: ['flacon visible, étiquette lisible'], variables: ['hook'], references: [],
    composition: 'flacon au centre, main à gauche', styleIntent: 'lumière douce du matin', texts: ['Marre des boutons ?'],
    formats: ['4:5'], exclusions: ['aucune promesse médicale'],
    ...o,
  };
}

export function contenuImages(brief: Record<string, unknown> = briefCanonique(), nPlans = 4): ContenuVersion {
  const ids = Array.from({ length: nPlans }, (_, i) => `s${i + 1}`);
  return {
    brief, productRef: { productId: 'p_serum', assetId: 'a_serum' }, styleRef: { material: 'mat', palette: ['#ffffff'], lighting: 'douce' },
    characterRefs: {}, shots: { order: ids, byId: Object.fromEntries(ids.map((id) => [id, plan(id, [])])) }, document: null, timeline: null,
  };
}

export async function projetAvecBrief(base: BaseStudio, o: { workspaceId: string; brandId: string; userId: string; titre?: string; contenu?: ContenuVersion; sources?: unknown[] }): Promise<{ projectId: string; versionId: string }> {
  const contenu = o.contenu ?? contenuImages();
  const [p] = await base.insert(schema.studioProjects).values({
    workspaceId: o.workspaceId, brandId: o.brandId, kind: 'ads', title: o.titre ?? `Sérum ${randomUUID().slice(0, 6)}`, ownerId: o.userId,
    sourceRefs: o.sources ?? [],
  }).returning();
  const [v] = await base.insert(schema.studioProjectVersions).values({
    projectId: p!.id, workspaceId: p!.workspaceId, brandId: o.brandId, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: o.userId, reason: 'test',
  }).returning();
  await base.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  return { projectId: p!.id, versionId: v!.id };
}

/** Devis + approbation sur la version COURANTE · le job est en file, pas encore exécuté. */
export async function lancerLot(base: BaseStudio, ctx: ContexteStudio, projectId: string, operations: string[]): Promise<string> {
  const d = await creerDevis(ctx, { projectId, operations, variante: true }, base);
  if (!d.ok) throw new Error(`devis ${d.code} ${d.message}`);
  const a = await approuverEtMettreEnFile(ctx, { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `l4c-${randomUUID()}` }, { illimite: true, base });
  if (!a.ok) throw new Error(`approbation ${a.code} ${a.message}`);
  return a.job.id;
}

/** Le worker simulé mène le job jusqu'à son état final. */
export async function executer(base: BaseStudio, jobId: string): Promise<string> {
  const b = banc(base);
  return jusquAuBout(base, b.moteur, jobId);
}

/** Sorties livrées d'un job · `{ operation: assetId }`, lu en base. */
export async function sortiesDuJob(base: BaseStudio, jobId: string): Promise<Record<string, string>> {
  const [j] = await base.select({ result: schema.studioJobs.result }).from(schema.studioJobs).where(eq(schema.studioJobs.id, jobId));
  return ((j?.result as { assets?: Record<string, string> } | null)?.assets) ?? {};
}

export const KEYFRAMES = (n: number) => Array.from({ length: n }, (_, i) => `keyframe:s${i + 1}`);

export function saisieTest(o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hypothese: 'Une accroche douleur fait mieux cliquer qu’une accroche bénéfice', variable: 'hook', valeurVariable: 'Marre des boutons ?',
    objectif: 'Baisser le CPA sous 30 €', protocole: 'abo_one_adset_per_ad', periodeDebut: '2026-10-12', periodeFin: '2026-10-19', metrique: 'cpa',
    ...o,
  };
}
