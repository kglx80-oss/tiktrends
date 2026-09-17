/**
 * Les titres homonymes d'une galerie · qui a besoin d'être distingué.
 *
 * Une galerie de pubs répète souvent le même titre (même accroche déclinée,
 * même gabarit relancé) · côte à côte, deux « Ma piscine… » ne se distinguent
 * plus, et on clique au hasard. La règle — « ce titre est-il partagé par une
 * autre carte ? » — est une DÉCISION pure · elle vit au noyau, éprouvable sans
 * rendu, et l'écran se contente d'afficher le distingueur (variante, date) pour
 * les cartes qu'elle désigne.
 */

/** Normalise un titre pour la comparaison · espaces et casse ne créent pas de faux homonymes. */
function cle(titre: string): string {
  return (titre ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * L'ensemble des identifiants dont le titre est PARTAGÉ par au moins une autre
 * entrée de la liste. Un titre unique n'y figure pas · on ne surcharge que ce
 * qui, sinon, se confond. Un titre vide ne compte jamais comme homonyme (rien à
 * distinguer).
 */
export function idsHomonymes(items: ReadonlyArray<{ id: string; titre: string }>): Set<string> {
  const parCle = new Map<string, string[]>();
  for (const it of items) {
    const k = cle(it.titre);
    if (!k) continue;
    const l = parCle.get(k);
    if (l) l.push(it.id); else parCle.set(k, [it.id]);
  }
  const homonymes = new Set<string>();
  for (const ids of parCle.values()) {
    if (ids.length > 1) for (const id of ids) homonymes.add(id);
  }
  return homonymes;
}
