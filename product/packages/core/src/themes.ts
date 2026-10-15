/**
 * V5 · A4a · socle des thèmes clair / sombre et palette ADMIN+.
 *
 * Règles pures (ni DOM, ni réseau, ni base) :
 *  1. la préférence de thème · cookie `tt_theme`, valeurs `clair` / `sombre`,
 *     défaut sombre ; lue au rendu serveur par le layout racine, qui pose
 *     `data-theme` sur `<html>` dès le premier octet (aucun flash) ;
 *  2. le contraste WCAG 2 d'une paire de couleurs, transparence comprise
 *     (`contrasteCouleurs`) ;
 *  3. les paires de jetons que l'interface pose l'une sur l'autre, avec leur
 *     seuil · la garde (`test/a4a-themes.test.ts`) lit `packages/ui/tokens.css`,
 *     reconstitue les quatre palettes avec `palettesDepuisCss` et refuse toute
 *     paire sous son seuil, dans chacune.
 *
 * Les VALEURS ne vivent qu'à un endroit · `tokens.css`. Ce module ne recopie
 * que la couleur de la barre du navigateur (`viewport.themeColor`), que Next
 * exige en littéral · la garde vérifie qu'elle reste égale à `--bg`.
 */

/* ─────────────────────────── Préférence ─────────────────────────── */

export const THEMES = ['sombre', 'clair'] as const;
export type Theme = (typeof THEMES)[number];

/** Le thème sans préférence · le sombre, l'apparence historique. */
export const THEME_DEFAUT: Theme = 'sombre';

/** Nom du cookie · court, sans donnée personnelle, lisible côté client. */
export const THEME_COOKIE = 'tt_theme';

/** L'attribut posé sur `<html>` · `data-theme="sombre"` ou `"clair"`. */
export const ATTRIBUT_THEME = 'data-theme';

/** La palette ADMIN+ · `data-palette="admin"` sur la racine de l'espace. */
export const ATTRIBUT_PALETTE = 'data-palette';
export const PALETTE_ADMIN = 'admin';

/** Le thème d'un cookie · seule la valeur exacte « clair » vaut clair. Tout le
 *  reste (absent, vide, « sombre », valeur inconnue ou falsifiée) vaut sombre ·
 *  le défaut sûr est l'apparence historique. */
export function themeDepuisCookie(raw: string | undefined | null): Theme {
  return raw === 'clair' ? 'clair' : 'sombre';
}

/** L'autre thème · ce que fait la bascule. */
export function themeOppose(t: Theme): Theme {
  return t === 'clair' ? 'sombre' : 'clair';
}

/**
 * La chaîne à poser dans `document.cookie` (côté client), sur le modèle du rail
 * et de Jarvis · `path=/` (le thème vaut partout), un an (la préférence survit
 * à la session), `samesite=lax` (un cookie d'apparence n'a rien à faire dans
 * une requête tierce).
 */
