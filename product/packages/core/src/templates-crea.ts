/**
 * Les TEMPLATES de créative · la bibliothèque visuelle que l'agence nourrit.
 *
 * ── Le besoin ────────────────────────────────────────────────────────────────
 *
 * Le propriétaire veut une bibliothèque de gabarits VISUELS, alimentée « dans les
 * coulisses » (l'agence, admin+), et visible du client qui s'en sert pour
 * générer · jamais modifiable par lui.
 *
 * ── Le choix 0-migration ─────────────────────────────────────────────────────
 *
 * Un asset (image, déjà en base avec sa miniature) DEVIENT un template quand il
 * porte un marqueur réservé dans ses `tags`. Aucun changement de schéma · on
 * réutilise la bibliothèque Assets. Le marqueur est distinct des tags humains ou
 * IA (double souligné) pour ne jamais entrer en collision avec eux.
 *
 * ── Ce que ce module NE fait pas ─────────────────────────────────────────────
 *
 * Il ne dit pas QUI a le droit de marquer (c'est un contrôle d'accès · admin+,
 * vérifié dans l'action serveur). Il dit seulement ce qu'EST un template et
 * comment poser/retirer le marqueur proprement. Pur : ni base, ni réseau.
 */

/** Le marqueur réservé qui range un asset parmi les templates. */
export const TAG_TEMPLATE = '__template__';

/** Vrai si l'asset (par ses tags) est un template de la bibliothèque. */
export function estTemplateAsset(tags?: readonly string[] | null): boolean {
  return !!tags && tags.includes(TAG_TEMPLATE);
}

/**
 * Pose ou retire le marqueur de template · rend une liste de tags propre, sans
 * doublon du marqueur, en préservant les autres tags tels quels. Idempotent :
 * marquer deux fois ne crée pas deux marqueurs, démarquer un non-template ne
 * casse rien.
 */
export function avecTemplate(tags: readonly string[] | null | undefined, on: boolean): string[] {
  const base = (tags ?? []).filter((t) => t !== TAG_TEMPLATE);
  return on ? [...base, TAG_TEMPLATE] : base;
}

/**
 * Lot 12 V5 · un tag posé À LA MAIN dans la Bibliothèque vit dans la même
 * colonne `tags`, préfixé de ce marqueur réservé (double souligné, comme le
 * template · 0 migration). Le préfixe distingue la main de l'analyse · une
 * nouvelle analyse remplace les tags IA et GARDE ceux-ci
 * (`spatial/bibliotheque/tags-fichier.ts`). Les écrans ne voient que le libellé.
 */
export const PREFIXE_TAG_MAIN = '__main__:';

/** Le libellé affiché d'un tag stocké · un tag posé à la main perd son préfixe. */
export function libelleTagStocke(t: string): string {
  return t.startsWith(PREFIXE_TAG_MAIN) ? t.slice(PREFIXE_TAG_MAIN.length) : t;
}

/**
 * N'expose au client que les tags visibles · le marqueur reste une plomberie ·
 * un tag posé à la main se montre par son libellé, une seule fois (un tag IA de
 * même libellé exact ne le double pas).
 */
export function tagsVisibles(tags?: readonly string[] | null): string[] {
  const out: string[] = [];
  for (const t of tags ?? []) {
    if (t === TAG_TEMPLATE) continue;
    const l = libelleTagStocke(t);
    if (l && !out.includes(l)) out.push(l);
  }
  return out;
}

/**
 * Range les templates de l'agence EN PREMIER, l'ordre relatif conservé (tri
 * stable). Le client choisit une référence dans l'assistant · les gabarits
 * curés doivent tomber sous les yeux avant le reste de la bibliothèque, sans
 * masquer celle-ci. Pur · s'applique à toute liste portant `isTemplate`.
 */
export function templatesDabord<T extends { isTemplate?: boolean }>(items: readonly T[]): T[] {
  const oui: T[] = [];
  const non: T[] = [];
  for (const it of items) (it.isTemplate ? oui : non).push(it);
  return [...oui, ...non];
}
