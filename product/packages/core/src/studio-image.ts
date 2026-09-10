import { directionByKey, directionPrompt, directionScenePrompt } from './ad-directions';

/**
 * Les règles pures du studio Image · l'équivalent, côté visuel seul, de ce que
 * `assistant-pub` / `production-mode` font pour la publicité.
 *
 * ── La direction artistique, réutilisée ──────────────────────────────────────
 *
 * Le studio Image générait sur une description libre · une phrase, donc une
 * image plausible et générique, exactement le défaut que le catalogue de
 * directions a corrigé pour la pub. On NE duplique PAS un second catalogue · un
 * visuel de studio est une SCÈNE (scène + lumière + finition), et le catalogue
 * `ad-directions` la porte déjà, mesurée. Quand on demande un texte lisible
 * dans l'image, la typographie et la disposition entrent aussi · c'est la
 * direction complète.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */
export function promptImage(base: string, directionKey: string | null | undefined, avecTexte: boolean): string {
  const b = (base || '').trim();
  const d = directionByKey(directionKey);
  if (!d) return b;
  const bloc = avecTexte ? directionPrompt(d) : directionScenePrompt(d);
  return b ? `${b}\n\n${bloc}` : bloc;
}
