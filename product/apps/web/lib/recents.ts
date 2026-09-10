/**
 * Les écrans récemment visités · pour reprendre une tâche d'un raccourci.
 *
 * ⌘K savait naviguer partout, mais pas « là où j'étais il y a deux écrans ».
 * La liste vit dans le navigateur (localStorage) · ici, seulement la RÈGLE, pure
 * et testable : le dernier écran passe en tête, on ne garde pas de doublon, et on
 * plafonne la liste pour qu'elle reste courte et utile.
 */
export interface EcranRecent {
  path: string;
  label: string;
}

export function ajouterRecent(recents: EcranRecent[], entree: EcranRecent, max = 6): EcranRecent[] {
  const sansDoublon = recents.filter((r) => r.path !== entree.path);
  return [entree, ...sansDoublon].slice(0, Math.max(0, max));
}
