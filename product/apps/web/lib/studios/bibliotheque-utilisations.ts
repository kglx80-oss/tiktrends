import 'server-only';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db, schema } from '@tiktrends/db';
import { objetDansPortee, utilisationsBibliotheque, PROJETS_UTILISATION_MAX, type LigneProjetUtilisation, type UtilisationsBibliotheque } from '@tiktrends/core';
import { gardeStudio, type ContexteStudio } from './garde';
import { refusCapacite } from './interrupteurs';

/**
 * Bibliothèque · « Utilisé dans » · LECTURE SEULE (aucune écriture, aucun
 * appel modèle, aucune dépense).
 *
 * Les projets que la session VOIT, par la même lecture que la page Studios
 * (`listerCartesPour`) · garde `studio.read`, capacité « projets », filtre
 * SQL espace + marques visibles, chaque ligne revérifiée par `objetDansPortee`
 * (une marque hors de la restriction d'un membre ne passe pas), actifs et
 * archivés. On ne lit que la version COURANTE (`current_version_id`, même
 * projet) et, d'elle, les seules références du brief
 * (`content->'brief'->'references'`) · jamais le contenu entier.
 *
 * DEUX requêtes quel que soit le nombre de fichiers ou de projets (projets +
 * version courante en une jointure, puis les noms de marque) · bornée à
 * `PROJETS_UTILISATION_MAX` projets, les plus récemment modifiés parmi ceux
 * dont les références citent la bibliothèque (pré-filtre texte `"bib_`, la
 * lecture exacte est faite au noyau · `utilisationsBibliotheque`).
 */

function porteeSql(t: { workspaceId: PgColumn; brandId: PgColumn }, ctx: ContexteStudio): SQL {
  if (ctx.marques.length === 0) return sql`false`;
  return and(eq(t.workspaceId, ctx.workspaceId), inArray(t.brandId, ctx.marques))!;
}
const dansPortee = (ctx: ContexteStudio, l: { workspaceId: string; brandId: string }): boolean =>
  objetDansPortee({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque }, l);

export async function lireUtilisationsBibliothequePour(ctx: ContexteStudio): Promise<UtilisationsBibliotheque> {
  if (!db || ctx.marques.length === 0) return { parFichier: {}, borne: false };
  const P = schema.studioProjects;
  const V = schema.studioProjectVersions;
  const refs = sql<unknown>`${V.content} -> 'brief' -> 'references'`;
  const lignes = await db.select({
    id: P.id, titre: P.title, statut: P.status, workspaceId: P.workspaceId, brandId: P.brandId,
    vWorkspaceId: V.workspaceId, vBrandId: V.brandId, references: refs,
  })
    .from(P)
    .innerJoin(V, and(eq(V.id, P.currentVersionId), eq(V.projectId, P.id)))
    .where(and(
      porteeSql(P, ctx), porteeSql(V, ctx),
      sql`jsonb_typeof(${refs}) = 'array'`,
      sql`(${refs})::text like '%"bib\\_%'`,
    ))
    .orderBy(desc(P.updatedAt))
    .limit(PROJETS_UTILISATION_MAX);
  const visibles = lignes.filter((l) => dansPortee(ctx, l) && dansPortee(ctx, { workspaceId: l.vWorkspaceId, brandId: l.vBrandId }));
  const idsMarques = [...new Set(visibles.map((l) => l.brandId))];
  const marques = idsMarques.length
    ? await db.select({ id: schema.brands.id, nom: schema.brands.name }).from(schema.brands)
      .where(and(eq(schema.brands.workspaceId, ctx.workspaceId), inArray(schema.brands.id, idsMarques)))
    : [];
  const nom = new Map(marques.map((m) => [m.id, m.nom]));
  const entree: LigneProjetUtilisation[] = visibles.map((l) => ({
    id: l.id, titre: l.titre, marque: nom.get(l.brandId) ?? '', statut: l.statut === 'archived' ? 'archived' : 'active', references: l.references,
  }));
  return utilisationsBibliotheque(entree, { borne: lignes.length >= PROJETS_UTILISATION_MAX });
}

/**
 * Pour la page Bibliothèque · `null` quand la session ne lit pas les projets
 * Studios (garde ou capacité refusée) ou que la lecture échoue · l'aperçu ne
 * dit alors rien plutôt que « aucun projet ».
 */
export async function lireUtilisationsBibliotheque(): Promise<UtilisationsBibliotheque | null> {
  try {
    const g = await gardeStudio('studio.read');
    if (!g.ok) return null;
    if (await refusCapacite(g.ctx, ['projets'])) return null;
    return await lireUtilisationsBibliothequePour(g.ctx);
  } catch (e) {
    console.error('[bibliotheque:utilise-dans] lecture', e instanceof Error ? e.message : e);
    return null;
  }
}
