/**
 * ADSMAP · compatibilité descendante avec le Google Sheet (§2.3 principe 9).
 *
 * L'export doit rendre EXACTEMENT les 19 colonnes du tableur d'origine, dans le
 * même ordre. Ce n'est pas une coquetterie : c'est ce qui permet à l'équipe de
 * continuer à travailler dans son fichier pendant la bascule, et de revenir en
 * arrière sans rien perdre si ADSMAP ne convainc pas.
 *
 * Les colonnes calculées (verdict, intervalles, étape défaillante) viennent
 * APRÈS les 19, jamais entre : un fichier tronqué aux 19 premières colonnes reste
 * un Sheet valide.
 *
 * Pur : pas de base, pas de fichier. L'appelant fournit des lignes déjà résolues.
 */

/**
 * Les 19 colonnes du Sheet, dans l'ordre exact des trois blocs d'origine.
 *
 * Ce sont les intitulés RÉELS du fichier TrueFords, relevés dessus · ils diffèrent
 * de ceux décrits au §1.1 du cahier des charges (« Ad Variable » et non
 * « Variable », « Date de lancement » et non « Date », et une colonne d'hypothèse
 * dont l'intitulé est une phrase entière). Un export qui ne les reprend pas ne se
 * recolle pas au fichier d'origine, ce qui est tout l'objet de cette compatibilité.
 */
export const SHEET_COLUMNS = [
  // CRÉATION & STRATÉGIE
  'Status', 'BATCH #', 'Autheur', 'Ad Concept', '📎 Désire', '📎 Angle(s)', "Motif d'Iteration",
  "Que testez-vous et qu'est-ce qui vous donne confiance dans le fait que ce test améliorera les performances globales ?",
  // PRODUCTION & LIVRAISON
  'Ad Format', 'Ad Type', 'Lien du Brief créa', "Lien de l'Ad",
  // TEST & ANALYSE
  'Résultats', 'Apprentissages', 'Ad Variable', 'Test Result', 'Learnings', 'Date de lancement', 'Plateforme',
] as const;

/** Raccourcis lisibles vers les colonnes dont l'intitulé réel est verbeux. */
export const COL_HYPOTHESIS = SHEET_COLUMNS[7];
export const COL_DESIRE = SHEET_COLUMNS[4];
export const COL_ANGLE = SHEET_COLUMNS[5];

/** Colonnes ajoutées par ADSMAP · toujours après les 19 d'origine. */
export const COMPUTED_COLUMNS = [
  'Verdict calculé', 'Comparable', 'CPA', 'CPA borne haute', 'Étape défaillante',
  'Signal de coupe', 'Variante', 'Parent', 'Dépense', 'Achats',
] as const;

export type SheetColumn = (typeof SHEET_COLUMNS)[number];
export type ComputedColumn = (typeof COMPUTED_COLUMNS)[number];

/** Une ligne exportable · déjà résolue (libellés, pas d'identifiants). */
export interface SheetRow extends Partial<Record<SheetColumn | ComputedColumn, string | number | null | undefined>> {}

/**
 * Échappement CSV (RFC 4180) : guillemets doublés, champ entouré dès qu'il
 * contient un séparateur, un guillemet ou un saut de ligne.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvOptions {
  /** Point-virgule par défaut : c'est ce qu'attend Excel en configuration française. */
  delimiter?: string;
  /** Inclure les colonnes calculées après les 19 d'origine. */
  withComputed?: boolean;
  /** BOM UTF-8 · sans lui, Excel affiche « Ã© » à la place des accents. */
  bom?: boolean;
}

export function toCsv(rows: SheetRow[], opts: CsvOptions = {}): string {
  const sep = opts.delimiter ?? ';';
  const cols: readonly string[] = opts.withComputed
    ? [...SHEET_COLUMNS, ...COMPUTED_COLUMNS]
    : SHEET_COLUMNS;

  const lignes = [
    cols.join(sep),
    ...rows.map((r) => cols.map((c) => csvCell((r as Record<string, unknown>)[c])).join(sep)),
  ];
  // CRLF : les tableurs Windows en dépendent pour les champs multilignes.
  return (opts.bom === false ? '' : '﻿') + lignes.join('\r\n') + '\r\n';
}

/* -------------------------------------------------------------------------- */
/*  Traductions vers le vocabulaire du Sheet                                  */
/* -------------------------------------------------------------------------- */

/** Statut ADSMAP → vocabulaire du tableur d'origine. */
export const SHEET_STATUS: Record<string, string> = {
  draft: '', proposed: '', ready: 'Prête', live: 'Test en cours', paused: 'En pause', done: 'Terminé',
};

/** Verdict → la formulation que l'équipe employait déjà. */
export const SHEET_VERDICT: Record<string, string> = {
  winner: 'Winning Ad',
  baby_winner: 'Baby Wining',
  relative_winner: 'Baby Wining (relatif)',
  loser: 'Losing',
  inconclusive: 'Non concluant',
  insufficient_delivery: 'Sous-diffusée',
};

export const SHEET_STAGE: Record<string, string> = {
  hook: 'Accroche', hold: 'Rétention', click: 'Clic', convert: 'Conversion',
};

export const SHEET_VARIABLE: Record<string, string> = {
  hook: 'Hook', opening_visual: 'Visuel d’ouverture', body: 'Corps', length: 'Durée',
  cta: 'CTA', format: 'Format', offer: 'Offre', landing: 'Landing',
  avatar_on_screen: 'Personne à l’écran', proof: 'Preuve', audio: 'Audio',
  angle: 'Angle', desire: 'Désir', none_control: 'Aucune (contrôle)',
};

export const SHEET_FORMAT: Record<string, string> = {
  video_ugc: 'Vidéo UGC', video_vsl: 'Vidéo VSL', video_demo: 'Vidéo démo',
  video_story: 'Vidéo story', static: 'Statique', image_carousel: 'Carrousel', gif: 'GIF',
};

export const SHEET_AD_TYPE: Record<string, string> = {
  ideation: 'Idéation', iteration: 'Itération', imitation: 'Imitation', new: 'Nouveau',
};

/** Date au format français court, ou vide · jamais « Invalid Date ». */
export function sheetDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Nombre au format français, ou vide si absent · jamais « NaN » ni « null ». */
export function sheetNumber(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return n.toLocaleString('fr-FR', { maximumFractionDigits: digits });
}
