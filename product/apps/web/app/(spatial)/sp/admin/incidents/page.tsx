import { desc, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { adminDateHeure } from '@tiktrends/core';
import { FAMILY_LABEL, type ErrorFamily } from '../../../../../lib/user-error';
import { Incidents, PERIODES_INCIDENTS } from '../../../../../spatial/vues/admin/Incidents';
import { bandeauSeul, porteAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

/** Ce qu'il faut regarder, par cause · repris de l'ancien écran. */
const CONSEIL: Partial<Record<ErrorFamily, string>> = {
  quota: 'Recharger le compte fournisseur (Fal, Anthropic).',
  acces: 'Clé serveur expirée ou révoquée · à renouveler dans .env.deploy.',
  saturation: 'Pic de charge chez le fournisseur · en général transitoire.',
  service: 'Panne côté fournisseur · vérifier sa page de statut.',
  image: 'Souvent des URLs produit incorrectes côté client, pas une panne.',
  reseau: 'Coupure réseau ou DNS · vérifier le serveur si ça persiste.',
};
const LIMITE = 80;

/**
 * « Incidents » · porte de l'ancien `/admin/incidents` (`porteAdmin` · admin de
 * l'espace ET fondateur), avant toute lecture. Lecture seule · la date passe
 * par `gte`, jamais brute dans `sql`.
 */
export default async function IncidentsSpatial({ searchParams }: { searchParams?: Promise<{ j?: string }> } = {}) {
  await porteAdmin();
  const sp = (await searchParams) ?? {};
  const jours = (PERIODES_INCIDENTS as readonly number[]).includes(Number(sp.j)) ? Number(sp.j) : 7;
  const depuis = new Date(Date.now() - jours * 86_400_000);
  const E = schema.errorLog;
  const [b, familles, zones, lignes] = await Promise.all([
    bandeauSeul(),
    db ? db.select({ famille: E.family, n: sql<number>`count(*)`, dernier: sql<Date>`max(${E.createdAt})` }).from(E).where(gte(E.createdAt, depuis)).groupBy(E.family).orderBy(sql`count(*) desc`) : Promise.resolve([]),
    db ? db.select({ zone: E.scope, n: sql<number>`count(*)` }).from(E).where(gte(E.createdAt, depuis)).groupBy(E.scope).orderBy(sql`count(*) desc`).limit(12) : Promise.resolve([]),
    db ? db.select({ id: E.id, zone: E.scope, famille: E.family, detail: E.detail, le: E.createdAt, espace: schema.workspaces.name })
      .from(E).leftJoin(schema.workspaces, eq(E.workspaceId, schema.workspaces.id)).where(gte(E.createdAt, depuis)).orderBy(desc(E.createdAt)).limit(LIMITE) : Promise.resolve([]),
  ]);
  const total = familles.reduce((s, f) => s + Number(f.n), 0);
  const max = Number(familles[0]?.n ?? 0) || 1;
  const nom = (f: string) => FAMILY_LABEL[f as ErrorFamily] ?? f;
  return (
    <Incidents
      bandeau={b} jours={jours} total={total} limite={LIMITE}
      causes={familles.map((f) => ({ cle: f.famille, libelle: nom(f.famille), n: Number(f.n), part: (Number(f.n) / max) * 100, dernier: adminDateHeure(new Date(f.dernier)), conseil: CONSEIL[f.famille as ErrorFamily] ?? null }))}
      zones={zones.map((z) => ({ zone: z.zone, n: Number(z.n) }))}
      lignes={lignes.map((l) => ({ id: l.id, zone: l.zone, cause: nom(l.famille), espace: l.espace ?? null, quand: adminDateHeure(l.le as Date), detail: l.detail }))}
    />
  );
}
