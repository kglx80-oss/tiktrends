/**
 * Spatial · le THÈME CLAIR, dérivé mécaniquement de la feuille de la maquette.
 *
 * L'ancienne interface avait sa palette claire (`packages/ui/tokens.css`), lue
 * au rendu serveur depuis le cookie `tt_theme` (`<html data-theme="clair">`,
 * aucun flash). La maquette Spatial n'en a pas · `spatial.css` est sombre de
 * bout en bout, et reste intouchable (garde à l'octet de `spatial-fondation`).
 *
 * On en DÉRIVE donc une seconde feuille, comme `deriverRoutesCss` · pour chaque
 * règle de `spatial.css` (y compris dans un `@media`), chaque déclaration de
 * COULEUR est reprise sous `html[data-theme="clair"]`, transformée par une
 * règle fixe. Aucune autre propriété n'est reprise · la mise en page (grilles,
 * tailles, rail, barre mobile) n'existe qu'une fois, dans la maquette.
 *
 * Pourquoi TOUTES les déclarations de couleur, même `var(--fg2)` inchangé ·
 * le préfixe ajoute la même spécificité à chaque règle dérivée. Si l'on ne
 * reprenait que les littéraux, une règle dérivée peu spécifique (`.a`) battrait
 * en clair une règle d'origine plus spécifique non reprise (`.b .a`) · l'ordre
 * de la cascade de la maquette ne serait plus celui du clair.
 *
 * La transformation, par nature de couleur ·
 *  · NEUTRE (blancs, noirs, gris, bleu nuit de la maquette) · inversée le long
 *    de l'axe encre ↔ papier, alpha conservé. Le blanc devient l'encre, le
 *    bleu nuit devient le papier. Un texte blanc sur un voile nuit devient un
 *    texte encre sur un voile papier · la PAIRE garde son contraste.
 *  · SATURÉE, posée en texte, trait ou bordure · la teinte et la saturation
 *    restent, la clarté descend jusqu'à 4,7:1 sur blanc (les pastels pensés
 *    pour le verre sombre deviennent leurs versions profondes).
 *  · SATURÉE, posée en fond · gardée (accents, dégradés de section, teintes).
 *  · OMBRE portée · reste sombre, alpha divisé par deux ; un liseré intérieur
 *    (reflet du verre) reste tel quel ; un anneau (`0 0 0 Npx`) suit la règle
 *    des bordures.
 *  · `var(--acc)` posé en texte ou en trait · mêlé à l'encre (part mesurée,
 *    `PART_ACCENT_TEXTE`) · les accents vifs de section ne passent pas 4,5:1
 *    sur blanc.
 * Les créas (`.ad`, `.mini`, `.comp`…) ne suivent jamais le thème · la règle
 * de la maquette (« creative, never styled by the UI theme »).
 *
 * Pur. La garde `spatial-fondation` exige que la feuille livrée soit
 * EXACTEMENT `deriverThemeClairCss(spatial.css)`, et `spatial-theme-clair`
 * mesure les contrastes de la palette.
 */
import { composer, contrasteCouleurs, lireCouleurCss, SEUILS_CONTRASTE, type Rgba } from '../themes';
import { deriverRoutesCss } from './routes-css';

export const ENTETE_THEME_CLAIR_CSS =
  '/* Dérivée de spatial.css par deriverThemeClairCss (noyau) · thème clair Spatial · ne pas éditer à la main. */\n';

/** Le sélecteur posé par le layout racine (cookie `tt_theme`). */
export const SELECTEUR_CLAIR = 'html[data-theme="clair"]';

/** L'encre et le papier du clair · l'axe d'inversion des neutres. */
export const ENCRE_CLAIRE = '#0b1220';
export const PAPIER_CLAIR = '#eef1f6';

/** Le seuil visé pour un texte saturé assombri (4,5 AA + marge). */
export const CIBLE_TEXTE_CLAIR = 6.5;

