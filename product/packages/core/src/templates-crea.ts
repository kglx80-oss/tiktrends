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

/** N'expose au client que les tags visibles · le marqueur reste une plomberie. */
export function tagsVisibles(tags?: readonly string[] | null): string[] {
  return (tags ?? []).filter((t) => t !== TAG_TEMPLATE);
}
