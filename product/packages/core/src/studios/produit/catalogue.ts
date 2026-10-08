/**
 * Studios · L5 · les FICHIERS que l'on peut épingler ou associer, tirés du
 * catalogue EXISTANT de la marque (cahier 01 §2.2 « ne pas créer une seconde
 * bibliothèque », §4.4 points 1 et 2, §7 ProductReference).
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * ── D'où viennent les fichiers ───────────────────────────────────────────────
 *
 *  · photos produit : `products.image_url` puis `products.image_urls` (data URI
 *    déposée, ou adresse distante d'un import Shopify / site) ;
 *  · logos de la marque : `brands.logo_url` puis `brands.logos` ;
 *  · bibliothèque : `assets` (images de l'espace, communes ou de la marque) ;
 *  · médias studio : `studio_assets` (empreinte SHA-256 réelle déjà stockée) ;
 *  · sources du projet : `studio_projects.source_refs` (annonces CONCURRENTES,
 *    sans média stocké · leur empreinte est celle de l'observé, L4-B).
 *
 * ── Identité, version, empreinte ─────────────────────────────────────────────
 *
 * Le catalogue produit n'a NI identifiant de photo NI version (`products` est
 * mis à jour en place, L0-B). On ne fabrique pas de seconde bibliothèque pour
 * en donner : l'identité d'une photo DÉRIVE de son produit et de son
 * empreinte, et sa version EST son empreinte (adressage par contenu). Une photo
 * remplacée dans le catalogue a donc une autre identité : la référence épinglée
 * ne glisse jamais vers une autre image, elle devient « retirée » (`etatPhoto`).
 *
 * L'empreinte porte sa NATURE : `contenu` (SHA-256 des octets décodés d'une
 * data URI) ou `adresse` (SHA-256 de l'adresse d'une photo distante, que le
 * serveur ne télécharge pas). L'écran le dit ; on ne présente jamais une
 * empreinte d'adresse comme celle du contenu.
 */

import { sha256Hex } from '../version';

export type ProvenanceFichier = 'produit' | 'logo' | 'bibliotheque' | 'studio' | 'concurrent';
export type NatureEmpreinte = 'contenu' | 'adresse';

export const LIBELLES_PROVENANCE: Readonly<Record<ProvenanceFichier, string>> = {
  produit: 'Photo produit',
  logo: 'Logo de la marque',
  bibliotheque: 'Bibliothèque',
  studio: 'Média du studio',
  concurrent: 'Annonce concurrente (source du projet)',
};

export const LIBELLES_NATURE_EMPREINTE: Readonly<Record<NatureEmpreinte, string>> = {
  contenu: 'empreinte du contenu',
  adresse: 'empreinte de l’adresse (photo distante, contenu non téléchargé)',
};

export interface EmpreinteFichier { sha256: string; nature: NatureEmpreinte }

/** Un fichier épinglable ou associable · tout ce que l'écran et les règles en savent. */
export interface FichierCatalogue {
  assetId: string;
  assetVersion: string;
  sha256: string;
  nature: NatureEmpreinte;
  provenance: ProvenanceFichier;
  libelle: string;
  /** Produit dont c'est une photo (provenance `produit`), sinon `null`. */
  productId: string | null;
  /** Position dans les photos du produit (1 = principale), sinon `null`. */
  position: number | null;
  /** Annonceur d'une source concurrente, sinon `null`. */
  annonceur: string | null;
  /** Un aperçu image est-il servable (faux pour une source sans média) ? */
  apercu: boolean;
}

const SHA = /^[a-f0-9]{64}$/;
export const estEmpreinte = (x: unknown): x is string => typeof x === 'string' && SHA.test(x);

/** La version d'un fichier adressé par contenu · son empreinte, abrégée et préfixée. */
export function versionDepuisEmpreinte(sha256: string): string {
  return `sha256-${sha256.slice(0, 16)}`;
}

/** Empreinte d'une adresse distante · jamais présentée comme celle du contenu. */
export function empreinteAdresse(url: string): EmpreinteFichier {
  return { sha256: sha256Hex(url), nature: 'adresse' };
}

/** `pph_<24 hex>` · stable pour (produit, contenu), indépendant de la position. */
export function idPhotoProduit(productId: string, sha256: string): string {
  return `pph_${sha256Hex(`produit:${productId}:${sha256}`).slice(0, 24)}`;
}

export function idLogoMarque(brandId: string, sha256: string): string {
  return `logo_${sha256Hex(`logo:${brandId}:${sha256}`).slice(0, 24)}`;
}

export const idBibliotheque = (assetUuid: string) => `bib_${assetUuid}`;
export const idMediaStudio = (assetUuid: string) => `sta_${assetUuid}`;

/** Une entrée brute du catalogue produit (colonnes de `products`). */
export interface ProduitCatalogue {
  id: string;
  name: string;
  imageUrl: string | null;
  imageUrls: readonly string[] | null;
}

/**
 * Les photos d'un produit, dans l'ordre du catalogue (principale d'abord),
 * sans doublon d'adresse · le même compte que `faitsProduit` (L4-B).
 * `hacher` est fourni par le serveur (décodage d'une data URI).
 */
export function photosDuProduit(p: ProduitCatalogue, hacher: (url: string) => EmpreinteFichier): Array<FichierCatalogue & { url: string }> {
  const urls: string[] = [];
  if (p.imageUrl) urls.push(p.imageUrl);
  for (const u of p.imageUrls ?? []) if (typeof u === 'string' && u.length > 0 && !urls.includes(u)) urls.push(u);
  const vus = new Set<string>();
  const out: Array<FichierCatalogue & { url: string }> = [];
  urls.forEach((url) => {
    const e = hacher(url);
    const assetId = idPhotoProduit(p.id, e.sha256);
    if (vus.has(assetId)) return; // même contenu déposé deux fois : une seule photo
    vus.add(assetId);
    out.push({
      assetId, assetVersion: versionDepuisEmpreinte(e.sha256), sha256: e.sha256, nature: e.nature, provenance: 'produit',
      libelle: `${p.name.trim() || 'Produit'} · photo ${out.length + 1}`, productId: p.id, position: out.length + 1,
      annonceur: null, apercu: true, url,
    });
  });
  return out;
}

/**
 * Variante catalogue. Le catalogue EXISTANT n'en connaît pas (`products` est à
 * plat : une ligne par produit, aucune table de variantes) : la variante est
 * dite « unique », identifiant `null`, sans en inventer. Le jour où le
 * catalogue porte des variantes, elles entrent ici sans changer la référence.
 */
export interface VarianteCatalogue { id: string | null; libelle: string }
export const VARIANTE_UNIQUE: VarianteCatalogue = { id: null, libelle: 'Variante unique · le catalogue n’a pas de variantes' };
