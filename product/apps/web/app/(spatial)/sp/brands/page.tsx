import { redirect } from 'next/navigation';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { initialeNom, ligneMarque, messagesListeMarques, ordreMarques, refusNouvelleMarque } from '@tiktrends/core';
import { forfaitEffectif } from '../../../../lib/droits-forfait';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { deleteBrandAction, setActiveBrand } from '../../../actions/brands';
import { ListeMarques, type MarqueListe } from '../../../../spatial/vues/marque/ListeMarques';

export const dynamic = 'force-dynamic';

/**
 * « Marques » (Spatial) · mêmes gardes et mêmes lectures que la page V5
 * `/brands` : session, rôle admin d'espace (sinon le tableau de bord), les
 * marques de l'espace et leurs comptages (une passe par table).
 */
export default async function ListeMarquesSpatiale() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const active = await getActiveBrand(s.workspaceId);
  const rows = db ? await db.select().from(schema.brands).where(eq(schema.brands.workspaceId, s.workspaceId)) : [];
  const ids = rows.map((b) => b.id);

  const parMarque = (arr: Array<{ brandId: string; n: number }>) => Object.fromEntries(arr.map((x) => [x.brandId, Number(x.n)]));
  let personas: Record<string, number> = {}, scenarios: Record<string, number> = {}, comptes: Record<string, number> = {};
  if (db && ids.length) {
    const [p, sc, ad] = await Promise.all([
      db.select({ brandId: schema.personas.brandId, n: sql<number>`count(*)` }).from(schema.personas).where(inArray(schema.personas.brandId, ids)).groupBy(schema.personas.brandId),
      db.select({ brandId: schema.scenarios.brandId, n: sql<number>`count(*)` }).from(schema.scenarios).where(inArray(schema.scenarios.brandId, ids)).groupBy(schema.scenarios.brandId),
      db.select({ brandId: schema.adAccounts.brandId, n: sql<number>`count(*)` }).from(schema.adAccounts).where(inArray(schema.adAccounts.brandId, ids)).groupBy(schema.adAccounts.brandId),
    ]);
    personas = parMarque(p); scenarios = parMarque(sc); comptes = parMarque(ad);
  }

  const marques: MarqueListe[] = rows.map((b) => {
    const l = ligneMarque(b);
    return {
      id: b.id, nom: b.name, initiale: initialeNom(b.name), ligne: l.texte, domaine: l.domaine, active: active?.id === b.id,
      comptes: { pub: comptes[b.id] ?? 0, scenarios: scenarios[b.id] ?? 0, personas: personas[b.id] ?? 0, concurrents: (b.competitors ?? []).length },
    };
  });

  // Droits du forfait (29/10, point 6) · la limite de marques se lit AVANT le clic, avec le forfait qui la lève.
  const limite = refusNouvelleMarque(forfaitEffectif(s.plan), rows.length);
  return <ListeMarques marques={ordreMarques(marques, active?.id ?? null)} retours={messagesListeMarques({ limiteMarques: limite })} limite={limite} choisir={setActiveBrand} supprimer={deleteBrandAction} />;
}
