import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  // pgvector : activer l'extension dans la 1re migration : CREATE EXTENSION IF NOT EXISTS vector;
  verbose: true,
  strict: true,
});
