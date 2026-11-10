import type { SectionSpatiale } from '../types';

/**
 * Spatial · les RACCOURCIS CLAVIER · lot 13 V5 (CA R04, H04, H06, H07, J02 ·
 * RJ G02 · PC D16). Pur.
 *
 * UNE table (`RACCOURCIS`) dit chaque raccourci de l'application · ses
 * touches, son action, sa portée, son libellé. La coquille en tire son
 * écouteur (`raccourciDeLaFrappe`), la fenêtre d'aide (« ? ») en tire sa liste
 * (`groupesAideRaccourcis`) · jamais une liste écrite à la main.
 *
 * Deux sortes d'entrées ·
 *  · celles de la COQUILLE (`action` posée, portée « partout » ou « aller ») ·
 *    l'écouteur de la coquille les exécute ;
 *  · celles des VUES (`action` nulle, `sources` · les fichiers qui les gèrent)
 *    · déjà en place avant ce lot, RECENSÉES par motif dans le code
 *    (`TOUCHES_RECENSEES`, refait par la garde web) pour que l'aide les dise
 *    et que la garde refuse tout conflit avec elles.
 *
 * Ce qui est refusé, et prouvé par les gardes ·
 *  · deux entrées aux mêmes touches dans des portées qui se recouvrent (une
 *    portée globale recouvre toutes les autres) ;
 *  · une touche simple de la coquille qui commence une séquence (« g » ne peut
 *    rien faire seul, il attend la lettre suivante) ;
 *  · un raccourci de la coquille dans un champ de saisie, une zone éditable, un
 *    lecteur vidéo ou audio, sous une fenêtre modale, ou avec une touche de
 *    modification qu'il ne prévoit pas (Ctrl, ⌘, Alt, Maj sur une lettre) ·
 *    seule la recherche (Ctrl K ou ⌘ K) reste ouverte dans un champ, comme
 *    avant ce lot.
 *
 * WCAG 2.1.4 (raccourcis à un caractère) · un raccourci fait d'une lettre,
 * d'un chiffre ou d'un signe, sans Ctrl ni ⌘, doit pouvoir être COUPÉ, sauf
 * s'il n'agit que sur l'élément qui a le focus. Le choix ici · un interrupteur
 * « Raccourcis à une touche », gardé sur l'appareil par un cookie d'ergonomie
 * (`tt_raccourcis`, comme le rail `tt_rail` et le thème `tt_theme`), dans la
 * fenêtre d'aide et dans « Mon profil ». Actifs par défaut. Coupés, toutes les
 * entrées concernées se taisent · celles de la coquille ET le « / » de Ce qui
 * scale ; la recherche (Ctrl K ou ⌘ K), Échap et les flèches restent.
 */

/* ───────────── Portées ───────────── */

export type PorteeRaccourci =
  | 'partout' | 'aller' | 'fenetres' | 'recherche' | 'menus'
  | 'veille-detail' | 'bibliotheque-apercu' | 'ce-qui-scale' | 'editeur' | 'canvas' | 'mentions';

export interface DefPortee {
  cle: PorteeRaccourci;
  libelle: string;
  /** Globale · active sur tout écran · recouvre donc toutes les autres portées. */
  globale: boolean;
}

/** L'ordre de l'aide · d'abord ce qui marche partout, puis chaque écran. */
export const PORTEES_RACCOURCIS: readonly DefPortee[] = [
  { cle: 'partout', libelle: 'Partout', globale: true },
  { cle: 'aller', libelle: 'Aller à', globale: true },
  { cle: 'fenetres', libelle: 'Fenêtres, panneaux et menus', globale: false },
  { cle: 'recherche', libelle: 'Dans la recherche', globale: false },
  { cle: 'menus', libelle: 'Menu d’un fichier (Bibliothèque)', globale: false },
  { cle: 'veille-detail', libelle: 'Détail d’une pub (Veille)', globale: false },
  { cle: 'bibliotheque-apercu', libelle: 'Aperçu complet d’un fichier (Bibliothèque)', globale: false },
  { cle: 'ce-qui-scale', libelle: 'Ce qui scale (Veille)', globale: false },
  { cle: 'editeur', libelle: 'Éditeur de créa', globale: false },
  { cle: 'canvas', libelle: 'Canvas du projet', globale: false },
  { cle: 'mentions', libelle: 'Mentions dans un commentaire', globale: false },
];

