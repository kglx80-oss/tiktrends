/**
 * Studios · éditeur de calques · formats de document et polices fournies.
 *
 * Pur. Un document image naît d'un FORMAT (cahier 01 §4.4 point 9 : 1:1, 4:5,
 * 9:16). Le format vient du brief quand il le dit, sinon d'un défaut annoncé
 * comme tel à l'écran, jamais deviné en silence.
 *
 * ── Polices ─────────────────────────────────────────────────────────────────
 *
 * Cahier §11.1 : « Polices fournies/licenciées et mêmes métriques au rendu ».
 * Le produit embarque UNE famille licenciée, Liberation Sans (SIL OFL), en
 * deux graisses, déjà servie par `apps/web/public/fonts/` et utilisée par le
 * rendu des publicités (`lib/ad-fonts.ts`). L'éditeur ne propose qu'elle : une
 * police que le rendu final n'aurait pas donnerait un aperçu menteur. Une police
 * déjà déclarée dans un document (import) reste lisible et choisissable, mais
 * l'écran dit que son aperçu est approximatif.
 */

import type { DocumentStudio } from '../document';

export type FormatDocument = '1:1' | '4:5' | '9:16';

export interface DefinitionFormat {
  width: number;
  height: number;
  libelle: string;
}

/** 1080 de large · la largeur de sortie des trois placements visés (feed, carré, story). */
export const FORMATS_DOCUMENT: Readonly<Record<FormatDocument, DefinitionFormat>> = {
  '1:1': { width: 1080, height: 1080, libelle: 'Carré · 1:1' },
  '4:5': { width: 1080, height: 1350, libelle: 'Portrait · 4:5' },
  '9:16': { width: 1080, height: 1920, libelle: 'Vertical · 9:16' },
};
export const ORDRE_FORMATS: readonly FormatDocument[] = ['4:5', '1:1', '9:16'];

/**
 * Défaut quand le brief ne dit rien · 4:5, le cadre que le produit rend déjà
 * par défaut pour une publicité (`production-mode.ts`, `scene-framing.ts`).
 * L'écran annonce que c'est un défaut.
 */
export const FORMAT_PAR_DEFAUT: FormatDocument = '4:5';

export function estFormatDocument(x: unknown): x is FormatDocument {
  return x === '1:1' || x === '4:5' || x === '9:16';
}

const RATIO = /(?:^|[^\d])(1|4|9)\s*[:x×/]\s*(1|5|16)(?!\d)/i;
const MOTS: ReadonlyArray<[RegExp, FormatDocument]> = [
  [/(?:^|[^\p{L}])carr[ée]e?s?(?![\p{L}])/iu, '1:1'],
  [/(?:^|[^\p{L}])(story|stories|reels?|vertical)(?![\p{L}])/iu, '9:16'],
  [/(?:^|[^\p{L}])(portrait|feed)(?![\p{L}])/iu, '4:5'],
];

export interface FormatPropose {
  format: FormatDocument;
  /** Vrai si le brief l'a dit · faux = défaut, à annoncer comme tel. */
  depuisBrief: boolean;
  /** La ligne du brief qui l'a dit, telle quelle. */
  texte: string | null;
}

/** Lit les formats du brief (`BriefCanonique.formats`, texte libre) · le premier reconnu gagne. */
export function formatDepuisBrief(formats: readonly unknown[] | null | undefined): FormatPropose {
  for (const t of formats ?? []) {
    if (typeof t !== 'string') continue;
    const m = RATIO.exec(t);
    if (m) {
      const f = `${m[1]}:${m[2]}`;
      if (estFormatDocument(f)) return { format: f, depuisBrief: true, texte: t };
    }
    for (const [re, f] of MOTS) if (re.test(t)) return { format: f, depuisBrief: true, texte: t };
  }
  return { format: FORMAT_PAR_DEFAUT, depuisBrief: false, texte: null };
}

/* ─────────────────────────────── Polices ─────────────────────────────────── */

export interface PoliceEditeur {
  /** Identifiant stable, clé de `document.fonts`. */
  id: string;
  /** Nom complet de la fonte, écrit dans le document. */
  family: string;
  poids: 400 | 700;
  /** Fichier servi par l'application · même fichier que le rendu. */
  fichier: string;
  libelle: string;
}

export const POLICES_EDITEUR: readonly PoliceEditeur[] = [
  { id: 'sans', family: 'Liberation Sans', poids: 400, fichier: '/fonts/sans-400.ttf', libelle: 'Sans · normale' },
  { id: 'sans-gras', family: 'Liberation Sans Bold', poids: 700, fichier: '/fonts/sans-700.ttf', libelle: 'Sans · grasse' },
];
export const POLICE_PAR_DEFAUT = 'sans';

export function policeEditeur(id: string): PoliceEditeur | null {
  return POLICES_EDITEUR.find((p) => p.id === id) ?? null;
}

/* ─────────────────────────── Document initial ────────────────────────────── */

/**
 * Part de la largeur du document occupée par la photo produit posée à la
 * création · le scénario de recette IMG-05 (« produit à 55 % de la largeur »).
 * C'est un point de départ éditable, pas une règle de composition.
 */
export const PART_PRODUIT_INITIALE = 0.55;
export const ID_CALQUE_PRODUIT = 'produit';

export interface ProduitInitial {
  assetId: string;
  sourceWidth: number;
  sourceHeight: number;
  nom?: string;
}

/**
 * Taille d'un média à une part de la largeur du document, proportions de la
 * SOURCE conservées, arrondie au pixel · déterministe (même entrée, même sortie).
 */
export function tailleSelonLargeur(docWidth: number, part: number, sourceWidth: number, sourceHeight: number): { width: number; height: number } {
  const width = Math.max(1, Math.round(docWidth * part));
  const height = Math.max(1, Math.round((width * sourceHeight) / sourceWidth));
  return { width, height };
}

/** Le document vide d'un format · une police fournie déclarée, et la photo produit si on la donne. */
export function documentInitial(format: FormatDocument, o: { produit?: ProduitInitial | null } = {}): DocumentStudio {
  const f = FORMATS_DOCUMENT[format];
  const police = policeEditeur(POLICE_PAR_DEFAUT)!;
  const doc: DocumentStudio = {
    width: f.width, height: f.height, colorSpace: 'sRGB',
    layers: {},
    fonts: { [police.id]: { family: police.family, assetId: null } },
  };
  const p = o.produit;
  if (p) {
    const t = tailleSelonLargeur(f.width, PART_PRODUIT_INITIALE, p.sourceWidth, p.sourceHeight);
    doc.layers[ID_CALQUE_PRODUIT] = {
      id: ID_CALQUE_PRODUIT, kind: 'image', name: (p.nom ?? 'Photo produit').slice(0, 200) || 'Photo produit',
      visible: true, locked: false,
      x: Math.round((f.width - t.width) / 2), y: Math.round((f.height - t.height) / 2),
      width: t.width, height: t.height, rotationDeg: 0, opacity: 1, z: 0,
      assetId: p.assetId, sourceWidth: p.sourceWidth, sourceHeight: p.sourceHeight, mask: null,
    };
  }
  return doc;
}
