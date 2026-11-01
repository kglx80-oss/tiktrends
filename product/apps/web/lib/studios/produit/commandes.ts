import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  epinglerProduit, changementsEpinglage, ajouterAssociation, retirerAssociation, VARIANTE_UNIQUE, erreurStudio,
  validerVersement, refusFichiersVersement, verserReferences, cheminProjetStudio, LIBELLES_ROLE, LIBELLES_PORTEE,
  type ChangementPatch, type ReferenceBrief, type ResultatVersement,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { enregistrerVersion, estUuid, lireProjet, type VersionStudio } from '../depot';
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
  ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown }, o: Dependances & { bibliotheque?: readonly string[] },
  calcul: (refs: ReferenceBrief[], cat: Parameters<typeof ajouterAssociation>[2], produit: Parameters<typeof ajouterAssociation>[3]) => ReturnType<typeof ajouterAssociation> | ResultatVersement,
  raison: string,
  /** `courante` · le geste vient de la Bibliothèque, qui ne tient pas de version · la base est la version courante relue ici (verrou et 409 inchangés). */
  base: 'fournie' | 'courante' = 'fournie',
): Promise<Resultat<{ version: VersionStudio; inchange: boolean }>> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const c = await chargerCatalogueProjet(ctx, e.projectId, { veilleOuverte: o.veilleOuverte, maintenant: o.maintenant, bibliotheque: o.bibliotheque });
  if (!c.ok) return c;
  const cat = c.catalogue;
  if (!cat.brief) {
    return erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, targetIds: [cat.projet.id], message: cat.briefIllisible ? 'Le brief de cette version est illisible · les références s’y rangent.' : 'Ce projet n’a pas encore de brief · les références s’y rangent.' });
  }
  const r = calcul(cat.brief.references, cat.fichiers, cat.epingle);
  if (!r.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: r.violations });
  return ecrire(ctx, cat.projet.id, base === 'courante' ? cat.version.id : e.baseVersionId, [{ op: 'replace', path: '/brief/references', newValue: r.references, reason: raison }], raison);
}

/** Associe un fichier avec un rôle et une portée EXPLICITES · une association de plus. */
export function associerReferencePour(ctx: ContexteStudio, e: EntreeAssociation, o: Dependances) {
  return modifierReferences(ctx, e, o, (refs, fichiers, produit) => ajouterAssociation(refs, { assetId: e.assetId, role: e.role, scope: e.scope }, fichiers, produit), 'Référence associée');
}

/** Retire l'association (fichier, rôle) · les autres rôles du même fichier restent. */
export function retirerReferencePour(ctx: ContexteStudio, e: EntreeAssociation, o: Dependances) {
  return modifierReferences(ctx, e, o, (refs, _f, produit) => retirerAssociation(refs, { assetId: e.assetId, role: e.role }, produit), 'Référence retirée');
}


export interface ResultatVersementProjet {
  projet: { id: string; titre: string; href: string };
  /** Images versées · nouvelles associations (fichier, rôle). */
  ajoutes: number;
  /** Images qui portaient déjà ce rôle dans le projet · non ajoutées une seconde fois. */
  dejaPresents: number;
  /** Numéro de la version courante après le geste (inchangée si rien n'a été ajouté). */
  versionN: number;
}

/**
 * Bibliothèque · « Utiliser dans un projet » · verse une sélection de fichiers
 * dans les RÉFÉRENCES du projet, par le chemin de `associerReferencePour` :
 * catalogue du projet relu côté serveur (portée espace + marques), règle pure
 * `ajouterAssociation` pour chaque fichier, UNE nouvelle version auditée.
 *
 * Avant toute écriture, chaque fichier est relu dans l'espace de la session
 * (`refusFichiersVersement` · introuvable, corbeille, pas une image, autre
 * marque, droits) · un seul refus et RIEN n'est versé. Les doublons (même
 * fichier, même rôle) ne sont pas ajoutés · s'il n'y a rien de nouveau, aucune
 * version n'est créée. Aucun appel modèle, aucun média produit, aucune dépense.
 */
export async function verserSelectionBibliothequePour(ctx: ContexteStudio, entree: unknown, o: Dependances): Promise<Resultat<ResultatVersementProjet>> {
  const v = validerVersement(entree);
  if (!v.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'versement', raison: v.raison }] });
  const p = await lireProjet(ctx, v.projectId);
  if (!p.ok) return p;
  if (p.projet.status !== 'active') return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'projet', raison: 'Ce projet est archivé · restaure-le avant d’y verser des images.' }] });
  const A = schema.assets;
  const lignes = await db.select({ id: A.id, name: A.name, kind: A.kind, brandId: A.brandId, rights: A.rights, deletedAt: A.deletedAt })
    .from(A).where(and(eq(A.workspaceId, ctx.workspaceId), inArray(A.id, v.ids)));
  const refus = refusFichiersVersement(lignes.map((l) => ({ ...l, supprime: l.deletedAt !== null })), v.ids, p.projet.brandId);
  if (refus.length) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: refus });

  let compte = { ajoutes: 0, dejaPresents: 0 };
  const raison = `Bibliothèque · sélection de ${v.ids.length} image${v.ids.length > 1 ? 's' : ''} versée dans les références · rôle ${LIBELLES_ROLE[v.role]}, portée ${LIBELLES_PORTEE[v.scope]}`;
  const r = await modifierReferences(ctx, { projectId: v.projectId, baseVersionId: null }, { ...o, bibliotheque: v.ids }, (refs, fichiers, produit) => {
    const x = verserReferences(refs, v.ids, v.role, v.scope, fichiers, produit);
    if (x.ok) compte = { ajoutes: x.ajoutes.length, dejaPresents: x.dejaPresents.length };
    return x;
  }, raison, 'courante');
  if (!r.ok) return r;
  return {
    ok: true,
    projet: { id: p.projet.id, titre: p.projet.title, href: `${cheminProjetStudio(p.projet.id)}/produit` },
    ajoutes: compte.ajoutes, dejaPresents: compte.dejaPresents, versionN: r.version.n,
  };
}
