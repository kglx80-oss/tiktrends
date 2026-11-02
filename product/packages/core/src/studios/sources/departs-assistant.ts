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

export const ORIGINES_DEPART_ASSISTANT = ['veille', 'iteration'] as const;
export type OrigineDepartAssistant = (typeof ORIGINES_DEPART_ASSISTANT)[number];

/** La route gardée qui sert le média d'une ad Adsmap (« Lien de l'Ad » rangé au stockage), par son identifiant. */
export function routeApercuAdAdsmap(adId: string): string {
  return `/api/adsmap/${encodeURIComponent(adId)}/apercu`;
}

/**
 * Le « Lien de l'Ad » tel que le navigateur le reçoit · un objet du stockage
 * privé passe par sa route gardée (adresse stable, session relue à chaque
 * requête) ; un lien externe (Drive, régie, libellé) est rendu tel quel, comme
 * il a été saisi.
 */
export function lienAdAffiche(adId: string, lien: string | null, estObjetStockage: boolean): string | null {
  if (!lien) return null;
  return estObjetStockage ? routeApercuAdAdsmap(adId) : lien;
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