/* ───────────── Actions de la coquille ───────────── */

export type ActionRaccourci =
  | { type: 'palette' }
  | { type: 'aide' }
  | { type: 'jarvis' }
  | { type: 'rail' }
  /** Une section du rail · la destination est celle de l'entrée du rail (droits compris). */
  | { type: 'aller'; section: SectionSpatiale }
  /** Une page d'action · `requis` doit être ouvert par les droits (comme la palette). */
  | { type: 'ouvrir'; href: string; requis: string };

/* ───────────── La table ───────────── */

/**
 * Un accord · `mod+k` (Ctrl sous Windows et Linux, ⌘ sous macOS), `mod+maj+z`,
 * `maj+ArrowLeft`, ou une touche seule (`j`, `?`, `[`, `ArrowLeft`, `Escape`).
 * Une lettre s'écrit en minuscule. Un signe s'écrit tel qu'il sort (`?`, `[`) ·
 * Maj ou AltGr qui servent à le former ne sont pas des modificateurs.
 */
export type Accord = string;
/** Une séquence · un accord, ou deux tapés l'un après l'autre (`['g', 'a']`). */
export type SequenceTouches = readonly Accord[];

export interface Raccourci {
  id: string;
  /** Les séquences qui déclenchent l'entrée · une ou plusieurs équivalentes. */
  touches: readonly SequenceTouches[];
  libelle: string;
  portee: PorteeRaccourci;
  /** L'action de la coquille · `null` = gérée par une vue (`sources`). */
  action: ActionRaccourci | null;
  /** Les fichiers qui gèrent l'entrée (sous `apps/web/spatial/`) · pour une entrée de vue. */
  sources?: readonly string[];
  /** Active même dans un champ de saisie · seule la recherche (comme avant ce lot). */
  dansSaisie?: boolean;
  /** N'agit que sur l'élément qui a le focus (canvas, surface de l'éditeur) · exempté de coupure (WCAG 2.1.4). */
  surFocus?: boolean;
}

const aller = (id: string, lettre: string, libelle: string, section: SectionSpatiale): Raccourci =>
  ({ id: `aller-${id}`, touches: [['g', lettre]], libelle, portee: 'aller', action: { type: 'aller', section } });

