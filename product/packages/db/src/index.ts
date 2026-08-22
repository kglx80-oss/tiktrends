import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
const client = url ? postgres(url, { prepare: false }) : undefined;

// Client Drizzle (typé sur le schéma). Lazily null si DATABASE_URL absent (build).
export const db = client ? drizzle(client, { schema }) : (undefined as never);
export { schema };
export * from './schema';
