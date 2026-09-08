/**
 * La grammaire de mise en page qui GAGNE dans une catégorie.
 *
 * ── Le maillon qui fait pomper le poumon ─────────────────────────────────────
 *
 * #261 a posé la taxonomie de layout des pubs statiques concurrentes (position
 * de l'accroche, composition, densité de texte, fond). Décrire ne suffit pas ·
 * il faut en tirer ce qui REVIENT chez les gagnantes d'une catégorie, pour le
 * faire remonter à la direction artistique de l'entière. « 60 % des gagnantes de
 * ta catégorie posent l'accroche en haut » n'a de valeur que si on le mesure, et
 * qu'on ne le dit que quand c'est vrai.
 *
 * Ce module agrège une liste d'observations de layout en une grammaire · pour
 * chaque dimension, la valeur DOMINANTE, ou `null` quand rien ne domine.
 *
 * ── On ne conclut que sur un motif net ───────────────────────────────────────
 *
 * Deux barrières, la discipline du reste de la carte :
 *
 * 1. **Un minimum d'effectif** · sous `MIN_MARCHE` observations non nulles pour
 *    une dimension, on ne dit rien · quelques créas ne font pas une catégorie.
 * 2. **Une part majoritaire** · la valeur dominante ne compte que si elle
 *    dépasse `SEUIL_DOMINANT`. Une catégorie où quatre compositions se partagent
 *    le marché n'a pas de grammaire à imposer · le silence est la réponse, et
 *    c'est la plus fréquente.
 *
 * Comparer à une part plutôt qu'au simple « le plus fréquent » · avec six
 * compositions, la plus fréquente peut tenir 20 % et ne rien signifier. On
 * n'injecte une consigne que quand le marché a VRAIMENT tranché.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import type {
  HeadlinePosition, Composition, TextDensity, Background, TypoRegister, Palette,
} from './asset-taxonomy';
import {
  HEADLINE_POSITION_LABEL, COMPOSITION_LABEL, TEXT_DENSITY_LABEL, BACKGROUND_LABEL,
  TYPO_REGISTER_LABEL, PALETTE_LABEL,
} from './asset-taxonomy';

/** Une observation de layout et de charte · chaque dimension nullable. */
export interface ObservationLayout {
  headlinePosition: HeadlinePosition | null;
  composition: Composition | null;
  textDensity: TextDensity | null;
  background: Background | null;
  typoRegister: TypoRegister | null;
  palette: Palette | null;
}

export interface GrammaireLayout {
  headlinePosition: HeadlinePosition | null;
  composition: Composition | null;
  textDensity: TextDensity | null;
  background: Background | null;
  typoRegister: TypoRegister | null;
  palette: Palette | null;
  /** Observations agrégées · toutes dimensions confondues. */
  n: number;
}

/**
 * Combien d'observations non nulles avant qu'une dimension ait le droit de
 * parler. Douze · plus que le minimum des relectures (huit), parce qu'une
 * catégorie se juge sur plus de créas qu'une seule marque. Provisoire, à
 * mesurer une fois qu'un premier marché sera décrit · la structure tient, le
 * chiffre s'affinera.
 */
export const MIN_MARCHE = 12;

/**
 * Part minimale de la valeur dominante pour qu'on l'impose · une majorité
 * franche. Sous ce seuil, aucune valeur ne s'est détachée. Provisoire, même
 * raison que le minimum d'effectif.
 */
export const SEUIL_DOMINANT = 0.5;

/** La valeur dominante d'une dimension, ou `null` si rien ne domine assez. */
function dominante<T extends string>(valeurs: readonly (T | null)[]): T | null {
  const vues = valeurs.filter((v): v is T => v !== null);
  if (vues.length < MIN_MARCHE) return null;
  const comptes = new Map<T, number>();
  for (const v of vues) comptes.set(v, (comptes.get(v) ?? 0) + 1);
  let meilleure: T | null = null;
  let max = 0;
  for (const [v, c] of comptes) if (c > max) { max = c; meilleure = v; }
  // Strictement au-dessus · à 50/50 exact, aucune valeur ne s'est détachée.
  return meilleure !== null && max / vues.length > SEUIL_DOMINANT ? meilleure : null;
}

/** Ce que les gagnantes d'une catégorie ont en commun · `null` là où rien ne tranche. */
export function grammaireLayout(obs: readonly ObservationLayout[]): GrammaireLayout {
  return {
    headlinePosition: dominante(obs.map((o) => o.headlinePosition)),
    composition: dominante(obs.map((o) => o.composition)),
    textDensity: dominante(obs.map((o) => o.textDensity)),
    background: dominante(obs.map((o) => o.background)),
    typoRegister: dominante(obs.map((o) => o.typoRegister)),
    palette: dominante(obs.map((o) => o.palette)),
    n: obs.length,
  };
}

/* -------------------------------------------------------------------------- */
/*  Distiller la grammaire en consignes pour la génération entière             */
/* -------------------------------------------------------------------------- */

