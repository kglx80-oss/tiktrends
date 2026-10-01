/**
 * Le cadre extérieur des écrans · SOURCE UNIQUE (lot B2 · #118).
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Mesuré sur les 46 routes à 1440 (build de production, avant B2) · neuf
 * largeurs de cadre (700 à 1200), gouttières à 32 ou 36, et le titre de page
 * qui sautait de x=60 à x=234 d'un écran à l'autre. Jarvis, Veille, Accueil,
 * Adsmap et Pubs IA tenaient déjà la charte (1200, 32/16) · les autres avaient
 * dérivé chacun de son côté.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Tout écran de l'application pose le MÊME cadre extérieur · 1200 de large au
 * plus, centré, gouttières 32 en desktop qui descendent à 16 sur mobile. Le
 * titre de page tombe donc au même endroit partout.
 *
 * Un écran peut resserrer sa LECTURE à l'intérieur de ce cadre (formulaire,
 * conversation, liste à une colonne) · la colonne reste alignée à gauche sur le
 * bord du cadre, jamais recentrée (sinon le titre resaute). Ces exceptions sont
 * nommées ici, avec leur raison · une largeur intérieure hors de cette liste
 * est une dérive.
 *
 * Bordures · deux niveaux de la charte · `--line` (cadres, 12 %) et `--line-2`
 * (contrôles, 20 %). Les couleurs sémantiques (alerte, succès, accent) gardent
 * les leurs.
 *
 * Pur : ni base, ni réseau, ni DOM.
 */

export const CADRE_PAGE = {
  /** Largeur maximale du cadre extérieur, gouttières comprises. */
  largeurMax: 1200,
  /** Gouttière latérale en desktop. */
  gouttiereDesktop: 32,
  /** Gouttière latérale sur mobile (plancher de la gouttière fluide). */
  gouttiereMobile: 16,
  /** Respiration haute, sous la barre de l'application. */
  haut: 32,
  /** Respiration basse. */
  bas: 60,
} as const;

/** Les deux niveaux de bordure de la charte (alpha sur blanc). */
export const BORDURES = { cadre: 0.12, controle: 0.2 } as const;

/** Les largeurs de lecture admises À L'INTÉRIEUR du cadre. */
export const LECTURE = {
  /** Formulaire, réglages, fiche courte. */
  formulaire: 860,
  /** Conversation, fil de messages, état vide centré sur un message. */
  fil: 760,
} as const;

export type LectureInterieure = keyof typeof LECTURE;

/**
 * Les écrans dont la lecture est resserrée DANS le cadre, et pourquoi. Le cadre
 * extérieur, lui, reste le même · seul le contenu s'arrête plus tôt.
 */
export const EXCEPTIONS_LECTURE: Readonly<Record<string, { lecture: LectureInterieure; raison: string }>> = {
  '/profile': { lecture: 'formulaire', raison: 'formulaire de profil · des champs étirés sur 1136 se lisent mal' },
  '/settings': { lecture: 'formulaire', raison: 'réglages en formulaire' },
  '/support': { lecture: 'formulaire', raison: 'formulaire de demande et liste courte' },
  '/support/[id]': { lecture: 'fil', raison: 'fil de conversation · mesure de lecture' },
  '/brands/new': { lecture: 'formulaire', raison: 'formulaire de création de marque' },
  '/adsmap/protocole': { lecture: 'formulaire', raison: 'réglage du protocole en formulaire' },
  '/adsmap/import': { lecture: 'formulaire', raison: 'import en formulaire guidé' },
  // États sans accès ou sans marque · un message court, pas un écran de données.
  '/jarvis': { lecture: 'fil', raison: 'état sans marque · message court (le chat garde le cadre entier)' },
  '/jarvis/sources': { lecture: 'fil', raison: 'état sans marque · message court' },
  '/adsmap': { lecture: 'fil', raison: 'état sans accès ou sans marque · message court' },
};

/** La gouttière fluide, écrite comme le style en ligne l'attend. */
export function gouttiereCss(): string {
  return `clamp(${CADRE_PAGE.gouttiereMobile}px, 4vw, ${CADRE_PAGE.gouttiereDesktop}px)`;
}
