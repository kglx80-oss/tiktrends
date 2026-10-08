import { environnementPrompts } from '../../../../lib/studios/prompts/environnement';

/**
 * La page de recette des propositions est-elle ouverte ? Hors production :
 * oui. En production : seulement en recette LOCALE explicite du registre
 * (`STUDIOS_PROMPTS_RECETTE_LOCALE=1` ET base sur 127.0.0.1 / localhost), pour
 * capturer le build de production sur une base locale. La base de production
 * est jointe par le nom de service `db` : le drapeau n'y ouvre rien.
 */
export function recetteOuverte(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.NODE_ENV !== 'production' || environnementPrompts(env) === 'test';
}
