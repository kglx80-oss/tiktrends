import 'server-only';
import { createHash } from 'node:crypto';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  photosDuProduit, empreinteAdresse, idLogoMarque, idBibliotheque, idMediaStudio, versionDepuisEmpreinte, estEmpreinte,
  lireReferencesSources, lireReferenceEpinglee, lireReferenceProduit, validerFormeBrief, objetDansPortee, erreurStudio,
  type BriefCanonique, type ContenuVersion, type EmpreinteFichier, type FichierCatalogue, type ProduitMarque,
  type ReferenceProduitEpinglee, type ReferenceProduitStudio, type SourceReferenceStudio, type ErreurStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { lireProjet, lireVersion, type ProjetStudio, type VersionStudio } from '../depot';
import { etatSources } from '../sources/sources';

/**
 * Le catalogue EXISTANT d'un projet, lu côté serveur (cahier §2.2 : aucune
 * seconde bibliothèque) · photos des produits de la marque du projet, logos de
 * la marque, images de la bibliothèque (communes ou de la marque), médias
 * studio stockés de la marque, sources du projet encore lisibles.
 *
 * ── Portée ───────────────────────────────────────────────────────────────────
 *
 * Le projet est lu par le dépôt L1 (double garde : filtre SQL espace + marques
 * visibles, puis revérification pure). Tout le reste est filtré par la marque
 * DU PROJET et l'espace de la session · un identifiant venu du client ne sert
 * qu'à CHOISIR dans ce catalogue, jamais à l'élargir.
 *
 * ── Empreintes ───────────────────────────────────────────────────────────────
 *
 * Data URI : SHA-256 des octets décodés (`node:crypto`, même résultat que
 * `sha256OctetsHex` du noyau, éprouvé en test). Adresse distante : SHA-256 de
 * l'adresse, nature `adresse` · aucune requête sortante pour la télécharger.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

const PRODUITS_MAX = 200;
const IMAGES_BIBLIOTHEQUE_MAX = 60;
const MEDIAS_STUDIO_MAX = 60;

const DATA_URI = /^data:([a-z0-9.+/-]+);base64,/i;

/** Octets d'une data URI base64 · `null` pour une adresse. */
export function octetsDataUri(url: string): { mime: string; octets: Buffer } | null {
  const m = DATA_URI.exec(url);
  if (!m) return null;
  return { mime: m[1]!.toLowerCase(), octets: Buffer.from(url.slice(m[0].length), 'base64') };
}

export function hacherImage(url: string): EmpreinteFichier {
  const d = octetsDataUri(url);
  if (d) return { sha256: createHash('sha256').update(d.octets).digest('hex'), nature: 'contenu' };
  return empreinteAdresse(url);
}

export interface ProduitAvecPhotos {
  produit: ProduitMarque;
  photos: Array<FichierCatalogue & { url: string }>;
}

export interface CatalogueProjet {
  projet: ProjetStudio;
  version: VersionStudio;
  contenu: ContenuVersion;
  marque: string;
  brief: BriefCanonique | null;
  briefIllisible: boolean;
  /** Référence épinglée L5 · `null` si le produit n'est pas (encore) épinglé à une photo. */
  epingle: ReferenceProduitEpinglee | null;
  /** Instantané produit L4-B, quand le projet n'a qu'un produit sans photo épinglée. */
  instantane: ReferenceProduitStudio | null;
  produits: ProduitAvecPhotos[];
  /** Tout ce qui peut être associé, par identifiant · la seule table de résolution. */
  fichiers: Map<string, FichierCatalogue & { url: string | null }>;
  /** Sources ENCORE lisibles · les seules associables. */
  sources: SourceReferenceStudio[];
  /** Toutes les sources du projet, tombstones compris · citées par les faits du brief. */
  sourcesProjet: SourceReferenceStudio[];
}

const introuvable = (ctx: ContexteStudio) => erreurStudio('NOT_FOUND', { traceId: ctx.traceId });

/**
 * Lit le projet (version COURANTE, ou celle demandée) et son catalogue. Lecture
 * pure : aucune écriture, aucun appel sortant.
 */
