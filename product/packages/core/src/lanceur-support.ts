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
 * Radar créatif · « Retravailler au Studio » (29 % à 390, 18 % à 1280).
 * Sauvegardes, remplie (390) · ★ (100 %), « Site ↗ » (75 %), « + Suivre » (70 %),
 * « ✓ Suivi » (62 %) ; Nouveautés · ☆ (100 %). Vide, rien n'était recouvert.
 * Tagging (390) · la valeur et la barre de « Persona / Femme 30–45 » · les
 * chiffres comptent autant que les contrôles (relevé par Codex sur capture).
 * Compte (lot 8, remplis) · Équipe « Rôle » (100 % à 1280 et 390), « Révoquer »
 * (28 % à 390) ; Crédits · les montants du tableau (100 % à 1280 et 390) ;
 * Usage · les montants du journal (35 % à 1280, 66 % à 390) ; Support · le nom
 * de l'auteur d'un ticket (100 % à 390). Un ticket seul (`/support/<id>`) : 0.
 * Studio (lot 9, rempli de données synthétiques) · à 390 « Archiver » (100 %),
 * « Supprimer » (96 %), « Ouvrir › » du hub (89 %), « copier » des textes (79 %) ;
 * à 1280×720 « copier » (34 %).
 * Abonnement (`/billing`, lot 9) · la bulle couvrait le badge « Populaire » et
 * le haut d'une formule à 390 (capture relevée par Codex).
 * Ces écrans ancrent le lanceur · l'assistance reste là, rien n'est recouvert.
 * `/jarvis` (conversation) n'a pas de lanceur · il recouvrait « Envoyer ».
 */
export const ROUTES_LANCEUR_SUPPORT_ANCRE: readonly string[] = [
  '/dashboard', '/veille', '/adsmap', '/adsmap/suites', '/adsmap/lots', '/adsmap/radar',
  '/adsmap/tri', '/adsmap/protocole', '/adsmap/import', '/analytics', '/connections', '/settings', '/veille/scale',
  '/assets', '/radar', '/saved', '/tags', '/team', '/usage', '/credits', '/support',
  '/billing',
  // Lot 20 · Formats (ajoutée par #723 après les autres écrans de la Veille) ·
  // la bulle couvrait la droite du sélecteur « Format » à 390 (recette m59) et
  // masquait 20 % de « Classées récemment » au focus clavier (mesure lot 20).
  '/veille/formats',
];

export type PlacementLanceurSupport = 'ancre' | 'flottant' | 'aucun';

/** La fiche d'une marque (`/brands/<id>`, hors création) · la bulle recouvrait le champ « Site » à 390. */
const FICHE_MARQUE = /^\/brands\/(?!new$)[^/]+$/;

export function placementLanceurSupport(pathname: string): PlacementLanceurSupport {
  if (ROUTES_LANCEUR_SUPPORT_ANCRE.includes(pathname) || FICHE_MARQUE.test(pathname)) return 'ancre';
  return pathname === '/jarvis' ? 'aucun' : 'flottant';
}

/**
 * Lot 20 · la bulle FLOTTANTE et le focus clavier. Au Tab, le navigateur fait
 * défiler l'élément qui reçoit le focus juste dans la fenêtre · au bas de
 * l'écran, sous la bulle. Mesuré à 390 × 720 sur `70200777` (bulle 314,644 →
 * 370,700) · part de l'élément focalisé masquée par la bulle :
 *
 *   /jarvis/sources « Détail › »                 55 %
 *   /console champ du plafond                    29 %
 *   /veille/formats (grille) « Classées récemment » 20 %
 *   /admin « Crédits & marges »                    8 %
 *   /admin/connaissances zone de texte             1 %
 *
 * Réserve · la bulle occupe 76 px depuis le bas (56 de haut, 20 de marge) ; on
 * garde 20 px de plus pour que l'anneau de focus (2 px + décalage) reste net.
 * Sondé au navigateur avec 96 px · 0 % sur les quatre premiers ; seules deux
 * zones de texte PLUS HAUTES que la place restante gardent 2 à 3 % de leur coin
 * bas-droit sous la bulle (leur haut, où est le curseur, reste visible).
 */
export const RESERVE_FOCUS_LANCEUR_FLOTTANT = 96;

/** Marge basse de défilement (`scroll-padding-bottom`, px) selon le placement du lanceur. */
export function reserveFocusLanceur(placement: PlacementLanceurSupport): number {
  return placement === 'flottant' ? RESERVE_FOCUS_LANCEUR_FLOTTANT : 0;
}
