/**
 * Bibliothèque · les TAGS DE COULEUR des dossiers · RÈGLES PURES (ni base, ni
 * réseau). Maquette `bibliotheque` (prototype V5, module « dossiers lisibles +
 * tags couleur ») · le tag se pose sur un DOSSIER (carte, bouton « Tag de
 * couleur »), se lit en pastille dans l'arbre et en étiquette sur la carte, et
 * filtre l'écran (« Dossiers tagués « Validé » · tous espaces confondus »).
 *
 * Le catalogue est celui de la maquette, à l'identique (clé, libellé, teinte),
 * dans son ordre. La clé est STOCKÉE (`library_folders.color_tag`, contrainte
 * CHECK sur cette même liste · migration 0064) ; le libellé français et la
 * teinte sont rendus d'ici.
 *
 * La teinte · la valeur de la maquette, posée en `--tc` sur l'élément. C'est la
 * variable que la feuille de la maquette consomme (`.ftag`, `.tgchip`, `.ftsw`,
 * `.ftb.has`, `.tagb`), et que la feuille claire DÉRIVÉE (`deriverThemeClairCss`)
 * mêle déjà à l'encre pour tout texte · aucune vue n'écrit de couleur, l'arbre
 * Spatial ne charge pas `tokens.css` (garde `spatial-fondation`). La lisibilité
 * des étiquettes est MESURÉE dans les deux thèmes (`contrasteEtiquetteTag`,
 * test `spatial-tags-couleur`).
 */

export const TAGS_COULEUR = [
  { cle: 'rouge', libelle: 'Urgent', teinte: '#f87171' },
  { cle: 'orange', libelle: 'À valider', teinte: '#fb923c' },
  { cle: 'jaune', libelle: 'En cours', teinte: '#facc15' },
  { cle: 'vert', libelle: 'Validé', teinte: '#4ade80' },
  { cle: 'bleu', libelle: 'Client', teinte: '#60a5fa' },
  { cle: 'violet', libelle: 'Inspiration', teinte: '#a78bfa' },
  { cle: 'rose', libelle: 'Campagne', teinte: '#f472b6' },
  { cle: 'gris', libelle: 'Archive', teinte: '#94a3b8' },
] as const;

export type CleTagCouleur = (typeof TAGS_COULEUR)[number]['cle'];
export type TagCouleur = (typeof TAGS_COULEUR)[number];

const PAR_CLE = new Map<string, TagCouleur>(TAGS_COULEUR.map((t) => [t.cle, t]));

export function estTagCouleur(x: unknown): x is CleTagCouleur {
  return typeof x === 'string' && PAR_CLE.has(x);
}

/** Le tag d'une clé · `null` pour une valeur absente ou hors catalogue (jamais d'exception). */
export function tagCouleur(x: unknown): TagCouleur | null {
  return estTagCouleur(x) ? PAR_CLE.get(x)! : null;
}

/**
 * Le filtre lu dans l'adresse (`?tag=vert`) · une clé du catalogue, sinon
 * aucun filtre. Une valeur répétée (`?tag=a&tag=b`) ne filtre pas.
 */
export function lireFiltreTag(raw: string | readonly string[] | null | undefined): CleTagCouleur | null {
  return typeof raw === 'string' && estTagCouleur(raw) ? raw : null;
}

/**
 * Ce que l'action accepte · une clé du catalogue (poser) ou `null` (retirer).
 * Tout le reste est refusé, avec la phrase dite à l'écran.
 */
export function validerTagCouleur(x: unknown): { ok: true; tag: CleTagCouleur | null } | { ok: false; raison: string } {
  if (x === null) return { ok: true, tag: null };
  if (estTagCouleur(x)) return { ok: true, tag: x };
  return { ok: false, raison: 'Couleur inconnue · choisis un tag de la liste.' };
}

