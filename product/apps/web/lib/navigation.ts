import { DEFINITIONS_CAPACITES, type CapaciteStudio } from '@tiktrends/core';

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
 * ── Ce qui empêche la dérive de recommencer ──────────────────────────────────
 *
 * Un test lit le dossier des pages et échoue si une route n'est pas déclarée
 * ici. C'est la même leçon que le journal de migrations : « ne pas oublier » n'est
 * pas une règle applicable, seule une vérification qui ne dépend de personne
 * tient dans la durée.
 *
 * ── Retrait de la coquille V5 ────────────────────────────────────────────────
 *
 * Le fil d'Ariane de l'ancienne interface (`breadcrumb`, `filEnTete`,
 * `routeLabel`, `isBrandScoped`) est retiré avec elle · l'interface Spatial a
 * sa propre navigation. La carte reste · elle décrit les écrans et porte les
 * capacités Studios (`capaciteDeRoute`, `liensAtelierProjet`).
 */

/** Sections de premier niveau (regroupements de la carte des routes). */
export type Section = 'Pilotage' | 'Observatoire' | 'Atelier' | 'Laboratoire' | 'Espace' | 'Plateforme';

export interface RouteNode {
  /** Motif de chemin · les segments dynamiques s'écrivent `[id]`. */
  path: string;
  label: string;
  /** Chemin du parent · absent pour une racine de section. */
  parent?: string;
  section: Section;
  /**
   * D'où vient le libellé quand le segment est dynamique.
   * `brand` · nom de la marque active. `segment` · le segment de l'URL, décodé.
   */
  dynamic?: 'brand' | 'segment';
  /** Écran qui n'a pas à figurer dans un fil · tunnels et redirections. */
  hidden?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  La carte                                                                  */
/* -------------------------------------------------------------------------- */

export const ROUTES: RouteNode[] = [
  // ── Analyse ────────────────────────────────────────────────────────────────
  { path: '/dashboard', label: 'Accueil', section: 'Pilotage' },
  { path: '/analytics', label: 'Analytics', section: 'Pilotage' },
  { path: '/radar', label: 'Radar créatif', parent: '/veille', section: 'Observatoire' },
  { path: '/tags', label: 'Tagging', parent: '/veille', section: 'Observatoire' },

  { path: '/adsmap', label: 'Résultats', section: 'Laboratoire' },
  { path: '/adsmap/suites', label: 'Suites', parent: '/adsmap', section: 'Laboratoire' },
  { path: '/adsmap/lots', label: 'Lots de test', parent: '/adsmap', section: 'Laboratoire' },
  { path: '/adsmap/protocole', label: 'Protocole & seuils', parent: '/adsmap', section: 'Laboratoire' },
  { path: '/adsmap/import', label: 'Importer', parent: '/adsmap', section: 'Laboratoire' },
  { path: '/adsmap/radar', label: 'Radar de veille', parent: '/adsmap', section: 'Laboratoire' },
  { path: '/adsmap/tri', label: 'Tri des propositions', parent: '/adsmap', section: 'Laboratoire' },
  // Redirige vers `/jarvis` · déclarée pour que la carte reste complète, cachée
  // pour qu'un fil ne s'affiche jamais sur un écran qu'on ne fait que traverser.
  { path: '/adsmap/jarvis', label: 'Jarvis', parent: '/adsmap', section: 'Laboratoire', hidden: true },

  // ── Création ───────────────────────────────────────────────────────────────
  { path: '/jarvis', label: 'Jarvis', section: 'Atelier' },
  // Les sources de Jarvis · mémoire mesurée, décrire, réglages · atteintes depuis
  // la conversation, pas listées dans le rail (cf. jarvis/sources/page). Le reste
  // du détail vit à sa destination (Adsmap, Analytics, Veille, contexte du chat).
  { path: '/jarvis/sources', label: 'Sources', parent: '/jarvis', section: 'Atelier', hidden: true },
  { path: '/jarvis/veille', label: 'Depuis la Veille', parent: '/jarvis', section: 'Atelier', hidden: true },

  { path: '/veille', label: 'Veille', section: 'Observatoire' },
  { path: '/veille/scale', label: 'Ce qui scale', parent: '/veille', section: 'Observatoire' },
  { path: '/veille/formats', label: 'Formats', parent: '/veille', section: 'Observatoire' },
  { path: '/saved', label: 'Sauvegardes', parent: '/veille', section: 'Observatoire' },

  // Les anciennes adresses de création · elles ne font plus que rediriger
  // (`destinationAncienneAdresse`, retrait du 10/10) · cachées, jamais dans un fil.
  { path: '/studio', label: 'Studios', section: 'Atelier', hidden: true },
  { path: '/studio/ads', label: 'Studios', section: 'Atelier', hidden: true },
  { path: '/studio/image', label: 'Studios', section: 'Atelier', hidden: true },
  { path: '/studio/video', label: 'Studios', section: 'Atelier', hidden: true },
  { path: '/studio/textes', label: 'Studios', section: 'Atelier', hidden: true },
  { path: '/studio/projets', label: 'Studios', section: 'Atelier' },
  { path: '/studio/projets/nouveau', label: 'Préparer un projet', parent: '/studio/projets', section: 'Atelier' },
  { path: '/studio/projets/nouveau/concept', label: 'Nouveau concept créatif', parent: '/studio/projets', section: 'Atelier' },
  { path: '/studio/projets/[id]', label: 'Projet', parent: '/studio/projets', section: 'Atelier', dynamic: 'segment' },
  { path: '/studio/projets/[id]/image', label: 'Éditer l’image', parent: '/studio/projets/[id]', section: 'Atelier' },
  { path: '/studio/projets/[id]/produit', label: 'Produit et références', parent: '/studio/projets/[id]', section: 'Atelier' },
  { path: '/studio/projets/[id]/textes', label: 'Textes liés au brief', parent: '/studio/projets/[id]', section: 'Atelier' },
  { path: '/studio/projets/[id]/identites', label: 'Identités et voix', parent: '/studio/projets/[id]', section: 'Atelier' },
  { path: '/studio/projets/[id]/export', label: 'Exporter l’image', parent: '/studio/projets/[id]', section: 'Atelier' },
  { path: '/studio/projets/[id]/video', label: 'Vidéo · storyboard et montage', parent: '/studio/projets/[id]', section: 'Atelier' },

  { path: '/assets', label: 'Bibliothèque', section: 'Atelier' },

  // ── Espace ─────────────────────────────────────────────────────────────────
  { path: '/brands', label: 'Marques', section: 'Espace' },
  { path: '/brands/new', label: 'Nouvelle marque', parent: '/brands', section: 'Espace' },
  { path: '/brands/[id]', label: 'Marque', parent: '/brands', section: 'Espace', dynamic: 'brand' },
  {
    path: '/brands/[id]/competitors/[name]', label: 'Concurrent',
    parent: '/brands/[id]', section: 'Espace', dynamic: 'segment',
  },
  { path: '/team', label: 'Membres', section: 'Espace' },
  { path: '/connections', label: 'Connexions', section: 'Espace' },
  { path: '/usage', label: 'Utilisation des crédits', section: 'Espace' },
  { path: '/billing', label: 'Abonnement & factures', section: 'Espace' },
  { path: '/settings', label: 'Réglages', section: 'Espace' },
  { path: '/profile', label: 'Mon profil', section: 'Espace' },
  { path: '/support', label: 'Support', section: 'Espace' },
  { path: '/support/[id]', label: 'Demande', parent: '/support', section: 'Espace', dynamic: 'segment' },

  // ── Plateforme · fondateur ─────────────────────────────────────────────────
  { path: '/admin', label: 'Coulisses', section: 'Plateforme' },
  { path: '/admin/finance', label: 'Finance · MRR', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/signups', label: 'Inscriptions', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/equipe', label: 'Équipe & droits', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/plans', label: 'Formules & crédits', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/paiement', label: 'Chaîne de paiement', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/incidents', label: 'Incidents', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/depenses', label: 'Dépense IA réelle', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/intelligence', label: 'Intelligence marché', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/connaissances', label: 'Connaissances', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/ia-studios', label: 'IA et Studios', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/studios-interrupteurs', label: 'Interrupteurs Studios', parent: '/admin', section: 'Plateforme' },
  { path: '/console', label: 'Console', section: 'Plateforme' },
  { path: '/credits', label: 'Coûts & marges', section: 'Plateforme' },

  // Tunnel d'entrée · un fil d'Ariane y proposerait de partir, ce qui est le
  // contraire de ce qu'on veut à cet endroit.
  { path: '/onboarding', label: 'Bienvenue', section: 'Espace', hidden: true },
];

const PAR_CHEMIN = new Map(ROUTES.map((r) => [r.path, r]));

/* -------------------------------------------------------------------------- */
/*  Résolution                                                                */
/* -------------------------------------------------------------------------- */

const segments = (p: string): string[] => p.split('/').filter(Boolean);

/**
 * Retrouve la route qui décrit ce chemin.
 *
 * Les motifs dynamiques (`[id]`) acceptent n'importe quel segment · à longueur
 * égale, un motif LITTÉRAL l'emporte, sinon `/brands/new` serait capté par
 * `/brands/[id]` et l'écran de création s'annoncerait comme une marque.
 */
export function matchRoute(pathname: string): RouteNode | null {
  const exact = PAR_CHEMIN.get(pathname);
  if (exact) return exact;

  const parts = segments(pathname);
  const candidats = ROUTES.filter((r) => {
    const motif = segments(r.path);
    if (motif.length !== parts.length) return false;
    return motif.every((m, i) => (m.startsWith('[') && m.endsWith(']')) || m === parts[i]);
  });
  if (!candidats.length) return null;

  const dynamiques = (r: RouteNode) => segments(r.path).filter((m) => m.startsWith('[')).length;
  return candidats.sort((a, b) => dynamiques(a) - dynamiques(b))[0]!;
}

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
 * Ajout seulement · rien ici ne change la carte `ROUTES` ni le fil d'Ariane.
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

export function capaciteDeRoute(pathname: string): CapaciteStudio | null {
  const r = matchRoute(pathname);
  return r ? CAPACITE_DES_ROUTES[r.path] ?? null : null;
}

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

const ATELIER: readonly string[] = ['image', 'produit', 'textes', 'video', 'identites', 'export'];

/** Les entrées de l'atelier d'un projet, avec leur état pour l'espace · filtrage de la navigation. */
export function liensAtelierProjet(projectId: string, actif: (c: CapaciteStudio) => boolean): LienAtelier[] {
  return ATELIER.map((segment) => {
    const motif = `/studio/projets/[id]/${segment}`;
    const capacite = CAPACITE_DES_ROUTES[motif]!;
    const active = actif(capacite);
    return {
      href: active ? `/studio/projets/${projectId}/${segment}` : null,
      libelle: PAR_CHEMIN.get(motif)?.label ?? segment,
      segment,
      capacite,
      active,
      mention: active ? null : 'non activé pour cet espace',
    };
  });
}

/** Libellé d'une capacité · pour les écrans qui n'importent pas le noyau. */
export const libelleCapacite = (c: CapaciteStudio): string => DEFINITIONS_CAPACITES[c].libelle;