export function themeCookieString(t: Theme): string {
  return `${THEME_COOKIE}=${t}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** La couleur de la barre du navigateur mobile · égale à `--bg` du thème
 *  (garde : `test/a4a-themes.test.ts`). */
export const COULEUR_BARRE: Record<Theme, string> = { sombre: '#120810', clair: '#fbf5f6' };

/** `color-scheme` du thème · contrôles natifs, barres, champs auto-remplis. */
export const SCHEMA_COULEUR: Record<Theme, 'dark' | 'light'> = { sombre: 'dark', clair: 'light' };

/* ─────────────────────────── Contraste ─────────────────────────── */

/** Seuils WCAG 2 AA · texte courant, grand texte (≥ 24 px ou ≥ 18,66 px gras),
 *  et éléments d'interface (bordure d'un contrôle, anneau de focus · 1.4.11). */
export const SEUILS_CONTRASTE = { texte: 4.5, grand: 3, interface: 3 } as const;
export type NatureSeuil = keyof typeof SEUILS_CONTRASTE;

export type Rgba = readonly [number, number, number, number];

/** Lit `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(…)` ou `rgba(…)`. */
export function lireCouleurCss(c: string): Rgba {
  const s = c.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    const h = hex[1]!.length <= 4 ? [...hex[1]!].map((x) => x + x).join('') : hex[1]!;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
  throw new Error(`couleur illisible : ${c}`);
}

/** Une couleur (éventuellement translucide) posée sur un fond opaque · le
 *  résultat que l'œil voit. Un fond translucide est d'abord posé sur `sous`. */
export function composer(dessus: string, fond: string, sous = '#000000'): Rgba {
  const f = lireCouleurCss(fond);
  const base = f[3] < 1 ? composer(fond, sous) : f;
  const [r, g, b, a] = lireCouleurCss(dessus);
  return [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a), 1];
}

function lineaire(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgba): number {
  return 0.2126 * lineaire(r) + 0.7152 * lineaire(g) + 0.0722 * lineaire(b);
}

/**
 * Rapport de contraste WCAG 2 (1 à 21) d'une couleur posée sur un fond, NON
 * arrondi · un 4,496 ne doit pas passer pour 4,5. La transparence du premier
 * plan est composée sur le fond (une bordure `rgba` se mesure telle qu'on la voit).
 * `ratioContraste` (L8-A, arrondi au centième) et `contrasteWcag` (logos,
 * `#RRGGBB` seul) restent pour leurs gardes · aucun ne lit `rgba()` ni `#rgba`,
 * que les jetons de bordure et de voile emploient.
 */
export function contrasteCouleurs(premierPlan: string, fond: string): number {
  const b = composer(fond, '#000000');
  const f = composer(premierPlan, `rgb(${b[0]},${b[1]},${b[2]})`);
  const [x, y] = [luminance(f), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/* ─────────────────────────── Palettes ─────────────────────────── */

export const PALETTES_THEME = ['sombre', 'clair', 'admin-sombre', 'admin-clair'] as const;
export type PaletteTheme = (typeof PALETTES_THEME)[number];
export type Jetons = Readonly<Record<string, string>>;

/** Les sélecteurs de `tokens.css` qui déclarent chaque palette. */
export const SELECTEURS_PALETTE: Record<PaletteTheme, string> = {
  sombre: ':root',
  clair: ':root[data-theme="clair"]',
  'admin-sombre': '[data-palette="admin"]',
  'admin-clair': ':root[data-theme="clair"] [data-palette="admin"]',
};

const sansCommentaires = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Les jetons `--x: valeur` déclarés par la règle dont la liste de sélecteurs
 *  CONTIENT `selecteur` (comparaison exacte, espaces normalisés). */
export function jetonsDeclares(css: string, selecteur: string): Record<string, string> {
  const norme = (s: string) => s.replace(/\s+/g, ' ').trim();
  const out: Record<string, string> = {};
  for (const m of sansCommentaires(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1]!.split(',').map(norme);
    if (!sels.includes(norme(selecteur))) continue;
    for (const d of m[2]!.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim();
  }
  return out;
}

/** Une valeur est-elle une couleur (ou en contient-elle une) ? */
export const estValeurCouleur = (v: string) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(v);

/**
 * Les quatre palettes EFFECTIVES, comme le navigateur les résout :
 *  · clair = sombre surchargé par le bloc clair ;
 *  · ADMIN+ sombre = sombre surchargé par le bloc ADMIN+ ;
 *  · ADMIN+ clair = clair surchargé par ADMIN+ puis par ADMIN+ clair (plus
 *    spécifique). Un jeton qu'ADMIN+ déclare sans qu'ADMIN+ clair le
 *    redéclare fuirait donc en sombre dans l'espace clair · la garde de
 *    complétude l'interdit.
 */
export function palettesDepuisCss(css: string): { declarees: Record<PaletteTheme, Record<string, string>>; effectives: Record<PaletteTheme, Jetons> } {
  const declarees = Object.fromEntries(PALETTES_THEME.map((p) => [p, jetonsDeclares(css, SELECTEURS_PALETTE[p])])) as Record<PaletteTheme, Record<string, string>>;
  const s = declarees.sombre, c = declarees.clair, a = declarees['admin-sombre'], ac = declarees['admin-clair'];
  return {
    declarees,
    effectives: { sombre: { ...s }, clair: { ...s, ...c }, 'admin-sombre': { ...s, ...a }, 'admin-clair': { ...s, ...c, ...a, ...ac } },
  };
}

/** Les jetons de COULEUR de la palette sombre · ceux que chaque autre palette
 *  doit redéclarer (rayons et polices ne dépendent pas du thème). */
export function jetonsDeCouleur(sombre: Record<string, string>): string[] {
  return Object.entries(sombre).filter(([, v]) => estValeurCouleur(v)).map(([k]) => k).sort();
}

/** Les arrêts d'un `linear-gradient(...)` · un texte posé dessus se juge sur le pire. */
export function arretsDegrade(v: string): string[] {
  return [...v.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)].map((m) => m[0]);
}

/** Une paire posée par l'interface · un texte (ou un trait) sur un fond. */
export interface PaireJetons { dessus: string; fond: string; nature: NatureSeuil; usage: string }

const croiser = (dessus: readonly string[], fonds: readonly string[], nature: NatureSeuil, usage: string): PaireJetons[] =>
  dessus.flatMap((d) => fonds.map((f) => ({ dessus: d, fond: f, nature, usage })));

/** Les fonds sur lesquels se pose du texte courant. */
export const FONDS_TEXTE = ['bg', 'surface', 'surface-raised', 'rail', 'paper', 'hover', 'selected', 'accent-soft'] as const;
/** Les fonds sur lesquels se pose un statut, un lien ou une bordure de contrôle. */
export const FONDS_STATUT = ['bg', 'surface', 'surface-raised', 'paper'] as const;

/**
 * Les paires déclarées, avec leur seuil. Ajouter un fond ou un rôle de texte ici
 * le fait mesurer dans les QUATRE palettes.
 *
 * Mesuré le 14/10/2026 sur `tokens.css` (63 paires par palette, 0 échec) :
 *
 * | palette      | texte, pire paire                 | interface, pire paire        |
 * | ------------ | --------------------------------- | ---------------------------- |
 * | sombre       | 4,54 · --info sur --paper         | 3,54 · --line-strong / paper |
 * | clair        | 4,93 · --warn sur --paper         | 3,82 · --line-strong / paper |
 * | ADMIN+ sombre| 5,34 · --muted sur --hover        | 4,49 · --line-strong / raised|
 * | ADMIN+ clair | 4,92 · --accent-strong / selected | 3,32 · --line-strong / paper |
 *
 * Repères · clair : encre 15,87 sur fond, blanc sur accent 5,33, --ok 5,10 et
 * --err 5,43 sur --paper. Le sombre est celui de main · son --info sur --paper
 * (4,54) n'a aucune marge et ne doit pas descendre.
 */
/**
 * V5 · T4 · les rôles nés de la tokenisation d'Adsmap (Résultats) et de Jarvis.
 * Mesuré le 15/10/2026 (pire paire, toutes palettes) · texte · --warn-text et
 * --warn-strong 4,93 sur --paper en clair ; interface · --violet 3,11 sur
 * --paper en ADMIN+ sombre.
 *
 * Le bouton « Entraîner Jarvis » (--on-violet sur --grad-violet) est déclaré ·
 * le sombre de main y était à 4,45:1, ce lot le corrige à 5,31 au pire arrêt
 * en assombrissant le dégradé. La pastille cochée du règlement (texte --ok-text
 * sur une teinte --ok-text à 20 %) n'est PAS exprimable ici (fond color-mix, pas
 * un jeton) · mesurée au navigateur · sombre 7,66, clair 4,85 au pire, au-dessus
 * de 4,5 partout (le sombre de main y était à 1,08:1, corrigé par ce lot).
 */
export const PAIRES_ADSMAP_JARVIS: readonly PaireJetons[] = [
  ...croiser(['warn-text', 'warn-strong', 'err-strong', 'ok-pale', 'err-pale', 'recul-text', 'info-pale', 'violet-text'], FONDS_STATUT, 'texte', 'Adsmap et Jarvis · verdicts, messages, conseils'),
  ...croiser(['ok-strong', 'signal', 'violet'], ['bg', 'surface', 'paper'], 'interface', 'Adsmap et Jarvis · jauge, cadre signal, pictogramme'),
  { dessus: 'paper', fond: 'grad-ok-doux', nature: 'interface', usage: 'barre au-dessus de la moyenne sur sa piste (pire arrêt)' },
  { dessus: 'on-violet', fond: 'grad-violet', nature: 'texte', usage: 'libellé du bouton « Entraîner Jarvis » (pire arrêt du dégradé)' },
];

export const PAIRES_THEME: readonly PaireJetons[] = [
  ...croiser(['ink', 'ink-2', 'muted'], FONDS_TEXTE, 'texte', 'texte principal, secondaire, méta'),
  ...croiser(['accent-strong'], [...FONDS_STATUT, 'selected', 'accent-soft'], 'texte', 'lien, onglet choisi, entrée active'),
  ...croiser(['ok', 'warn', 'err', 'info', 'ok-text', 'err-text'], FONDS_STATUT, 'texte', 'statuts et messages'),
  { dessus: 'on-accent', fond: 'accent', nature: 'texte', usage: 'libellé sur l’accent plein' },
  { dessus: 'on-accent', fond: 'grad-accent', nature: 'texte', usage: 'libellé des boutons principaux (pire arrêt du dégradé)' },
  ...croiser(['line-strong'], FONDS_STATUT, 'interface', 'bordure d’un champ ou d’un contrôle'),
  ...croiser(['accent-strong'], ['bg', 'surface', 'paper'], 'interface', 'anneau de focus clavier'),
  ...PAIRES_ADSMAP_JARVIS,
];

export interface MesurePaire extends PaireJetons { palette: PaletteTheme; ratio: number; seuil: number; ok: boolean }

/** Mesure chaque paire déclarée dans une palette effective (pire arrêt pour un
 *  dégradé, jeton manquant = échec explicite). */
export function mesurerPalette(palette: PaletteTheme, jetons: Jetons, paires: readonly PaireJetons[] = PAIRES_THEME): MesurePaire[] {
  return paires.map((p) => {
    const dessus = jetons[p.dessus];
    const fond = jetons[p.fond];
    const seuil = SEUILS_CONTRASTE[p.nature];
    if (!dessus || !fond) return { ...p, palette, ratio: 0, seuil, ok: false };
    const fonds = /gradient\(/.test(fond) ? arretsDegrade(fond) : [fond];
    const ratio = Math.min(...fonds.map((f) => contrasteCouleurs(dessus, f)));
    return { ...p, palette, ratio, seuil, ok: ratio >= seuil };
  });
}
