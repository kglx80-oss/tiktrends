/**
 * Spatial · « Tagging » (vague 4 · écran V5 `/tags` sans fragment de maquette).
 * Pur.
 *
 * L'écran V5 calculait tout sur un ÉCHANTILLON FIXE (`fixtures.tagged`) ·
 * aucun compte branché ne l'alimente (recette #106 · « un cul-de-sac de
 * chiffres faux pris pour les siens »). La règle Spatial « rien de simulé »
 * l'emporte · l'écran dit ce que fera l'analyse et qu'elle n'est pas encore
 * disponible, sans un seul chiffre d'exemple, et sans porte vers un
 * branchement qui n'existe pas. Le calcul (`topCreativeTags`,
 * `personaHookMatrix`, testés) reste au noyau pour le jour où une source
 * réelle existera.
 */
export const ETAT_TAGGING = {
  titre: 'L’analyse par ingrédient créatif n’est pas encore disponible',
  texte: 'Le Tagging décomposera tes créas en ingrédients (type de hook, persona, angle, émotion) et mesurera leur performance pondérée par la dépense. Aucune source ne l’alimente encore · plutôt que des chiffres d’exemple, rien n’est affiché ici.',
} as const;

/**
 * La sortie RÉELLE de l'écran · les apprentissages de Résultats lisent les
 * vrais tests de la marque, variable par variable. Absente sans accès à
 * Résultats (l'offre ou le rôle ne l'ouvrent pas).
 */
export function sortieTagging(p: { resultats: boolean }): { href: string; libelle: string } | null {
  return p.resultats ? { href: '/adsmap/apprentissages', libelle: 'Ouvrir les apprentissages' } : null;
}