export async function chargerCatalogueProjet(
  ctx: ContexteStudio,
  projectId: unknown,
  o: { veilleOuverte: boolean; maintenant: Date; versionId?: unknown },
): Promise<Resultat<{ catalogue: CatalogueProjet }>> {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  const projet = p.projet;
  if (!projet.currentVersionId) return introuvable(ctx);
  const v = await lireVersion(ctx, o.versionId ?? projet.currentVersionId);
  if (!v.ok) return v;
  if (v.version.projectId !== projet.id) return introuvable(ctx);
  // La marque du projet est revérifiée dans la portée de la session (ceinture).
  if (!objetDansPortee({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque }, { workspaceId: projet.workspaceId, brandId: projet.brandId })) return introuvable(ctx);

  const brandId = projet.brandId;
  const [marque] = await db.select({ nom: schema.brands.name, logoUrl: schema.brands.logoUrl, logos: schema.brands.logos })
    .from(schema.brands).where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, ctx.workspaceId))).limit(1);
  if (!marque) return introuvable(ctx);

  const lignesProduits = await db.select({
    id: schema.products.id, name: schema.products.name, description: schema.products.description, usp: schema.products.usp,
    price: schema.products.price, url: schema.products.url, imageUrl: schema.products.imageUrl, imageUrls: schema.products.imageUrls,
  }).from(schema.products).where(eq(schema.products.brandId, brandId)).limit(PRODUITS_MAX);

  const fichiers = new Map<string, FichierCatalogue & { url: string | null }>();
  const produits: ProduitAvecPhotos[] = lignesProduits.map((l) => {
    const produit: ProduitMarque = { id: l.id, name: l.name, description: l.description, usp: l.usp, price: l.price, url: l.url, imageUrl: l.imageUrl, imageUrls: l.imageUrls };
    const photos = photosDuProduit({ id: l.id, name: l.name, imageUrl: l.imageUrl, imageUrls: l.imageUrls }, hacherImage);
    for (const ph of photos) fichiers.set(ph.assetId, ph);
    return { produit, photos };
  });

  const logos = [marque.logoUrl, ...(marque.logos ?? [])].filter((u): u is string => typeof u === 'string' && u.length > 0);
  [...new Set(logos)].forEach((url, i) => {
    const e = hacherImage(url);
    const assetId = idLogoMarque(brandId, e.sha256);
    if (!fichiers.has(assetId)) fichiers.set(assetId, { assetId, assetVersion: versionDepuisEmpreinte(e.sha256), sha256: e.sha256, nature: e.nature, provenance: 'logo', libelle: i === 0 ? 'Logo principal' : `Logo · variante ${i}`, productId: null, position: null, annonceur: null, apercu: true, url });
  });

  const A = schema.assets;
  const biblio = await db.select({ id: A.id, name: A.name, url: A.url })
    .from(A).where(and(eq(A.workspaceId, ctx.workspaceId), eq(A.kind, 'image'), or(isNull(A.brandId), eq(A.brandId, brandId))))
    .orderBy(desc(A.createdAt)).limit(IMAGES_BIBLIOTHEQUE_MAX);
  for (const b of biblio) {
    const e = hacherImage(b.url);
    const assetId = idBibliotheque(b.id);
    fichiers.set(assetId, { assetId, assetVersion: versionDepuisEmpreinte(e.sha256), sha256: e.sha256, nature: e.nature, provenance: 'bibliotheque', libelle: b.name.slice(0, 120) || 'Image', productId: null, position: null, annonceur: null, apercu: true, url: `/api/asset/${b.id}` });
  }

  const S = schema.studioAssets;
  const medias = await db.select({ id: S.id, sha256: S.sha256, mime: S.mime, workspaceId: S.workspaceId, brandId: S.brandId })
    .from(S).where(and(eq(S.workspaceId, ctx.workspaceId), eq(S.brandId, brandId), eq(S.storageState, 'stored')))
    .orderBy(desc(S.createdAt)).limit(MEDIAS_STUDIO_MAX);
  for (const m of medias) {
    if (!m.mime.startsWith('image/') || !estEmpreinte(m.sha256)) continue;
    const assetId = idMediaStudio(m.id);
    fichiers.set(assetId, { assetId, assetVersion: versionDepuisEmpreinte(m.sha256), sha256: m.sha256, nature: 'contenu', provenance: 'studio', libelle: `Média du studio · ${m.id.slice(0, 8)}`, productId: null, position: null, annonceur: null, apercu: false, url: null });
  }

  // Sources du projet · seules les sources ENCORE lisibles s'associent (une
  // source révoquée garde son tombstone, elle ne devient pas une référence).
  const { sources: refs } = lireReferencesSources(projet.sourceRefs);
  const vivantes = await etatSources(ctx, refs, { veilleOuverte: o.veilleOuverte, maintenant: o.maintenant });
  const sources = vivantes.filter((s) => s.statut === 'active');
  for (const s of sources) {
    if (!estEmpreinte(s.empreinte)) continue;
    fichiers.set(s.sourceId, { assetId: s.sourceId, assetVersion: versionDepuisEmpreinte(s.empreinte), sha256: s.empreinte, nature: 'contenu', provenance: 'concurrent', libelle: `Annonce ${s.plateforme} · ${s.annonceur || 'annonceur inconnu'}`, productId: null, position: null, annonceur: s.annonceur || null, apercu: false, url: null });
  }

  const contenu = v.version.content as ContenuVersion;
  const brut = (contenu as { brief?: unknown }).brief ?? null;
  const illisible = brut !== null && validerFormeBrief(brut).length > 0;
  const brief = brut !== null && !illisible ? (brut as BriefCanonique) : null;
  const epingle = lireReferenceEpinglee(contenu.productRef);
  return {
    ok: true,
    catalogue: {
      projet, version: v.version, contenu, marque: marque.nom, brief, briefIllisible: illisible,
      epingle, instantane: epingle ? null : lireReferenceProduit(contenu.productRef),
      produits, fichiers, sources, sourcesProjet: refs,
    },
  };
}

/** Un produit du catalogue, par identifiant · `null` hors marque. */
export function produitDuCatalogue(c: CatalogueProjet, productId: unknown): ProduitAvecPhotos | null {
  return typeof productId === 'string' ? c.produits.find((p) => p.produit.id === productId) ?? null : null;
}

/** Identifiants des photos d'un produit (pour garder les vues Produit d'un même produit). */
export function idsPhotos(p: ProduitAvecPhotos | null): Set<string> {
  return new Set((p?.photos ?? []).map((f) => f.assetId));
}

