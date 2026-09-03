/**
 * Les directions artistiques · ce qui manquait vraiment.
 *
 * ── L'écart, mesuré ──────────────────────────────────────────────────────────
 *
 * L'outil auquel on nous compare met en avant plus de mille gabarits, et
 * chacun porte le cadrage, la lumière, le style et la mise en page. Nous avions
 * huit « univers visuels », **une phrase chacun** :
 *
 *   « Dark cinematic scene, moody dramatic lighting, deep shadows. »
 *
 * C'était toute notre direction artistique. Un modèle d'images à qui on donne
 * une phrase rend une image plausible et générique · c'est exactement ce qu'on
 * obtenait, et ce qui a valu « on obtient toujours le même résultat ».
 *
 * ── Ce qui manquait le plus, et que personne ne disait ────────────────────────
 *
 * Depuis que le modèle produit la publicité ENTIÈRE, il choisit aussi la
 * typographie et la disposition. Or on ne lui en disait **rien**. Il inventait
 * donc les deux à chaque génération, et la mise en page changeait sans raison
 * d'une image à l'autre.
 *
 * Une direction complète tient en quatre fragments, et les quatre comptent :
 *
 * - **la scène** · où le produit se trouve, et ce qui l'entoure ;
 * - **la lumière** · nommée, pas « douce » ;
 * - **la typographie** · la famille, le poids, le traitement · c'est elle qui
 *   sépare une publicité conçue d'une photo avec des mots dessus ;
 * - **la disposition** · où la copie se pose par rapport au produit.
 *
 * ── Pourquoi on n'a pas remplacé les huit ────────────────────────────────────
 *
 * Leurs clés sont consignées dans les recettes déjà produites, et les essais
 * d'ambiance se cumulent dessus. Les renommer effacerait cet historique. Les
 * huit restent donc, enrichies · les nouvelles s'ajoutent.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export interface AdDirection {
  key: string;
  label: string;
  /** Ce que ça donne, en une ligne · pour choisir sans générer. */
  hint: string;
  /** Où le produit se trouve, et ce qui l'entoure. */
  scene: string;
  /** La lumière, nommée. */
  lumiere: string;
  /** Le registre typographique · absent, le modèle en invente un à chaque fois. */
  typo: string;
  /** Où la copie se pose par rapport au produit. */
  disposition: string;
  /** La finition · grain, contraste, étalonnage. */
  finition: string;
}

/**
 * Le catalogue.
 *
 * Les huit premières clés existaient déjà · elles gardent leur identifiant pour
 * que les publicités et les essais déjà mesurés continuent de compter.
 */
