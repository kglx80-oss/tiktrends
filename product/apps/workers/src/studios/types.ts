import type { db } from '@tiktrends/db';
import type { schema } from '@tiktrends/db';

/** Le client drizzle (postgres-js en production, pglite ou une seconde connexion en test). */
export type BaseStudio = typeof db;
export type TxStudio = Parameters<Parameters<BaseStudio['transaction']>[0]>[0];
export type ExecStudio = BaseStudio | TxStudio;
export type JobStudio = typeof schema.studioJobs.$inferSelect;
export type TentativeStudio = typeof schema.studioJobAttempts.$inferSelect;

/** Une ligne du journal JSON (banc, débogage) · transitions et mouvements du registre. */
export type EntreeJournal =
  | { t: string; type: 'transition'; worker: string; jobId: string; de: string; vers: string; acteur: string; motif: string }
  | { t: string; type: 'registre'; worker: string; jobId: string; kind: string; credits: number; usdMicros: number; ref: string }
  | { t: string; type: 'fournisseur'; worker: string; jobId: string; appel: string; detail: string }
  | { t: string; type: 'webhook'; worker: string; jobId: string | null; evenement: string; action: string; raison: string };