/** Le message dit après le geste (repris de la maquette). */
export function messageTagPose(tag: CleTagCouleur | null, dossier: string): string {
  const t = tagCouleur(tag);
  return t ? `Tag « ${t.libelle} » ajouté à « ${dossier} »` : 'Tag retiré';
}

/* ───────────────────────────── Tag d'une SÉLECTION ───────────────────────────── */

/**
 * Le nombre de dossiers qu'un seul geste « Tag de couleur » de la barre de
 * sélection peut taguer.
 *
 * Pourquoi 100 · la sélection se fait À LA MAIN, une case par carte, dans UNE
 * vue (un niveau du drive, une recherche ou un filtre par tag) · la maquette en
 * montre 5 par niveau, le jeu de parité aussi. Aucune base réelle n'est lisible
 * depuis la session (aucune mesure de prod possible), donc la borne se fixe par
 * ce qu'elle protège · une requête forgée ne doit pas pouvoir écrire tout un
 * espace d'un coup ni porter une liste `IN (…)` démesurée. 100 laisse vingt fois
 * la maquette de marge pour un vrai geste, tient dans ≈ 3,7 Ko d'identifiants,
 * et reprend l'ordre de grandeur des autres listes bornées du noyau
 * (`ASSOCIATIONS_MAX` = 100). Au-delà, refus TOTAL, dit à l'écran avant le
 * clic · rien n'est écrit.
 */
export const TAG_SELECTION_MAX = 100;

/** Un identifiant de dossier · `library_folders.id` est un UUID (une autre forme ferait échouer la requête). */
const ID_DOSSIER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ce que l'action de sélection accepte · une liste d'identifiants (des UUID,
 * dédoublonnés, entre 1 et `TAG_SELECTION_MAX`) et un tag du catalogue
 * ou `null` (retirer). Tout écart refuse le geste ENTIER, avec la phrase dite à
 * l'écran · jamais une liste tronquée en silence.
 */
export function validerSelectionTag(ids: unknown, tag: unknown): { ok: true; ids: string[]; tag: CleTagCouleur | null } | { ok: false; raison: string } {
  const v = validerTagCouleur(tag);
  if (!v.ok) return v;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string' || !ID_DOSSIER.test(x))) return { ok: false, raison: 'Sélection illisible · rien n’a été tagué.' };
  const uniques = [...new Set((ids as string[]).map((x) => x.toLowerCase()))];
  if (!uniques.length) return { ok: false, raison: 'Aucun dossier sélectionné.' };
  if (uniques.length > TAG_SELECTION_MAX) return { ok: false, raison: refusSelectionTropLarge(uniques.length) };
  return { ok: true, ids: uniques, tag: v.tag };
}

/** La phrase du refus de borne · la même avant le clic (écran) et après (action). */
export function refusSelectionTropLarge(n: number): string {
  return `${n} dossiers sélectionnés · ${TAG_SELECTION_MAX} au plus par geste, rien n’a été tagué.`;
}

/**
 * Le message dit après le geste sur une sélection · le nombre de dossiers
 * tagués (ou dont le tag est retiré) et, si la sélection contenait des
 * fichiers, qu'ils ne portent pas de tag (seul un dossier en porte un).
 */
export function messageTagSelection(tag: CleTagCouleur | null, dossiers: number, fichiers = 0): string {
  const t = tagCouleur(tag);
  const s = dossiers > 1 ? 's' : '';
  const tete = t ? `${dossiers} dossier${s} tagué${s} « ${t.libelle} »` : `Tag retiré de ${dossiers} dossier${s}`;
  return fichiers > 0 ? `${tete} · les fichiers ne portent pas de tag` : tete;
}

/**
 * La ligne du menu de la barre de sélection, dite AVANT le clic · seuls les
 * dossiers reçoivent le tag ; s'il y a des fichiers dans la sélection, combien
 * resteront sans tag.
 */
