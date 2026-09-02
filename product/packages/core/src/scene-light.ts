/**
 * Le voile qui porte le texte, taillé sur la scène qu'il couvre.
 *
 * ── Ce qu'on faisait ─────────────────────────────────────────────────────────
 *
 * Le panneau bas de chaque publicité était peint en `rgba(8,8,11,.97)`, une
 * constante. Le bandeau du haut en `rgba(0,0,0,.6)`, une autre constante. Aucune
 * ne regardait l'image.
 *
 * Sur une scène déjà sombre, ce voile n'apportait rien et enterrait la photo
 * qu'on venait de payer · la moitié basse de la publicité était un rectangle
 * noir. Sur une scène claire, il tenait, mais par hasard.
 *
 * ── Ce qu'on fait ────────────────────────────────────────────────────────────
 *
 * On mesure la scène une fois (deux bandes, celles où le texte se pose), et on
 * en déduit l'opacité MINIMALE qui garantit encore la lisibilité. Pas plus.
 * Chaque point d'opacité en trop est de la photo perdue.
 *
 * ── Pourquoi le pic et non la moyenne ────────────────────────────────────────
 *
 * Une bande sombre en moyenne peut porter un reflet blanc. La moyenne dit que
 * tout va bien ; le mot qui traverse le reflet est illisible. On dimensionne
 * donc sur le neuvième décile de la bande · ce qui compte, c'est l'endroit le
 * plus clair sous le texte, pas l'endroit moyen.
 *
 * ── La composition se fait en sRGB ───────────────────────────────────────────
 *
 * Un moteur de rendu mélange les couleurs dans l'espace d'affichage, pas en
 * lumière linéaire. Le calcul suit donc le même chemin : on mélange en sRGB,
 * PUIS on linéarise pour juger du contraste. Faire l'inverse donnerait des
 * voiles systématiquement trop épais.
 *
 * Pur : ni image, ni réseau, ni modèle.
 */

/** Une bande mesurée · valeurs sRGB (encodées gamma), 0 = noir, 1 = blanc. */
export interface Bande {
  /** Gris moyen de la bande. */
  moyenne: number;
  /** Neuvième décile · l'endroit clair qui décide de la lisibilité. */
  pic: number;
}

/** Ce qu'on a relevé d'une scène. Deux bandes, celles que le texte occupe. */
export interface SceneLight {
  /** Haut de l'image · logo, badge, accroche de rappel. */
  haut: Bande;
  /** Bas de l'image · le panneau de copie. */
  bas: Bande;
}

/** Les trois opacités de la maquette. */
export interface Voiles {
  /** Bandeau du haut, à son point le plus dense. */
  haut: number;
  /** Panneau bas, sa base pleine. */
  basFort: number;
  /** Panneau bas, son point le plus transparent · c'est LUI qui doit tenir. */
  basDoux: number;
}

/* -------------------------------------------------------------------------- */
/*  Contraste                                                                  */
/* -------------------------------------------------------------------------- */

/** sRGB (0..1, gamma) -> luminance relative WCAG (0..1, linéaire). */
export function luminance(gris: number): number {
  const c = Math.min(1, Math.max(0, gris));
  const l = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  // Bande de gris : les trois canaux sont égaux, les coefficients somment à 1.
  return l;
}

/** Rapport de contraste WCAG entre deux luminances relatives. */
export function contraste(a: number, b: number): number {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Le contraste visé sous le texte.
 *
 * 4,5 est le minimum réglementaire pour du texte courant. On vise 7 · une
 * accroche posée sur une photo n'a pas le fond uni d'une page web, et la marge
 * paie les zones qu'on n'a pas mesurées (le décile laisse dix pour cent de la
 * bande au-dessus de lui).
 */
export const CIBLE_CONTRASTE = 7;

/** Le gris du voile · `#08080b` moyenné, en sRGB. */
export const GRIS_VOILE = 10 / 255;

/** Luminance du blanc, l'encre de tous les voiles. */
const BLANC = 1;

/**
 * L'opacité minimale du voile pour que du blanc reste lisible sur `pic`.
 *
 * Résolution directe : le mélange sRGB est linéaire en alpha, donc le gris
 * composé décroît de `pic` vers `GRIS_VOILE` à mesure que l'opacité monte. On
 * cherche l'alpha où ce gris atteint le seuil de contraste, et 0 quand la scène
 * est déjà assez sombre pour s'en passer.
 */
export function voileNecessaire(pic: number, cible = CIBLE_CONTRASTE): number {
  const p = Math.min(1, Math.max(0, pic));
  // Gris maximal admissible : celui dont la luminance donne exactement `cible`
  // contre du blanc. On le cherche par dichotomie plutôt que d'inverser la
  // fonction de transfert à la main · une inversion fausse serait invisible.
  const grisMax = seuilGris(cible);
  if (p <= grisMax) return 0;
  if (p <= GRIS_VOILE) return 0;
  const alpha = (p - grisMax) / (p - GRIS_VOILE);
  return Math.min(1, Math.max(0, alpha));
}

/** Le gris sRGB le plus clair qui tienne encore `cible` contre du blanc. */
export function seuilGris(cible = CIBLE_CONTRASTE): number {
  let bas = 0, haut = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (bas + haut) / 2;
    if (contraste(BLANC, luminance(mid)) >= cible) bas = mid; else haut = mid;
  }
  return bas;
}

