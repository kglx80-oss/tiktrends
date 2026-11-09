import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { offreDuBrief, offreDuTest, ordonnerOffres, type AttributionOffre, type PersonaRef } from '@tiktrends/core';

/**
 * Lot 9 bis V5 · les offres d'une marque et l'offre de CHAQUE test, en
 * LECTURE SEULE et dans la portée (espace ET marque) · aucune écriture. Le
 * modèle exact de `personas-tests.ts`.
 *
 * Une seule table (`adsmap_offers`). Deux liens LUS, jamais recopiés (la règle
 * qui les compose, sans fusion, est au noyau · `offreDuTest`) :
 *  · l'annonce · `adsmap_ads.offer_id`, borné à l'espace de l'ad ET à la marque
 *    de l'offre ;
 *  · le brief · lien variante ↔ ad (`studio_test_links`, borné à l'espace et à
 *    la marque) → variante → version de projet → fait d'offre du brief
 *    (`offreDuBrief`), relu contre les offres de la marque (une offre d'ailleurs
 *    ne compte pas · le texte figé dans le brief n'est jamais repris pour la nommer).
 * Une offre ARCHIVÉE reste lue · elle a été diffusée.
 */

export interface OffreDeMarque extends PersonaRef { active: boolean }

export interface OffresEtTests {
  /** Les offres de la marque, actives d'abord (`ordonnerOffres`) · `nom` = l'intitulé. */
  offres: OffreDeMarque[];
  /** L'offre de chaque ad de la marque · une ad absente n'a ni offre diffusée ni brief lisible. */
  parAd: Map<string, AttributionOffre>;
}

export async function offresEtTests(workspaceId: string, brandId: string): Promise<OffresEtTests> {
  if (!db) return { offres: [], parAd: new Map() };
  const O = schema.offers, TL = schema.studioTestLinks, VA = schema.studioVariants, V = schema.studioProjectVersions;
  const [lignes, annonces, briefs] = await Promise.all([
    db.select({ id: O.id, nom: O.label, active: O.active }).from(O)
      .where(and(eq(O.brandId, brandId), eq(O.workspaceId, workspaceId))).orderBy(O.createdAt),
    db.select({ adId: schema.ads.id, offreId: O.id }).from(schema.ads)
      .innerJoin(O, eq(O.id, schema.ads.offerId))
      .where(and(eq(schema.ads.workspaceId, workspaceId), eq(O.brandId, brandId), eq(O.workspaceId, workspaceId))),
    db.select({ adId: TL.adsmapAdId, faits: sql<unknown>`${V.content} -> 'brief' -> 'facts'` })
      .from(TL)
      .innerJoin(VA, and(eq(VA.id, TL.variantId), eq(VA.workspaceId, TL.workspaceId), eq(VA.brandId, TL.brandId)))
      .innerJoin(V, and(eq(V.id, VA.projectVersionId), eq(V.workspaceId, VA.workspaceId), eq(V.brandId, VA.brandId)))
      .where(and(eq(TL.workspaceId, workspaceId), eq(TL.brandId, brandId))),
  ]);
  const offres = ordonnerOffres(lignes);
  const parId = new Map(offres.map((o) => [o.id, { id: o.id, nom: o.nom }]));
  const annonce = new Map(annonces.map((a) => [a.adId, parId.get(a.offreId) ?? null]));
  const brief = new Map(briefs.map((b) => { const o = offreDuBrief(b.faits); return [b.adId, o ? parId.get(o.id) ?? null : null] as const; }));
  const parAd = new Map<string, AttributionOffre>();
  for (const adId of new Set([...annonce.keys(), ...brief.keys()])) parAd.set(adId, offreDuTest({ annonce: annonce.get(adId) ?? null, brief: brief.get(adId) ?? null }));
  return { offres, parAd };
}
