/**
 * Spatial · « Prompts conseillés » (`/studio/prompts`, maquette `prompts`). Pur.
 *
 * La maquette montre six catégories et des prompts d'exemple appuyés sur des
 * apprentissages fictifs. La seule source réelle de prompts est le REGISTRE des
 * Studios (`studio_prompt_versions` / `_releases`, écran admin « IA et
 * Studios ») · il ne contient que les consignes INTERNES des appels IA
 * (orientation Jarvis, brief, image…) et des recettes de style, jamais des
 * textes destinés à être copiés par un client. Les exposer ici reviendrait à
 * publier les consignes système · on ne le fait pas. L'écran dit donc, en
 * clair, qu'aucun prompt conseillé n'est publié (décision produit à prendre :
 * un type de contenu « conseillé » dans le registre).
 */
export const VIDE_PROMPTS_SPATIAL = {
  titre: 'Aucun prompt conseillé publié pour l’instant',
  texte: 'Les prompts de TikTrends servent aujourd’hui aux consignes internes des studios, validées par l’équipe · ils ne sont pas faits pour être copiés. Les points de départ conseillés apparaîtront ici dès qu’une bibliothèque sera publiée. En attendant, pars d’une pub gagnante ou d’un nouveau projet.',
} as const;
