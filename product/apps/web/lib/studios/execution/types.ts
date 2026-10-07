import type { db } from '@tiktrends/db';

/** Le client drizzle · `db` par défaut, une autre connexion dans les tests de concurrence. */
export type BaseStudio = typeof db;
export type TxStudio = Parameters<Parameters<BaseStudio['transaction']>[0]>[0];
export type ExecStudio = BaseStudio | TxStudio;
