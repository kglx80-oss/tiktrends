/**
 * Les points de départ de l'assistant Nouveau projet · et ce que leur liste
 * montre au NAVIGATEUR.
 *
 * La liste fait foi · le type en dérive, et la garde des points d'entrée
 * (`apps/web/test/adresses-brutes-api-db.test.tsx`) appelle
 * `listerDepartsAssistant` avec CHACUN · un départ ajouté ici est exercé
 * d'office, il ne peut pas échapper à la garde.
 *
 * L'aperçu d'un choix est une projection d'AFFICHAGE · jamais une adresse
 * signée du stockage (elle expire au bout de 300 s sous les yeux de l'écran
 * resté ouvert, et elle nomme la clé interne), jamais l'adresse brute d'un
 * objet privé. Ce qui part au MODÈLE est une autre affaire (adresse signée
 * courte, gardée à part) · rien ici n'y touche.
 */

import { usableImageUrl } from '../../adsmap/written-source';

export const ORIGINES_DEPART_ASSISTANT = ['veille', 'iteration'] as const;
export type OrigineDepartAssistant = (typeof ORIGINES_DEPART_ASSISTANT)[number];

/**
 * Les médias d'une ad Adsmap que sa route gardée sert · le « Lien de l'Ad »
 * (`adsmap_ads.asset_url`, par défaut), sa vignette (la miniature de sa créa
 * d'abord · `vignetteSourceAd`) et le « Lien du Brief créa »
 * (`adsmap_ads.brief_url`). Un objet du stockage privé n'arrive JAMAIS au
 * navigateur par son adresse brute (image cassée, clé interne nommée) · il passe
 * par `/api/adsmap/[id]/apercu`, qui relit la session à chaque requête.
 */
export const MEDIAS_AD_ADSMAP = ['lien', 'vignette', 'brief'] as const;
export type MediaAdAdsmap = (typeof MEDIAS_AD_ADSMAP)[number];

/** La route gardée qui sert un média d'une ad Adsmap, par son identifiant · `lien` sans paramètre (l'adresse publiée par #1015 ne change pas). */
export function routeApercuAdAdsmap(adId: string, media: MediaAdAdsmap = 'lien'): string {
  const route = `/api/adsmap/${encodeURIComponent(adId)}/apercu`;
  return media === 'lien' ? route : `${route}?media=${media}`;
}

/** Le média que demande l'adresse de la route · absent = le lien ; inconnu = `null` (la route répond 404). */
export function mediaAdDemande(parametre: string | null): MediaAdAdsmap | null {
  if (parametre === null) return 'lien';
  return (MEDIAS_AD_ADSMAP as readonly string[]).includes(parametre) ? (parametre as MediaAdAdsmap) : null;
}

/** Les adresses d'une ad telles qu'en base · son lien et son brief, la miniature et le fichier de sa créa (`creatives`). */
export interface AdressesAdAdsmap {
  lien: string | null | undefined;
  brief?: string | null | undefined;
  miniature?: string | null | undefined;
  fichier?: string | null | undefined;
}

/**
 * La vignette d'une ad · la première image ouvrable parmi la miniature de sa
 * créa, le fichier de sa créa, puis son « Lien de l'Ad » (`usableImageUrl` ·
 * une page de partage ou un libellé n'est pas une image). Les écrans ET la
 * route gardée la choisissent ici · l'image montrée est celle que la route sert.
 */
export function vignetteSourceAd(a: AdressesAdAdsmap): string | null {
  for (const u of [a.miniature, a.fichier, a.lien]) {
    const v = usableImageUrl(u);
    if (v) return v;
  }
  return null;
}

/** L'adresse en base du média demandé · celle que la route gardée relit. */
export function sourceMediaAd(media: MediaAdAdsmap, a: AdressesAdAdsmap): string | null {
  if (media === 'vignette') return vignetteSourceAd(a);
  const u = (media === 'brief' ? a.brief : a.lien)?.trim();
  return u ? u : null;
}

/**
 * Le « Lien de l'Ad » (ou, `media`, le « Lien du Brief créa ») tel que le
 * navigateur le reçoit · un objet du stockage privé passe par sa route gardée
 * (adresse stable, session relue à chaque requête) ; un lien externe (Drive,
 * régie, libellé) est rendu tel quel, comme il a été saisi.
 */
export function lienAdAffiche(adId: string, lien: string | null, estObjetStockage: boolean, media: Exclude<MediaAdAdsmap, 'vignette'> = 'lien'): string | null {
  if (!lien) return null;
  return estObjetStockage ? routeApercuAdAdsmap(adId, media) : lien;
}

/**
 * La vignette d'une ad telle que l'écran la montre · un objet du stockage
 * privé passe par la route gardée (`?media=vignette`) ; une image externe (CDN
 * de régie) telle quelle ; rien d'ouvrable · `null`, jamais une image inventée.
 */
export function vignetteAdAffichee(adId: string, a: AdressesAdAdsmap, estObjetStockage: (url: string) => boolean): string | null {
  const v = vignetteSourceAd(a);
  if (!v) return null;
  return estObjetStockage(v) ? routeApercuAdAdsmap(adId, 'vignette') : v;
}

/**
 * Une image qu'un écran peut afficher · une route de l'application (même
 * origine, chemin absolu, jamais `//hôte` ni `/\hôte`) telle quelle, sinon une
 * adresse ouvrable (`usableImageUrl`). Les vignettes d'ad arrivent déjà
 * projetées (`vignetteAdAffichee`) · la route gardée doit passer.
 */
export function imageAffichable(u: string | null | undefined): string | null {
  const v = u?.trim();
  if (!v) return null;
  if (/^\/(?![/\\])/.test(v)) return v;
  return usableImageUrl(v);
}

/**
 * L'aperçu d'une annonce sauvegardée en Veille · une vignette de régie
 * (adresse externe) telle quelle. Un objet du stockage privé n'a rien à faire
 * dans l'instantané d'une annonce observée et aucune route ne le sert pour
 * elle · pas d'aperçu plutôt qu'une signature qui expire.
 */
export function apercuSauvegardeVeille(url: string | null, estObjetStockage: boolean): string | null {
  if (!url || estObjetStockage) return null;
  return url;
}
