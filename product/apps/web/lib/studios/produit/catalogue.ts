import 'server-only';
import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  photosDuProduit, empreinteAdresse, idLogoMarque, idBibliotheque, idMediaStudio, versionDepuisEmpreinte, estEmpreinte,
  DROITS_PUB_AUTORISES,
  lireReferencesSources, lireReferenceEpinglee, lireReferenceProduit, validerFormeBrief, objetDansPortee, erreurStudio,
  type BriefCanonique, type ContenuVersion, type EmpreinteFichier, type FichierCatalogue, type ProduitMarque,
  type ReferenceProduitEpinglee, type ReferenceProduitStudio, type SourceReferenceStudio, type ErreurStudio,
  libelleMediaStudio, titreSource, uuidsBibliothequeCites,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { adresseAssetProxy } from '../../asset-url';
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
/** Références d'une version (`ASSOCIATIONS_MAX`) + un versement (`TAG_SELECTION_MAX`), avec marge. */
const IMAGES_CITEES_MAX = 400;

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

/**
 * Les logos de la charte tels que le catalogue les nomme · identifiant
 * (`idLogoMarque`), adresse, « Logo principal » puis « Logo · variante n »,
 * dans l'ordre (défaut d'abord), chaque adresse une fois. Le catalogue d'un
 * projet et l'annonce des logos à réimporter de la vidéo lisent CETTE liste.
 */
export function logosDuCatalogue(brandId: string, m: { logoUrl: string | null; logos: readonly string[] | null }): Array<{ assetId: string; url: string; libelle: string } & EmpreinteFichier> {
  const urls = [...new Set([m.logoUrl, ...(m.logos ?? [])].filter((u): u is string => typeof u === 'string' && u.length > 0))];
  return urls.map((url, i) => {
    const e = hacherImage(url);
    return { assetId: idLogoMarque(brandId, e.sha256), url, libelle: i === 0 ? 'Logo principal' : `Logo · variante ${i}`, ...e };
  });
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
  o: { veilleOuverte: boolean; maintenant: Date; versionId?: unknown; bibliotheque?: readonly string[] },
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

  for (const l of logosDuCatalogue(brandId, marque)) {
    if (!fichiers.has(l.assetId)) fichiers.set(l.assetId, { assetId: l.assetId, assetVersion: versionDepuisEmpreinte(l.sha256), sha256: l.sha256, nature: l.nature, provenance: 'logo', libelle: l.libelle, productId: null, position: null, annonceur: null, apercu: true, url: l.url });
  }

  const A = schema.assets;
  // Droits d'usage (V5) · seuls les médias AUTORISÉS en publicité entrent au
  // catalogue (règle `droitAutorisePub` du noyau, valeurs depuis
  // `DROITS_PUB_AUTORISES`). `rights` null = non classé → hérité, admis (on ne
  // retire pas l'éligibilité des médias déjà là). « À préciser » est exclu.
  // La corbeille (`deleted_at`) est exclue : un média jeté n'est pas une source.
  const admis = and(
    eq(A.workspaceId, ctx.workspaceId), eq(A.kind, 'image'),
    or(isNull(A.brandId), eq(A.brandId, brandId)),
    or(isNull(A.rights), inArray(A.rights, DROITS_PUB_AUTORISES as unknown as string[])),
    isNull(A.deletedAt),
  );
  const biblio = await db.select({ id: A.id, name: A.name, url: A.url })
    .from(A).where(admis)
    .orderBy(desc(A.createdAt)).limit(IMAGES_BIBLIOTHEQUE_MAX);
  // Au-delà des plus récentes · les images CITÉES par les références de la
  // version, et celles qu'un versement depuis la Bibliothèque demande, sous la
  // MÊME règle d'admission · une référence ne sort pas du catalogue parce que
  // d'autres images ont été ajoutées depuis.
  const vues = new Set(biblio.map((b) => b.id));
  const citees = [...new Set([
    ...uuidsBibliothequeCites((v.version.content as { brief?: unknown } | null)?.brief),
    ...(o.bibliotheque ?? []).map((x) => x.toLowerCase()),
  ])].filter((x) => !vues.has(x)).slice(0, IMAGES_CITEES_MAX);
  if (citees.length) biblio.push(...await db.select({ id: A.id, name: A.name, url: A.url }).from(A).where(and(admis, inArray(A.id, citees))));
  for (const b of biblio) {
    const e = hacherImage(b.url);
    const assetId = idBibliotheque(b.id);
    fichiers.set(assetId, { assetId, assetVersion: versionDepuisEmpreinte(e.sha256), sha256: e.sha256, nature: e.nature, provenance: 'bibliotheque', libelle: b.name.slice(0, 120) || 'Image', productId: null, position: null, annonceur: null, apercu: true, url: adresseAssetProxy(b.id) });
  }

  const S = schema.studioAssets;
  const medias = await db.select({ id: S.id, sha256: S.sha256, mime: S.mime, origin: S.origin, workspaceId: S.workspaceId, brandId: S.brandId })
    .from(S).where(and(eq(S.workspaceId, ctx.workspaceId), eq(S.brandId, brandId), eq(S.storageState, 'stored')))
    .orderBy(desc(S.createdAt)).limit(MEDIAS_STUDIO_MAX);
  for (const m of medias) {
    if (!m.mime.startsWith('image/') || !estEmpreinte(m.sha256)) continue;
    const assetId = idMediaStudio(m.id);
    fichiers.set(assetId, { assetId, assetVersion: versionDepuisEmpreinte(m.sha256), sha256: m.sha256, nature: 'contenu', provenance: 'studio', libelle: libelleMediaStudio(m.origin, m.id), productId: null, position: null, annonceur: null, apercu: false, url: null });
  }

  // Sources du projet · seules les sources ENCORE lisibles s'associent (une
  // source révoquée garde son tombstone, elle ne devient pas une référence).
  const { sources: refs } = lireReferencesSources(projet.sourceRefs);
  const vivantes = await etatSources(ctx, refs, { veilleOuverte: o.veilleOuverte, maintenant: o.maintenant });
  const sources = vivantes.filter((s) => s.statut === 'active');
  for (const s of sources) {
    if (!estEmpreinte(s.empreinte)) continue;
    // Une création précédente appartient à la marque · elle n'est pas un concurrent (aucun interdit de transfert).
    if (s.type === 'creation') {
      fichiers.set(s.sourceId, { assetId: s.sourceId, assetVersion: versionDepuisEmpreinte(s.empreinte), sha256: s.empreinte, nature: 'contenu', provenance: 'bibliotheque', libelle: titreSource(s), productId: null, position: null, annonceur: null, apercu: !!s.apercu, url: s.apercu });
      continue;
    }
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

