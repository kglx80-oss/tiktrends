/**
 * Écrire les critères d'une liste dans l'URL (remplacement, sans empiler).
 *
 * L'état passé est TOUJOURS `null`. Next 15 patche `history.replaceState` ·
 * un état qui porte sa marque interne (`__NA`) est pris pour un appel du
 * routeur lui-même et passe SANS synchroniser le routeur. Passer
 * `window.history.state` (qui la porte) laissait donc le routeur ignorer nos
 * paramètres, et sa réécriture suivante (après une action serveur qui
 * revalide) les effaçait · mesuré sur Suites (`?mode=` perdu après création,
 * recette #106). Avec `null`, Next recopie son état interne et met à jour son
 * URL canonique.
 */
export function remplacerRecherche(recherche: string): void {
  const { pathname, hash } = window.location;
  window.history.replaceState(null, '', `${pathname}${recherche}${hash}`);
}
