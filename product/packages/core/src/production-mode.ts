/**
 * Deux façons de fabriquer une publicité, et ce que chacune garantit.
 *
 * ── Ce qu'on faisait, et son plafond ─────────────────────────────────────────
 *
 * On demandait une SCÈNE au modèle d'images, puis on posait la typographie
 * par-dessus en CSS. Le produit était donc fidèle — c'est sa photo qui sert de
 * référence — et le texte toujours net, puisque c'est nous qui l'écrivons.
 *
 * Le plafond est le compositeur. Il traduit un sous-ensemble de CSS en SVG : ni
 * masque, ni fusion, ni grain, ni détourage. On obtient une mise en page propre,
 * jamais une publicité qui a l'air fabriquée par une agence.
 *
 * ── Ce qu'on ajoute ──────────────────────────────────────────────────────────
 *
 * Le modèle produit la publicité ENTIÈRE, typographie comprise, à partir de la
 * photo du produit et de la copie écrite par Jarvis. C'est ce que fait
 * l'outil auquel on nous compare, et un essai côte à côte l'a montré meilleur
 * sur les trois points qui comptent : étiquette intacte, français juste, mise
 * en page publiable.
 *
 * ── Pourquoi les deux restent ────────────────────────────────────────────────
 *
 * Un modèle d'images écrit du texte *le plus souvent* juste. Pas toujours. La
 * composition, elle, ne peut pas se tromper sur une accroche : elle la recopie.
 *
 * Supprimer la composition échangerait donc une garantie contre une moyenne. On
 * garde les deux, et **chaque mode dit ce qu'il garantit** · c'est la seule
 * façon de choisir en connaissance de cause plutôt que par habitude.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export const PRODUCTION_MODES = ['composee', 'entiere'] as const;
export type ProductionMode = typeof PRODUCTION_MODES[number];

export const PRODUCTION_LABEL: Record<ProductionMode, string> = {
  composee: 'Composée',
  entiere: 'Générée entièrement',
};

/** Ce que le mode fait, en une phrase. */
export const PRODUCTION_RESUME: Record<ProductionMode, string> = {
  composee: 'Le modèle produit la scène, on pose les textes par-dessus.',
  entiere: 'Le modèle produit la publicité complète, typographie comprise.',
};

/** Ce que le mode GARANTIT · une promesse tenue à chaque fois. */
export function garanties(mode: ProductionMode): string[] {
  return mode === 'composee'
    ? ['Les textes sont exacts, toujours', 'La mise en page est prévisible', 'Le produit reste fidèle']
    : ['Le produit reste fidèle', 'Le rendu est celui d’une agence'];
}

/** Ce que le mode NE garantit PAS · dit d'avance, pas découvert après. */
export function reserves(mode: ProductionMode): string[] {
  return mode === 'composee'
    ? ['Le rendu reste sobre · le compositeur ne sait ni détourer, ni fusionner, ni texturer']
    : [
        'Le texte est écrit par le modèle · il se trompe parfois d’accent ou de lettre',
        'La mise en page varie d’une génération à l’autre',
      ];
}

/**
 * La composition pose-t-elle une couche de texte par-dessus ?
 *
 * C'est la seule question que la maquette a besoin de poser. Une publicité
 * entière porte déjà ses mots : lui superposer les nôtres les écrirait deux
 * fois, l'une sur l'autre.
 */
export function poseUneCouche(mode: ProductionMode | null | undefined): boolean {
  return mode !== 'entiere';
}

/**
 * Le texte est-il DANS l'image par construction ?
 *
 * Sert au contrôle des ratés de fabrication. « Du texte est cuit dans l'image »
 * est un défaut quand on comptait écrire par-dessus, et c'est exactement ce
 * qu'on a demandé dans l'autre mode · signaler l'un pour l'autre transformerait
 * la réussite en alerte, et l'écran perdrait sa crédibilité d'un coup.
 */
export function texteAttenduDansImage(mode: ProductionMode | null | undefined): boolean {
  return mode === 'entiere';
}

/**
 * La mise en page a-t-elle encore un sens ?
 *
 * En mode entier, c'est le modèle qui la décide · imposer une coquille, la faire
 * tourner ou l'essayer n'aurait aucun effet sur le rendu. Un réglage sans effet
 * est pire qu'un réglage absent : on croit avoir dirigé.
 */