export const AD_DIRECTIONS: AdDirection[] = [
  {
    key: 'studio', label: 'Studio packshot',
    hint: 'Fond uni, produit centré, typographie en bandeau net.',
    scene: 'Clean studio packshot of the product on a seamless solid-colour backdrop drawn from the brand palette, no props, generous empty space around the product.',
    lumiere: 'Large softbox from the front-left with a subtle gradient falloff, a crisp contact shadow directly under the product, no coloured spill.',
    typo: 'Bold geometric grotesque sans-serif, tight tracking, two weights only · one heavy for the headline, one regular for everything else.',
    disposition: 'Headline occupying the upper third across the full width, product centred below it, a single pill-shaped button at the bottom.',
    finition: 'Neutral colour grading, high micro-contrast, no grain, e-commerce cleanliness.',
  },
  {
    key: 'lifestyle', label: 'Lifestyle capté',
    hint: 'Scène réelle, l’air d’une photo prise au téléphone.',
    scene: 'A real person using the product in an ordinary domestic setting, candid and unposed, the surroundings slightly cluttered as real life is.',
    lumiere: 'Natural window light, mildly uneven, a little clipping in the highlights as a phone camera would produce.',
    typo: 'Plain UI sans-serif at a modest size, the way a caption sits on a social post · never elegant, deliberately ordinary.',
    disposition: 'Copy confined to a narrow band at the very bottom, the scene left almost untouched above it.',
    finition: 'Slight handheld softness, natural skin tones, no colour grading.',
  },
  {
    key: 'editorial', label: 'Éditorial magazine',
    hint: 'Grande typographie à empattements, beaucoup de blanc.',
    scene: 'The product treated as a still-life object on a plain paper-toned surface, a single sculptural prop, considerable empty space.',
    lumiere: 'One hard directional source raking from the side, long clean shadows, deep falloff.',
    typo: 'Large high-contrast serif display face for the headline, small widely-tracked uppercase sans for the supporting lines · a fashion magazine cover.',
    disposition: 'Headline set very large across the top, running over two or three lines, the product small and low in the frame.',
    finition: 'Warm paper whites, restrained saturation, fine film grain.',
  },
  {
    key: 'nature', label: 'Nature organique',
    hint: 'Matières vivantes, lumière traversante, typographie fine.',
    scene: 'The product resting on stone, raw wood or linen, surrounded by fresh foliage and a few natural elements.',
    lumiere: 'Sunlight filtered through leaves, dappled shadows crossing the surface, warm and alive.',
    typo: 'Light-weight humanist sans-serif with open spacing, lowercase headline, nothing shouted.',
    disposition: 'Copy set into the calm empty area beside the product rather than over it, aligned to one side.',
    finition: 'Green and sand tones, soft contrast, gentle highlight roll-off.',
  },
  {
    key: 'bold', label: 'Aplat pop',
    hint: 'Blocs de couleur, typographie énorme, contraste maximal.',
    scene: 'The product cut out and placed over flat colour-blocked shapes built from the brand palette, geometric forms overlapping behind it.',
    lumiere: 'Flat frontal studio light with a hard-edged drop shadow, poster-like and graphic.',
    typo: 'Extra-bold condensed sans-serif at enormous size, tightly stacked lines, occasional word reversed out of a colour block.',
    disposition: 'Headline dominating more than half the frame, product overlapping the type, button as a solid rectangle.',
    finition: 'Saturated pure colours, zero grain, hard edges throughout.',
  },
  {
    key: 'cinematic', label: 'Nuit cinématique',
    hint: 'Sombre, contre-jour, typographie lumineuse.',
    scene: 'The product in a dark environment with atmosphere · haze, wet surfaces, distant out-of-focus lights.',
    lumiere: 'Strong rim light carving the product silhouette, a single cool key, everything else falling into deep shadow.',
    typo: 'Tall bright sans-serif in pure white with generous leading, small uppercase eyebrow above it.',
    disposition: 'Copy in the lower third over the darkest area, product upper-centre catching the rim light.',
    finition: 'Teal and amber grading, deep blacks, cinematic film grain.',
  },
  {
    key: 'flatlay', label: 'Vue du dessus',
    hint: 'À plat, objets rangés, typographie en grille.',
    scene: 'Perfect top-down view of the product surrounded by a few complementary objects arranged on a styled surface with visible order.',
    lumiere: 'Even diffuse daylight from above, shadows short and soft, no hotspots.',
    typo: 'Medium-weight sans-serif on a strict grid, labels and short lines rather than sentences.',
    disposition: 'Copy occupying one clean quadrant of the frame, the arrangement respecting its space.',
    finition: 'Bright airy exposure, muted pastel palette, minimal contrast.',
  },
  {
    key: 'energy', label: 'Énergie sport',
    hint: 'Mouvement, lumière dure, typographie en italique.',
    scene: 'An active outdoor or gym setting with a sense of motion · sweat, dust, movement blur behind a sharp product.',
    lumiere: 'Hard midday sun or a direct flash, punchy specular highlights, strong shadows.',
    typo: 'Heavy italic condensed sans-serif, uppercase, angled slightly, suggesting speed.',
    disposition: 'Headline crossing the frame diagonally or hard-left, product low-right, button tight under the headline.',
    finition: 'High contrast, boosted saturation, slight motion blur at the edges.',
  },

  /* ── Nouvelles · elles ouvrent des territoires que les huit ne couvraient pas ── */

  {
    key: 'preuve', label: 'Chiffre géant',
    hint: 'Un nombre occupe la moitié de l’image, le produit s’efface.',
    scene: 'A near-empty frame built around one number, the product small and precisely placed as the only other object.',
    lumiere: 'Flat even studio light on a plain ground · nothing competes with the figure.',
    typo: 'One enormous numeral filling a large part of the frame, a short caption beneath it in small uppercase, nothing else.',
    disposition: 'The number centred and dominant, the product tucked at the lower edge, caption directly under the figure.',
    finition: 'Two colours only · the brand accent and a neutral, hard edges, no texture.',
  },
  {
    key: 'temoignage', label: 'Témoignage',
    hint: 'Un visage, une citation en gros, le produit en second.',
    scene: 'A close portrait of an ordinary-looking person holding or beside the product, direct eye contact, a real interior behind them.',
    lumiere: 'Soft frontal light on the face, background gently underexposed, warm and human.',
    typo: 'Large quotation set in a readable sans-serif with visible quotation marks, a small attribution line under it.',
    disposition: 'Portrait on one half of the frame, quotation filling the other half, product small near the attribution.',
    finition: 'Natural skin tones, mild contrast, no stylisation.',
  },
  {
    key: 'comparatif', label: 'Comparatif',
    hint: 'Deux moitiés, deux étiquettes, un verdict évident.',
    scene: 'The frame split into two halves · a messy or dated alternative on one side, the product on the other, the same viewpoint on both.',
    lumiere: 'Duller flatter light on the left half, cleaner brighter light on the product half · the difference must read instantly.',
    typo: 'Short labels in small uppercase over each half, a single verdict line across the seam.',
    disposition: 'A clean vertical division at the centre, one label per half, verdict line and button at the bottom.',
    finition: 'Desaturated on one side, full colour on the other, sharp division.',
  },
  {
    key: 'promo', label: 'Promo assumée',
    hint: 'Pastille de prix, typographie criée, aucune subtilité.',
    scene: 'The product front and centre against a saturated flat ground, an angled sticker or burst shape overlapping it.',
    lumiere: 'Hard frontal light, glossy highlights, product looking freshly unboxed.',
    typo: 'Very heavy sans-serif shouting the offer, a rotated sticker carrying the figure, everything uppercase.',
    disposition: 'Offer sticker in an upper corner, product centred, headline and button stacked at the bottom.',
    finition: 'Loud brand colours, maximum contrast, poster energy.',
  },
  {
    key: 'main', label: 'En main',
    hint: 'Une main tient le produit · échelle et geste immédiats.',
    scene: 'A single hand holding or using the product, close in, the background thrown out of focus · scale and gesture read instantly.',
    lumiere: 'Soft daylight from one side, gentle falloff, believable skin and material.',
    typo: 'Clean medium-weight sans-serif, short lines, nothing decorative · the gesture carries the message.',
    disposition: 'Hand and product occupying the upper two thirds, copy in the calm blurred area below.',
    finition: 'Shallow depth of field, natural colours, subtle grain.',
  },
  {
    key: 'affiche', label: 'Affiche typographique',
    hint: 'Le texte est le sujet, l’image le soutient.',
    scene: 'A mostly typographic poster · the product appears as a small precise image at the bottom, everything above is type on a solid ground.',
    lumiere: 'Product photographed cleanly on a matching ground so it sits inside the poster rather than on top of it.',
    typo: 'Massive display type filling most of the frame, two or three lines, one word possibly in the accent colour.',
    disposition: 'Type occupying the top two thirds, a horizontal band of image at the bottom, button between the two.',
    finition: 'Flat paper-like ground, no gradients, print-poster feel.',
  },
];