export const RACCOURCIS: readonly Raccourci[] = [
  /* Partout · la coquille. */
  { id: 'recherche', touches: [['mod+k']], libelle: 'Rechercher une page, un projet, une action', portee: 'partout', action: { type: 'palette' }, dansSaisie: true },
  { id: 'aide', touches: [['?']], libelle: 'Afficher les raccourcis clavier', portee: 'partout', action: { type: 'aide' } },
  { id: 'jarvis', touches: [['j']], libelle: 'Demander à Jarvis sur cette page', portee: 'partout', action: { type: 'jarvis' } },
  { id: 'rail', touches: [['[']], libelle: 'Réduire ou déployer le menu', portee: 'partout', action: { type: 'rail' } },
  { id: 'nouveau-projet', touches: [['n']], libelle: 'Nouveau projet', portee: 'partout', action: { type: 'ouvrir', href: '/studio/projets/nouveau', requis: '/studio/projets' } },
  { id: 'importer', touches: [['i']], libelle: 'Importer des résultats', portee: 'partout', action: { type: 'ouvrir', href: '/adsmap/import', requis: '/adsmap/import' } },
  /* Aller à · « g » puis une lettre. */
  aller('accueil', 'a', 'Accueil', 'accueil'),
  aller('studios', 's', 'Studios', 'studios'),
  aller('veille', 'v', 'Veille', 'veille'),
  aller('resultats', 'r', 'Résultats', 'resultats'),
  aller('bibliotheque', 'b', 'Bibliothèque', 'bibliotheque'),
  aller('jarvis', 'j', 'Jarvis', 'jarvis'),
  aller('marque', 'm', 'Marque', 'marque'),
  /* Les vues · déjà en place, recensées (`TOUCHES_RECENSEES`). */
  {
    id: 'fermer', touches: [['Escape']], libelle: 'Fermer la fenêtre, le panneau ou le menu ouvert', portee: 'fenetres', action: null,
    sources: [
      'coquille/Coquille.tsx', 'vues/bibliotheque/Bibliotheque.tsx', 'vues/bibliotheque/apercu-complet.tsx', 'vues/bibliotheque/menu-fichier.tsx',
      'vues/formats/TousLesFormats.tsx', 'vues/marque/interactifs.tsx', 'vues/projet/ChampMentions.tsx', 'vues/projet/Editeur.tsx', 'vues/projet/Video.tsx',
      'vues/reglages/tags-client.tsx', 'vues/resultats/Suites.tsx', 'vues/studios/GrilleProjets.tsx', 'vues/studios/assistant/Panneaux.tsx',
      'vues/veille/client.tsx', 'vues/veille/sauvegarde-client.tsx', 'vues/veille/sauvegardes-client.tsx',
    ],
  },
  { id: 'recherche-choisir', touches: [['ArrowDown'], ['ArrowUp']], libelle: 'Choisir le résultat suivant ou précédent', portee: 'recherche', action: null, sources: ['coquille/Surcouches.tsx'] },
  { id: 'menu-parcourir', touches: [['ArrowDown'], ['ArrowUp'], ['Home'], ['End']], libelle: 'Parcourir le menu (premier, dernier)', portee: 'menus', action: null, sources: ['vues/bibliotheque/menu-fichier.tsx'] },
  { id: 'menu-sous-menu', touches: [['ArrowRight']], libelle: 'Ouvrir le sous-menu', portee: 'menus', action: null, sources: ['vues/bibliotheque/menu-fichier.tsx'] },
  { id: 'menu-retour', touches: [['ArrowLeft']], libelle: 'Revenir au menu', portee: 'menus', action: null, sources: ['vues/bibliotheque/menu-fichier.tsx'] },
  { id: 'veille-precedente', touches: [['ArrowLeft']], libelle: 'Pub précédente', portee: 'veille-detail', action: null, sources: ['vues/veille/client.tsx'] },
  { id: 'veille-suivante', touches: [['ArrowRight']], libelle: 'Pub suivante', portee: 'veille-detail', action: null, sources: ['vues/veille/client.tsx'] },
  { id: 'apercu-precedent', touches: [['ArrowLeft']], libelle: 'Fichier précédent', portee: 'bibliotheque-apercu', action: null, sources: ['vues/bibliotheque/apercu-complet.tsx'] },
  { id: 'apercu-suivant', touches: [['ArrowRight']], libelle: 'Fichier suivant', portee: 'bibliotheque-apercu', action: null, sources: ['vues/bibliotheque/apercu-complet.tsx'] },
  { id: 'scale-recherche', touches: [['/']], libelle: 'Aller au champ de recherche de la liste', portee: 'ce-qui-scale', action: null, sources: ['vues/veille/scale-client.tsx'] },
  { id: 'editeur-annuler', touches: [['mod+z']], libelle: 'Annuler', portee: 'editeur', action: null, sources: ['vues/projet/Editeur.tsx'] },
  { id: 'editeur-retablir', touches: [['mod+maj+z'], ['mod+y']], libelle: 'Rétablir', portee: 'editeur', action: null, sources: ['vues/projet/Editeur.tsx'] },
  { id: 'editeur-enregistrer', touches: [['mod+s']], libelle: 'Enregistrer', portee: 'editeur', action: null, sources: ['vues/projet/Editeur.tsx'] },
  { id: 'editeur-zoom-plus', touches: [['mod++'], ['mod+=']], libelle: 'Zoom avant', portee: 'editeur', action: null, sources: ['vues/projet/Editeur.tsx'] },
  { id: 'editeur-zoom-moins', touches: [['mod+-'], ['mod+_']], libelle: 'Zoom arrière', portee: 'editeur', action: null, sources: ['vues/projet/Editeur.tsx'] },
  { id: 'editeur-zoom-ajuster', touches: [['mod+0']], libelle: 'Ajuster à l’écran', portee: 'editeur', action: null, sources: ['vues/projet/Editeur.tsx'] },
  {
    id: 'editeur-deplacer', touches: [['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown']], libelle: 'Déplacer le calque choisi (avec Maj · par 10)',
    portee: 'editeur', action: null, sources: ['vues/projet/Editeur.tsx'], surFocus: true,
  },
  { id: 'editeur-deselectionner', touches: [['Escape']], libelle: 'Désélectionner le calque', portee: 'editeur', action: null, sources: ['vues/projet/Editeur.tsx'], surFocus: true },
  { id: 'canvas-zoom-plus', touches: [['+'], ['=']], libelle: 'Zoom avant', portee: 'canvas', action: null, sources: ['vues/projet/CanvasLibre.tsx'], surFocus: true },
  { id: 'canvas-zoom-moins', touches: [['-']], libelle: 'Zoom arrière', portee: 'canvas', action: null, sources: ['vues/projet/CanvasLibre.tsx'], surFocus: true },
  { id: 'canvas-ajuster', touches: [['0']], libelle: 'Ajuster à l’écran', portee: 'canvas', action: null, sources: ['vues/projet/CanvasLibre.tsx'], surFocus: true },
  {
    id: 'canvas-deplacer', touches: [['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown']], libelle: 'Déplacer la carte choisie (avec Maj · grand pas)',
    portee: 'canvas', action: null, sources: ['vues/projet/CanvasLibre.tsx'], surFocus: true,
  },
  /* Les mentions d'un commentaire (fiche projet, onglet Activité) · liste ouverte par « @ » · Entrée choisit (touche de composant), Échap ferme (« fermer »). */
  { id: 'mention-choisir', touches: [['ArrowDown'], ['ArrowUp']], libelle: 'Choisir le membre suivant ou précédent', portee: 'mentions', action: null, sources: ['vues/projet/ChampMentions.tsx'], surFocus: true },
];

