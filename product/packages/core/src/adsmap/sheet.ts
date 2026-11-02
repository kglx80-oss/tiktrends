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

/* -------------------------------------------------------------------------- */
/*  Injection de formule (CWE-1236)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Premiers caractères qui font ÉVALUER une cellule par Excel, LibreOffice ou
 * Google Sheets à l'ouverture d'un CSV (liste OWASP « CSV Injection »). Les
 * guillemets RFC 4180 n'y changent rien : `"=HYPERLINK(...)"` reste une formule.
 * Un apprentissage saisi par un membre, ou un lien importé par un admin, finit
 * ainsi exécuté chez un AUTRE utilisateur qui ouvre l'export (exfiltration des
 * cellules voisines par HYPERLINK, DDE sur les vieux Excel).
 */
export const DEBUTS_DE_FORMULE = ['=', '+', '-', '@', '\t', '\r'] as const;

/**
 * Formes de texte considérées NUMÉRIQUES · laissées telles quelles pour que le
 * tableur les lise comme des nombres (un `-12,5` préfixé deviendrait du texte).
 *
 * Mesuré sur `sheetNumber` (fr-FR, ICU de Node 22) :
 *
 * | entrée          | sortie            | points de code notables      |
 * | --------------- | ----------------- | ---------------------------- |
 * | -12.5           | `-12,5`           | signe U+002D, virgule        |
 * | 1234.567        | `1 234,57`        | groupe U+202F                |
 * | -1234567.891    | `-1 234 567,89`   | U+002D, U+202F               |
 * | -0.004          | `-0`              | zéro signé                   |
 * | 1e21            | `1 000 … 000`     | groupes U+202F, pas d'exposant |
 *
 * D'où la forme stricte : signe moins ASCII optionnel, chiffres (groupés par
 * trois avec U+202F, ou U+00A0 des ICU plus anciens, ou non groupés), décimales
 * après une virgule. Rien d'autre · `-1+1`, `-12.5`, `- 3` ou `-1e3` ne sont
 * pas numériques ici et sont neutralisés. Un `number` fini l'est d'office.
 */
export const NOMBRE_TABLEUR_FR = /^-?(?:\d{1,3}(?:[  ]\d{3})+|\d+)(?:,\d+)?$/;

/** Vrai si la valeur part au tableur comme un nombre (type, ou forme stricte). */
export function estNombreTableur(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  return typeof v === 'string' && NOMBRE_TABLEUR_FR.test(v);
}

/**
 * À neutraliser · un premier caractère de formule, éventuellement précédé
 * d'apostrophes. Les apostrophes de tête entrent dans le motif pour que la
 * neutralisation soit RÉVERSIBLE sans ambiguïté : `'=x` (texte saisi tel quel)
 * part en `''=x`, et l'import n'en retire qu'une.
 */
const CLASSE_FORMULE = `[${DEBUTS_DE_FORMULE.map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('')}]`;
const A_NEUTRALISER = new RegExp(`^'*${CLASSE_FORMULE}`);
/** Ce que la neutralisation produit · retiré à l'import, une seule fois. */
const NEUTRALISE = new RegExp(`^'+${CLASSE_FORMULE}`);

/**
 * Neutralise une valeur TEXTE qui commencerait par un caractère de formule en
 * la préfixant d'une apostrophe (le tableur l'affiche alors comme du texte).
 * Les nombres (`estNombreTableur`) passent intacts.
 */
export function neutraliserFormule(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (estNombreTableur(v)) return String(v);
  const s = String(v);
  return A_NEUTRALISER.test(s) ? `'${s}` : s;
}

/**
 * Inverse exact de `neutraliserFormule` sur toute chaîne · utilisé par l'import
 * pour qu'un export repris (directement ou via Sheets) redonne la valeur saisie.
 */
export function retirerNeutralisation(s: string): string {
  return NEUTRALISE.test(s) ? s.slice(1) : s;
}

export interface CelluleCsvOptions {
  /** Séparateur du fichier · le champ est entouré s'il le contient. `;` par défaut. */
  separateur?: string;
  /** Entourer chaque champ de guillemets, même sans caractère spécial. */
  toujoursEntourer?: boolean;
}

/**
 * LA cellule CSV du dépôt · tout export tableur passe par elle (garde
 * `apps/web/test/exports-csv-recensement.test.ts`).
 *
 * 1. neutralisation des formules (`neutraliserFormule`) ;
 * 2. échappement RFC 4180 : guillemets doublés, champ entouré dès qu'il contient
 *    le séparateur, un guillemet ou un saut de ligne.
 */
export function csvCell(v: unknown, opts: CelluleCsvOptions = {}): string {
  if (v === null || v === undefined) return '';
  const s = neutraliserFormule(v);
  const sep = opts.separateur ?? ';';
  return opts.toujoursEntourer || s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
    ...rows.map((r) => cols.map((c) => csvCell((r as Record<string, unknown>)[c], { separateur: sep })).join(sep)),
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