// Les consignes sont en anglais · c'est la langue de `promptPubEntiere`, où
// elles iront rejoindre la direction artistique. Chacune ne se pose que sur une
// dimension qui a tranché · une grammaire vide ne dit rien.
const HEADLINE_HINT: Record<HeadlinePosition, string> = {
  top: 'place the headline at the TOP of the frame',
  center: 'place the headline in the CENTER of the frame',
  bottom: 'place the headline at the BOTTOM of the frame',
  none: '', // « pas d'accroche » ne se prescrit pas · l'entière porte toujours des mots.
};
const COMPOSITION_HINT: Record<Composition, string> = {
  product_hero: 'a product-hero composition (the product large and central)',
  lifestyle: 'a lifestyle composition (the product in a real setting)',
  before_after: 'a before/after composition',
  comparison: 'a side-by-side comparison composition',
  text_card: 'a typographic card composition (type-led, minimal imagery)',
  packaging_closeup: 'a packaging close-up composition',
};
const DENSITY_HINT: Record<TextDensity, string> = {
  minimal: 'keep the on-image text MINIMAL',
  moderate: 'keep the on-image text MODERATE',
  heavy: '', // « dense » ne se prescrit pas · charger de texte dégrade la lisibilité, qu'on défend par ailleurs.
};
const BACKGROUND_HINT: Record<Background, string> = {
  light: 'use a LIGHT background',
  dark: 'use a DARK background',
  vibrant: 'use a VIBRANT, colourful background',
};
const TYPO_HINT: Record<TypoRegister, string> = {
  sans: 'set the type in a clean SANS-SERIF register',
  serif: 'set the type in a SERIF register',
  display: 'use a bold DISPLAY typeface for the headline',
  script: 'use a SCRIPT / handwritten register for accents',
  mixed: '', // « mixte » ne se prescrit pas · c'est l'absence de parti pris typographique.
};
const PALETTE_HINT: Record<Palette, string> = {
  monochrome: 'keep the palette MONOCHROME (a single hue)',
  duotone: 'use a DUOTONE palette (two colours)',
  pastel: 'use a soft PASTEL palette',
  vibrant: 'use a SATURATED, vivid palette',
  earthy: 'use an EARTHY, natural palette',
};

/**
 * Les consignes de layout à ajouter à la direction artistique de l'entière ·
 * vides quand la catégorie n'a pas de grammaire nette. Formulées comme une
 * tendance de marché à SUIVRE, pas une règle rigide · le modèle garde la main
 * sur la composition, on lui dit seulement ce qui gagne autour.
 */
export function briefLayout(g: GrammaireLayout): string[] {
  const parts = [
    g.headlinePosition ? HEADLINE_HINT[g.headlinePosition] : '',
    g.composition ? COMPOSITION_HINT[g.composition] : '',
    g.textDensity ? DENSITY_HINT[g.textDensity] : '',
    g.background ? BACKGROUND_HINT[g.background] : '',
    g.typoRegister ? TYPO_HINT[g.typoRegister] : '',
    g.palette ? PALETTE_HINT[g.palette] : '',
  ].filter(Boolean);
  if (!parts.length) return [];
  return [`In this product category, the ads that keep running tend to ${parts.join('; ')}. Lean that way unless the product demands otherwise.`];
}

/* -------------------------------------------------------------------------- */
/*  Rendre la grammaire LISIBLE · la carte d'identité de la catégorie          */
/* -------------------------------------------------------------------------- */

/** Une ligne lisible de la carte d'identité · un intitulé et sa valeur dominante. */
export interface LigneGrammaire {
  /** L'axe · « Accroche », « Composition », « Typo »… */
  axe: string;
  /** La valeur dominante, en clair · « Accroche en haut », « Serif »… */
  valeur: string;
}

/**
 * La grammaire en clair, pour l'afficher · une ligne par dimension qui a
 * tranché, dans la langue de l'interface. Vide quand rien ne domine · on ne
 * montre pas une carte d'identité à moitié devinée.
 *
 * On saute les valeurs qui ne se prescrivent pas non plus à la génération
 * (« pas d'accroche », « mixte ») · elles n'apprennent rien à montrer.
 */
export function resumeGrammaire(g: GrammaireLayout): LigneGrammaire[] {
  const lignes: LigneGrammaire[] = [];
  if (g.headlinePosition && g.headlinePosition !== 'none') lignes.push({ axe: 'Accroche', valeur: HEADLINE_POSITION_LABEL[g.headlinePosition] });
  if (g.composition) lignes.push({ axe: 'Composition', valeur: COMPOSITION_LABEL[g.composition] });
  if (g.textDensity) lignes.push({ axe: 'Texte', valeur: TEXT_DENSITY_LABEL[g.textDensity] });
  if (g.background) lignes.push({ axe: 'Fond', valeur: BACKGROUND_LABEL[g.background] });
  if (g.typoRegister && g.typoRegister !== 'mixed') lignes.push({ axe: 'Typo', valeur: TYPO_REGISTER_LABEL[g.typoRegister] });
  if (g.palette) lignes.push({ axe: 'Palette', valeur: PALETTE_LABEL[g.palette] });
  return lignes;
}