/**
 * Le RECENSEMENT des touches lues par le code des vues, par fichier (sous
 * `apps/web/spatial/`), fait par motif sur `main` (dbdb7d0, 10/11/2026) puis
 * complété par ce lot (`coquille/Raccourcis.tsx`) · `.key === '…'`,
 * `.key !== '…'`, `key.toLowerCase() === '…'`, `k === '…'` après
 * `e.key.toLowerCase()`, tables `ArrowLeft: …`, et les règles du noyau appelées
 * (`REGLES_CLAVIER`). La garde web refait ce recensement à chaque passage et
 * échoue s'il change · une touche nouvelle doit entrer ici ET dans `RACCOURCIS`
 * (ou être une touche de composant, `TOUCHES_DE_COMPOSANT`).
 *
 * Ce qu'il a trouvé (24 fichiers) ·
 *
 * | fichier | touches |
 * | --- | --- |
 * | coquille/Coquille.tsx | Échap (la lettre « k » de Ctrl K passe désormais par la table) |
 * | coquille/Surcouches.tsx | ↑ ↓ Entrée (palette) |
 * | coquille/Raccourcis.tsx | Tab (fenêtre d'aide · Échap passe par la coquille) |
 * | vues/bibliotheque/Bibliotheque.tsx | Échap |
 * | vues/bibliotheque/menu-fichier.tsx | Échap Tab ← → ↓ (+ ↑ ↓ Début Fin par `focusMenuSuivant`) |
 * | vues/coquille/ParcoursAccueil.tsx | Entrée |
 * | vues/formats/TousLesFormats.tsx | Échap |
 * | vues/marque/interactifs.tsx | Échap |
 * | vues/projet/CanvasLibre.tsx | + = - 0 ← → ↑ ↓ |
 * | vues/projet/ChampMentions.tsx | ↑ ↓ Entrée Échap (liste des mentions · ajouté par le lot des mentions) |
 * | vues/projet/Editeur.tsx | Échap Tab ← → ↑ ↓, Ctrl s z y (+ Ctrl + = - _ 0 par `raccourciZoom`) |
 * | vues/projet/PanneauJarvis.tsx | Entrée |
 * | vues/projet/Video.tsx | Échap |
 * | vues/reglages/interactifs.tsx | Entrée Espace |
 * | vues/reglages/tags-client.tsx | Échap Tab |
 * | vues/resultats/Importer.tsx | Entrée Espace |
 * | vues/resultats/Suites.tsx | Échap |
 * | vues/studios/GrilleProjets.tsx | Échap |
 * | vues/studios/NouveauConcept.tsx | Entrée |
 * | vues/studios/NouveauProjet.tsx | Entrée Espace |
 * | vues/studios/assistant/Panneaux.tsx | Échap Tab |
 * | vues/bibliotheque/apercu-complet.tsx | Échap ← → (lot 12 · même règle `toucheNavigationDetail` que la Veille) |
 * | vues/veille/client.tsx | Échap (+ ← → par `toucheNavigationDetail`) |
 * | vues/veille/sauvegarde-client.tsx | Échap Tab Entrée |
 * | vues/veille/sauvegardes-client.tsx | Échap |
 * | vues/veille/scale-client.tsx | / |
 *
 * Aucune lettre seule, aucun « ? », aucun « [ » · la touche J n'existait nulle
 * part (ni la coquille, ni le tiroir, ni la page Jarvis). Le « / » est pris par
 * Ce qui scale (recherche de la liste) · la coquille ne le prend donc pas, sa
 * recherche reste Ctrl K ou ⌘ K (CA H04, partiel).
 */
