/**
 * Supprimer une marque quand le nouveau studio a écrit pour elle.
 *
 * ── Pourquoi une règle ───────────────────────────────────────────────────────
 *
 * Avant le studio, supprimer une marque emportait toute sa donnée par cascade
 * (fil Jarvis compris). Les tables `studio_*` la protègent en RESTRICT : un
 * registre de dépense, un audit, une version de projet ne disparaissent pas
 * avec un clic. Mais depuis que Jarvis trace chaque tour dans
 * `studio_prompt_runs`, une marque qui a seulement CONVERSÉ devenait
 * impossible à supprimer · la base refusait et l'écran tombait en erreur.
 *
 * La règle sépare deux natures :
 *  - les TRACES d'exécution (`studio_prompt_runs`) suivent la marque, comme
 *    son fil Jarvis · la dépense réelle reste dans `ai_spend`, qui ne dépend
 *    pas de la marque ;
 *  - l'HISTORIQUE studio (projets, médias, registre de dépense, audit,
 *    prompts propres à la marque) et les RESTRICTIONS d'accès d'un membre
 *    bloquent la suppression, avec un motif lisible. Effacer une restriction
 *    rendrait toutes les marques à ce membre : un refus vaut mieux qu'une
 *    escalade silencieuse.
 */
export interface ComptesStudioMarque {
  projets: number;
  medias: number;
  registre: number;
  audit: number;
  prompts: number;
  restrictions: number;
}

export type RefusSuppressionMarque = 'studio_historique' | 'studio_restrictions';

/** Copie client des refus, indexée par le code porté dans l'URL (`/brands?e=`). */
export const MESSAGES_SUPPRESSION_MARQUE: Readonly<Record<RefusSuppressionMarque, string>> = {
  studio_restrictions: 'Des membres sont limités à cette marque. Retire d’abord leur restriction, sinon ils verraient toutes les marques.',
  studio_historique: 'Cette marque a un historique dans le studio (projets, médias ou dépenses). Il est conservé · la marque ne peut pas être supprimée.',
};

/** `null` = suppression permise ; sinon le motif du refus. */
export function refusSuppressionMarque(c: ComptesStudioMarque): RefusSuppressionMarque | null {
  if (c.restrictions > 0) return 'studio_restrictions';
  if (c.projets + c.medias + c.registre + c.audit + c.prompts > 0) return 'studio_historique';
  return null;
}
