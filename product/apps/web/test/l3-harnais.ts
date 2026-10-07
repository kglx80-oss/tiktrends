import { randomUUID } from 'node:crypto';
import { eq, inArray, like } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import { violationsRegistreJob } from '@tiktrends/core';
import { contexteDepuisSession, type ContexteStudio } from '../lib/studios/garde';
import { session, type IdsStudios } from './studios-semis';
import type { BaseStudio } from '../lib/studios/execution/types';
import { MoteurStudio } from '../../workers/src/studios/moteur';
import type { EntreeJournal } from '../../workers/src/studios/types';
import { FournisseurSimule, StockageSimule, DRAPEAU_SIMULE, type OptionsFournisseurSimule } from '../../../packages/integrations/src/studios-simule';
import { contenuVideo } from '../../../packages/core/test/studios-fixtures';

/**
 * Harnais des tests L3 · semis, contexte, moteur simulé, lecture de l'état
 * RÉEL en base (job, tentatives, registre studio, registre de crédits, solde).
 * Aucun réseau, aucune dépense : fournisseur et stockage simulés, refusés en
 * production.
 */

export function ctxDe(ids: IdsStudios, qui: 'ua' | 'uv' | 'ur' | 'ub'): ContexteStudio {
  const s = session(ids, qui);
  const marques = qui === 'ub' ? [ids.brandB1] : [ids.brandA1, ids.brandA2];
  return contexteDepuisSession(s, marques, qui === 'ur' ? [ids.brandA1] : [], `st_test_${randomUUID()}`);
}

export async function poserSolde(base: BaseStudio, workspaceId: string, credits: number): Promise<void> {
  await base.update(schema.workspaces).set({ creditsBalance: credits }).where(eq(schema.workspaces.id, workspaceId));
}

export async function solde(base: BaseStudio, workspaceId: string): Promise<number> {
  const [w] = await base.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  return w!.c;
}

/** Projet vidéo de démonstration directement en base (même forme que `creerProjet`). */
export async function projetTest(base: BaseStudio, ids: IdsStudios, brandId: string, userId: string): Promise<{ projectId: string; versionId: string }> {
  const contenu = contenuVideo();
  const { empreinteContenu, SCHEMA_VERSION_CONTENU } = await import('@tiktrends/core');
  const [p] = await base.insert(schema.studioProjects).values({ workspaceId: brandId === ids.brandB1 ? ids.wsB : ids.wsA, brandId, kind: 'video', title: `Projet ${randomUUID().slice(0, 6)}`, ownerId: userId }).returning();
  const [v] = await base.insert(schema.studioProjectVersions).values({
    projectId: p!.id, workspaceId: p!.workspaceId, brandId, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: userId, reason: 'test',
  }).returning();
  await base.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  return { projectId: p!.id, versionId: v!.id };
}

export interface Banc {
  moteur: MoteurStudio;
  fournisseur: FournisseurSimule;
  stockage: StockageSimule;
  journal: EntreeJournal[];
  decalage: { ms: number };
  avancer(ms: number): void;
  horloge(): Date;
}

export function banc(base: BaseStudio, o: Partial<Omit<OptionsFournisseurSimule, 'drapeau'>> & { workerId?: string; secret?: string; partage?: { fournisseur: FournisseurSimule; stockage: StockageSimule; decalage: { ms: number }; journal: EntreeJournal[] } } = {}): Banc {
  const decalage = o.partage?.decalage ?? { ms: 0 };
  const horloge = () => new Date(Date.now() + decalage.ms);
  const fournisseur = o.partage?.fournisseur ?? new FournisseurSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' }, ...o });
  const stockage = o.partage?.stockage ?? new StockageSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } });
  const journal = o.partage?.journal ?? [];
  const moteur = new MoteurStudio({ base, fournisseur, stockage, workerId: o.workerId, bailMs: 30_000, horloge, secretWebhook: o.secret ?? null, journal: (e) => journal.push(e) });
  return { moteur, fournisseur, stockage, journal, decalage, avancer: (ms) => { decalage.ms += ms; }, horloge };
}

/** Un second worker sur le MÊME fournisseur, le même stockage, la même horloge. */
export function secondWorker(base: BaseStudio, b: Banc, workerId: string, secret?: string): MoteurStudio {
  return banc(base, { workerId, secret, partage: { fournisseur: b.fournisseur, stockage: b.stockage, decalage: b.decalage, journal: b.journal } }).moteur;
}

/** Tourne jusqu'à l'état final (ou `max` tours). */
export async function jusquAuBout(base: BaseStudio, m: MoteurStudio, jobId: string, max = 20): Promise<string> {
  for (let i = 0; i < max; i++) {
    const [j] = await base.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, jobId));
    if (['completed', 'failed', 'cancelled', 'reconciliation_required'].includes(j!.state)) return j!.state;
    await m.tour();
  }
  const [j] = await base.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, jobId));
  return j!.state;
}

/** L'état RÉEL d'un job en base · c'est ce que les gardes vérifient. */
export async function etatEnBase(base: BaseStudio, jobId: string) {
  const [job] = await base.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, jobId));
  const tentatives = await base.select().from(schema.studioJobAttempts).where(eq(schema.studioJobAttempts.jobId, jobId));
  const registre = await base.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.jobId, jobId));
  const credits = await base.select().from(schema.creditLedger).where(like(schema.creditLedger.refId, `studio:job:${jobId}:%`));
  const assets = await base.select().from(schema.studioAssets).where(eq(schema.studioAssets.projectId, job!.projectId));
  const outbox = await base.select().from(schema.studioOutbox).where(eq(schema.studioOutbox.aggregateId, jobId));
  const n = (k: string) => registre.filter((r) => r.kind === k).length;
  return {
    job: job!,
    tentatives: tentatives.sort((a, b) => a.n - b.n),
    registre,
    credits,
    assets: assets.filter((a) => (a.rights as { jobId?: string }).jobId === jobId),
    outbox,
    reserves: n('reserve'), reglements: n('settle'), liberations: n('release'),
    violations: violationsRegistreJob(registre.map((r) => ({ kind: r.kind, credits: r.credits, usdMicros: Number(r.usdMicros) })), job!.state),
  };
}

export async function jobsDuDevis(base: BaseStudio, quoteIds: string[]) {
  return quoteIds.length ? base.select().from(schema.studioJobs).where(inArray(schema.studioJobs.quoteId, quoteIds)) : [];
}
