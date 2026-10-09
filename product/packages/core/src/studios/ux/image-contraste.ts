/**
 * L8-A · contraste des écrans image, produit, textes et éditeur (cahier §153,
 * exigence UX-01 « contraste vérifié pour texte et contrôles »).
 *
 * Règle pure : le rapport de contraste WCAG 2.x entre deux couleurs sRGB, et
 * le tableau MESURÉ des paires jeton de texte × jeton de fond réellement
 * posées par ces écrans (styles en ligne sur les jetons de `tokens.css`). Le
 * tableau n'est pas écrit de tête : chaque ratio a été calculé par
 * `ratioContraste` sur les valeurs du fichier de jetons, puis recopié ici ; la
 * garde (`packages/core/test/l8a-contraste.test.ts`) relit `tokens.css`,
 * recalcule et refuse un écart ou une paire sous son seuil.
 *
 * Mesures au navigateur (inventaire L8-A, 1280/1440/390 × 720, zone `main`
 * et dialogues ouverts, contrôles inactifs exemptés comme le permet WCAG
 * 1.4.3) : aucune paire sous le seuil. La plus basse est `--info` sur
 * `--paper` (4,54) · elle n'a donc aucune marge et ne doit pas descendre.
 */

/** Seuils AA · texte courant, et texte « grand » (≥ 24 px, ou ≥ 18,66 px gras). */
export const SEUIL_AA_TEXTE = 4.5;
export const SEUIL_AA_GRAND_TEXTE = 3;

/** Les jetons de couleur de la charte, tels que `packages/ui/tokens.css` les définit. */
export const JETONS_COULEUR = {
  ink: '#f6eef4', 'ink-2': '#cbbcc7', muted: '#9a8a98', 'accent-strong': '#ff5c8a',
  ok: '#18cc8c', warn: '#f5a623', err: '#ff4d6d', info: '#3b82f6',
  bg: '#120810', surface: '#1c121b', rail: '#0d070c', paper: '#2a1826', 'accent-soft': '#2a1320', 'on-accent': '#120810',
} as const;
export type JetonCouleur = keyof typeof JETONS_COULEUR;

/** Les deux arrêts du dégradé d'accent (`--grad-accent`) · un texte posé dessus est jugé sur le PIRE arrêt. */
export const ARRETS_DEGRADE_ACCENT = ['#fe2c55', '#ff2d8f'] as const;

function canal(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative WCAG d'une couleur `#rrggbb`. */
export function luminanceRelative(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`couleur #rrggbb attendue : ${hex}`);
  const n = parseInt(m[1]!, 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

/** Rapport de contraste WCAG (1 à 21), arrondi au centième. */
export function ratioContraste(a: string, b: string): number {
  const [x, y] = [luminanceRelative(a), luminanceRelative(b)].sort((p, q) => q - p) as [number, number];
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

export interface PaireMesuree { texte: JetonCouleur; fond: JetonCouleur | 'grad-accent'; ratio: number; usage: string }

/**
 * Paires posées par les écrans L8-A, ratio MESURÉ (pire arrêt pour le
 * dégradé). L'ordre suit l'usage, du texte courant aux statuts.
 */
export const PAIRES_TEXTE_MESUREES: readonly PaireMesuree[] = [
  { texte: 'ink', fond: 'surface', ratio: 16.02, usage: 'texte principal des panneaux' },
  { texte: 'ink', fond: 'bg', ratio: 17.28, usage: 'texte des cartes et du panneau plein écran' },
  { texte: 'ink', fond: 'accent-soft', ratio: 15.22, usage: 'nom du calque choisi' },
  { texte: 'ink-2', fond: 'surface', ratio: 10.03, usage: 'texte secondaire, étiquettes de champ' },
  { texte: 'ink-2', fond: 'rail', ratio: 10.98, usage: 'texte des champs et des signaux' },
  { texte: 'muted', fond: 'surface', ratio: 5.61, usage: 'légendes, aides, coûts' },
  { texte: 'muted', fond: 'bg', ratio: 6.05, usage: 'légendes dans les cartes' },
  { texte: 'muted', fond: 'rail', ratio: 6.14, usage: 'légendes dans les signaux' },
  { texte: 'muted', fond: 'paper', ratio: 5.14, usage: 'légendes des blocs de propriétés' },
  { texte: 'muted', fond: 'accent-soft', ratio: 5.33, usage: 'type du calque choisi' },
  { texte: 'accent-strong', fond: 'surface', ratio: 6.21, usage: 'lien de retour, onglet choisi' },
  { texte: 'accent-strong', fond: 'bg', ratio: 6.7, usage: 'lien dans une carte' },
  { texte: 'ok', fond: 'surface', ratio: 8.73, usage: 'statut « Enregistré »' },
  { texte: 'warn', fond: 'surface', ratio: 9, usage: 'statut « Modifications non enregistrées », « Indisponible »' },
  { texte: 'err', fond: 'surface', ratio: 5.67, usage: 'statut « Conflit », bouton « Supprimer »' },
  { texte: 'err', fond: 'paper', ratio: 5.2, usage: 'refus d’une opération dans les propriétés' },
  { texte: 'info', fond: 'surface', ratio: 4.96, usage: 'statut « Enregistrement… »' },
  { texte: 'info', fond: 'paper', ratio: 4.54, usage: 'statut en cours sur un bloc (aucune marge)' },
  { texte: 'on-accent', fond: 'grad-accent', ratio: 5.34, usage: 'libellé des boutons principaux' },
];

/** Ratio d'une paire, recalculé sur les jetons (le pire arrêt pour le dégradé). */
export function ratioPaire(p: Pick<PaireMesuree, 'texte' | 'fond'>): number {
  const t = JETONS_COULEUR[p.texte];
  if (p.fond === 'grad-accent') return Math.min(...ARRETS_DEGRADE_ACCENT.map((a) => ratioContraste(t, a)));
  return ratioContraste(t, JETONS_COULEUR[p.fond]);
}

/** Seuil applicable · texte grand (≥ 24 px, ou ≥ 18,66 px gras) ou courant. */
export function seuilContraste(taillePx: number, gras: boolean): number {
  return taillePx >= 24 || (gras && taillePx >= 18.66) ? SEUIL_AA_GRAND_TEXTE : SEUIL_AA_TEXTE;
}
