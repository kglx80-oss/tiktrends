'use server';

import { aPermissionEspace, etatNouveauProjet, titreNouveauProjetParDefaut, photosDuProduit } from '@tiktrends/core';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { assetAiUrl } from '../../../lib/asset-ai-url';
import { brandMediaPreview } from '../../../lib/brand-media-url';
import { hacherImage } from '../../../lib/studios/produit/catalogue';
import { getActiveBrand } from '../../../lib/brands';
import { gardeStudio } from '../../../lib/studios/garde';
import { personasDeLaMarque } from '../../../lib/studios/personas-marque';
import { offresEtAllegationsDuBrief } from '../../../lib/studios/offres-marque';

/** Ouverture du wizard : lecture seulement, droits réévalués au clic. */
export async function ouvrirAssistantProjet() {
  const g = await gardeStudio('studio.read', 'projets');
  if (!g.ok) return g;
  const active = await getActiveBrand(g.ctx.workspaceId);
  const marque = active && g.ctx.marques.includes(active.id) ? active : null;
  const etat = etatNouveauProjet({ peutProposer: aPermissionEspace(g.ctx.permissions, 'studio.propose'), marqueActive: marque });
  const personas = etat.etat === 'pret' ? await personasDeLaMarque(g.ctx, etat.marque.id) : [];
  // Lot 9 bis · les offres actives et les allégations de la marque active · lecture, portée.
  const { offres, allegations } = etat.etat === 'pret' ? await offresEtAllegationsDuBrief(g.ctx, etat.marque.id) : { offres: [], allegations: [] };
  const lignes = marque ? await db.select({ id: schema.products.id, name: schema.products.name, imageUrl: schema.products.imageUrl, imageUrls: schema.products.imageUrls }).from(schema.products).innerJoin(schema.brands, eq(schema.products.brandId, schema.brands.id)).where(and(eq(schema.products.brandId, marque.id), eq(schema.brands.workspaceId, g.ctx.workspaceId))).limit(200) : [];
  // L'aperçu d'une photo passe par la route média de la marque (stable, gardée à chaque lecture) · jamais
  // l'adresse privée du stockage, ni une adresse SIGNÉE de 5 minutes laissée dans la page (cassée ensuite).
  // Une photo du stockage hors de l'espace reste écartée (`assetAiUrl` ⇒ null), comme avant.
  const produits = lignes.map((p) => ({ id: p.id, nom: p.name, photos: photosDuProduit(p, hacherImage).flatMap((ph) => { const apercu = marque && ph.url && assetAiUrl(ph.url, g.ctx.workspaceId) ? brandMediaPreview(marque.id, ph.url) : null; return apercu ? [{ assetId: ph.assetId, apercu, position: ph.position ?? 1 }] : []; }) }));
  return { ok: true as const, props: { etat, initial: { type: 'ads' as const, titre: titreNouveauProjetParDefaut('ads', marque?.name ?? ''), intention: '' }, personas, offres, allegations, produits } };
}