export function coquilleUtile(mode: ProductionMode | null | undefined): boolean {
  return poseUneCouche(mode);
}

export function estMode(v: unknown): v is ProductionMode {
  return typeof v === 'string' && (PRODUCTION_MODES as readonly string[]).includes(v);
}

/* -------------------------------------------------------------------------- */
/*  La consigne de publicité entière                                           */
/* -------------------------------------------------------------------------- */

/** La copie à faire écrire par le modèle, dans l'image. */
export interface CopiePub {
  kicker?: string;
  headline: string;
  subhead?: string;
  benefits?: string[];
  cta?: string;
  badge?: string;
  brandName?: string;
}

/** Une ligne de consigne, ou rien · les vides ne se demandent pas. */
function ligne(role: string, texte?: string): string | null {
  const t = (texte ?? '').trim();
  return t ? `- ${role}: ${t}` : null;
}

/**
 * Ce qu'on demande au modèle pour une publicité complète.
 *
 * ── Trois exigences, dans cet ordre ──────────────────────────────────────────
 *
 * 1. **Le produit ne bouge pas.** C'est le seul point éliminatoire : une
 *    publicité qui déforme l'étiquette est inutilisable, quelle que soit sa
 *    beauté. La consigne nomme donc ce qu'il y a SUR l'étiquette plutôt que de
 *    dire « garde le produit », qu'un modèle interprète comme « garde l'idée ».
 * 2. **Les mots sont donnés, pas suggérés.** On liste les chaînes exactes. Un
 *    modèle à qui on décrit une accroche en invente une autre, et la copie
 *    écrite par Jarvis — celle qui porte l'angle, l'offre et la mémoire — serait
 *    remplacée par une phrase quelconque.
 * 3. **Le français est rappelé explicitement**, accents compris. C'est la faute
 *    la plus fréquente et la plus visible.
 *
 * ── Ce qu'on ne fait pas ─────────────────────────────────────────────────────
 *
 * On ne décrit pas une mise en page précise. Le modèle en compose une meilleure
 * que celle qu'on lui dicterait · c'est même la raison d'être de ce mode. On
 * fixe la hiérarchie, pas les coordonnées.
 */
export function promptPubEntiere(o: {
  copie: CopiePub;
  /** Le brief de scène écrit par Jarvis. */
  sceneBrief: string;
  /** Une photo du produit est fournie en référence. */
  avecProduit: boolean;
  /** Direction artistique demandée. */
  universPrompt?: string;
}): string {
  const c = o.copie;
  const textes = [
    ligne('eyebrow, small uppercase', c.kicker),
    ligne('HEADLINE, large and dominant', c.headline),
    ligne('supporting line', c.subhead),
    ...(c.benefits ?? []).slice(0, 3).map((b, i) => ligne(`bullet ${i + 1}, with a small check mark`, b)),
    ligne('call-to-action button', c.cta),
    ligne('offer badge', c.badge),
    ligne('brand wordmark, small', c.brandName),
  ].filter(Boolean).join('\n');

  const produit = o.avecProduit
    ? 'The provided image is the EXACT product. Reproduce it strictly identically: same packaging shape, same cap, same label artwork, same label text and its typography, same badges and logos, same colours, same real-world proportions. Do not redraw, restyle, translate or paraphrase anything printed on the packaging. The label must stay as sharp and legible as in the reference.'
    : 'No product photo is provided · invent nothing branded, and keep the composition centred on the scene.';

  const uni = o.universPrompt ? `Art direction: ${o.universPrompt}` : '';

  return [
    'Produce a COMPLETE, ready-to-publish 4:5 social media advertisement · not a bare photograph.',
    produit,
    `Scene: ${o.sceneBrief.slice(0, 600)}`,
    uni,
    'Render the advertising typography DIRECTLY INSIDE the image, integrated into the design.',
    'The copy below is FINAL · reproduce each string exactly, character for character, in FRENCH with all accents and apostrophes. Do not translate, rewrite, shorten or invent any wording.',
    textes,
    'Typographic hierarchy: the headline dominates the frame, the rest supports it. Clean modern performance-marketing art direction, high contrast, generous margins, crisp legible type at every size.',
    'Do NOT add any text that is not listed above.',
  ].filter(Boolean).join('\n\n');
}
