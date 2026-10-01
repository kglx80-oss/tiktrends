/**
 * Un service pas encore activé · ce que le CLIENT lit quand le serveur n'a pas
 * la clé d'un service (recette #106b).
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * Plusieurs actions renvoyaient à l'écran l'envers du décor · « Stockage objet
 * non configuré sur le serveur », « La source de veille n'est pas configurée
 * sur le serveur », « L'IA n'est pas configurée sur le serveur (clé
 * manquante) », « Source de données non configurée », « La bibliothèque
 * publicitaire n'est pas configurée sur le serveur ». Tous ces écrans sont
 * ouverts au client (membre ou administrateur de SON espace), pas seulement à
 * l'équipe de la plateforme · un client ne règle pas un serveur.
 *
 * Chaque message dit ce qui n'est pas activé, que notre équipe l'active sur
 * demande (le support), et ce qu'on peut faire en attendant quand il existe un
 * repli. Aucun nom de variable, de clé, de fournisseur ni de « serveur ».
 *
 * Pur · ni base ni réseau. La logique (refus, état de démonstration) ne bouge
 * pas · seuls les mots changent.
 */

const QUI = 'notre équipe l’active sur demande, depuis le support';

/** Les services absents qu'un écran client peut rencontrer. */
export type ServiceInactif =
  | 'stockage'          // téléversement direct des gros fichiers (Assets)
  | 'veille'            // recherche publicitaire en direct (Veille, Jarvis, concurrents)
  | 'ia_profil'         // pré-remplissage IA d'une marque (assistant de création)
  | 'relecture_image'   // relecture automatique d'un visuel (Image IA)
  | 'jarvis';           // conversation Jarvis

export const MESSAGES_SERVICE_INACTIF: Record<ServiceInactif, string> = {
  stockage: `Le téléversement direct des gros fichiers n’est pas encore activé pour ton espace · ${QUI}. En attendant, importe tes vidéos par lien.`,
  veille: `La recherche publicitaire en direct n’est pas encore activée pour ton espace · ${QUI}.`,
  ia_profil: `Le pré-remplissage par l’IA n’est pas encore activé pour ton espace · ${QUI}. Tu peux remplir le profil à la main.`,
  relecture_image: `La relecture automatique des visuels n’est pas encore activée pour ton espace · ${QUI}.`,
  jarvis: `Jarvis n’est pas encore activé pour ton espace · ${QUI}.`,
};

/** Le message client d'un service absent. */
export function messageServiceInactif(service: ServiceInactif): string {
  return MESSAGES_SERVICE_INACTIF[service];
}

/**
 * Le panneau Stockage des Réglages · deux publics, mêmes fonctions.
 *
 * Les Réglages s'ouvrent à l'administrateur de l'espace · un CLIENT. Il lisait
 * « Pose d'abord les clés S3 dans .env.deploy sur le VPS », « Configurer le
 * bucket (public + CORS) », « renseigne S3_PUBLIC_BASE_URL ». L'équipe de la
 * plateforme (opérateur) garde ses consignes techniques · le client lit les
 * mêmes états en mots de client. Aucun bouton n'apparaît ni ne disparaît.
 */
export interface CopieStockage {
  /** Stockage pas encore activé (client seulement · l'opérateur lit les consignes). */
  inactif: string;
  configurer: string;
  deplacer: string;
  migrationTitre: (restantes: number, poidsMo: number) => string;
  migrationTexte: string;
  testOk: string;
  testLecture: string;
  testEcriture: string;
}

export const COPIE_STOCKAGE: { client: CopieStockage; operateur: CopieStockage } = {
  client: {
    inactif: `Le stockage des fichiers lourds (rushs vidéo) n’est pas encore activé pour ton espace · ${QUI}. En attendant, importe tes vidéos par lien dans Assets.`,
    configurer: 'Préparer le stockage',
    deplacer: 'Ranger 25 images',
    migrationTitre: (n, mo) => `${n} image(s) à ranger dans le stockage · environ ${mo} Mo`,
    migrationTexte: 'Elles s’affichent déjà correctement · les ranger allège ton espace, par lots de 25, sans rien perdre.',
    testOk: 'Stockage opérationnel · tu peux téléverser des rushs dans Assets.',
    testLecture: `Le stockage accepte les fichiers mais ne les affiche pas encore · ${QUI}.`,
    testEcriture: `Le stockage ne répond pas comme prévu · ${QUI}.`,
  },
  operateur: {
    inactif: '',
    configurer: 'Configurer le bucket (public + CORS)',
    deplacer: 'Déplacer 25 images vers le bucket',
    migrationTitre: (n, mo) => `${n} image(s) vivent encore dans la base · environ ${mo} Mo`,
    migrationTexte: 'Elles s’affichent correctement (elles passent par le proxy), mais leurs octets alourdissent la base, chaque sauvegarde, et chaque requête qui touche la table. Les déplacer vers le bucket les sort définitivement · par lots de 25, sans rien perdre : le fichier est écrit avant que la ligne change.',
    testOk: 'Stockage opérationnel · tu peux téléverser des rushs dans Assets.',
    testLecture: 'Écriture OK mais lecture publique KO : relance « Configurer le bucket » (policy) ou renseigne S3_PUBLIC_BASE_URL.',
    testEcriture: 'Écriture KO : vérifie les clés S3, le nom du bucket et la région.',
  },
};

/** Le bandeau de démonstration d'un écran de veille sans recherche en direct. */
export const BANDEAU_DEMO_VEILLE = 'Échantillon · la recherche en direct n’est pas encore activée pour ton espace.';
