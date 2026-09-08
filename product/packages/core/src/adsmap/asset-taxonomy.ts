/**
 * ADSMAP · taxonomie d'analyse d'asset (agent A0, §8.2).
 *
 * Les colonnes `hookType`, `openingType`, `talent` et `lengthBucket` existent sur
 * `creatives` depuis le début, et la mémoire de Jarvis les lit déjà. Elles sont
 * vides · c'est ce qui sépare « le mécanisme listicle marche ici » de « les
 * accroches chiffrées gagnent 3 fois sur 8 tests concluants ».
 *
 * Ce fichier tient la liste FERMÉE des valeurs admises et la normalisation qui y
 * ramène. Il est pur, et c'est délibéré : une sortie d'IA laissée libre produit
 * `question`, `Question`, `interrogative`, `question directe` · quatre lignes
 * dans un tableau statistique qui devrait n'en avoir qu'une, et une statistique
 * qui ne conclut jamais faute d'effectif.
 */

export const HOOK_TYPES = [
  'question', 'statement', 'callout', 'number', 'negative', 'curiosity', 'demonstration', 'testimonial',
] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export const OPENING_TYPES = [
  'face_talking', 'product', 'problem_scene', 'text_on_screen', 'before_after', 'unboxing', 'b_roll',
] as const;
export type OpeningType = (typeof OPENING_TYPES)[number];

export const TALENTS = ['ugc_creator', 'founder', 'actor', 'customer', 'voice_over_only', 'none'] as const;
export type Talent = (typeof TALENTS)[number];

/** Libellés d'affichage · le tableau de Jarvis et les écrans lisent d'ici. */
export const HOOK_LABEL: Record<HookType, string> = {
  question: 'Question', statement: 'Affirmation', callout: 'Interpellation', number: 'Chiffre',
  negative: 'Négatif', curiosity: 'Curiosité', demonstration: 'Démonstration', testimonial: 'Témoignage',
};
export const OPENING_LABEL: Record<OpeningType, string> = {
  face_talking: 'Visage qui parle', product: 'Produit', problem_scene: 'Scène de problème',
  text_on_screen: 'Texte à l’écran', before_after: 'Avant / après', unboxing: 'Déballage', b_roll: 'Plans d’illustration',
};
export const TALENT_LABEL: Record<Talent, string> = {
  ugc_creator: 'Créateur UGC', founder: 'Fondateur', actor: 'Comédien', customer: 'Client',
  voice_over_only: 'Voix off seule', none: 'Personne à l’écran',
};

/* -------------------------------------------------------------------------- */
/*  Grammaire de mise en page · pubs STATIQUES                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ce que le mode « généré entièrement » a besoin d'apprendre du marché.
 *
 * La taxonomie ci-dessus décrit une créa VIDÉO · accroche parlée, ouverture,
 * personne à l'écran, durée. Elle ne dit rien de la grammaire d'une pub
 * STATIQUE : où se pose l'accroche, comment la scène est composée, combien de
 * texte, sur quel fond. Or c'est précisément ce qui fait qu'une pub concurrente
 * « a l'air d'une agence », et ce qu'on veut faire remonter à la direction
 * artistique de l'entière.
 *
 * Fermé, comme le reste · une sortie d'IA laissée libre produit dix variantes de
 * « accroche en haut » qui ne se comptent jamais ensemble. Les valeurs sont
 * choisies pour être MUTUELLEMENT EXCLUSIVES et reconnaissables d'un coup d'œil ·
 * c'est la condition pour qu'un taux veuille dire quelque chose.
 */

/** Où se pose l'accroche principale dans le cadre. */
export const HEADLINE_POSITIONS = ['top', 'center', 'bottom', 'none'] as const;
export type HeadlinePosition = (typeof HEADLINE_POSITIONS)[number];

/** L'archétype de composition · ce que la scène montre et comment. */
export const COMPOSITIONS = [
  'product_hero', 'lifestyle', 'before_after', 'comparison', 'text_card', 'packaging_closeup',
] as const;
export type Composition = (typeof COMPOSITIONS)[number];

/** Combien de texte publicitaire porte la pub. */
export const TEXT_DENSITIES = ['minimal', 'moderate', 'heavy'] as const;
export type TextDensity = (typeof TEXT_DENSITIES)[number];

/** Le registre du fond · décide du contraste et de l'ambiance. */
export const BACKGROUNDS = ['light', 'dark', 'vibrant'] as const;
export type Background = (typeof BACKGROUNDS)[number];

/**
 * Le registre TYPOGRAPHIQUE dominant · « la gestion des typo » de la charte.
 *
 * C'est la FAMILLE de caractère qui donne le ton, pas la police exacte (qu'on ne
 * peut ni lire de façon fiable, ni imposer au modèle). Fermé, mutuellement
 * exclusif.
 */
