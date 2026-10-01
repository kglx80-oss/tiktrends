/**
 * Où vit le lanceur « Aide & support » · bulle flottante (coin bas-droit) ou
 * lanceur ANCRÉ en pied de contenu, qui défile avec la page.
 *
 * La bulle fixe recouvre ce qui passe dessous au défilement. Sur les écrans
 * denses en commandes, elle masquait des contrôles · mesuré à 390 au tactile
 * sur Connexions (recette A #120) · jusqu'à 52 % du bouton « Afficher » du
 * jeton Meta, 10 % de « Connecter », 13 % du champ du compte publicitaire.
 * Réglages aussi · la bulle masquait le texte de la carte White-label à 390.
 * Ce qui scale · elle recouvrait « Tri » (15 %) et « Copier » (53 %) à 1280,
 * l'étoile (91 %), « + Suivre » (54 %) et « Copier » (82 %) à 390.
 * Assets · la puce « Audio » (32 %) et la ligne « 1 crédit/image » à 390.
 * Radar produits · « Retravailler au Studio » (29 % à 390, 18 % à 1280).
 * Ces écrans ancrent le lanceur · l'assistance reste là, rien n'est recouvert.
 * `/jarvis` (conversation) n'a pas de lanceur · il recouvrait « Envoyer ».
 */
export const ROUTES_LANCEUR_SUPPORT_ANCRE: readonly string[] = [
  '/studio/ads', '/dashboard', '/veille', '/adsmap', '/adsmap/suites', '/adsmap/lots', '/adsmap/radar',
  '/adsmap/tri', '/adsmap/protocole', '/adsmap/import', '/analytics', '/connections', '/settings', '/veille/scale',
  '/assets', '/radar',
];

export type PlacementLanceurSupport = 'ancre' | 'flottant' | 'aucun';

/** La fiche d'une marque (`/brands/<id>`, hors création) · la bulle recouvrait le champ « Site » à 390. */
const FICHE_MARQUE = /^\/brands\/(?!new$)[^/]+$/;

export function placementLanceurSupport(pathname: string): PlacementLanceurSupport {
  if (ROUTES_LANCEUR_SUPPORT_ANCRE.includes(pathname) || FICHE_MARQUE.test(pathname)) return 'ancre';
  return pathname === '/jarvis' ? 'aucun' : 'flottant';
}
