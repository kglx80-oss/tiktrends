import 'server-only';
import {
  epinglerProduit, changementsEpinglage, ajouterAssociation, retirerAssociation, VARIANTE_UNIQUE, erreurStudio,
  type ChangementPatch, type ReferenceBrief,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { enregistrerVersion, estUuid, type VersionStudio } from '../depot';
import { chargerCatalogueProjet, produitDuCatalogue, idsPhotos, type Resultat } from './catalogue';

/**
 * Commandes « produit et références » (cahier §4.4 points 1 et 2).
 *
 * Chacune : catalogue relu côté serveur (portée du projet), règle PURE du
 * noyau, puis UNE nouvelle version par la commande L1 `enregistrerVersion`
 * (verrou, version de base obligatoire, 409 `VERSION_CONFLICT` si elle a
 * bougé, audit) · jamais d'écriture directe du contenu. Chemins bornés :
 * `/productRef` et `/brief` seulement.
 *
 * Aucun appel modèle, aucun média produit, aucune dépense.
 */

const CHEMINS: readonly string[] = ['/productRef', '/brief'];

export interface EntreeEpinglage {
  projectId: unknown;
  baseVersionId: unknown;
  productId: unknown;
  photoId: unknown;
  composants?: unknown;
  attributs?: unknown;
  transformations?: unknown;
}

type Dependances = { veilleOuverte: boolean; maintenant: Date };

async function ecrire(ctx: ContexteStudio, projectId: string, baseVersionId: unknown, changes: ChangementPatch[], raison: string): Promise<Resultat<{ version: VersionStudio; inchange: boolean }>> {
  return enregistrerVersion(ctx, { projectId, baseVersionId, changes, allowedPaths: CHEMINS, raison });
}

/** Épingle UNE photo d'un produit du catalogue de la marque du projet · nouvelle version. */
export async function epinglerProduitPour(ctx: ContexteStudio, e: EntreeEpinglage, o: Dependances): Promise<Resultat<{ version: VersionStudio; inchange: boolean }>> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const c = await chargerCatalogueProjet(ctx, e.projectId, o);
  if (!c.ok) return c;
  const cat = c.catalogue;
  const p = produitDuCatalogue(cat, e.productId);
  const r = epinglerProduit(
    { productId: e.productId, photoId: e.photoId, composants: e.composants, attributs: e.attributs, transformations: e.transformations },
    { produit: p?.produit ?? null, photos: p?.photos ?? [], variante: VARIANTE_UNIQUE },
    o.maintenant,
  );
  if (!r.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: r.violations });
  const changes = changementsEpinglage(cat.contenu, cat.brief, r.reference, idsPhotos(p));
  return ecrire(ctx, cat.projet.id, e.baseVersionId, changes, `Produit épinglé : ${r.reference.nom} · photo ${r.reference.photo.position} sur ${r.reference.photo.total}`);
}

export interface EntreeAssociation { projectId: unknown; baseVersionId: unknown; assetId: unknown; role: unknown; scope?: unknown }

async function modifierReferences(
  ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown }, o: Dependances,
  calcul: (refs: ReferenceBrief[], cat: Parameters<typeof ajouterAssociation>[2], produit: Parameters<typeof ajouterAssociation>[3]) => ReturnType<typeof ajouterAssociation>,
  raison: string,
): Promise<Resultat<{ version: VersionStudio; inchange: boolean }>> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const c = await chargerCatalogueProjet(ctx, e.projectId, o);
  if (!c.ok) return c;
  const cat = c.catalogue;
  if (!cat.brief) {
    return erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, targetIds: [cat.projet.id], message: cat.briefIllisible ? 'Le brief de cette version est illisible · les références s’y rangent.' : 'Ce projet n’a pas encore de brief · les références s’y rangent.' });
  }
  const r = calcul(cat.brief.references, cat.fichiers, cat.epingle);
  if (!r.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: r.violations });
  return ecrire(ctx, cat.projet.id, e.baseVersionId, [{ op: 'replace', path: '/brief/references', newValue: r.references, reason: raison }], raison);
}

/** Associe un fichier avec un rôle et une portée EXPLICITES · une association de plus. */
export function associerReferencePour(ctx: ContexteStudio, e: EntreeAssociation, o: Dependances) {
  return modifierReferences(ctx, e, o, (refs, fichiers, produit) => ajouterAssociation(refs, { assetId: e.assetId, role: e.role, scope: e.scope }, fichiers, produit), 'Référence associée');
}

/** Retire l'association (fichier, rôle) · les autres rôles du même fichier restent. */
export function retirerReferencePour(ctx: ContexteStudio, e: EntreeAssociation, o: Dependances) {
  return modifierReferences(ctx, e, o, (refs, _f, produit) => retirerAssociation(refs, { assetId: e.assetId, role: e.role }, produit), 'Référence retirée');
}