export const TYPO_REGISTERS = ['sans', 'serif', 'display', 'script', 'mixed'] as const;
export type TypoRegister = (typeof TYPO_REGISTERS)[number];

/**
 * La PALETTE · le caractère de la charte couleur, distinct du fond (qui ne dit
 * que clair/sombre/coloré). Ici c'est la RICHESSE et l'harmonie des couleurs de
 * marque · combien de teintes, et lesquelles.
 */
export const PALETTES = ['monochrome', 'duotone', 'pastel', 'vibrant', 'earthy'] as const;
export type Palette = (typeof PALETTES)[number];

export const HEADLINE_POSITION_LABEL: Record<HeadlinePosition, string> = {
  top: 'Accroche en haut', center: 'Accroche centrée', bottom: 'Accroche en bas', none: 'Pas d’accroche',
};
export const COMPOSITION_LABEL: Record<Composition, string> = {
  product_hero: 'Produit héros', lifestyle: 'Mise en situation', before_after: 'Avant / après',
  comparison: 'Comparatif', text_card: 'Carte typographique', packaging_closeup: 'Gros plan packaging',
};
export const TEXT_DENSITY_LABEL: Record<TextDensity, string> = {
  minimal: 'Texte minimal', moderate: 'Texte modéré', heavy: 'Texte dense',
};
export const BACKGROUND_LABEL: Record<Background, string> = {
  light: 'Fond clair', dark: 'Fond sombre', vibrant: 'Fond coloré',
};
export const TYPO_REGISTER_LABEL: Record<TypoRegister, string> = {
  sans: 'Sans serif', serif: 'Serif', display: 'Display / titrage',
  script: 'Manuscrite', mixed: 'Mixte',
};
export const PALETTE_LABEL: Record<Palette, string> = {
  monochrome: 'Monochrome', duotone: 'Deux tons', pastel: 'Pastel',
  vibrant: 'Saturée', earthy: 'Naturelle / terreuse',
};

/**
 * Synonymes fréquents dans les sorties d'IA · la liste vient de ce que le modèle
 * renvoie réellement quand on lui laisse la bride, pas d'une invention.
 */
const ALIASES: Record<string, string> = {
  interrogative: 'question', interrogation: 'question', hook_question: 'question',
  affirmation: 'statement', claim: 'statement', declaration: 'statement',
  direct_address: 'callout', callout_audience: 'callout', hey: 'callout',
  stat: 'number', statistic: 'number', figure: 'number', chiffre: 'number',
  warning: 'negative', mistake: 'negative', erreur: 'negative',
  teaser: 'curiosity', mystery: 'curiosity',
  demo: 'demonstration', showing: 'demonstration',
  review: 'testimonial', social_proof: 'testimonial',
  talking_head: 'face_talking', selfie: 'face_talking', ugc_face: 'face_talking',
  product_shot: 'product', packshot: 'product',
  // `problem` ne désigne une ouverture que parce que `normalize` est borné par la
  // liste admise · le même mot ne pourrait pas servir deux familles à la fois.
  problem: 'problem_scene', pain_point: 'problem_scene',
  text_overlay: 'text_on_screen', caption: 'text_on_screen', title_card: 'text_on_screen',
  transformation: 'before_after',
  unbox: 'unboxing',
  broll: 'b_roll', lifestyle: 'b_roll',
  creator: 'ugc_creator', influencer: 'ugc_creator', ugc: 'ugc_creator',
  owner: 'founder', ceo: 'founder',
  model: 'actor', talent: 'actor',
  client: 'customer', user: 'customer',
  voiceover: 'voice_over_only', vo: 'voice_over_only', narration: 'voice_over_only',
  aucun: 'none', nobody: 'none',
  // Grammaire de mise en page · synonymes fréquents des sorties d'IA.
  haut: 'top', top_third: 'top', upper: 'top',
  centre: 'center', middle: 'center', centered: 'center',
  bas: 'bottom', lower: 'bottom', bottom_third: 'bottom',
  hero: 'product_hero', product_shot_hero: 'product_hero', product_focus: 'product_hero',
  in_situ: 'lifestyle', in_use: 'lifestyle', scene: 'lifestyle',
  // `transformation` est déjà mappé plus haut sur before_after, valable pour la
  // composition comme pour l'ouverture · on ne le redéclare pas.
  avant_apres: 'before_after',
  versus: 'comparison', vs: 'comparison', side_by_side: 'comparison',
  typographic: 'text_card', text_only: 'text_card', quote_card: 'text_card',
  // `packshot` sert déjà l'ouverture (product) · pour le gros plan packaging on
  // s'appuie sur label_closeup et macro, sans clé en double.
  label_closeup: 'packaging_closeup', macro: 'packaging_closeup',
  clean: 'minimal', sparse: 'minimal',
  medium: 'moderate', balanced: 'moderate',
  dense: 'heavy', busy: 'heavy', text_heavy: 'heavy',
  clair: 'light', white: 'light', bright: 'light',
  sombre: 'dark', black: 'dark', moody: 'dark',
  colore: 'vibrant', colorful: 'vibrant', bold_color: 'vibrant', saturated: 'vibrant',
  // Charte · registre typographique (synonymes réels des sorties d'IA). `sans`,
  // `serif`, `display`, `script`, `mixed` sont déjà des valeurs directes.
  sans_serif: 'sans', grotesque: 'sans', geometric_sans: 'sans',
  slab: 'serif', slab_serif: 'serif', transitional: 'serif',
  headline_type: 'display', condensed: 'display', bold_display: 'display', titling: 'display',
  handwritten: 'script', cursive: 'script', brush: 'script', manuscrite: 'script',
  multiple: 'mixed', mix: 'mixed',
  // Charte · palette (`monochrome`, `duotone`, `pastel`, `vibrant`, `earthy` directs).
  mono: 'monochrome', single_colour: 'monochrome', single_color: 'monochrome', grayscale: 'monochrome', greyscale: 'monochrome',
  two_tone: 'duotone', two_colour: 'duotone', two_color: 'duotone',
  soft: 'pastel', muted: 'pastel', desaturated: 'pastel',
  natural: 'earthy', earth_tones: 'earthy', terreux: 'earthy', warm_tones: 'earthy',
};

