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

/* ═══════════════════════════════════════════════════════════════════════════
 * Bordures et rayons PAR RÔLE (lot 19D · tranche 2 du cadre commun)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Mesuré sur 37 routes à 1440 (build de production, `98fd2d64`) · 291 cadres
 * soumis à un rôle, 263 hors de leur rôle. Le même bloc de premier niveau
 * portait un rayon de 12, 13, 14, 16, 18, 20 ou 24 selon l'écran, et la
 * bordure des contrôles (`--line-2`, 20 %) sur des panneaux entiers :
 *
 *   | famille mesurée (avant)        | occurrences | routes |
 *   | ------------------------------ | ----------- | ------ |
 *   | --line r14                     | 94          | 8      |
 *   | --line r16                     | 43          | 15     |
 *   | --line-2 sur encart flottant   | 20          | 20     |
 *   | --line r18                     | 15          | 6      |
 *   | --line-2 r16 (cadre)           | 14          | 7      |
 *   | --line-2 r18 (cadre)           | 12          | 6      |
 *   | --line r10 (imbriqué)          | 9           | 1      |
 *   | pointillé --line-2 r16 (vide)  | 3           | 3      |
 *   | couleurs sémantiques r11 à r18 | 25          | 15     |
 *   | autres (r12, r13, r20 en 20 %) | 22          | —      |
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Un cadre prend la bordure et le rayon de son RÔLE, jamais un nombre choisi à
 * l'écran. Les valeurs sont celles de la charte (`packages/ui/tokens.css`) ·
 * `--line` 12 % pour les cadres, `--line-2` 20 % pour les contrôles,
 * `--r-card` 20 px pour les cartes, `--r-md` 12 px pour les petites cartes et
 * les boutons.
 *
 *  - `surface`  · bloc de premier niveau dans la page (panneau, section, carte
 *                 d'une grille principale, KPI de premier niveau).
 *  - `tuile`    · cadre IMBRIQUÉ dans une surface (sous-carte, ligne d'option,
 *                 KPI dans un panneau, encart d'aide), ou encart déplié par-dessus
 *                 la page depuis un contrôle (mode d'emploi).
 *  - `controle` · champ, sélecteur, barre de filtres, bouton secondaire · rayon
 *                 inchangé (r-md ou pilule).
 *  - `vide`     · état vide qui appelle un geste · pointillé `--line-2`.
 *  - `signal`   · alerte, succès, mise en avant · garde SA couleur sémantique,
 *                 prend le rayon de son niveau (surface 20, tuile 12).
 *
 * Ce qui n'est pas un cadre garde son rayon · image, avatar, pastille, puce,
 * pilule, bulle de conversation (coins asymétriques).
 */

/** Les rayons de la charte (`--r-card`, `--r-md`) · en px. */
export const RAYONS = { carte: 20, moyen: 12 } as const;

export type RoleCadre = 'surface' | 'tuile' | 'controle' | 'vide' | 'signal';

/** Ce que chaque rôle pose · trait, niveau de bordure, rayon. */
export const ROLES_CADRE: Readonly<Record<RoleCadre, {
  trait: 'solid' | 'dashed';
  /** `cadre` = --line (12 %), `controle` = --line-2 (20 %), `semantique` = la couleur du signal. */
  bordure: 'cadre' | 'controle' | 'semantique';
  /** `niveau` = celui de son niveau d'imbrication (signal) · `libre` = inchangé (contrôle). */
  rayon: 'carte' | 'moyen' | 'niveau' | 'libre';
  quoi: string;
}>> = {
  surface: { trait: 'solid', bordure: 'cadre', rayon: 'carte', quoi: 'bloc de premier niveau · panneau, section, carte de grille, KPI' },
  tuile: { trait: 'solid', bordure: 'cadre', rayon: 'moyen', quoi: 'cadre imbriqué · sous-carte, ligne d’option, KPI dans un panneau, encart déplié' },
  controle: { trait: 'solid', bordure: 'controle', rayon: 'libre', quoi: 'champ, sélecteur, barre de filtres, bouton secondaire' },
  vide: { trait: 'dashed', bordure: 'controle', rayon: 'carte', quoi: 'état vide qui appelle un geste' },
  signal: { trait: 'solid', bordure: 'semantique', rayon: 'niveau', quoi: 'alerte, succès, mise en avant · sa couleur' },
};

const VAR_BORDURE = { cadre: 'var(--line)', controle: 'var(--line-2)' } as const;
const VAR_RAYON = { carte: 'var(--r-card)', moyen: 'var(--r-md)' } as const;

