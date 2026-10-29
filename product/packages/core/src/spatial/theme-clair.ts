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
 *    restent, la clarté descend jusqu'à `CIBLE_TEXTE_CLAIR` sur blanc (les
 *    pastels pensés pour le verre sombre deviennent leurs versions profondes).
 *  · Une encre posée sur un fond VIF (accent opaque, aplat saturé) ou sur une
 *    pastille d'identité garde sa valeur sombre, `var(--ink)` compris ; une
 *    teinte mêlée à moins de moitié, ou à du transparent, n'est qu'un voile ·
 *    le texte posé dessus suit le thème (`PART_TEINTE_FOND_VIF`).
 *  · Une variable de teinte (accent, tag, dossier, étape) posée en texte ou en
 *    trait se mêle à l'encre (`VAR_TEINTE`).
 *  · Un fond vif remplacé par un verre neutre reçoit l'encre du thème
 *    (`basesVives`).
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

/**
 * Le seuil visé SUR BLANC pour un texte saturé assombri. Le pire fond réel
 * n'est pas la fenêtre · c'est une pastille de statut (12 % de sa teinte)
 * posée sur une tuile teintée par l'accent (`mesurerPastillesClaires`). À
 * 6,5:1 (valeur d'avant), la pastille « Faible » tombait à 4,09 au modèle,
 * 4,17 mesuré au banc (relevé D6) ; à 7,5:1, 4,70 au modèle, 4,78 au banc.
 */
export const CIBLE_TEXTE_CLAIR = 7.5;

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

/**
 * Les TEINTES posées par variable · l'accent de section (`--acc`, `--acc2`),
 * les teintes de raccourci (`--q1`, `--q2`), et les teintes de donnée qu'une
 * vue pose en ligne (`--tc` tag, `--fc` dossier ou type de fichier, `--sc`
 * étape de la boucle, `--c` étape de tendance). Toutes vives ou pastel, pensées
 * pour le verre sombre · posées en texte ou en trait, elles se mêlent à l'encre
 * en clair, comme l'accent (relevé D6 · `.dfold` #60a5fa sur bleu pâle 1,79:1,
 * `.tni` 1,37:1).
 */
const VAR_TEINTE = /var\(--(acc2?|q[12]|tc|fc|sc|c)(?=[,)])/g;

/** Une variable de teinte posée en texte ou en trait · mêlée à l'encre (fallback compris). */
function accentLisible(v: string): string {
  let out = '', i = 0;
  for (const m of v.matchAll(VAR_TEINTE)) {
    const deb = m.index!;
    if (deb < i) continue; // déjà dans un `var(…)` mêlé (repli d'une teinte)
    let prof = 0, fin = deb;
    for (; fin < v.length; fin++) {
      if (v[fin] === '(') prof++;
      else if (v[fin] === ')' && --prof === 0) break;
    }
    out += v.slice(i, deb) + `color-mix(in srgb,${v.slice(deb, fin + 1)} ${PART_ACCENT_TEXTE}%,${ENCRE_CLAIRE})`;
    i = fin + 1;
  }
  return out + v.slice(i);
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

const ACCENT_FOND = /var\(--(acc2?|q[12]|on|tc|fc|sc|c)[,)]/;

/**
 * Part minimale d'une teinte dans un `color-mix` pour que le mélange reste un
 * fond VIF. En dessous, ou mêlée à du transparent ou à un neutre translucide,
 * la teinte n'est qu'un voile · le mélange suit son verre, qui s'inverse en
 * clair (bleu pâle, pêche pâle), et le texte blanc posé dessus ne se lit plus
 * (relevé D6 · « Mon drive » 1,61:1, « Toutes les sauvegardes » 1,35:1, onglet
 * pressé de la Bibliothèque 1,53:1).
 */
export const PART_TEINTE_FOND_VIF = 50;

/** Retire d'une valeur de fond les mélanges où la teinte n'est qu'un voile. */
function sansVoilesDeTeinte(v: string): string {
  let out = '', i = 0;
  for (let k = v.indexOf('color-mix(', i); k >= 0; k = v.indexOf('color-mix(', i)) {
    let prof = 0, fin = k;
    for (; fin < v.length; fin++) {
      if (v[fin] === '(') prof++;
      else if (v[fin] === ')' && --prof === 0) break;
    }
    const corps = v.slice(k + 'color-mix('.length, fin);
    const [, a = '', b = ''] = decouper(corps, ',');
    const teinte = ACCENT_FOND.test(a) ? a.trim() : ACCENT_FOND.test(b) ? b.trim() : null;
    const autre = teinte === a.trim() ? b : a;
    // Part de la teinte · `var(--acc) 30%` ; absente = 50 % ; calculée (`calc(…)`) = inconnue, donc voile.
    const part = teinte === null ? 0 : /\)$/.test(teinte) ? 50 : Number(/\)\s+(\d+(?:\.\d+)?)%$/.exec(teinte)?.[1] ?? 0);
    const autreLit = (autre.match(LITTERAL) ?? [])[0];
    const autreTranslucide = /\btransparent\b/.test(autre) || (!!autreLit && lireCouleurCss(autreLit)[3] < 0.9);
    const voile = teinte !== null && (part < PART_TEINTE_FOND_VIF || autreTranslucide);
    out += v.slice(i, k) + (voile ? 'transparent' : v.slice(k, fin + 1));
    i = fin + 1;
  }
  return out + v.slice(i);
}

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
  return decls.some((d) => {
    if (!PROP_FOND.test(d.prop)) return false;
    const v = sansVoilesDeTeinte(d.valeur);
    return ACCENT_FOND.test(v) || (v.match(LITTERAL) ?? []).some((c) => !estNeutre(c) && lireCouleurCss(c)[3] >= 0.9);
  });
}