const clef = (v: string) => v.trim().toLowerCase().replace(/[\s-]+/g, '_');

/**
 * Ramène une valeur libre dans la liste fermée, ou renvoie `null`.
 *
 * `null` plutôt qu'une valeur par défaut : « je ne sais pas » est une information,
 * et la ranger d'office dans la catégorie la plus fréquente fausserait toutes les
 * statistiques qui suivent, en silence.
 */
function normalize<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  if (!value) return null;
  const k = clef(value);
  if ((allowed as readonly string[]).includes(k)) return k as T;
  const alias = ALIASES[k];
  return alias && (allowed as readonly string[]).includes(alias) ? (alias as T) : null;
}

export const normalizeHookType = (v: string | null | undefined) => normalize(v, HOOK_TYPES);
export const normalizeOpeningType = (v: string | null | undefined) => normalize(v, OPENING_TYPES);
export const normalizeTalent = (v: string | null | undefined) => normalize(v, TALENTS);
export const normalizeHeadlinePosition = (v: string | null | undefined) => normalize(v, HEADLINE_POSITIONS);
export const normalizeComposition = (v: string | null | undefined) => normalize(v, COMPOSITIONS);
export const normalizeTextDensity = (v: string | null | undefined) => normalize(v, TEXT_DENSITIES);
export const normalizeBackground = (v: string | null | undefined) => normalize(v, BACKGROUNDS);
export const normalizeTypoRegister = (v: string | null | undefined) => normalize(v, TYPO_REGISTERS);
export const normalizePalette = (v: string | null | undefined) => normalize(v, PALETTES);

/** Brut de l'agent A0 · tout est optionnel, le modèle peut ne pas savoir. */
export interface RawAssetAnalysis {
  hookType?: string | null;
  openingType?: string | null;
  talent?: string | null;
  durationS?: number | null;
  hookSpoken?: string | null;
  claims?: string[];
  proofElements?: string[];
  productFirstSec?: number | null;
  ctaFirstSec?: number | null;
  cutsFirst10s?: number | null;
  hasCaptions?: boolean | null;
  confidence?: number | null;
  // Grammaire de mise en page · renseignée surtout pour les pubs statiques.
  headlinePosition?: string | null;
  composition?: string | null;
  textDensity?: string | null;
  background?: string | null;
  // Charte · registre typographique et palette.
  typoRegister?: string | null;
  palette?: string | null;
}

export interface AssetAnalysis {
  hookType: HookType | null;
  openingType: OpeningType | null;
  talent: Talent | null;
  durationS: number | null;
  hookSpoken: string | null;
  claims: string[];
  proofElements: string[];
  productFirstSec: number | null;
  ctaFirstSec: number | null;
  cutsFirst10s: number | null;
  hasCaptions: boolean | null;
  /** Grammaire de mise en page · `null` quand le modèle n'a pas su, ou hors sujet (vidéo). */
  headlinePosition: HeadlinePosition | null;
  composition: Composition | null;
  textDensity: TextDensity | null;
  background: Background | null;
  /** Charte · `null` quand le modèle n'a pas su. */
  typoRegister: TypoRegister | null;
  palette: Palette | null;
  /** Confiance déclarée, bornée à [0,1] · sous 0,5 l'écran invite à corriger. */
  confidence: number;
  /** Champs que le modèle a rendus mais qu'on n'a pas su ranger · affichés, pas devinés. */
  unmapped: string[];
}

