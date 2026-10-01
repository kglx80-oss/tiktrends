/**
 * Où vit le lanceur « Aide & support » · bulle flottante (coin bas-droit) ou
 * lanceur ANCRÉ en pied de contenu, qui défile avec la page.
 *
 * La bulle fixe recouvre ce qui passe dessous au défilement. Sur les écrans
 * denses en commandes, elle masquait des contrôles · mesuré à 390 au tactile
 * sur Connexions (recette A #120) · jusqu'à 52 % du bouton « Afficher » du
 * jeton Meta, 10 % de « Connecter », 13 % du champ du compte publicitaire.
 * Réglages aussi · la bulle masquait le texte de la carte White-label à 390.
 * Ces écrans ancrent le lanceur · l'assistance reste là, rien n'est recouvert.
 * `/jarvis` (conversation) n'a pas de lanceur · il recouvrait « Envoyer ».
 */
export const ROUTES_LANCEUR_SUPPORT_ANCRE: readonly string[] = [
  '/studio/ads', '/dashboard', '/veille', '/adsmap', '/adsmap/suites', '/adsmap/lots', '/adsmap/radar',
  '/adsmap/tri', '/adsmap/protocole', '/adsmap/import', '/analytics', '/connections', '/settings',
];

export type PlacementLanceurSupport = 'ancre' | 'flottant' | 'aucun';

export function placementLanceurSupport(pathname: string): PlacementLanceurSupport {
  if (ROUTES_LANCEUR_SUPPORT_ANCRE.includes(pathname)) return 'ancre';
  return pathname === '/jarvis' ? 'aucun' : 'flottant';
}
