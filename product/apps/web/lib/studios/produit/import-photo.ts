import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  verdictDataUriPhoto, decisionAjoutPhoto, colonnesApresImport, photosDuProduit, idPhotoProduit, epinglerProduit, changementsEpinglage,
  VARIANTE_UNIQUE, erreurStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { enregistrerVersion, estUuid, type VersionStudio } from '../depot';
import { chargerCatalogueProjet, produitDuCatalogue, hacherImage, type Resultat } from './catalogue';

/**
 * UX V2 · lot 3a · une photo déposée depuis l'ordinateur devient la photo
 * produit épinglée du projet.
 *
 * Même chemin que l'ancien geste retiré avec les anciens studios
 * (`setProductImagesAction`, #779) : data URI dans `products.image_urls` du
 * produit · mais le produit est cherché dans le catalogue de la marque DU
 * PROJET (portée relue par le dépôt L1), jamais dans « la marque active ».
 * Puis l'épinglage existant (`epinglerProduit` → `enregistrerVersion` : verrou,
 * version de base, 409, audit).
 *
 * Ordre des écritures · toutes les règles PURES d'abord (fichier, borne,
 * composants, gestes, version de base) : un refus n'écrit RIEN. Ensuite
 * l'ajout au catalogue, puis la version. Si la version échoue après l'ajout
 * (course avec un autre onglet), la photo reste dans le catalogue du produit,
 * visible et épinglable, et le message le dit · rien n'est perdu ni masqué.
 *
 * Aucun appel modèle, aucun fournisseur, aucune dépense.
 */

export interface EntreeImportPhoto {
  projectId: unknown;
  baseVersionId: unknown;
  productId: unknown;
  dataUri: unknown;
  composants?: unknown;
  transformations?: unknown;
}

export type ResultatImportPhoto = Resultat<{ version: VersionStudio; inchange: boolean; photoId: string; ajoutee: boolean }>;

export async function importerPhotoProduitPour(ctx: ContexteStudio, e: EntreeImportPhoto, o: { veilleOuverte: boolean; maintenant: Date }): Promise<ResultatImportPhoto> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const c = await chargerCatalogueProjet(ctx, e.projectId, o);
  if (!c.ok) return c;
  const cat = c.catalogue;
  const p = produitDuCatalogue(cat, e.productId);
  if (!p) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'productId', raison: 'produit absent du catalogue de la marque du projet' }] });

  const v = verdictDataUriPhoto(e.dataUri);
  if (!v.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, message: v.message, violations: [{ chemin: 'dataUri', raison: v.message }] });
  const dataUri = e.dataUri as string;

  const photoId = idPhotoProduit(p.produit.id, hacherImage(dataUri).sha256);
  const decision = decisionAjoutPhoto(p.photos, photoId);
  if (decision.action === 'refus') return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, message: decision.message, violations: [{ chemin: 'productId', raison: decision.message }] });
  const ajoutee = decision.action === 'ajouter';

  // Le catalogue tel qu'il sera APRÈS l'ajout · l'épinglage se calcule dessus, avant toute écriture.
  const produitApres = ajoutee ? { ...p.produit, ...colonnesApresImport(p.produit, dataUri) } : p.produit;
  const photosApres = ajoutee ? photosDuProduit(produitApres, hacherImage) : p.photos;
  const r = epinglerProduit(
    { productId: p.produit.id, photoId, composants: e.composants, transformations: e.transformations },
    { produit: produitApres, photos: photosApres, variante: VARIANTE_UNIQUE },
    o.maintenant,
  );
  if (!r.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: r.violations });

  // Version de base périmée · refus AVANT d'écrire le produit (cas courant : un onglet resté ouvert).
  if (typeof e.baseVersionId !== 'string' || e.baseVersionId !== cat.version.id) {
    return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [cat.projet.id, cat.version.id], conflit: { versionCouranteId: cat.version.id, differences: [] } });
  }

  if (ajoutee) {
    const P = schema.products;
    const maj = await db.update(P).set({
      // Mêmes règles que `colonnesApresImport` · évaluées sur les valeurs AVANT mise à jour.
      imageUrl: sql`case when ${P.imageUrl} is null and coalesce(cardinality(${P.imageUrls}), 0) = 0 then ${dataUri} else ${P.imageUrl} end`,
      imageUrls: sql`array_append(coalesce(${P.imageUrls}, '{}'::text[]), ${dataUri}::text)`,
    }).where(and(eq(P.id, p.produit.id), eq(P.brandId, cat.projet.brandId))).returning({ id: P.id });
    if (maj.length !== 1) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  }

  const changes = changementsEpinglage(cat.contenu, cat.brief, r.reference, new Set(photosApres.map((f) => f.assetId)));
  const w = await enregistrerVersion(ctx, {
    projectId: cat.projet.id, baseVersionId: e.baseVersionId, changes, allowedPaths: ['/productRef', '/brief'],
    raison: `Photo importée et épinglée : ${r.reference.nom} · photo ${r.reference.photo.position} sur ${r.reference.photo.total}`,
  });
  if (!w.ok) {
    if (!ajoutee) return w;
    const suite = 'La photo a bien rejoint le catalogue du produit · recharge la page pour l’épingler.';
    return w.code === 'VERSION_CONFLICT' ? w : { ...w, message: `${w.message} ${suite}` };
  }
  return { ok: true, version: w.version, inchange: w.inchange, photoId, ajoutee };
}