/** Le gris obtenu en posant un voile d'opacité `alpha` sur `gris`. */
export function grisVoile(gris: number, alpha: number): number {
  const a = Math.min(1, Math.max(0, alpha));
  return a * GRIS_VOILE + (1 - a) * Math.min(1, Math.max(0, gris));
}

/* -------------------------------------------------------------------------- */
/*  Les voiles de la maquette                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Ce qu'on peignait avant de mesurer quoi que ce soit.
 *
 * Une scène non mesurée les garde. On ne voile pas moins que ce qu'on peut
 * justifier · alléger sans avoir regardé, c'est exactement la faute qu'on
 * corrige, dans l'autre sens.
 */
export const VOILES_PAR_DEFAUT: Voiles = { haut: 0.6, basFort: 0.97, basDoux: 0.62 };

/**
 * Planchers.
 *
 * Le panneau ne sert pas qu'à rendre le texte lisible · il sépare la zone de
 * copie de la photo, et c'est ce qui distingue une publicité d'une image avec
 * des mots dessus. En dessous de ces valeurs il cesse de se lire comme un
 * panneau, même quand le contraste est acquis.
 */
const PLANCHER_HAUT = 0.28;
const PLANCHER_DOUX = 0.42;
/** Écart entre la base pleine et le point le plus transparent du panneau. */
const EPAISSEUR_PANNEAU = 0.3;
const PLAFOND = 0.97;

/**
 * Les opacités à peindre pour cette scène.
 *
 * `null` quand la scène n'a pas été mesurée · on rend alors exactement ce qu'on
 * rendait avant, pour qu'une publicité déjà composée ne change pas d'allure
 * sans qu'on ait rien appris sur elle.
 */
export function voilesDe(light?: SceneLight | null): Voiles {
  if (!light) return VOILES_PAR_DEFAUT;

  const haut = borne(voileNecessaire(light.haut.pic), PLANCHER_HAUT, 0.8);
  // C'est le point le plus TRANSPARENT du panneau qui doit tenir · le texte y
  // monte, et dimensionner sur la base pleine laisserait sa moitié haute sans
  // garantie. Le reste du dégradé s'en déduit.
  const basDoux = borne(voileNecessaire(light.bas.pic), PLANCHER_DOUX, PLAFOND);
  const basFort = borne(basDoux + EPAISSEUR_PANNEAU, basDoux, PLAFOND);
  return { haut, basFort, basDoux };
}

/**
 * Deux décimales, arrondies VERS LE HAUT.
 *
 * Arrondir au plus proche paraissait sans conséquence · un demi-centième de
 * moins que ce que le calcul demande, et la garantie de contraste tombe. Le
 * test l'a vu au premier passage, sur une scène à mi-clarté.
 */
function borne(v: number, min: number, max: number): number {
  const arrondi = Math.ceil(Math.max(min, v) * 100) / 100;
  return Math.min(max, arrondi);
}

/* -------------------------------------------------------------------------- */
/*  Mesure d'une bande                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Moyenne et neuvième décile d'un échantillon de gris.
 *
 * Séparé du décodage d'image pour être vérifiable sans image · c'est la partie
 * où une erreur d'indice passerait inaperçue.
 */
export function bandeDe(gris: readonly number[]): Bande {
  if (!gris.length) return { moyenne: 0, pic: 0 };
  let somme = 0;
  for (const g of gris) somme += g;
  const tri = [...gris].sort((a, b) => a - b);
  // Index du neuvième décile · `length - 1` au maximum, sinon un échantillon de
  // dix valeurs sortirait du tableau.
  const i = Math.min(tri.length - 1, Math.floor(tri.length * 0.9));
  return { moyenne: somme / gris.length, pic: tri[i]! };
}

/** Où se posent les deux bandes, en fraction de hauteur. */
export const BANDE_HAUT = 0.3;
export const BANDE_BAS = 0.42;