/**
 * Les PASTILLES D'IDENTITÉ · initiales d'une marque, d'un persona, d'un membre,
 * monogramme d'une source. Leur teinte est posée EN LIGNE par la vue
 * (`style={{ background: teinte }}`), jamais par la feuille · la règle de la
 * maquette n'écrit que l'encre, choisie pour cet aplat (nuit sur pastel pour
 * `.av` et `.savav`, blanc sur aplat de marque pour `.logo2`). Cette encre ne
 * suit donc pas le thème (relevé D6 · initiales « I » 1,08:1, « M » 3,58:1).
 * Liste fermée · la garde web vérifie que chaque usage pose sa teinte en ligne.
 */
export const PASTILLES_TEINTE_EN_LIGNE = ['.av', '.savav', '.logo2'] as const;

/** Le dernier composé d'un sélecteur (`.xh .av` → `.av`). */
const dernierCompose = (s: string) => s.trim().split(/\s*[\s>+~]\s*/).pop() ?? '';

const estPastille = (sels: string[]) =>
  sels.every((s) => (PASTILLES_TEINTE_EN_LIGNE as readonly string[]).includes(dernierCompose(s)));

/**
 * L'encre FIXE · celle d'un texte posé sur un fond vif (ou sur une pastille
 * d'identité) · gardée telle qu'en sombre. Une variable de la palette
 * s'inverserait pourtant avec le thème · `var(--ink)` (l'encre nuit posée sur
 * l'orbe de Jarvis, sur la pastille « 21 j + », sur les initiales) deviendrait
 * le papier en clair (relevé D6 · orbe « J » 1,23:1). Elle est donc figée à sa
 * valeur sombre, l'encre nuit.
 */
const encreFigee = (v: string) => v.replace(/var\(--ink\)/g, INK_MAQUETTE);

/** `--ink` de la maquette (`:root` de `spatial.css`) · l'encre nuit du sombre. */
export const INK_MAQUETTE = '#0b1220';

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
    if (texteFixe && /^(color|fill|stroke|-webkit-text-fill-color)$/.test(prop)) return { prop, valeur: encreFigee(d.valeur) };
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

/** Toutes les règles (tête, corps), `@media`/`@supports` compris, dans l'ordre. */
function reglesAplaties(css: string): { tete: string; corps: string }[] {
  const out: { tete: string; corps: string }[] = [];
  let prof = 0, deb = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') prof++;
    else if (css[i] === '}' && --prof === 0) {
      const brut = css.slice(deb, i + 1).trim();
      deb = i + 1;
      const o = brut.indexOf('{');
      const tete = brut.slice(0, o).trim(), corps = brut.slice(o + 1, -1);
      if (/^@(media|supports|container)\b/.test(tete)) out.push(...reglesAplaties(corps));
      else if (!tete.startsWith('@')) out.push({ tete, corps });
    }
  }
  return out;
}