export function noteSelectionTag(fichiers: number): string {
  if (fichiers <= 0) return 'Seuls les dossiers portent un tag.';
  const s = fichiers > 1 ? 's' : '';
  return `${fichiers} fichier${s} sélectionné${s} ne ${fichiers > 1 ? 'seront' : 'sera'} pas tagué${s} · les fichiers ne portent pas de tag.`;
}

/**
 * Les tags EN USAGE, dans l'ordre du catalogue, avec leur nombre de dossiers ·
 * les puces de filtre de l'arbre. Un tag sans dossier ne s'affiche pas
 * (maquette · « Ajoute un tag depuis un dossier. » quand aucun n'est posé).
 */
export function tagsEnUsage(tags: ReadonlyArray<string | null | undefined>, actif: CleTagCouleur | null = null): Array<TagCouleur & { compte: number; actif: boolean }> {
  const comptes = new Map<string, number>();
  for (const t of tags) if (estTagCouleur(t)) comptes.set(t, (comptes.get(t) ?? 0) + 1);
  return TAGS_COULEUR.filter((t) => comptes.has(t.cle)).map((t) => ({ ...t, compte: comptes.get(t.cle)!, actif: t.cle === actif }));
}

/* ───────────────────────────── Lisibilité mesurée ───────────────────────────── */

type Rgb = readonly [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** `color-mix(in srgb, a p%, b)` entre deux couleurs opaques. */
const melange = (a: Rgb, p: number, b: Rgb): Rgb => [a[0] * p + b[0] * (1 - p), a[1] * p + b[1] * (1 - p), a[2] * p + b[2] * (1 - p)];
const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contraste = (x: Rgb, y: Rgb) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p) as [number, number]; return (a + 0.05) / (b + 0.05); };

/**
 * Contraste WCAG du libellé de l'étiquette `.ftag` d'un tag, sur son propre
 * lavis, posé sur la carte · EXACTEMENT les règles des deux feuilles :
 *  · sombre (`spatial.css`) · texte `color-mix(--tc 55%, #fff)`, lavis `--tc` à
 *    20 %, carte `#ffffff0a` posée sur la page (`.dmain` n'est pas une tuile),
 *    encre `#0b1220` ;
 *  · clair (`spatial-clair.css`, dérivée) · texte
 *    `color-mix(color-mix(--tc 40%, #0b1220) 55%, #0b1220)`, lavis `--tc` à
 *    20 %, carte `#0b12200a` sur le papier `#eef1f6`.
 * Le flou de la créa sous le verre n'est pas compté (fond uni, le cas courant).
 *
 * Mesuré le 29/10/2026 (texte 11 px gras · seuil AA 4,5) :
 *
 * | tag    | sombre | clair |
 * | ------ | ------ | ----- |
 * | rouge  | 7,27   | 9,36  |
 * | orange | 7,67   | 9,19  |
 * | jaune  | 8,37   | 8,72  |
 * | vert   | 7,98   | 8,74  |
 * | bleu   | 7,38   | 9,13  |
 * | violet | 7,33   | 9,25  |
 * | rose   | 7,33   | 9,28  |
 * | gris   | 7,48   | 9,22  |
 *
 * Pire paire · rouge en sombre, 7,27 · la garde exige 4,5 (marge ≈ 60 %).
 */
export function contrasteEtiquetteTag(cle: CleTagCouleur, theme: 'sombre' | 'clair'): number {
  const tc = hex(PAR_CLE.get(cle)!.teinte);
  const nuit: Rgb = [11, 18, 32], blanc: Rgb = [255, 255, 255];
  if (theme === 'sombre') {
    const carte = melange(blanc, 0x0a / 255, nuit);
    return contraste(melange(tc, 0.55, blanc), melange(tc, 0.2, carte));
  }
  const papier: Rgb = [0xee, 0xf1, 0xf6];
  const carte = melange(nuit, 0x0a / 255, papier);
  return contraste(melange(melange(tc, 0.4, nuit), 0.55, nuit), melange(tc, 0.2, carte));
}
