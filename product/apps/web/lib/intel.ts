/**
 * Intelligence marché · concurrents directs et positionnement TikTrends.
 * Données publiques / estimations début 2026 · les tarifs évoluent, à revérifier.
 * Centralisé ici pour alimenter l'espace ADMIN (aucune donnée sensible).
 */

export interface Competitor {
  key: string;
  name: string;
  tag: string;             // catégorie
  url: string;
  positioning: string;     // ce qu'ils sont
  pricing: string;         // estimation tarifaire
  strengths: string[];
  weaknesses: string[];
  ourEdge: string;         // notre angle face à eux
}

export const COMPETITORS: Competitor[] = [
  {
    key: 'atria',
    name: 'Atria',
    tag: 'Creative Intelligence',
    url: 'https://atria.com',
    positioning:
      "Plateforme « creative intelligence » pour marques DTC et agences. Analyse des pubs concurrentes (ad libraries Meta/TikTok), contexte de marque riche, puis génération de concepts et de créas statiques ancrées sur la marque. C'est notre concurrent le plus frontal.",
    pricing: 'Abonnement haut de gamme, souvent sur devis (cible agences / gros annonceurs). Ordre de grandeur : plusieurs centaines d’€/mois.',
    strengths: [
      'Contexte de marque profond (audience, USP, ton) réinjecté dans chaque créa',
      'Veille concurrentielle intégrée et structurée',
      'Génération de créas statiques de qualité, orientées performance',
    ],
    weaknesses: [
      'Peu / pas de génération vidéo native',
      'Cher, orienté gros comptes · peu accessible aux petites agences',
      'Pas de couche de règles maison éditable façon Jarvis',
    ],
    ourEdge:
      'TikTrends est TikTok-first, ajoute la vidéo (Kling) et une IA maison éditable (Jarvis), en marque blanche pour les agences, à un prix accessible.',
  },
  {
    key: 'foreplay',
    name: 'Foreplay',
    tag: 'Veille & swipe file',
    url: 'https://foreplay.co',
    positioning:
      "La référence de la veille publicitaire : la plus grosse « swipe file » du marché. Discovery de pubs gagnantes, tracking de concurrents (Spyder), organisation par boards, et briefs créatifs à partir des inspirations.",
    pricing: 'Abonnement grand public : ~49 à 99 $/mois selon le module (Inspiration, Spyder, Briefs).',
    strengths: [
      'Bibliothèque de pubs immense (Meta + TikTok ad libraries)',
      'Excellent pour sauvegarder, organiser et briefer',
      'Tracking de concurrents mûr (Spyder)',
    ],
    weaknesses: [
      'Ne génère pas la créa finale (image/vidéo) · s’arrête au brief',
      'Pas d’ancrage marque profond ni de contrôle qualité IA',
      'Outil de créateur/média-buyer, pas une chaîne de production complète',
    ],
    ourEdge:
      'On couvre le même besoin de veille, puis on va jusqu’à la production : génération d’images et de vidéos ancrées marque, avec les règles Jarvis.',
  },
  {
    key: 'higgsfield',
    name: 'Higgsfield',
    tag: 'Génération vidéo IA',
    url: 'https://higgsfield.ai',
    positioning:
      "Studio de génération vidéo IA très fort sur le motion cinématographique, les effets et les avatars/UGC. Orienté créateurs et social, avec une qualité de mouvement remarquable.",
    pricing: 'Crédits / abonnement créateur : ~9 à 49 $/mois selon les paliers, packs de crédits.',
    strengths: [
      'Qualité de mouvement et d’effets vidéo au top',
      'Avatars / UGC et presets cinématographiques',
      'Cadence d’innovation très rapide sur la vidéo',
    ],
    weaknesses: [
      'Aucune intelligence marque ni veille publicitaire',
      'Pas de chaîne concept -> scène -> design de pub complète',
      'Orienté créateur individuel, pas agence DTC multi-marques',
    ],
    ourEdge:
      'On orchestre les meilleurs moteurs (dont des modèles vidéo type Kling) DANS une chaîne marque : veille -> concept -> scène produit fidèle -> design -> vidéo, gouvernée par Jarvis.',
  },
];

/** Notre pile IA maison, expliquée (orchestration + règles Jarvis par-dessus les modèles). */
export const AI_STACK: Array<{ layer: string; role: string; engines: string }> = [
  { layer: 'Veille & inspiration', role: 'Repérer les mécaniques qui performent (concurrents, ad libraries, sauvegardes).', engines: 'Bibliothèques d’ads + analyse Claude' },
  { layer: 'Contexte de marque', role: 'DA, produits réels, audience, USP, concurrents · injectés dans chaque prompt.', engines: 'Base marque TikTrends' },
  { layer: 'Jarvis · règles maison', role: 'Nos consignes (style, ton, interdits, mentions) imposées en priorité absolue.', engines: 'Couche d’orchestration TikTrends' },
  { layer: 'Concept & copy', role: 'Angles, hooks, accroches direct-response, structure de la pub.', engines: 'Anthropic · Claude' },
  { layer: 'Image / scène', role: 'Mise en scène du produit réel, fidèle au packaging.', engines: 'Fal · Nano Banana 2 (Gemini)' },
  { layer: 'Vidéo', role: 'Animation cinématographique des visuels et plans produit.', engines: 'Fal · Kling 2.5 turbo pro' },
  { layer: 'Design & composition', role: 'Gabarits, logo, couleurs, variantes de mise en page posés sur l’image.', engines: 'Compositeur maison (satori)' },
  { layer: 'Contrôle qualité', role: 'Réalisme, proportions, packaging fidèle, zéro texte parasite.', engines: 'Contraintes Jarvis + garde-fous' },
];
