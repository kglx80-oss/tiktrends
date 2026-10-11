/**
 * UX V2 · lot 2 · l'ESPACE DE CRÉATION d'un projet (maquettes validées le 10/10).
 * Pur · ni navigateur, ni base.
 *
 * Trois règles que la coquille et la barre de projet appliquent :
 *
 *  1. Le MODE courant du projet, lu dans l'adresse · Brief (la fiche), Image,
 *     Vidéo, Textes, Produit, Identités, Export. Une seule barre les présente
 *     sur toutes les pages du projet · les modes restent des pages réelles
 *     (mêmes adresses, mêmes gardes), la barre ne fait que les relier.
 *
 *  2. Le MODE FOCUS · il cache le rail, la barre du haut, le fil d'Ariane et
 *     les onglets de section pour rendre la place au travail, et garde la
 *     barre de projet (titre, sortie, export, Jarvis). Proposé seulement dans
 *     un projet. Réversible · Alt F bascule, Échap quitte, le bouton aussi.
 *     Il n'est pas mémorisé · on revient toujours à l'écran complet. La
 *     préférence du rail (Alt B) en est indépendante.
 *
 *  3. JARVIS MASQUABLE · le panneau des propositions peut être masqué ; le
 *     choix est mémorisé par appareil (cookie lu au rendu serveur, comme le
 *     rail) · rien ne saute au chargement.
 */

export const MODES_PROJET = ['brief', 'image', 'video', 'textes', 'produit', 'identites', 'export'] as const;
export type ModeProjet = (typeof MODES_PROJET)[number];

export const LIBELLES_MODE_PROJET: Record<ModeProjet, string> = {
  brief: 'Brief',
  image: 'Image',
  video: 'Vidéo',
  textes: 'Textes',
  produit: 'Produit',
  identites: 'Identités et voix',
  export: 'Export',
};

/** Segment d'adresse de chaque mode · le Brief est la fiche du projet elle-même. */
export const SEGMENT_MODE_PROJET: Record<ModeProjet, string> = {
  brief: '', image: 'image', video: 'video', textes: 'textes', produit: 'produit', identites: 'identites', export: 'export',
};

// `/studio/projets/<id>` ou `/studio/projets/<id>/<segment>` · `nouveau` est la
// préparation d'un projet, pas un projet.
const PROJET = /^\/studio\/projets\/([^/?#]+)(?:\/([^/?#]+))?\/?$/;

/** Le projet et le mode d'une adresse, ou `null` hors d'un projet (ou sur un segment inconnu). */
export function modeProjetDuChemin(pathname: string): { projectId: string; mode: ModeProjet } | null {
  const m = PROJET.exec(pathname);
  if (!m || m[1] === 'nouveau') return null;
  const seg = m[2] ?? '';
  const mode = MODES_PROJET.find((x) => SEGMENT_MODE_PROJET[x] === seg);
  return mode ? { projectId: decodeURIComponent(m[1]!), mode } : null;
}

/** Le mode focus n'est proposé que dans un projet · ailleurs, la navigation reste toujours visible. */
export const focusDisponible = (pathname: string): boolean => modeProjetDuChemin(pathname) !== null;

export interface ToucheFocus { key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey?: boolean }
export interface CibleTouche {
  /** Une saisie a le focus (champ, zone de texte, liste, contenu éditable). */
  saisie: boolean;
  /** Une boîte de dialogue est ouverte · Échap lui appartient. */
  dialogue: boolean;
}

/**
 * Ce que fait une touche vis-à-vis du mode focus.
 *  · Alt F (sans Ctrl ni Cmd) · bascule, si le focus est disponible ici et
 *    qu'on n'est pas en train de saisir ;
 *  · Échap · quitte, seulement en focus, hors saisie et hors dialogue (Échap
 *    ferme d'abord ce qui est ouvert, jamais deux choses à la fois).
 */
export function actionToucheFocus(t: ToucheFocus, cible: CibleTouche, etat: { focus: boolean; disponible: boolean }): 'basculer' | 'quitter' | null {
  if (cible.saisie) return null;
  if (t.altKey && !t.ctrlKey && !t.metaKey && t.code === 'KeyF') return etat.disponible || etat.focus ? 'basculer' : null;
  if (t.key === 'Escape' && !t.altKey && !t.ctrlKey && !t.metaKey && etat.focus && !cible.dialogue) return 'quitter';
  return null;
}

/* ─────────────────────────── Jarvis masquable ─────────────────────────── */

/** Nom du cookie · court, sans donnée personnelle. */
export const JARVIS_COOKIE = 'tt_jarvis';

/** Jarvis est-il masqué ? · seule la valeur « 0 » le masque · le défaut sûr est Jarvis visible. */
export const jarvisMasqueDepuisCookie = (raw: string | undefined | null): boolean => raw === '0';

/** La chaîne à poser dans `document.cookie` au basculement · un an, tout le site, jamais en requête tierce. */
export function jarvisCookieString(masque: boolean): string {
  return `${JARVIS_COOKIE}=${masque ? '0' : '1'}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
