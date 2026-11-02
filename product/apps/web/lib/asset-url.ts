import { VERSION_CACHE_MEDIAS } from '@tiktrends/core/src/purge-cache';

/**
 * Sous quelle adresse une image de la bibliothèque est servie.
 *
 * ── Pourquoi c'est une fonction, et pas trois lignes dans l'action ───────────
 *
 * C'est ici qu'était le défaut le plus coûteux du produit : une image téléversée
 * est stockée en base sous forme de `data:` URI — jusqu'à six mégaoctets de
 * base64 — et la liste des assets la renvoyait telle quelle. Vingt-quatre
 * vignettes pesaient alors plus lourd que tout le reste de l'application, dans
 * une page qu'aucun cache ne peut aider : le navigateur ne sait pas mettre en
 * cache un morceau de HTML.
 *
 * Sortie de l'action, la règle se teste. Dans un fichier `'use server'` elle ne
 * pouvait pas l'être · tout ce qu'on y exporte devient un point d'entrée réseau.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * **Aucun contenu d'image ne part dans la page.** Ce qui est embarqué en base,
 * et ce qui vit derrière un accès privé, passe par le proxy · le reste garde son
 * adresse d'origine, parce qu'un saut de plus ne servirait à rien.
 *
 * ── Pourquoi le mode de service est un TYPE ──────────────────────────────────
 *
 * Première version : `servedAssetUrl` envoyait les images Drive privées vers
 * `/api/asset/[id]`, une route qui ne savait pas les lire · elle les redirigeait
 * vers Google, qui répondait une page de connexion, et la bibliothèque affichait
 * des cadres vides. Le test existait pourtant · il vérifiait **l'adresse**, pas
 * que la porte s'ouvre.
 *
 * Le mode est donc nommé, et la route l'épuise avec un `never` final. Ajouter un
 * quatrième cas casse la compilation tant que la route ne le traite pas · c'est
 * la seule forme de rappel qui ne s'oublie pas.
 */

/** Lien Drive privé · non affichable directement dans une balise `<img>`. */
export function isPrivateDriveUrl(url: string): boolean {
  return /drive\.google\.com|googleusercontent\.com/.test(url);
}

export interface AssetAddress {
  id: string;
  kind: string;
  source: string;
  /** L'adresse telle qu'en base · vide quand le contenu est embarqué. */
  url: string;
  /** Vrai quand la base contient les octets et non une adresse. */
  embedded: boolean;
  /** Identifiant chez la source · sans lui, un fichier Drive est intéléchargeable. */
  externalId?: string | null;
  /** Bucket privé identifié côté serveur ; URL stable du proxy. */
  privateStorage?: boolean;
  /**
   * L'empreinte de l'objet du stockage (`assets.object_etag`) · versionne
   * l'adresse du proxy (`&e=`, ignoré par la route). Un fichier REMPLACÉ
   * (`remplacerAssetAction`) change d'objet, donc d'adresse · une image déjà
   * affichée sous l'ancienne adresse n'est pas reprise du cache du navigateur.
   */
  version?: string | null;
}

/**
 * Comment cet asset doit être servi.
 *
 * - `embedded` · les octets sont en base, le proxy les décode.
 * - `drive` · fichier Google privé, le proxy le télécharge avec le jeton.
 * - `direct` · adresse publique, on la donne telle quelle.
 */
export type AssetServing = 'embedded' | 'drive' | 'direct';

export function assetServing(a: AssetAddress): AssetServing {
  if (a.embedded) return 'embedded';
  // Sans identifiant externe on ne saurait pas quoi demander à Drive · mieux
  // vaut tenter l'adresse publique que promettre un proxy qui échouera.
  if (isPrivateDriveUrl(a.url) && a.externalId) return 'drive';
  return 'direct';
}

/**
 * L'adresse du proxy, VERSIONNÉE (`?v=2`, ignoré par la route) · avant #798, un
 * SVG piégé y était servi en `immutable` trente jours ; changer l'adresse
 * détache les pages de l'entrée en cache (règle `purge-cache`, noyau).
 */
export function adresseAssetProxy(id: string): string {
  return `/api/asset/${id}?v=${VERSION_CACHE_MEDIAS}`;
}

/** La version portée par l'adresse · 16 caractères sûrs de l'empreinte, ou rien. */
export function versionAdresse(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const x = v.replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  return x || null;
}

export function servedAssetUrl(a: AssetAddress): string {
  if (assetServing(a) === 'direct' && !a.privateStorage) return a.url;
  const e = a.privateStorage && !a.embedded ? versionAdresse(a.version) : null;
  return e ? `${adresseAssetProxy(a.id)}&e=${e}` : adresseAssetProxy(a.id);
}
