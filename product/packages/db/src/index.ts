import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
const client = url ? postgres(url, { prepare: false }) : undefined;

// Client Drizzle (typé sur le schéma). Lazily null si DATABASE_URL absent (build).
export const db = client ? drizzle(client, { schema }) : (undefined as never);
export { schema };
export * from './schema';
// Ré-export des opérateurs courants pour les consommateurs sans dépendance directe à drizzle-orm.
export { eq, and, or, not, desc, asc, inArray, isNull, isNotNull, sql, count } from 'drizzle-orm';