const seconde = (v: unknown, max: number): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

const phrases = (xs: unknown, max: number): string[] =>
  Array.isArray(xs)
    ? xs.map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, max)
    : [];

/**
 * Range une sortie d'agent dans la taxonomie.
 *
 * Les durées absurdes sont écartées plutôt que corrigées : un modèle qui annonce
 * 4000 secondes sur une story de 15 s ne s'est pas trompé d'unité, il a halluciné ·
 * garder le chiffre en le divisant reviendrait à valider l'hallucination.
 */
export function normalizeAnalysis(raw: RawAssetAnalysis): AssetAnalysis {
  const unmapped: string[] = [];
  const hookType = normalizeHookType(raw.hookType);
  const openingType = normalizeOpeningType(raw.openingType);
  const talent = normalizeTalent(raw.talent);
  const headlinePosition = normalizeHeadlinePosition(raw.headlinePosition);
  const composition = normalizeComposition(raw.composition);
  const textDensity = normalizeTextDensity(raw.textDensity);
  const background = normalizeBackground(raw.background);
  const typoRegister = normalizeTypoRegister(raw.typoRegister);
  const palette = normalizePalette(raw.palette);
  if (raw.hookType && !hookType) unmapped.push(`accroche : ${raw.hookType}`);
  if (raw.openingType && !openingType) unmapped.push(`ouverture : ${raw.openingType}`);
  if (raw.talent && !talent) unmapped.push(`présence : ${raw.talent}`);
  if (raw.headlinePosition && !headlinePosition) unmapped.push(`position accroche : ${raw.headlinePosition}`);
  if (raw.composition && !composition) unmapped.push(`composition : ${raw.composition}`);
  if (raw.textDensity && !textDensity) unmapped.push(`densité texte : ${raw.textDensity}`);
  if (raw.background && !background) unmapped.push(`fond : ${raw.background}`);
  if (raw.typoRegister && !typoRegister) unmapped.push(`typographie : ${raw.typoRegister}`);
  if (raw.palette && !palette) unmapped.push(`palette : ${raw.palette}`);

  const conf = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
    ? Math.min(1, Math.max(0, raw.confidence))
    : 0.5;

  return {
    hookType, openingType, talent,
    headlinePosition, composition, textDensity, background,
    typoRegister, palette,
    durationS: seconde(raw.durationS, 900),
    hookSpoken: raw.hookSpoken?.replace(/\s+/g, ' ').trim().slice(0, 300) || null,
    claims: phrases(raw.claims, 8),
    proofElements: phrases(raw.proofElements, 8),
    productFirstSec: seconde(raw.productFirstSec, 900),
    ctaFirstSec: seconde(raw.ctaFirstSec, 900),
    cutsFirst10s: Number.isFinite(Number(raw.cutsFirst10s)) && Number(raw.cutsFirst10s) >= 0 && Number(raw.cutsFirst10s) <= 60
      ? Math.round(Number(raw.cutsFirst10s)) : null,
    hasCaptions: typeof raw.hasCaptions === 'boolean' ? raw.hasCaptions : null,
    confidence: conf,
    unmapped,
  };
}

/** Résumé d'une analyse, en une phrase · sert l'écran et le prompt de Jarvis. */
export function summarizeAnalysis(a: AssetAnalysis): string {
  const bouts = [
    a.hookType ? `accroche ${HOOK_LABEL[a.hookType].toLowerCase()}` : null,
    a.openingType ? `ouverture ${OPENING_LABEL[a.openingType].toLowerCase()}` : null,
    a.talent ? TALENT_LABEL[a.talent].toLowerCase() : null,
    a.durationS !== null ? `${Math.round(a.durationS)} s` : null,
    // Grammaire de mise en page · surtout renseignée pour les pubs statiques.
    a.composition ? COMPOSITION_LABEL[a.composition].toLowerCase() : null,
    a.headlinePosition && a.headlinePosition !== 'none' ? HEADLINE_POSITION_LABEL[a.headlinePosition].toLowerCase() : null,
    a.textDensity ? TEXT_DENSITY_LABEL[a.textDensity].toLowerCase() : null,
    a.background ? BACKGROUND_LABEL[a.background].toLowerCase() : null,
    // Charte · typographie et palette.
    a.typoRegister ? `typo ${TYPO_REGISTER_LABEL[a.typoRegister].toLowerCase()}` : null,
    a.palette ? `palette ${PALETTE_LABEL[a.palette].toLowerCase()}` : null,
  ].filter(Boolean);
  if (!bouts.length) return 'Rien de reconnu dans cet asset · complète à la main.';
  const base = bouts.join(' · ');
  return a.confidence < 0.5 ? `${base} · analyse peu sûre, à vérifier.` : base;
}
