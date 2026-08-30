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
 * Tout ici est par marque : la carte, la mémoire, les lots, les prompts. Un fil
 * qui affiche « ADSMAP › Radar » sans dire de quelle marque il parle décrit un
 * écran qui n'existe pas.
 *
 * ── Ce qui empêche la dérive de recommencer ──────────────────────────────────
 *
 * Un test lit le dossier des pages et échoue si une route n'est pas déclarée
 * ici. C'est la même leçon que le journal de migrations : « ne pas oublier » n'est
 * pas une règle applicable, seule une vérification qui ne dépend de personne
 * tient dans la durée.
 */

/** Sections de premier niveau · elles ouvrent tout fil d'Ariane. */
export type Section = 'Analyse' | 'Création' | 'Espace' | 'Plateforme';

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
  { path: '/dashboard', label: 'Dashboard', section: 'Analyse' },
  { path: '/analytics', label: 'Analytics', section: 'Analyse' },
  { path: '/radar', label: 'Radar produits', section: 'Analyse' },
  { path: '/tags', label: 'Tagging', section: 'Analyse' },

  { path: '/adsmap', label: 'ADSMAP', section: 'Analyse' },
  { path: '/adsmap/suites', label: 'Suites', parent: '/adsmap', section: 'Analyse' },
  { path: '/adsmap/lots', label: 'Lots de test', parent: '/adsmap', section: 'Analyse' },
  { path: '/adsmap/protocole', label: 'Protocole & seuils', parent: '/adsmap', section: 'Analyse' },
  { path: '/adsmap/import', label: 'Importer le tableau', parent: '/adsmap', section: 'Analyse' },
  { path: '/adsmap/radar', label: 'Radar de veille', parent: '/adsmap', section: 'Analyse' },
  // Redirige vers `/jarvis` · déclarée pour que la carte reste complète, cachée
  // pour qu'un fil ne s'affiche jamais sur un écran qu'on ne fait que traverser.
  { path: '/adsmap/jarvis', label: 'Jarvis', parent: '/adsmap', section: 'Analyse', hidden: true },

  // ── Création ───────────────────────────────────────────────────────────────
  { path: '/jarvis', label: 'Jarvis', section: 'Création' },

  { path: '/inspo', label: 'Veille', section: 'Création' },
  { path: '/inspo/scale', label: 'Ce qui scale', parent: '/inspo', section: 'Création' },
  { path: '/saved', label: 'Sauvegardes', parent: '/inspo', section: 'Création' },

  { path: '/studio', label: 'Studio IA', section: 'Création' },
  { path: '/studio/ads', label: 'Pubs IA', parent: '/studio', section: 'Création' },
  { path: '/studio/image', label: 'Image IA', parent: '/studio', section: 'Création' },
  { path: '/studio/video', label: 'Vidéo IA', parent: '/studio', section: 'Création' },
  { path: '/studio/prompts', label: 'Tes prompts', parent: '/studio', section: 'Création' },

  { path: '/assets', label: 'Assets', section: 'Création' },

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
  { path: '/admin/plans', label: 'Formules & crédits', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/paiement', label: 'Chaîne de paiement', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/incidents', label: 'Incidents', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/depenses', label: 'Dépense IA réelle', parent: '/admin', section: 'Plateforme' },
  { path: '/admin/intelligence', label: 'Intelligence marché', parent: '/admin', section: 'Plateforme' },
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

export interface Crumb { label: string; href: string | null }

export interface CrumbOptions {
  /** Nom de la marque active · rend « Marques › TrueFords » plutôt que « Marque ». */
  brandName?: string | null;
  /**
   * Ajoute la marque au fil sur les écrans qui travaillent marque par marque.
   * Sans elle, « ADSMAP › Radar » décrit un écran qui n'existe pas.
   */
  brandScoped?: boolean;
}

/** Écrans dont le contenu dépend entièrement de la marque active. */
const PAR_MARQUE = new Set([
  '/adsmap', '/adsmap/suites', '/adsmap/lots', '/adsmap/protocole',
  '/adsmap/import', '/adsmap/radar',
  '/jarvis', '/studio', '/studio/ads', '/studio/image', '/studio/video',
  '/studio/prompts', '/assets', '/analytics', '/dashboard',
]);

export function isBrandScoped(pathname: string): boolean {
  const r = matchRoute(pathname);
  return !!r && PAR_MARQUE.has(r.path);
}

/**
 * Le chemin complet jusqu'à l'écran courant.
 *
 * Le dernier maillon n'a pas de lien · c'est là qu'on est, et un lien vers
 * soi-même est une promesse de mouvement qui n'aboutit pas.
 *
 * Renvoie un tableau VIDE quand il n'y a rien d'utile à dire : route inconnue,
 * écran caché, ou racine de section. Afficher « Analyse › Dashboard » sur le
 * dashboard ajoute une ligne et zéro information.
 */
export function breadcrumb(pathname: string, opts: CrumbOptions = {}): Crumb[] {
  const route = matchRoute(pathname);
  if (!route || route.hidden) return [];

  // Remontée de filiation · bornée, sûre même si la carte contenait un cycle.
  const chaine: RouteNode[] = [];
  const vus = new Set<string>();
  let cur: RouteNode | undefined = route;
  while (cur && !vus.has(cur.path)) {
    vus.add(cur.path);
    chaine.unshift(cur);
    cur = cur.parent ? PAR_CHEMIN.get(cur.parent) : undefined;
  }

  // Une racine de section n'a rien à raconter · le rail la montre déjà.
  if (chaine.length === 1 && !opts.brandScoped) return [];

  const parts = segments(pathname);
  const crumbs: Crumb[] = [{ label: route.section, href: null }];

  if (opts.brandScoped && opts.brandName) {
    // La marque vient juste après la section · c'est le contexte dans lequel
    // tout le reste se lit.
    crumbs.push({ label: opts.brandName, href: null });
  }

  for (let i = 0; i < chaine.length; i++) {
    const n = chaine[i]!;
    const dernier = i === chaine.length - 1;
    crumbs.push({
      label: libelle(n, parts, opts),
      // On ne lie jamais l'écran courant · un lien vers soi-même promet un
      // mouvement qui n'arrive pas.
      href: dernier ? null : hydrate(n.path, parts),
    });
  }
  return crumbs;
}

function libelle(n: RouteNode, parts: string[], opts: CrumbOptions): string {
  if (n.dynamic === 'brand' && opts.brandName) return opts.brandName;
  if (n.dynamic === 'segment') {
    // Le DERNIER segment dynamique · sur `/brands/[id]/competitors/[name]`,
    // c'est le concurrent qu'on nomme, pas la marque qui le contient.
    const motif = segments(n.path);
    let i = -1;
    for (let k = motif.length - 1; k >= 0; k--) {
      if (motif[k]!.startsWith('[')) { i = k; break; }
    }
    const brut = i >= 0 ? parts[i] : undefined;
    if (brut) {
      try { return decodeURIComponent(brut); } catch { return brut; }
    }
  }
  return n.label;
}

/** Remplace les segments dynamiques d'un motif par ceux du chemin réel. */
function hydrate(motif: string, parts: string[]): string {
  const m = segments(motif);
  return '/' + m.map((seg, i) => (seg.startsWith('[') ? (parts[i] ?? seg) : seg)).join('/');
}

/** Libellé d'écran · sert aussi aux titres d'onglet et aux journaux. */
export function routeLabel(pathname: string): string | null {
  return matchRoute(pathname)?.label ?? null;
}