/**
 * Part de l'accent de section dans un texte ou un trait d'accent en clair
 * (`color-mix(in srgb, var(--acc) P%, encre)`). Mesurée sur les dix accents de
 * la maquette (`ACCENTS_SECTION`) · la garde exige ≥ 4,5:1 sur blanc pour
 * chacun.
 */
export const PART_ACCENT_TEXTE = 40;

/** Les accents déclarés par la maquette (`--acc`, `--acc2`), par section. */
export const ACCENTS_SECTION: Readonly<Record<string, readonly [string, string]>> = {
  defaut: ['#f43f73', '#ff8a3d'],
  studios: ['#8b5cf6', '#ec4899'],
  veille: ['#ffb020', '#ff6b3d'],
  resultats: ['#34d399', '#22d3ee'],
  bibliotheque: ['#3b82f6', '#8b5cf6'],
  jarvis: ['#8fd8ff', '#c084fc'],
  marque: ['#fb7185', '#f59e0b'],
  reglages: ['#60a5fa', '#22d3ee'],
  admin: ['#f5b942', '#f97316'],
  mcp: ['#a78bfa', '#22d3ee'],
};

/* ─────────────────────────── Couleurs ─────────────────────────── */

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

/** `#rrggbb` ou `#rrggbbaa` (alpha omis quand il vaut 1). */
export function versHex([r, g, b, a]: Rgba): string {
  const al = Math.round(a * 255);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${al >= 255 ? '' : hex2(al)}`;
}

function versHsl([r, g, b]: Rgba): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function depuisHsl(h: number, s: number, l: number, a: number): Rgba {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255, a];
}

/**
 * Une couleur NEUTRE de la maquette · grise, quasi blanche, quasi noire, ou du
 * bleu nuit de son verre (teinte 200–240°, très sombre).
 */
export function estNeutre(c: string): boolean {
  const rgba = lireCouleurCss(c);
  const [h, s, l] = versHsl(rgba);
  return s < 0.15 || l > 0.94 || l < 0.04 || (l < 0.22 && h >= 200 && h <= 240);
}

/** Neutre · inversé le long de l'axe encre ↔ papier, alpha conservé. */
export function inverserNeutre(c: string): string {
  const [r, g, b, a] = lireCouleurCss(c);
  const lEncre = versHsl(lireCouleurCss(ENCRE_CLAIRE))[2];
  const l = versHsl([r, g, b, 1])[2];
  const t = Math.max(0, Math.min(1, (l - lEncre) / (1 - lEncre)));
  const p = lireCouleurCss(PAPIER_CLAIR), e = lireCouleurCss(ENCRE_CLAIRE);
  return versHex([p[0] + (e[0] - p[0]) * t, p[1] + (e[1] - p[1]) * t, p[2] + (e[2] - p[2]) * t, a]);
}

/**
 * Saturée, en texte ou en trait · même teinte, clarté abaissée jusqu'à
 * `cible`:1 sur blanc. `avecAlpha` · un TEXTE translucide (`#ffe2a8b3`) se
 * juge tel qu'on le voit, posé sur le blanc · son alpha est gardé, la clarté
 * descend d'autant plus. Une bordure ou un trait translucide (teinte de
 * pastille) se juge sur sa couleur pleine · sinon sa teinte tomberait au noir.
 */
export function assombrirPourTexte(c: string, cible = CIBLE_TEXTE_CLAIR, avecAlpha = false): string {
  const rgba = lireCouleurCss(c);
  const vu = (x: Rgba) => versHex(avecAlpha ? composer(versHex(x), '#ffffff') : [x[0], x[1], x[2], 1]);
  if (contrasteCouleurs(vu(rgba), '#ffffff') >= cible) return c.toLowerCase();
  const [h, s, l] = versHsl(rgba);
  let lo = 0, hi = l;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (contrasteCouleurs(vu(depuisHsl(h, s, mid, rgba[3])), '#ffffff') >= cible) lo = mid; else hi = mid;
  }
  return versHex(depuisHsl(h, s, lo, rgba[3]));
}