/**
 * La bordure et le rayon d'un cadre neutre, écrits comme le style en ligne les
 * attend (jetons de la charte, pas de nombre). Les composants partagés
 * (`surface`, `tuile`, `vide`, `panel`) les lisent ici.
 */
export function styleCadre(role: 'surface' | 'tuile' | 'vide'): { border: string; borderRadius: string } {
  const r = ROLES_CADRE[role];
  return {
    border: `1px ${r.trait} ${VAR_BORDURE[r.bordure as 'cadre' | 'controle']}`,
    borderRadius: VAR_RAYON[r.rayon as 'carte' | 'moyen'],
  };
}

/** Le rayon d'un signal · celui de son niveau (surface 20, tuile 12). */
export function rayonSignal(niveau: 'surface' | 'tuile'): string {
  return niveau === 'surface' ? VAR_RAYON.carte : VAR_RAYON.moyen;
}

/**
 * Ce qu'on appelle un cadre quand on MESURE une page · une bordure égale sur
 * les quatre côtés, au moins 160 × 40 (repris de la mesure du lot 19 · en
 * dessous, ce sont des pastilles, puces et chips). Un lien ou un bouton reste
 * un contrôle jusqu'à 56 px de haut (bouton de 44 + marge) · plus haut, c'est
 * une carte cliquable, qui prend le rôle d'une carte.
 */
export const SEUILS_CADRE = { largeurMin: 160, hauteurMin: 40, hauteurControleMax: 56 } as const;

/**
 * Quand la forme ne suffit pas à dire le rôle (un champ composite comme le
 * Composer · zone de texte, puces de réglage et bouton dans un même cadre), le
 * cadre le DÉCLARE par cet attribut · la mesure le lit avant toute déduction.
 */
export const ATTRIBUT_ROLE_CADRE = 'data-cadre';

/** Ce que la mesure observe d'un cadre dans le DOM (rien d'autre). */
export interface CadreObserve {
  /** Champ, ou lien/bouton à hauteur de bouton, ou enveloppe courte d'un champ. */
  controle: boolean;
  /** Image/vidéo, ou enveloppe d'un seul média qui la remplit. */
  media: boolean;
  /** Rayon ≥ moitié de la hauteur. */
  pilule: boolean;
  /** Coins inégaux (bulle de conversation, onglet attaché). */
  forme: boolean;
  /** Posé par-dessus la page (position absolue ou fixe). */
  flottant: boolean;
  /** Bordure blanche translucide (pas une couleur sémantique). */
  neutre: boolean;
  pointille: boolean;
  /** Un ancêtre dans <main> porte lui-même une bordure. */
  imbrique: boolean;
}

export type ClasseCadre = RoleCadre | 'media' | 'pilule' | 'forme';

/** Le rôle d'un cadre, déduit de ce qu'on observe · la mesure et le code lisent la même règle. */
export function classerCadre(o: CadreObserve): ClasseCadre {
  if (o.controle) return 'controle';
  if (o.media) return 'media';
  if (o.pilule) return 'pilule';
  if (o.forme) return 'forme';
  if (!o.neutre) return 'signal';
  if (o.flottant) return 'tuile';
  if (o.pointille) return 'vide';
  return o.imbrique ? 'tuile' : 'surface';
}

/**
 * L'écart d'un cadre mesuré à son rôle · `null` s'il le tient. Le contrôle, le
 * média, la pilule et la forme ne sont pas jugés ici (rayons inchangés).
 */
export function ecartAuRole(
  classe: ClasseCadre,
  m: { imbrique: boolean; trait: string; alpha: number | null; rayon: number },
): string | null {
  if (classe === 'controle' || classe === 'media' || classe === 'pilule' || classe === 'forme') return null;
  const role = ROLES_CADRE[classe];
  const rayonAttendu = role.rayon === 'carte' ? RAYONS.carte
    : role.rayon === 'moyen' ? RAYONS.moyen
    : m.imbrique ? RAYONS.moyen : RAYONS.carte;
  const ecarts: string[] = [];
  if (m.trait !== role.trait) ecarts.push(`trait ${m.trait} ≠ ${role.trait}`);
  if (role.bordure !== 'semantique') {
    const alpha = BORDURES[role.bordure];
    if (m.alpha == null || Math.abs(m.alpha - alpha) > 0.005) ecarts.push(`bordure ${m.alpha} ≠ ${alpha}`);
  }
  if (m.rayon !== rayonAttendu) ecarts.push(`rayon ${m.rayon} ≠ ${rayonAttendu}`);
  return ecarts.length ? `${classe} · ${ecarts.join(' · ')}` : null;
}
