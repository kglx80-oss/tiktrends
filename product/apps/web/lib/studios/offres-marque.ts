import 'server-only';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { detailOffre, offreBriefDepuis, ordonnerOffres, signalAllegation, statutAllegation, type OffreBrief } from '@tiktrends/core';
import type { ContexteStudio } from './garde';

/**
 * Lot 9 bis V5 · les offres ACTIVES et les allégations d'une marque, en
 * LECTURE SEULE et DANS LA PORTÉE · pour « Offre et allégations » de
 * l'assistant (facultatif, jamais bloquant). Même portée que les personas
 * (`personasDeLaMarque`) · `brand_id IN <marques visibles>` ET l'espace de la
 * marque · une marque hors portée ne rend rien, indistinct de « n'en a pas ».
 * Une offre archivée ou une allégation archivée n'est pas proposée.
 */

export interface OffreProposee { id: string; intitule: string; detail: string; brief: OffreBrief }
export interface AllegationProposee { id: string; texte: string; statut: string; signal: string | null }

export async function offresEtAllegationsDuBrief(ctx: ContexteStudio, brandId: string): Promise<{ offres: OffreProposee[]; allegations: AllegationProposee[] }> {
  if (!db || !ctx.marques.includes(brandId)) return { offres: [], allegations: [] };
  const O = schema.offers, C = schema.brandClaims;
  const [offres, allegations] = await Promise.all([
    db.select({ id: O.id, intitule: O.label, type: O.kind, conditions: O.conditions, active: O.active }).from(O)
      .innerJoin(schema.brands, eq(O.brandId, schema.brands.id))
      .where(and(eq(O.brandId, brandId), inArray(O.brandId, ctx.marques), eq(O.workspaceId, ctx.workspaceId), eq(schema.brands.workspaceId, ctx.workspaceId), eq(O.active, true)))
      .orderBy(O.createdAt),
    db.select({ id: C.id, texte: C.text, statut: C.status }).from(C)
      .innerJoin(schema.brands, eq(C.brandId, schema.brands.id))
      .where(and(eq(C.brandId, brandId), inArray(C.brandId, ctx.marques), eq(C.workspaceId, ctx.workspaceId), eq(schema.brands.workspaceId, ctx.workspaceId), isNull(C.archivedAt)))
      .orderBy(C.createdAt),
  ]);
  return {
    offres: ordonnerOffres(offres).flatMap((o) => { const b = offreBriefDepuis(o); return b ? [{ id: o.id, intitule: o.intitule, detail: detailOffre(o), brief: b }] : []; }),
    allegations: allegations.map((a) => ({ id: a.id, texte: a.texte, statut: statutAllegation(a.statut), signal: signalAllegation(a.statut) })),
  };
}