const PAR_CLE = new Map(AD_DIRECTIONS.map((d) => [d.key, d]));

export function directionByKey(key?: string | null): AdDirection | null {
  return key ? PAR_CLE.get(key) ?? null : null;
}

/**
 * La direction, écrite pour le modèle.
 *
 * Les quatre fragments sont NOMMÉS dans la consigne. Fondus en un paragraphe,
 * ils se diluent · un modèle qui lit « Typography: … » traite la typographie
 * comme une instruction, pas comme une ambiance.
 */
export function directionPrompt(d: AdDirection): string {
  return [
    `Scene: ${d.scene}`,
    `Lighting: ${d.lumiere}`,
    `Typography: ${d.typo}`,
    `Layout: ${d.disposition}`,
    `Finish: ${d.finition}`,
  ].join('\n');
}

/**
 * La direction pour une SCÈNE seule · sans typographie ni disposition.
 *
 * En mode composé, c'est nous qui posons le texte : demander au modèle un
 * registre typographique lui ferait écrire des mots qu'on recouvrirait, et
 * dicter une disposition réserverait de la place à un texte qui n'ira pas là.
 */
export function directionScenePrompt(d: AdDirection): string {
  return [`Scene: ${d.scene}`, `Lighting: ${d.lumiere}`, `Finish: ${d.finition}`].join('\n');
}