/* ─────────────────────────── Valeurs ─────────────────────────── */

const LITTERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

type Nature = 'texte' | 'trait' | 'fond';

/** Transforme chaque couleur littérale d'une valeur selon sa nature. */
function transformerCouleurs(v: string, nature: Nature): string {
  return v.replace(LITTERAL, (c) => {
    if (estNeutre(c)) return inverserNeutre(c);
    return nature === 'fond' ? c : assombrirPourTexte(c, CIBLE_TEXTE_CLAIR, nature === 'texte');
  });
}

/** `var(--acc)` (ou `--acc2`) posé en texte ou en trait · mêlé à l'encre. */
function accentLisible(v: string): string {
  return v.replace(/var\(--(acc2?)\)/g, (_m, n: string) => `color-mix(in srgb,var(--${n}) ${PART_ACCENT_TEXTE}%,${ENCRE_CLAIRE})`);
}

/** Découpe au premier niveau (hors parenthèses et chaînes). */
function decouper(s: string, sep: string): string[] {
  const out: string[] = [];
  let prof = 0, deb = 0, guil: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (guil) { if (c === guil && s[i - 1] !== '\\') guil = null; continue; }
    if (c === '"' || c === "'") guil = c;
    else if (c === '(') prof++;
    else if (c === ')') prof--;
    else if (c === sep && prof === 0) { out.push(s.slice(deb, i)); deb = i + 1; }
  }
  out.push(s.slice(deb));
  return out;
}

/** Une couche d'ombre · portée (reste sombre, alpha ÷ 2), reflet intérieur (gardé), anneau (trait). */
function transformerCoucheOmbre(couche: string): string {
  const c = couche.trim();
  const couleurs = c.match(LITTERAL) ?? [];
  const longueurs = c.replace(LITTERAL, ' ').replace(/var\([^)]*\)|color-mix\([^)]*\)/g, ' ').split(/\s+/).filter((t) => /^-?[\d.]+(px|em|rem)?$/.test(t));
  const flou = longueurs[2] ?? '0';
  const inset = /\binset\b/.test(c);
  const anneau = longueurs.slice(0, 3).every((t) => parseFloat(t) === 0) && longueurs.length >= 4;
  if (anneau) return accentLisible(transformerCouleurs(c, 'trait'));
  if (inset && parseFloat(flou) === 0) return c;
  if (!couleurs.length) return c;
  return c.replace(LITTERAL, (col) => {
    if (!estNeutre(col)) return col;
    const [r, g, b, a] = lireCouleurCss(col);
    // Un halo blanc reste blanc (reflet) · une ombre sombre reste sombre, allégée.
    return versHsl([r, g, b, a])[2] > 0.5 ? col.toLowerCase() : versHex([r, g, b, a / 2]);
  });
}

/*
 * Les familles reprises en ENTIER · un raccourci (`background`, `border`,
 * `outline`) remet ses longues à zéro. Repris sans ses longues, il écraserait en
 * clair une `background-size` ou une `border-width` qu'une règle d'origine plus
 * spécifique posait (ou le `background-clip:text` d'un titre en dégradé). Les
 * longues sans couleur passent donc telles quelles · même cascade qu'en sombre.
 */
const PROP_TRAIT = /^(color|fill|stroke|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-(color|width|style))?|outline(-(color|width|style))?|caret-color|accent-color|text-decoration(-[a-z]+)?|column-rule(-[a-z]+)?|-webkit-text-stroke(-[a-z]+)?|-webkit-text-fill-color|scrollbar-color)$/;
const PROP_FOND = /^(-webkit-)?background(-[a-z-]+)?$/;
const PROP_OMBRE = /^(box-shadow|filter)$/;
/** Propriétés de couleur qui suivent la maquette telles quelles (masque · alpha seul ; ombre de texte · lisibilité sur média). */
const PROP_TELLE_QUELLE = /^(text-shadow|mask-image|-webkit-mask-image)$/;