export const TOUCHES_RECENSEES: Readonly<Record<string, readonly string[]>> = {
  'coquille/Coquille.tsx': ['Escape'],
  'coquille/Raccourcis.tsx': ['Tab'],
  'coquille/Surcouches.tsx': ['ArrowDown', 'ArrowUp', 'Enter'],
  'vues/bibliotheque/Bibliotheque.tsx': ['Escape'],
  'vues/bibliotheque/apercu-complet.tsx': ['ArrowLeft', 'ArrowRight', 'Escape'],
  'vues/bibliotheque/menu-fichier.tsx': ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Escape', 'Home', 'Tab'],
  'vues/coquille/ParcoursAccueil.tsx': ['Enter'],
  'vues/formats/TousLesFormats.tsx': ['Escape'],
  'vues/marque/interactifs.tsx': ['Escape'],
  'vues/projet/CanvasLibre.tsx': ['+', '-', '0', '=', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'],
  'vues/projet/ChampMentions.tsx': ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'],
  'vues/projet/Editeur.tsx': ['+', '-', '0', '=', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Escape', 'Tab', '_', 's', 'y', 'z'],
  'vues/projet/PanneauJarvis.tsx': ['Enter'],
  'vues/projet/Video.tsx': ['Escape'],
  'vues/reglages/interactifs.tsx': [' ', 'Enter'],
  'vues/reglages/tags-client.tsx': ['Escape', 'Tab'],
  'vues/resultats/Importer.tsx': [' ', 'Enter'],
  'vues/resultats/Suites.tsx': ['Escape'],
  'vues/studios/GrilleProjets.tsx': ['Escape'],
  'vues/studios/NouveauConcept.tsx': ['Enter'],
  'vues/studios/NouveauProjet.tsx': [' ', 'Enter'],
  'vues/studios/assistant/Panneaux.tsx': ['Escape', 'Tab'],
  'vues/veille/client.tsx': ['ArrowLeft', 'ArrowRight', 'Escape'],
  'vues/veille/sauvegarde-client.tsx': ['Enter', 'Escape', 'Tab'],
  'vues/veille/sauvegardes-client.tsx': ['Escape'],
  'vues/veille/scale-client.tsx': ['/'],
};

/**
 * Les règles du noyau qui lisent une touche · appelées par une vue, elles
 * comptent pour ses touches. La garde du noyau rejoue chaque règle sur un jeu
 * de touches et vérifie qu'elle ne répond qu'à celles-ci.
 */
export const REGLES_CLAVIER: Readonly<Record<string, readonly string[]>> = {
  toucheNavigationDetail: ['ArrowLeft', 'ArrowRight'],
  raccourciZoom: ['+', '-', '0', '=', '_'],
  focusMenuSuivant: ['ArrowDown', 'ArrowUp', 'End', 'Home'],
};

/**
 * Les touches d'un composant (activer un bouton dessiné, valider un champ,
 * garder le focus dans une fenêtre) · le comportement attendu de tout
 * composant (motifs ARIA), pas un raccourci · hors de la table.
 */
export const TOUCHES_DE_COMPOSANT: ReadonlySet<string> = new Set(['Enter', ' ', 'Tab']);

/* ───────────── Accords et séquences ───────────── */

/** La touche d'un accord, sans ses modificateurs (`mod+maj+z` → `z`). */
export function toucheDeLAccord(a: Accord): string {
  if (a.length === 1) return a;
  const parts = a.split('+');
  // `mod++` · la touche est le « + » (dernier segment vide).
  return a.endsWith('++') ? '+' : parts[parts.length - 1]!;
}

const LETTRE = /^\p{L}$/u;

/** Un raccourci « à une touche » au sens de WCAG 2.1.4 · une lettre, un chiffre, un signe, sans Ctrl ni ⌘. */
export function accordUneTouche(a: Accord): boolean {
  return a.length === 1 || (!a.startsWith('mod+') && toucheDeLAccord(a).length === 1);
}

/** L'entrée exige-t-elle un moyen de la couper (WCAG 2.1.4) ? */
export function exigeCoupure(r: Raccourci): boolean {
  return !r.surFocus && r.touches.some((s) => s.some(accordUneTouche));
}

export interface FrappeClavier {
  key: string;
  ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean;
  /** Touche maintenue (répétition automatique). */
  repetee?: boolean;
  /** Une vue l'a déjà traitée (`defaultPrevented`). */
  dejaTraitee?: boolean;
}

/**
 * L'accord d'une frappe, au format de la table · `null` pour une touche seule
 * de modification. Une lettre · Ctrl ou ⌘ donnent `mod+`, Maj `maj+`, Alt
 * `alt+`. Un signe ou un chiffre · Maj et AltGr (Ctrl + Alt sous Windows) le
 * forment, ils ne comptent pas · seuls ⌘ ou Ctrl SANS Alt donnent `mod+`.
 * Une touche nommée (flèches, Échap) · chaque modificateur compte.
 */
export function accordDeLaFrappe(f: FrappeClavier): Accord | null {
  const k = f.key;
  if (!k || ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified'].includes(k)) return null;
  if (k.length === 1 && !LETTRE.test(k)) {
    const mod = !!f.metaKey || (!!f.ctrlKey && !f.altKey);
    return mod ? `mod+${k}` : k;
  }
  const pre = [
    f.ctrlKey || f.metaKey ? 'mod' : null,
    f.altKey ? 'alt' : null,
    f.shiftKey ? 'maj' : null,
  ].filter(Boolean).join('+');
  const touche = k.length === 1 ? k.toLowerCase() : k;
  return pre ? `${pre}+${touche}` : touche;
}

/** Les éléments où une touche appartient à la saisie ou au lecteur · la coquille ne la prend jamais. */
const BALISES_SAISIE = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO']);
const ROLES_SAISIE = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider']);

export interface CibleFrappe {
  tagName?: string;
  /** Élément éditable, ou dans une zone éditable (`contenteditable`). */
  editable?: boolean;
  role?: string | null;
  /** Dans un lecteur vidéo ou audio (ses commandes comprises). */
  dansLecteur?: boolean;
}

export function cibleDeSaisie(c: CibleFrappe | null | undefined): boolean {
  if (!c) return false;
  return BALISES_SAISIE.has((c.tagName ?? '').toUpperCase()) || !!c.editable || ROLES_SAISIE.has(c.role ?? '') || !!c.dansLecteur;
}

/**
 * Le délai entre les deux touches d'une séquence (« g » puis « a »). Pas une
 * mesure faite ici · l'ordre de grandeur des séquences « g puis lettre »
 * (Gmail, GitHub). Au-delà, « g » est oublié et la lettre suivante compte
 * seule. À ajuster sur le retour du propriétaire.
 */
export const DELAI_SEQUENCE_MS = 1500;

export interface PrefixeRaccourci { accord: Accord; depuis: number }

export interface ContexteFrappe {
  /** Préférence « Raccourcis à une touche » (cookie `tt_raccourcis`). */
  actifs: boolean;
  /** Une fenêtre modale est ouverte (`aria-modal`) · elle a la main. */
  modaleOuverte: boolean;
  /** La cible de la frappe. */
  cible?: CibleFrappe | null;
  /** La première touche d'une séquence en attente. */
  prefixe: PrefixeRaccourci | null;
  /** Horloge (ms) · injectée, les gardes la simulent. */
  maintenant: number;
}

export interface ResultatFrappe {
  /** L'entrée à exécuter · `null` sinon. */
  raccourci: Raccourci | null;
  /** La séquence en attente après cette frappe. */
  prefixe: PrefixeRaccourci | null;
  /** La frappe est prise · la coquille l'empêche d'aller plus loin. */
  empecher: boolean;
}

const RIEN: ResultatFrappe = { raccourci: null, prefixe: null, empecher: false };

/**
 * Ce qu'une frappe demande à la COQUILLE · seulement ses entrées (`action`
 * posée). Jamais dans une saisie (sauf `dansSaisie`), jamais sous une fenêtre
 * modale pour un raccourci à une touche, jamais coupé par la préférence pour
 * ce qui l'exige, jamais une frappe qu'une vue a déjà prise.
 */
export function raccourciDeLaFrappe(f: FrappeClavier, c: ContexteFrappe, table: readonly Raccourci[] = RACCOURCIS): ResultatFrappe {
  if (f.dejaTraitee || f.repetee) return RIEN;
  const accord = accordDeLaFrappe(f);
  if (!accord) return { ...RIEN, prefixe: c.prefixe };
  const saisie = cibleDeSaisie(c.cible);
  const permis = (r: Raccourci, s: SequenceTouches) => {
    if (saisie && !r.dansSaisie) return false;
    const uneTouche = s.some(accordUneTouche);
    if (uneTouche && (!c.actifs || c.modaleOuverte)) return false;
    return true;
  };
  const coquille = table.filter((r) => r.action);
  const prefixe = c.prefixe && c.maintenant - c.prefixe.depuis <= DELAI_SEQUENCE_MS ? c.prefixe : null;
  if (prefixe) {
    for (const r of coquille) {
      for (const s of r.touches) if (s.length === 2 && s[0] === prefixe.accord && s[1] === accord && permis(r, s)) return { raccourci: r, prefixe: null, empecher: true };
    }
    // Pas de suite connue · « g » est oublié, la frappe compte seule.
  }
  for (const r of coquille) {
    for (const s of r.touches) if (s.length === 1 && s[0] === accord && permis(r, s)) return { raccourci: r, prefixe: null, empecher: true };
  }
  const commence = coquille.some((r) => r.touches.some((s) => s.length === 2 && s[0] === accord && permis(r, s)));
  if (commence) return { raccourci: null, prefixe: { accord, depuis: c.maintenant }, empecher: true };
  return RIEN;
}

/* ───────────── Conflits ───────────── */

/** Deux portées se recouvrent · la même, ou l'une est globale. */
export function porteesSeRecouvrent(a: PorteeRaccourci, b: PorteeRaccourci): boolean {
  if (a === b) return true;
  const g = (p: PorteeRaccourci) => PORTEES_RACCOURCIS.find((x) => x.cle === p)?.globale ?? false;
  return g(a) || g(b);
}

export interface ConflitRaccourci { a: string; b: string; touches: string; raison: string }

/**
 * Les conflits de la table · mêmes touches dans des portées qui se recouvrent,
 * ou une touche seule qui est aussi le début d'une séquence (la séquence ne
 * pourrait jamais partir). Vide = aucune collision.
 */
export function conflitsRaccourcis(table: readonly Raccourci[] = RACCOURCIS): ConflitRaccourci[] {
  const out: ConflitRaccourci[] = [];
  const cle = (s: SequenceTouches) => s.join(' puis ');
  table.forEach((a, i) => {
    // Une même entrée ne répète pas une séquence.
    const vues = new Set<string>();
    for (const s of a.touches) {
      if (vues.has(cle(s))) out.push({ a: a.id, b: a.id, touches: cle(s), raison: 'séquence répétée dans la même entrée' });
      vues.add(cle(s));
    }
    for (const b of table.slice(i + 1)) {
      if (!porteesSeRecouvrent(a.portee, b.portee)) continue;
      for (const sa of a.touches) for (const sb of b.touches) {
        if (cle(sa) === cle(sb)) out.push({ a: a.id, b: b.id, touches: cle(sa), raison: `mêmes touches, portées « ${a.portee} » et « ${b.portee} »` });
        else if (sa.length === 1 && sb.length > 1 && sb[0] === sa[0]) out.push({ a: a.id, b: b.id, touches: cle(sa), raison: 'touche seule qui commence une séquence' });
        else if (sb.length === 1 && sa.length > 1 && sa[0] === sb[0]) out.push({ a: b.id, b: a.id, touches: cle(sb), raison: 'touche seule qui commence une séquence' });
      }
    }
  });
  return out;
}

/* ───────────── Préférence (cookie d'ergonomie) ───────────── */

/** Le cookie · court, sans donnée personnelle, lisible côté client (comme `tt_rail`). */
export const RACCOURCIS_COOKIE = 'tt_raccourcis';

/** Les raccourcis à une touche sont-ils actifs ? · seule la valeur « 0 » les coupe · absent ou inconnu = actifs. */
export function raccourcisActifsDepuisCookie(raw: string | null | undefined): boolean {
  return raw !== '0';
}

/** La valeur d'un cookie dans `document.cookie` (`a=1; b=2`) · `null` si absent. */
export function valeurCookie(chaine: string, nom: string): string | null {
  for (const morceau of chaine.split(';')) {
    const i = morceau.indexOf('=');
    if (i < 0) continue;
    if (morceau.slice(0, i).trim() === nom) return morceau.slice(i + 1).trim();
  }
  return null;
}

/** Les raccourcis à une touche sont-ils actifs, lu dans `document.cookie`. */
export function raccourcisActifs(cookies: string): boolean {
  return raccourcisActifsDepuisCookie(valeurCookie(cookies, RACCOURCIS_COOKIE));
}

/** La chaîne à poser dans `document.cookie` · un an, tout le site, `samesite=lax` (comme le rail). */
export function raccourcisCookieString(actifs: boolean): string {
  return `${RACCOURCIS_COOKIE}=${actifs ? '1' : '0'}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** L'annonce d'un changement de préférence (zone `role="status"`). */
export function annoncePreferenceRaccourcis(actifs: boolean): string {
  return actifs ? 'Raccourcis à une touche activés' : 'Raccourcis à une touche coupés · la recherche (Ctrl K ou ⌘ K) et Échap restent actifs';
}

/* ───────────── Aide (« ? ») ───────────── */

const NOMS_TOUCHES: Readonly<Record<string, string>> = {
  Escape: 'Échap', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Home: 'Début', End: 'Fin', Enter: 'Entrée', Tab: 'Tab', ' ': 'Espace', '-': '−',
};

/** Les touches à afficher pour un accord (`mod+maj+z` → `Ctrl`, `Maj`, `Z`). `mac` · ⌘ au lieu de Ctrl. */
export function touchesAffichees(a: Accord, mac = false): string[] {
  const t = toucheDeLAccord(a);
  const mods = a.length === 1 || !a.includes('+') ? [] : (a.endsWith('++') ? a.slice(0, -2) : a.slice(0, a.length - t.length - 1)).split('+').filter(Boolean);
  const nom = NOMS_TOUCHES[t] ?? (LETTRE.test(t) ? t.toUpperCase() : t);
  return [...mods.map((m) => (m === 'mod' ? (mac ? '⌘' : 'Ctrl') : m === 'maj' ? 'Maj' : m === 'alt' ? 'Alt' : m)), nom];
}

export interface LigneAideRaccourci {
  id: string;
  libelle: string;
  /** Les séquences, chacune une liste d'accords, chacun une liste de touches affichées. */
  sequences: string[][][];
}
export interface GroupeAideRaccourcis { portee: PorteeRaccourci; libelle: string; lignes: LigneAideRaccourci[] }

/** La fenêtre d'aide · TOUTE la table, groupée par portée, dans l'ordre des portées puis de la table. */
export function groupesAideRaccourcis(table: readonly Raccourci[] = RACCOURCIS, mac = false): GroupeAideRaccourcis[] {
  return PORTEES_RACCOURCIS.map((p) => ({
    portee: p.cle,
    libelle: p.libelle,
    lignes: table.filter((r) => r.portee === p.cle).map((r) => ({ id: r.id, libelle: r.libelle, sequences: r.touches.map((s) => s.map((a) => touchesAffichees(a, mac))) })),
  })).filter((g) => g.lignes.length > 0);
}

/** Le message quand l'action n'est pas ouverte à la personne (droits inchangés · rien n'est ouvert de plus). */
export function messageRaccourciIndisponible(r: Raccourci): string {
  return `${r.libelle} n’est pas ouvert à ton accès`;
}
