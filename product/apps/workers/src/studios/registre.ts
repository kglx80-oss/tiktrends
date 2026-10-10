import { schema, eq, sql } from '@tiktrends/db';
import { decisionReglement, refsDuJob, type IssueFinanciere, type SnapshotJob } from '@tiktrends/core';
import type { JobStudio, TxStudio, EntreeJournal } from './types';

/**
 * Règlement UNIQUE d'un job et libération du non-consommé · à appeler DANS la
 * transaction qui fait passer le job dans son état final.
 *
 *  · une ligne `settle` (même à 0 : elle marque « réglé une fois ») ;
 *  · une ligne `release` si quelque chose est rendu ;
 *  · les crédits rendus sont recrédités à l'espace (`workspaces.credits_balance`)
 *    avec une ligne `credit_ledger` portant la MÊME référence (`ref_id`).
 *
 * La référence `studio:job:<id>:settle` est unique en base : un second
 * règlement (webhook dupliqué, deux workers) fait échouer la transaction
 * entière, crédit compris. C'est le même mouvement que `refundCredits`
 * (`apps/web/lib/credits.ts`), écrit ici parce que le worker ne peut pas
 * importer le code serveur de l'application web (voir L3-EXECUTION.md, besoin
 * d'un module partagé).
 */
export async function reglerJob(
  tx: TxStudio,
  job: JobStudio,
  snapshot: SnapshotJob,
  issue: IssueFinanciere,
  o: { operationsLivrees?: string[]; coutFournisseurUsdMicros?: number | null; worker: string; journal: EntreeJournal[] },
): Promise<void> {
  const L = schema.studioBudgetLedger;
  const refs = refsDuJob(job.id);
  const mouvements = await tx.select().from(L).where(eq(L.jobId, job.id));
  const reserve = mouvements.find((m) => m.kind === 'reserve');
  if (!reserve) throw new Error(`job ${job.id} sans réserve · règlement impossible`);
  if (mouvements.some((m) => m.kind === 'settle')) throw new Error(`job ${job.id} déjà réglé`);

  const d = decisionReglement({
    issue,
    reserve: { credits: reserve.credits, usdMicros: Number(reserve.usdMicros) },
    lignes: snapshot.lignes,
    operationsLivrees: o.operationsLivrees,
    coutFournisseurUsdMicros: o.coutFournisseurUsdMicros ?? null,
  });
  const commun = { workspaceId: job.workspaceId, brandId: job.brandId, projectId: job.projectId, jobId: job.id, quoteId: job.quoteId };
  const t = new Date().toISOString();
  await tx.insert(L).values({ ...commun, kind: 'settle', credits: d.settle.credits, usdMicros: d.settle.usdMicros, ref: refs.settle, reason: `règlement · ${issue}` });
  o.journal.push({ t, type: 'registre', worker: o.worker, jobId: job.id, kind: 'settle', credits: d.settle.credits, usdMicros: d.settle.usdMicros, ref: refs.settle });
  if (d.release.credits > 0 || d.release.usdMicros > 0) {
    await tx.insert(L).values({ ...commun, kind: 'release', credits: d.release.credits, usdMicros: d.release.usdMicros, ref: refs.release, reason: `libération · ${issue}` });
    o.journal.push({ t, type: 'registre', worker: o.worker, jobId: job.id, kind: 'release', credits: d.release.credits, usdMicros: d.release.usdMicros, ref: refs.release });
  }
  if (d.release.credits > 0) {
    await tx.update(schema.workspaces)
      .set({ creditsBalance: sql`${schema.workspaces.creditsBalance} + ${d.release.credits}` })
      .where(eq(schema.workspaces.id, job.workspaceId));
    await tx.insert(schema.creditLedger).values({ workspaceId: job.workspaceId, delta: d.release.credits, reason: 'Studio · crédits non consommés rendus', refId: refs.release });
  }
}