const PROP_FOND_POSE = /^(background|background-color|background-image)$/;

/**
 * Les BASES VIVES · un composé simple (`.ico`) dont la règle pose un fond vif
 * ET son encre (`.ico{background:linear-gradient(var(--acc),var(--acc2));color:var(--on)}`).
 * Une règle plus précise qui remplace ce fond par un verre neutre sans redire
 * l'encre (`.feed .it .ico{background:#ffffff1f}`) hérite d'une encre pensée
 * pour l'accent · en sombre, blanc sur verre sombre, elle se lit ; en clair,
 * blanc sur verre pâle, plus du tout (relevé D6 · pictogrammes du fil 1,5:1).
 * Cette règle reçoit en clair l'encre du thème, `var(--fg)`.
 */
function basesVives(css: string): Set<string> {
  const bases = new Set<string>();
  for (const { tete, corps } of reglesAplaties(css)) {
    const decls = lireDeclarations(corps);
    if (!decls.some((d) => d.prop === 'color') || !fondFixe(decls)) continue;
    for (const s of decouper(tete, ',').map((x) => x.trim())) if (/^\.[\w-]+$/.test(s)) bases.add(s);
  }
  return bases;
}

/** Règles et blocs `@media`/`@supports` de premier niveau, récursivement. */
function deriverBloc(css: string, telQuel = false, vives: ReadonlySet<string> = new Set()): string[] {
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
          const dedans = deriverBloc(corps, telQuel, vives);
          if (dedans.length) out.push(`${tete}{${dedans.join('')}}`);
        }
        continue; // @keyframes, @font-face · ni sélecteur ni thème
      }
      if (CREA.test(tete) && decouper(tete, ',').every((s) => CREA.test(s))) continue;
      const decls = lireDeclarations(corps);
      const sels = decouper(tete, ',').map((s) => s.trim()).filter((s) => !CREA.test(s));
      const sansFond = !decls.some((d) => PROP_FOND.test(d.prop));
      const fixe = fondFixe(decls) || (sansFond && estPastille(sels));
      const derivees = decls.map((d) => (telQuel ? garderDeclaration(d) : transformerDeclaration(d, fixe))).filter((d): d is Decl => d !== null);
      if (derivees.length) out.push(`${prefixerSelecteur(sels.join(','))}{${derivees.map((d) => `${d.prop}:${d.valeur}`).join(';')}}`);
      // Fond vif remplacé par un verre neutre · l'encre du thème (voir `basesVives`).
      if (!telQuel && !fixe && decls.some((d) => PROP_FOND_POSE.test(d.prop)) && !decls.some((d) => d.prop === 'color')) {
        const herites = sels.filter((s) => s.split(/\s*[\s>+~]\s*/).length > 1 && vives.has(dernierCompose(s)));
        if (herites.length) out.push(`${prefixerSelecteur(herites.join(','))}{color:var(--fg)}`);
      }
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

/* ─────────────────────────── Couleurs en ligne ─────────────────────────── */

/**
 * Les COULEURS EN LIGNE des vues · une couleur posée par `style={{…}}` ne passe
 * pas par la feuille dérivée (relevé D1 · cartes du Radar restées sur leur voile
 * nuit `#0d1424b3` en clair, texte encre dessus, 2,3:1 ; D6 · variation en baisse
 * `#ffb0bd` 1,21:1, conseil d'Admin en accent vif 1,46:1).
 *
 * Quand la palette a déjà la même valeur en sombre, la vue l'utilise (`#ffd48a`
 * → `var(--warn)`, `#fff` → `var(--fg)`). Sinon, elle écrit
 * `var(--clair-<nom>,<valeur de la maquette>)` · en sombre la variable n'existe
 * pas et le repli EST la valeur d'avant (rendu sombre inchangé) ; en clair, la
 * valeur est DÉRIVÉE ici par la règle même de la feuille (neutre inversé, texte
 * saturé assombri, teinte mêlée à l'encre). La garde web refuse un nom inconnu
 * ou un repli qui n'est pas la valeur sombre déclarée.
 */
