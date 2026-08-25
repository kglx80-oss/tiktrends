'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { getActiveBrand } from '../../lib/brands';

/** Enregistre les règles créatives maison (Jarvis) de la marque active. Injectées dans chaque génération. */
export async function saveJarvisRulesAction(input: { creativeRules: string }): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'Action réservée aux administrateurs.' };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne une marque active.' };
  const rules = (input.creativeRules || '').slice(0, 4000);
  await db.update(schema.brands).set({ creativeRules: rules || null }).where(eq(schema.brands.id, brand.id));
  return { ok: true };
}
