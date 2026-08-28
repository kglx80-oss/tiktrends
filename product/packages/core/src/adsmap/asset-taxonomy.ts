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
  if (raw.hookType && !hookType) unmapped.push(`accroche : ${raw.hookType}`);
  if (raw.openingType && !openingType) unmapped.push(`ouverture : ${raw.openingType}`);
  if (raw.talent && !talent) unmapped.push(`présence : ${raw.talent}`);

  const conf = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
    ? Math.min(1, Math.max(0, raw.confidence))
    : 0.5;

  return {
    hookType, openingType, talent,
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
  ].filter(Boolean);
  if (!bouts.length) return 'Rien de reconnu dans cet asset · complète à la main.';
  const base = bouts.join(' · ');
  return a.confidence < 0.5 ? `${base} · analyse peu sûre, à vérifier.` : base;
}
