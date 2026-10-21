'use server';

import { aPermissionEspace, etatNouveauProjet, titreNouveauProjetParDefaut, photosDuProduit } from '@tiktrends/core';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { assetAiUrl } from '../../../lib/asset-ai-url';
import { hacherImage } from '../../../lib/studios/produit/catalogue';
import { getActiveBrand } from '../../../lib/brands';
import { gardeStudio } from '../../../lib/studios/garde';
import { personasDeLaMarque } from '../../../lib/studios/personas-marque';

/** Ouverture du wizard : lecture seulement, droits réévalués au clic. */
export async function ouvrirAssistantProjet() {
  const g = await gardeStudio('studio.read', 'projets');
  if (!g.ok) return g;
  const active = await getActiveBrand(g.ctx.workspaceId);
  const marque = active && g.ctx.marques.includes(active.id) ? active : null;
  const etat = etatNouveauProjet({ peutProposer: aPermissionEspace(g.ctx.permissions, 'studio.propose'), marqueActive: marque });
  const personas = etat.etat === 'pret' ? await personasDeLaMarque(g.ctx, etat.marque.id) : [];
  const lignes = marque ? await db.select({ id: schema.products.id, name: schema.products.name, imageUrl: schema.products.imageUrl, imageUrls: schema.products.imageUrls }).from(schema.products).innerJoin(schema.brands, eq(schema.products.brandId, schema.brands.id)).where(and(eq(schema.products.brandId, marque.id), eq(schema.brands.workspaceId, g.ctx.workspaceId))).limit(200) : [];
  const produits = lignes.map((p) => ({ id: p.id, nom: p.name, photos: photosDuProduit(p, hacherImage).flatMap((ph) => { const apercu = ph.url ? assetAiUrl(ph.url, g.ctx.workspaceId) : null; return apercu ? [{ assetId: ph.assetId, apercu, position: ph.position ?? 1 }] : []; }) }));
  return { ok: true as const, props: { etat, initial: { type: 'ads' as const, titre: titreNouveauProjetParDefaut('ads', marque?.name ?? ''), intention: '' }, personas, produits } };
}
