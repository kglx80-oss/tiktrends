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

/* ============ Matrice comparative & plan « faire mieux » ============ */
export type Cap = 'yes' | 'partial' | 'no';
export interface CapabilityRow {
  capability: string;
  us: Cap; atria: Cap; foreplay: Cap; higgsfield: Cap;
  note?: string;
}

/** Capacités clés × concurrents (estimations · à réévaluer régulièrement). */
export const CAPABILITIES: CapabilityRow[] = [
  { capability: 'Règles maison éditables (Jarvis)', us: 'yes', atria: 'no', foreplay: 'no', higgsfield: 'no', note: 'Notre différenciateur : une couche de gouvernance créative propre.' },
  { capability: 'Contexte de marque profond', us: 'yes', atria: 'yes', foreplay: 'partial', higgsfield: 'no' },
  { capability: 'Génération image produit fidèle', us: 'yes', atria: 'yes', foreplay: 'no', higgsfield: 'partial' },
  { capability: 'Génération vidéo', us: 'yes', atria: 'partial', foreplay: 'no', higgsfield: 'yes', note: 'Higgsfield est la référence motion · on doit s’en rapprocher.' },
  { capability: 'Veille publicitaire (ad libraries)', us: 'partial', atria: 'yes', foreplay: 'yes', higgsfield: 'no', note: 'Foreplay est la référence · à brancher en temps réel.' },
  { capability: 'Tracking concurrents automatique', us: 'partial', atria: 'yes', foreplay: 'yes', higgsfield: 'no' },
  { capability: 'Bibliothèque d’assets + tagging IA', us: 'yes', atria: 'yes', foreplay: 'yes', higgsfield: 'partial' },
  { capability: 'Multi-marques / white-label agence', us: 'yes', atria: 'partial', foreplay: 'partial', higgsfield: 'no' },
  { capability: 'TikTok-first', us: 'yes', atria: 'partial', foreplay: 'yes', higgsfield: 'yes' },
  { capability: 'Prix accessible', us: 'yes', atria: 'no', foreplay: 'yes', higgsfield: 'yes' },
  { capability: 'Analyse de perf sur vraies données', us: 'partial', atria: 'yes', foreplay: 'partial', higgsfield: 'no' },
];

/** Où l'on doit faire mieux (priorisé). */
export const GAPS: Array<{ priority: 'haute' | 'moyenne'; title: string; detail: string; vs: string }> = [
  { priority: 'haute', title: 'Veille pub temps réel', detail: 'Brancher les bibliothèques Meta/TikTok pour une veille et une inspiration live, pas seulement des sauvegardes.', vs: 'Foreplay, Atria' },
  { priority: 'haute', title: 'Qualité & variété vidéo', detail: 'Monter au niveau motion/UGC : avatars, contrôles caméra, presets cinématographiques.', vs: 'Higgsfield' },
  { priority: 'moyenne', title: 'Tracking concurrents automatique', detail: 'Surveillance continue des marques suivies (nouvelles pubs, scaling) avec alertes.', vs: 'Foreplay (Spyder)' },
  { priority: 'moyenne', title: 'Analyse de performance', detail: 'Connexions Meta/TikTok Ads pour juger les créas sur les vrais KPI, pas des estimations.', vs: 'Atria' },
];

/** Nos avantages à presser (déjà en place). */
export const ADVANTAGES: string[] = [
  'Jarvis : une couche de règles maison éditable, unique sur le marché.',
  'Chaîne complète gouvernée : veille → concept → scène produit fidèle → design → vidéo.',
  'Produit réel fidèle dans les créas (Nano Banana 2), pas des visuels génériques.',
  'White-label agence + prix accessible face à des outils premium ou fragmentés.',
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
