import 'server-only';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type { InspoAd } from '@tiktrends/integrations';
import { lireFormatCreatif, styleDuFormat, type AnnonceFormat, type SauvegardePourTendance } from '@tiktrends/core';
import type { Session } from '../../../../../lib/auth';
import type { BrandLite } from '../../../../../lib/brands';

/**
 * Les lectures RÉELLES des écrans Formats et Tendances (Spatial) · même
 * périmètre que l'écran Formats de l'ancienne interface · les annonces que
 * l'espace a sauvegardées (marque active s'il y en a une), classées à la main.
 * Aucune annonce de la Veille ne porte de format (le connecteur n'en fournit
 * pas) · rien n'est classé ici, rien n'est deviné, aucune dépense.
 */

export interface SauvegardeSpatiale extends AnnonceFormat {
  id: string;
  externalId: string;
  ad: InspoAd;
}

export async function lireSauvegardes(s: Session, marque: BrandLite | null): Promise<SauvegardeSpatiale[]> {
  if (!db) return [];
  const ou = marque
    ? and(eq(schema.savedAds.workspaceId, s.workspaceId), eq(schema.savedAds.brandId, marque.id))
    : eq(schema.savedAds.workspaceId, s.workspaceId);
  const lignes = await db.select({ id: schema.savedAds.id, platform: schema.savedAds.platform, externalId: schema.savedAds.externalId, snapshot: schema.savedAds.snapshot, createdAt: schema.savedAds.createdAt })
    .from(schema.savedAds).where(ou).orderBy(desc(schema.savedAds.createdAt));
  return lignes.map((r) => {
    const ad = (r.snapshot ?? {}) as InspoAd;
    return {
      id: r.id, platform: r.platform, externalId: r.externalId, ad,
      mediaType: ad.mediaType ?? null, daysRunning: ad.daysRunning ?? null,
      sauvegardeLe: (r.createdAt as Date).toISOString(), format: lireFormatCreatif(r.snapshot),
    };
  });
}

/** Les marques suivies (`plateforme:nom`) · même portée que les sauvegardes. */
export async function lireSuivis(s: Session, marque: BrandLite | null): Promise<Set<string>> {
  if (!db) return new Set();
  const ou = marque
    ? and(eq(schema.followedBrands.workspaceId, s.workspaceId), eq(schema.followedBrands.brandId, marque.id))
    : eq(schema.followedBrands.workspaceId, s.workspaceId);
  const fl = await db.select({ platform: schema.followedBrands.platform, name: schema.followedBrands.name }).from(schema.followedBrands).where(ou);
  return new Set(fl.map((b) => `${b.platform}:${b.name}`));
}

/** L'image des miniatures · la première image produit de la marque active, sinon son logo. */
export async function lireImageMarque(marque: BrandLite | null): Promise<string | null> {
  if (!marque) return null;
  if (db) {
    const [p] = await db.select({ imageUrl: schema.products.imageUrl }).from(schema.products)
      .where(and(eq(schema.products.brandId, marque.id), isNotNull(schema.products.imageUrl))).limit(1);
    if (p?.imageUrl) return p.imageUrl;
  }
  return marque.logoUrl ?? null;
}

/** Les sauvegardes, prêtes pour la règle des tendances (noyau). */
export function sauvegardesPourTendances(annonces: readonly SauvegardeSpatiale[]): SauvegardePourTendance[] {
  return annonces.map((a) => ({
    sauvegardeLe: a.sauvegardeLe,
    style: a.format.etat === 'classe' ? styleDuFormat(a.format.id) : null,
    classee: a.format.etat === 'classe',
    annonceur: a.ad.advertiserName ?? null,
    plateforme: a.platform,
    jours: typeof a.daysRunning === 'number' ? a.daysRunning : null,
    vignette: a.ad.thumbnailUrl ?? null,
  }));
}