/** Les créas · jamais stylées par le thème de l'interface (règle de la maquette). */
const CREA = /\.(ad|mini|comp|blogo)(?![\w-])/;

const ACCENT_FOND = /var\(--(acc2?|q1|q2|on)[,)]/;

/** Une valeur porte-t-elle une couleur (littéral, variable, mot-clé) ? */
const porteCouleur = (prop: string, v: string) =>
  PROP_TRAIT.test(prop) || PROP_FOND.test(prop) || PROP_OMBRE.test(prop) || PROP_TELLE_QUELLE.test(prop) || (prop === 'color-scheme');

interface Decl { prop: string; valeur: string }

function lireDeclarations(corps: string): Decl[] {
  return decouper(corps, ';').map((d) => d.trim()).filter(Boolean).flatMap((d) => {
    const i = d.indexOf(':');
    if (i < 0) return [];
    return [{ prop: d.slice(0, i).trim().toLowerCase(), valeur: d.slice(i + 1).trim() }];
  });
}

/** Le fond de la règle est-il un accent ou une couleur vive opaque ? Son texte a été choisi pour lui. */
function fondFixe(decls: Decl[]): boolean {
  return decls.some((d) => PROP_FOND.test(d.prop) && (ACCENT_FOND.test(d.valeur) || (d.valeur.match(LITTERAL) ?? []).some((c) => !estNeutre(c) && lireCouleurCss(c)[3] >= 0.9)));
}

function transformerDeclaration(d: Decl, texteFixe: boolean): Decl | null {
  const { prop } = d;
  if (prop.startsWith('--')) return null;
  if (prop === 'color-scheme') return { prop, valeur: d.valeur.replace(/\bdark\b/, 'light') };
  if (!porteCouleur(prop, d.valeur)) return null;
  if (PROP_TELLE_QUELLE.test(prop)) return { prop, valeur: d.valeur };
  if (PROP_OMBRE.test(prop)) {
    if (prop === 'filter') {
      return { prop, valeur: d.valeur.replace(/drop-shadow\(([^()]*(?:\([^)]*\))?[^()]*)\)/g, (_m, x: string) => `drop-shadow(${transformerCoucheOmbre(x)})`) };
    }
    return { prop, valeur: decouper(d.valeur, ',').map(transformerCoucheOmbre).join(',') };
  }
  if (PROP_TRAIT.test(prop)) {
    if (texteFixe && /^(color|fill|stroke|-webkit-text-fill-color)$/.test(prop)) return { prop, valeur: d.valeur };
    return { prop, valeur: accentLisible(transformerCouleurs(d.valeur, /^(color|-webkit-text-fill-color)$/.test(prop) ? 'texte' : 'trait')) };
  }
  return { prop, valeur: transformerCouleurs(d.valeur, 'fond') };
}

/** Reprise telle quelle (règles d'accent par adresse) · seule la spécificité monte. */
function garderDeclaration(d: Decl): Decl | null {
  return !d.prop.startsWith('--') && porteCouleur(d.prop, d.valeur) ? d : null;
}

/** Préfixe chaque sélecteur de la liste par le sélecteur du clair. */
export function prefixerSelecteur(sel: string): string {
  return decouper(sel, ',').map((s) => {
    const t = s.trim();
    if (/^:root/.test(t)) return SELECTEUR_CLAIR + t.slice(5);
    if (/^html(?![\w-])/.test(t)) return SELECTEUR_CLAIR + t.slice(4);
    return `${SELECTEUR_CLAIR} ${t}`;
  }).join(',');
}

/* ─────────────────────────── Feuille ─────────────────────────── */