export const COULEURS_EN_LIGNE: Readonly<Record<string, { sombre: string; nature: 'texte' | 'fond' }>> = {
  /** Carte posée sur une tuile (alertes du Radar) · même voile que `.xa`. */
  'voile-carte': { sombre: '#0d1424b3', nature: 'fond' },
  /** Voile qui masque l'aperçu verrouillé (Radar sans l'offre). */
  'voile-verrou': { sombre: '#0b1220cc', nature: 'fond' },
  /** Variation défavorable d'un KPI (Accueil · reporting Meta). */
  baisse: { sombre: '#ffb0bd', nature: 'texte' },
  /** L'accent de section écrit en texte (conseils d'Admin+). */
  acc: { sombre: 'var(--acc)', nature: 'texte' },
};

/** La valeur claire d'une couleur en ligne · la règle de la feuille, appliquée telle quelle. */
export function couleurEnLigneClaire(nom: string): string {
  const c = COULEURS_EN_LIGNE[nom];
  if (!c) throw new Error(`couleur en ligne inconnue : ${nom}`);
  return c.nature === 'fond' ? transformerCouleurs(c.sombre, 'fond') : accentLisible(transformerCouleurs(c.sombre, 'texte'));
}

/*
 * Posées sur `body` · `--acc` y est fixé par la section (`body[data-sec=…]`), et
 * une variable qui en dépend se résout là où elle est déclarée.
 */
const reglesEnLigne = () =>
  `${SELECTEUR_CLAIR} body{${Object.keys(COULEURS_EN_LIGNE).map((n) => `--clair-${n}:${couleurEnLigneClaire(n)}`).join(';')}}`;

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
/**
 * La plus forte teinte d'accent posée sous un texte de tuile dans la maquette
 * (`.plan.rec`, `.tni` · `color-mix(var(--acc) 26%,transparent)`).
 */
export const PART_TEINTE_TUILE = 26;

/** Les statuts de la maquette (`--good`, `--chg`, `--warn`, `--bad` en sombre) · leur pastille `.pill.*` pose 12 % (`1f`) de leur teinte. */
export const STATUTS_MAQUETTE: Readonly<Record<'good' | 'chg' | 'warn' | 'bad', string>> = { good: '#7ef0b0', chg: '#8fd8ff', warn: '#ffd48a', bad: '#ff9b9b' };

export interface MesurePastille { statut: string; section: string; ratio: number; ok: boolean }

/**
 * Une pastille de statut en clair, au pire cas · son texte (le statut assombri
 * à `cible`) sur sa teinte à 12 %, posée sur une tuile teintée à
 * `PART_TEINTE_TUILE` % par l'accent de chaque section, sur la tuile pire cas.
 */
export function mesurerPastillesClaires(cible = CIBLE_TEXTE_CLAIR): MesurePastille[] {
  const rgb = (c: Rgba) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const tuile = fondsClairsPireCas().tuile;
  return Object.entries(STATUTS_MAQUETTE).flatMap(([statut, c]) => Object.entries(ACCENTS_SECTION).map(([section, [acc]]) => {
    const a = lireCouleurCss(acc);
    const teintee = rgb(composer(versHex([a[0], a[1], a[2], PART_TEINTE_TUILE / 100]), tuile));
    const fond = rgb(composer(`${c}1f`, teintee));
    const ratio = contrasteCouleurs(assombrirPourTexte(c, cible), fond);
    return { statut, section, ratio, ok: ratio >= SEUILS_CONTRASTE.texte };
  }));
}

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
  const regles = [...deriverBloc(sansCommentaires, false, basesVives(sansCommentaires)), ...deriverBloc(routes, true)];
  const palette = `${SELECTEUR_CLAIR}{${Object.entries(PALETTE_CLAIRE_SPATIALE).map(([k, v]) => `--${k}:${v}`).join(';')}}`;
  return ENTETE_THEME_CLAIR_CSS + regles.join('\n') + '\n' + palette + '\n' + reglesEnLigne() + '\n';
}
