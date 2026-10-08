import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  erreurStudio, faitsProduit, metriquesDisponibles, plafondPropositionUsd, rateFor,
  type ErreurStudio, type FaitProduit, type ManqueProduit, type SourceReferenceStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { chargerSources, estUuid } from './sources';

/**
 * « Préparer une création » · LECTURE (cahier 01 §4.2 points 2 et 6).
 *
 * Rend, pour la sélection : la source figée (date, droit, ressources réellement
 * disponibles, observations et absents), la marque cible et les autres marques
 * visibles (le choix est visible avant toute écriture), les produits de cette
 * marque avec leurs faits connus et leurs manques, et la disponibilité honnête
 * des propositions IA avec leur plafond de coût. N'écrit rien, n'appelle aucun
 * modèle.
 */

export interface ProduitPrepare {
  id: string;
  nom: string;
  faits: FaitProduit[];
  manques: ManqueProduit[];
  photoDisponible: boolean;
}

export interface DisponibiliteIa {
  disponible: boolean;
  /** Pourquoi elle ne l'est pas · phrase à afficher telle quelle. */
  raison: string | null;
  plafondUsd: number;
  modele: string;
}

export interface Preparation {
  brandId: string | null;
  marques: Array<{ id: string; nom: string }>;
  sources: SourceReferenceStudio[];
  produits: ProduitPrepare[];
  ia: DisponibiliteIa;
  metriques: string[];
}

export async function produitsDeLaMarque(brandId: string): Promise<ProduitPrepare[]> {
  const lignes = await db.select().from(schema.products).where(eq(schema.products.brandId, brandId)).orderBy(asc(schema.products.name)).limit(60);
  return lignes.map((p) => {
    const { faits, manques } = faitsProduit({ id: p.id, name: p.name, description: p.description, usp: p.usp, price: p.price, url: p.url, imageUrl: p.imageUrl, imageUrls: p.imageUrls });
    return { id: p.id, nom: p.name, faits, manques, photoDisponible: !manques.some((m) => m.cle === 'photo') };
  });
}

export async function preparerCreationPour(
  ctx: ContexteStudio,
  e: { sources: unknown; brandId?: unknown },
  o: { veilleOuverte: boolean; maintenant: Date; marqueActive: string | null; ia: { configuree: boolean; releasePubliee: boolean; modele: string } },
): Promise<({ ok: true } & Preparation) | ErreurStudio> {
  const marques = ctx.marques.length
    ? await db.select({ id: schema.brands.id, nom: schema.brands.name }).from(schema.brands)
      .where(and(eq(schema.brands.workspaceId, ctx.workspaceId), inArray(schema.brands.id, ctx.marques))).orderBy(asc(schema.brands.name))
    : [];
  let brandId: string | null = null;
  if (e.brandId !== undefined && e.brandId !== null) {
    if (!estUuid(e.brandId) || !marques.some((m) => m.id === e.brandId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
    brandId = e.brandId;
  } else {
    brandId = (o.marqueActive && marques.some((m) => m.id === o.marqueActive) ? o.marqueActive : marques[0]?.id) ?? null;
  }

  const c = await chargerSources(ctx, e.sources, o);
  if (!c.ok) return c;
  const produits = brandId ? await produitsDeLaMarque(brandId) : [];
  const raison = !o.ia.releasePubliee
    ? 'Propositions pas encore activées · aucune version des consignes n’est publiée. Rédige ton hypothèse.'
    : !o.ia.configuree
      ? 'Propositions indisponibles ici · aucun fournisseur configuré. Rédige ton hypothèse.'
      : null;
  return {
    ok: true,
    brandId,
    marques,
    sources: c.sources,
    produits,
    ia: { disponible: raison === null, raison, plafondUsd: plafondPropositionUsd(rateFor(o.ia.modele)), modele: o.ia.modele },
    metriques: metriquesDisponibles(c.sources.some((s) => s.modalites.includes('video'))),
  };
}
