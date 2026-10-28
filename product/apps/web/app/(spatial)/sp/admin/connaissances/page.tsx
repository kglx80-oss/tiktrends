import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { peutGererConnaissances } from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { chargerConnaissancesAction } from '../../../../actions/connaissances';
import { Connaissances } from '../../../../../spatial/vues/admin/Connaissances';
import { bandeauSeul } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * « Connaissances » · porte de l'ancien `/admin/connaissances` · l'ACCÈS TOTAL
 * d'équipe plateforme (Admin+ / Admin, lu sur `s.equipe`, jamais sur le rôle
 * d'espace), AVANT toute lecture. Un owner ou un admin d'espace client est
 * renvoyé au tableau de bord · la même garde est reposée dans chaque action.
 */
export default async function ConnaissancesSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!peutGererConnaissances(s.equipe?.role)) redirect('/dashboard');
  const [r, b, marques] = await Promise.all([
    chargerConnaissancesAction(),
    bandeauSeul(),
    // Les espaces et marques ne servent qu'au choix d'une portée restreinte.
    db ? db.select({ id: schema.brands.id, name: schema.brands.name, workspaceId: schema.brands.workspaceId, espace: schema.workspaces.name })
      .from(schema.brands).innerJoin(schema.workspaces, eq(schema.brands.workspaceId, schema.workspaces.id))
      .orderBy(schema.workspaces.name, schema.brands.name).limit(500).catch(() => []) : Promise.resolve([]),
  ]);
  const espaces = [...new Map(marques.map((m) => [m.workspaceId, { id: m.workspaceId, name: m.espace }])).values()];
  return <Connaissances bandeau={b} vue={r.vue ?? null} erreur={r.error ?? null} espaces={espaces} marques={marques.map((m) => ({ id: m.id, name: m.name, workspaceId: m.workspaceId }))} />;
}
