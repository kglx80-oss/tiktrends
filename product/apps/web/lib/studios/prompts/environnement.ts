/**
 * Environnement du registre de prompts · décide si une release NON évaluée
 * peut être activée. PUR : reçoit les variables, ne les lit pas.
 *
 * Règle (cahier §8.2) : en production, une release sans benchmark approuvé sur
 * son empreinte ne devient jamais active. Pour prouver la chaîne complète en
 * recette LOCALE, un drapeau serveur explicite ouvre l'environnement « test » :
 *
 *   STUDIOS_PROMPTS_RECETTE_LOCALE=1
 *
 * Il n'est honoré QUE si la base est locale (hôte 127.0.0.1, localhost ou ::1).
 * La base de production est jointe par son nom de service (`db`, cf.
 * `.env.deploy.example`) : poser le drapeau là-bas ne change rien. Toute
 * valeur illisible retombe sur « production », le côté sûr.
 */

export type EnvironnementPrompts = 'production' | 'test';

export const DRAPEAU_RECETTE_LOCALE = 'STUDIOS_PROMPTS_RECETTE_LOCALE';
const HOTES_LOCAUX: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Hôte d'une URL Postgres, ou `null` si illisible. */
export function hoteBase(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

export function environnementPrompts(env: Readonly<Record<string, string | undefined>>): EnvironnementPrompts {
  if (env[DRAPEAU_RECETTE_LOCALE] !== '1') return 'production';
  const hote = hoteBase(env.DATABASE_URL);
  return hote !== null && HOTES_LOCAUX.has(hote) ? 'test' : 'production';
}
