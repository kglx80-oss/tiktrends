import { hoteBase } from '../../../../lib/studios/prompts/environnement';

/** Page de recette · ouverte hors production ; en build de production, seulement drapeau ET base locale. */
const HOTES_LOCAUX = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function recetteAutorisee(env: Readonly<Record<string, string | undefined>>): boolean {
  if (env.NODE_ENV !== 'production') return true;
  return env.STUDIOS_RECETTE_PAGES === '1' && HOTES_LOCAUX.has(hoteBase(env.DATABASE_URL) ?? '');
}
