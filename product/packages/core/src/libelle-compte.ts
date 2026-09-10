/**
 * La phrase d'un compteur, avec l'accord juste.
 *
 * « Aucune visuel pour l'instant », « Aucune brief pour l'instant » traînaient
 * sur la page de garde du Studio · l'accord de « aucun » était figé au féminin,
 * quel que soit le nom compté. Un nom masculin (un visuel, un brief) le prenait
 * de plein fouet · c'est le genre de faute que le propriétaire voit au premier
 * coup d'œil.
 *
 * La règle vit ici, pure et testable · pas dans le JSX où elle était née. Le
 * genre accompagne le libellé, et « aucun / aucune » le suit.
 */
export type Genre = 'm' | 'f';

export function phraseCompte(n: number, label: string, genre: Genre): string {
  if (n <= 0) return `${genre === 'f' ? 'Aucune' : 'Aucun'} ${label} pour l’instant`;
  return `${n} ${label}${n > 1 ? 's' : ''}`;
}
