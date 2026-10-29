import type { CapaciteStudio } from '@tiktrends/core';

/**
 * Où l'on est, et comment on y est arrivé.
 *
 * ── Le problème que ce fichier règle ─────────────────────────────────────────
 *
 * La navigation était écrite à TROIS endroits qui avaient déjà divergé :
 *
 *  - `FEATURES` (rbac.ts) pour le rail de gauche ;
 *  - une barre de sept boutons codée en dur en haut d'ADSMAP ;
 *  - **vingt et un liens « ‹ Retour » écrits à la main**, page par page, chacun
 *    à sa façon.
 *
 * Trois sources pour une seule vérité, c'est trois vérités. ADSMAP exposait six
 * sous-écrans dans sa barre et aucun dans le rail ; Studio faisait l'inverse.
 * Personne n'avait décidé ça · c'est arrivé.
 *
 * ── Un fil d'Ariane n'est pas un bouton retour ───────────────────────────────
 *
 * Les vingt et un liens répondaient à « comment je sors d'ici ». C'est la
 * question facile. Celle à laquelle personne ne pouvait répondre, sur un produit
 * à trois niveaux, c'est **« où suis-je, et qu'est-ce qui contient cet
 * écran ? »**. Un chemin complet y répond ; une flèche vers le parent, non.
 *
 * ── La marque fait partie de l'adresse ───────────────────────────────────────
 *
 * Tout ici est par marque : la carte, la mémoire, les lots, les scènes. Un fil
 * qui affiche « ADSMAP › Radar » sans dire de quelle marque il parle décrit un
 * écran qui n'existe pas.
 *
 * ── Retrait de la coquille V5 ────────────────────────────────────────────────
 *
 * Le fil d'Ariane de l'ancienne interface (`breadcrumb`, `filEnTete`,
 * `routeLabel`, `isBrandScoped`) est retiré avec elle · l'interface Spatial a
 * sa propre navigation.
 *
 * ── Retrait de la carte `ROUTES` ─────────────────────────────────────────────
 *
 * La carte de tous les écrans (`ROUTES`, `matchRoute`, `capaciteDeRoute`) ne
 * servait plus qu'aux libellés de l'atelier d'un projet · ils sont nommés ici
 * (`ATELIER`), à côté des capacités qui les gardent. Restent les routes
 * historiques (gardées par `l8b-navigation`) et les capacités Studios.
 */

/* -------------------------------------------------------------------------- */
/*  Routes historiques · L8-B (UX-05)                                         */
/* -------------------------------------------------------------------------- */

/**
 * Les adresses que des liens déjà en circulation visent · anciens liens du
 * Studio, des Pubs IA et de la Veille (favoris, liens partagés, cartes de
 * Veille, notifications enregistrées). Chacune doit rester SERVIE · un test
 * parcourt cette liste (`l8b-navigation`) et échoue si une page disparaît, ou
 * si un paramètre porté par un lien existant n'est plus relu (ni par la page,
 * ni, pour une ancienne adresse de création, par sa redirection vers la
 * préparation d'un projet).
 *
 * Ajout seulement.
 */
export interface RouteHistorique {
  chemin: string;
  origine: 'Studio' | 'Pubs IA' | 'Veille';
  /** Paramètres de requête que des liens existants portent, et que la page lit encore. */
  params: readonly string[];
}

export const ROUTES_HISTORIQUES: readonly RouteHistorique[] = [
  { chemin: '/studio', origine: 'Studio', params: [] },
  { chemin: '/studio/ads', origine: 'Pubs IA', params: ['mode', 'ref', 'angle', 'iter', 'src', 'srcnom', 'depuis', 'rv'] },
  { chemin: '/studio/image', origine: 'Studio', params: [] },
  { chemin: '/studio/video', origine: 'Studio', params: ['prompt'] },
  { chemin: '/studio/textes', origine: 'Studio', params: ['brand', 'inspo'] },
  { chemin: '/studio/projets', origine: 'Studio', params: ['toutes'] },
  { chemin: '/studio/projets/nouveau', origine: 'Studio', params: ['type', 'angle', 'produit', 'ref', 'iter', 'src', 'srcnom', 'depuis', 'rv'] },
  { chemin: '/studio/projets/[id]', origine: 'Studio', params: ['version'] },
  { chemin: '/veille', origine: 'Veille', params: ['q', 'p', 'searchIn', 'media', 'sort', 'status', 'country', 'page', 'rv'] },
  { chemin: '/veille/scale', origine: 'Veille', params: ['q', 'country'] },
  { chemin: '/veille/formats', origine: 'Veille', params: [] },
  { chemin: '/saved', origine: 'Veille', params: ['onglet'] },
  { chemin: '/radar', origine: 'Veille', params: [] },
  { chemin: '/tags', origine: 'Veille', params: [] },
];

/* -------------------------------------------------------------------------- */
/*  Interrupteurs Studios · F1 (cahier §14)                                   */
/* -------------------------------------------------------------------------- */

/**
 * La capacité Studios dont dépend chaque écran des Studios (projets). Les
 * anciennes adresses (`/studio`, Pubs IA, Image IA, Vidéo IA, Textes IA) ne
 * font plus que rediriger (retrait du 10/10) et n'y figurent pas. Un test
 * (`f1-navigation`) échoue si un écran sous `/studio/projets` n'est pas
 * déclaré ici, ou si une ancienne adresse l'est.
 */
export const CAPACITE_DES_ROUTES: Readonly<Record<string, CapaciteStudio>> = {
  '/studio/projets': 'projets',
  '/studio/projets/nouveau': 'projets',
  '/studio/projets/nouveau/concept': 'projets',
  '/studio/projets/[id]': 'projets',
  '/studio/projets/[id]/image': 'editeur',
  '/studio/projets/[id]/produit': 'projets',
  '/studio/projets/[id]/textes': 'textes',
  '/studio/projets/[id]/identites': 'identites',
  '/studio/projets/[id]/export': 'export',
  '/studio/projets/[id]/video': 'video',
};

export interface LienAtelier {
  /** Adresse de l'écran · `null` quand la capacité est coupée (aucun lien mort). */
  href: string | null;
  libelle: string;
  segment: string;
  capacite: CapaciteStudio;
  active: boolean;
  /** « non activé pour cet espace » · dit à côté du libellé quand la capacité est coupée. */
  mention: string | null;
}

/** Les écrans de l'atelier d'un projet, dans l'ordre, et leur libellé. */
const ATELIER: ReadonlyArray<{ segment: string; libelle: string }> = [
  { segment: 'image', libelle: 'Éditer l’image' },
  { segment: 'produit', libelle: 'Produit et références' },
  { segment: 'textes', libelle: 'Textes liés au brief' },
  { segment: 'video', libelle: 'Vidéo · storyboard et montage' },
  { segment: 'identites', libelle: 'Identités et voix' },
  { segment: 'export', libelle: 'Exporter l’image' },
];

/** Les entrées de l'atelier d'un projet, avec leur état pour l'espace · filtrage de la navigation. */
export function liensAtelierProjet(projectId: string, actif: (c: CapaciteStudio) => boolean): LienAtelier[] {
  return ATELIER.map(({ segment, libelle }) => {
    const motif = `/studio/projets/[id]/${segment}`;
    const capacite = CAPACITE_DES_ROUTES[motif]!;
    const active = actif(capacite);
    return {
      href: active ? `/studio/projets/${projectId}/${segment}` : null,
      libelle,
      segment,
      capacite,
      active,
      mention: active ? null : 'non activé pour cet espace',
    };
  });
}