/** Règles et blocs `@media`/`@supports` de premier niveau, récursivement. */
function deriverBloc(css: string, telQuel = false): string[] {
  const out: string[] = [];
  let prof = 0, deb = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') prof++;
    else if (c === '}') {
      prof--;
      if (prof !== 0) continue;
      const brut = css.slice(deb, i + 1).trim();
      deb = i + 1;
      const o = brut.indexOf('{');
      const tete = brut.slice(0, o).trim();
      const corps = brut.slice(o + 1, -1);
      if (tete.startsWith('@')) {
        if (/^@(media|supports|container)\b/.test(tete)) {
          const dedans = deriverBloc(corps, telQuel);
          if (dedans.length) out.push(`${tete}{${dedans.join('')}}`);
        }
        continue; // @keyframes, @font-face · ni sélecteur ni thème
      }
      if (CREA.test(tete) && decouper(tete, ',').every((s) => CREA.test(s))) continue;
      const decls = lireDeclarations(corps);
      const fixe = fondFixe(decls);
      const derivees = decls.map((d) => (telQuel ? garderDeclaration(d) : transformerDeclaration(d, fixe))).filter((d): d is Decl => d !== null);
      if (!derivees.length) continue;
      const sels = decouper(tete, ',').map((s) => s.trim()).filter((s) => !CREA.test(s));
      out.push(`${prefixerSelecteur(sels.join(','))}{${derivees.map((d) => `${d.prop}:${d.valeur}`).join(';')}}`);
    }
  }
  return out;
}

/**
 * La palette CLAIRE des variables de la maquette, écrite à la main (les seules
 * valeurs non dérivées) · verre blanc dépoli, encre nuit, statuts profonds.
 * Les accents de section (`--acc`, `--acc2`, `--on`) ne changent pas · un
 * bouton principal garde son dégradé et son texte dans les deux thèmes.
 * Contrastes mesurés par `test/spatial-theme-clair.test.ts` (noyau).
 */
export const PALETTE_CLAIRE_SPATIALE: Readonly<Record<string, string>> = {
  ink: PAPIER_CLAIR,
  fg: ENCRE_CLAIRE,
  fg2: '#0b1220d1',
  fg3: '#0b1220ad',
  glass: '#ffffffcc',
  glass2: '#ffffff99',
  glass3: '#0b122012',
  edge: '#0b12201f',
  edge2: '#0b122017',
  chg: assombrirPourTexte('#8fd8ff'),
  good: assombrirPourTexte('#7ef0b0'),
  warn: assombrirPourTexte('#ffd48a'),
  bad: assombrirPourTexte('#ff9b9b'),
  sh: '0 30px 60px -30px #0b122033,inset 0 1px 0 #ffffffcc',
};

/* ─────────────────────────── Pop-up profil (G17) ─────────────────────────── */

/**
 * Part du fond PLEIN de la page (`--ink` · bleu nuit en sombre, papier en clair)
 * sous la pop-up profil. La maquette la pose à 85 % (`.notif{background:#1b2433d9}`)
 * en comptant sur le flou du verre · posée DANS la fenêtre déjà floutée, la
 * pop-up ne floute plus ce qui est dessous (le premier `backdrop-filter` borne
 * le second) et la page se lit à travers (relevé G17 · fantôme mesuré 1,60:1).
 * À 96 %, le pire texte de la page vu au travers (`fantomeSousSurcouche`)
 * tombe à 1,09:1 en sombre et 1,08:1 en clair · illisible.
 */
export const PART_FOND_SURCOUCHE = 96;
export const FOND_SURCOUCHE_OPAQUE = `color-mix(in srgb,var(--ink) ${PART_FOND_SURCOUCHE}%,transparent)`;

/** Contraste d'un texte de la page vu à travers la surcouche, sans flou · le
 *  « fantôme ». `fond` · la valeur de `--ink` du thème ; `texte` · le pire texte. */
export function fantomeSousSurcouche(fond: string, texte: string, part = PART_FOND_SURCOUCHE): number {
  const f = lireCouleurCss(fond);
  const surcouche = versHex([f[0], f[1], f[2], part / 100]);
  const rgb = (c: Rgba) => `rgb(${c[0]},${c[1]},${c[2]})`;
  return contrasteCouleurs(rgb(composer(surcouche, texte)), rgb(composer(surcouche, fond)));
}

/* ─────────────────────────── Mesure ─────────────────────────── */

