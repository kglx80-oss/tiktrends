import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { adminMoisLong, adminNombre, barresUsage } from '@tiktrends/core';
import { UsageTests } from '../../../../../spatial/vues/admin/UsageTests';
import { bandeauSeul, porteAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

const n = async (q: Promise<Array<{ n: number | string | null }>>) => { try { return Number((await q)[0]?.n ?? 0); } catch { return 0; } };

/** « Usage & tests » · NOUVELLE adresse · même porte que `/admin` (fondateur ET admin de l'espace). */
export default async function UsageAdminSpatial() {
  await porteAdmin();
  const maintenant = new Date();
  const depuis = new Date(maintenant.getTime() - 30 * 86_400_000);
  if (!db) return <UsageTests bandeau={await bandeauSeul()} titre="Usage · 30 jours" usage={[]} />;
  const [b, generations, projets, executions, jarvis, lots, credits, appels] = await Promise.all([
    bandeauSeul(),
    n(db.select({ n: count() }).from(schema.generations).where(gte(schema.generations.createdAt, depuis))),
    n(db.select({ n: count() }).from(schema.studioProjects).where(gte(schema.studioProjects.createdAt, depuis))),
    n(db.select({ n: count() }).from(schema.studioPromptRuns).where(gte(schema.studioPromptRuns.createdAt, depuis))),
    n(db.select({ n: count() }).from(schema.jarvisMessages).where(and(gte(schema.jarvisMessages.createdAt, depuis), eq(schema.jarvisMessages.role, 'user')))),
    n(db.select({ n: count() }).from(schema.batches).where(gte(schema.batches.createdAt, depuis))),
    n(db.select({ n: sql<number>`coalesce(-sum(${schema.creditLedger.delta}), 0)` }).from(schema.creditLedger).where(and(lt(schema.creditLedger.delta, 0), gte(schema.creditLedger.createdAt, depuis)))),
    n(db.select({ n: count() }).from(schema.aiSpend).where(gte(schema.aiSpend.createdAt, depuis))),
  ]);
  return (
    <UsageTests
      bandeau={b}
      titre={`Usage · 30 jours (jusqu’au ${maintenant.getDate()} ${adminMoisLong(maintenant)})`}
      usage={barresUsage([
        { libelle: 'Générations (images, vidéos, textes)', n: generations },
        { libelle: 'Projets Studios créés', n: projets },
        { libelle: 'Exécutions de prompts', n: executions },
        { libelle: 'Messages à Jarvis', n: jarvis },
        { libelle: 'Lots de test créés', n: lots },
        { libelle: 'Crédits consommés', n: credits },
        { libelle: 'Appels IA facturés', n: appels },
      ]).map((u) => ({ ...u, n: adminNombre(u.n) }))}
    />
  );
}
