/**
 * Bornes d'un appel texte d'une tâche studio · source UNIQUE.
 *
 * Le résolveur (`apps/web/lib/studios/prompts/resolveur.ts`) les applique à
 * chaque appel ; les écrans en tirent le coût maximal annoncé AVANT le clic
 * (entrée pleine, sortie pleine). Deux lots les avaient recopiées : une borne
 * changée d'un côté aurait fait mentir le plafond affiché de l'autre.
 */
export const JETONS_ENTREE_MAX_PROPOSITION = 24_000;
export const JETONS_SORTIE_MAX_PROPOSITION = 4_000;
/** Part du budget de contexte réservée aux éléments obligatoires (allocation L2). */
export const JETONS_RESERVE_CONTEXTE = 4_000;