/**
 * Les fonds du clair, au PIRE cas · une créa NOIRE derrière (le fond de page
 * est la créa de la marque, floutée). Le voile dérivé (`.bg2`, papier à 20 %
 * puis 25 % au coin le moins voilé) se pose dessus, puis la fenêtre de verre,
 * puis la tuile ou le bouton. Une créa plus claire ne fait que monter les
 * contrastes (texte encre).
 */
export function fondsClairsPireCas(creaSous = '#000000'): Record<'fenetre' | 'tuile' | 'bouton', string> {
  const rgb = (c: Rgba) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const voile = rgb(composer(inverserNeutre('#0b122040'), rgb(composer(inverserNeutre('#0b122033'), creaSous))));
  const fenetre = rgb(composer(PALETTE_CLAIRE_SPATIALE.glass!, voile));
  return {
    fenetre,
    tuile: rgb(composer(PALETTE_CLAIRE_SPATIALE.glass2!, fenetre)),
    bouton: rgb(composer(PALETTE_CLAIRE_SPATIALE.glass3!, fenetre)),
  };
}

export interface MesureClaire { texte: string; fond: 'fenetre' | 'tuile' | 'bouton'; ratio: number; seuil: number; ok: boolean }

/** Le texte d'un accent de section en clair (`accentLisible`), résolu. */
export function accentTexteClair(accent: string): string {
  const a = lireCouleurCss(accent), e = lireCouleurCss(ENCRE_CLAIRE), p = PART_ACCENT_TEXTE / 100;
  return versHex([a[0] * p + e[0] * (1 - p), a[1] * p + e[1] * (1 - p), a[2] * p + e[2] * (1 - p), 1]);
}

/**
 * Les paires principales du clair, mesurées au pire cas · encre (3 niveaux),
 * statuts, et texte d'accent de chaque section, sur la fenêtre et la tuile ;
 * encre et `--fg2` sur un bouton neutre (`--glass3`).
 */
export function mesurerThemeClair(): MesureClaire[] {
  const f = fondsClairsPireCas();
  const P = PALETTE_CLAIRE_SPATIALE;
  const textes: [string, string][] = [
    ...(['fg', 'fg2', 'fg3', 'good', 'chg', 'warn', 'bad'] as const).map((k): [string, string] => [`--${k}`, P[k]!]),
    ...Object.entries(ACCENTS_SECTION).flatMap(([s, [a, b]]): [string, string][] => [[`accent ${s}`, accentTexteClair(a)], [`accent2 ${s}`, accentTexteClair(b)]]),
  ];
  const mesure = (texte: string, couleur: string, fond: 'fenetre' | 'tuile' | 'bouton'): MesureClaire => {
    const ratio = contrasteCouleurs(couleur, f[fond]);
    return { texte, fond, ratio, seuil: SEUILS_CONTRASTE.texte, ok: ratio >= SEUILS_CONTRASTE.texte };
  };
  return [
    ...textes.flatMap(([t, c]) => [mesure(t, c, 'fenetre'), mesure(t, c, 'tuile')]),
    ...(['fg', 'fg2', 'fg3'] as const).map((k) => mesure(`--${k}`, P[k]!, 'bouton')),
  ];
}

export function deriverThemeClairCss(css: string): string {
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Les règles d'accent par adresse (`spatial-routes.css`, chargée après la
  // maquette) passent APRÈS, telles quelles · l'icône sombre posée sur un accent
  // clair (`.qa2[data-route="veille"] .ico{color:#111}`) doit continuer de battre
  // la règle générale dérivée, comme en sombre.
  const routes = deriverRoutesCss(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const regles = [...deriverBloc(sansCommentaires), ...deriverBloc(routes, true)];
  const palette = `${SELECTEUR_CLAIR}{${Object.entries(PALETTE_CLAIRE_SPATIALE).map(([k, v]) => `--${k}:${v}`).join(';')}}`;
  return ENTETE_THEME_CLAIR_CSS + regles.join('\n') + '\n' + palette + '\n';
}
