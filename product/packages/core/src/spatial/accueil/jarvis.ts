/**
 * Spatial · Accueil · la barre « Ta question à Jarvis… » (`jhero jhome` de la
 * maquette). Pur · ni base, ni réseau, ni horloge.
 *
 * ── Ce que la barre fait, et ce qu'elle ne fait JAMAIS ───────────────────────
 *
 * Elle ouvre une VRAIE conversation Jarvis (`/jarvis`) avec la question
 * PRÉREMPLIE dans la saisie · elle n'envoie rien, n'appelle aucun modèle et ne
 * débite rien. L'envoi reste un clic explicite sur l'écran Jarvis, là où le
 * coût est annoncé (barrière `sousPlafond`). Aucune réponse n'est simulée sur
 * l'Accueil (la maquette en jouait une, `jarvisAsk`).
 *
 * ── Le contrat avec l'écran Jarvis ───────────────────────────────────────────
 *
 * La question voyage dans le paramètre `q` (`PARAM_QUESTION_JARVIS`). L'écran
 * Jarvis la lit par `lireQuestionJarvis` et la pose dans sa saisie
 * (`brouillonInitial` de `JarvisChat`, « toujours soumise par un clic
 * explicite »). Bornée à la longueur que la saisie accepte (4 000 caractères).
 */

const CHEMIN_JARVIS = '/jarvis';
export const PARAM_QUESTION_JARVIS = 'q';
/** La saisie de Jarvis tronque à 4 000 caractères (`JarvisChat`) · la même borne ici. */
export const LONGUEUR_MAX_QUESTION_JARVIS = 4000;

/** Une question nettoyée · espaces de bord retirés, bornée · `null` si vide. */
export function questionJarvisPropre(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\u0000/g, '').trim().slice(0, LONGUEUR_MAX_QUESTION_JARVIS).trim();
  return t ? t : null;
}

/** L'adresse de la conversation, question préremplie · `/jarvis` seul sans question. */
export function lienQuestionJarvis(question: unknown): string {
  const q = questionJarvisPropre(question);
  if (!q) return CHEMIN_JARVIS;
  return `${CHEMIN_JARVIS}?${new URLSearchParams({ [PARAM_QUESTION_JARVIS]: q })}`;
}

/** Côté Jarvis · la question préremplie lue dans les paramètres de la page (`''` sans question). */
export function lireQuestionJarvis(params: Record<string, string | string[] | undefined> | URLSearchParams | null | undefined): string {
  if (!params) return '';
  const brut = params instanceof URLSearchParams ? params.get(PARAM_QUESTION_JARVIS) : params[PARAM_QUESTION_JARVIS];
  return questionJarvisPropre(Array.isArray(brut) ? brut[0] : brut) ?? '';
}

/**
 * Les pastilles de demande de la maquette · un thème, une question type. Ce ne
 * sont pas des données · ce sont des amorces, préremplies sans envoi.
 */
export const PASTILLES_JARVIS_ACCUEIL: ReadonlyArray<{ libelle: string; question: string }> = [
  'Stratégie', 'Angles', 'Accroches', 'Concurrents', 'Résultats', 'Créatif', 'Inspiration',
].map((libelle) => ({ libelle, question: `${libelle} : que me conseilles-tu ?` }));

/**
 * Les sources que la conversation lit RÉELLEMENT, montrées en pastilles
 * (`pill c`). La maquette en affiche quatre (Meta, TikTok, Veille, Fiche
 * marque) · la conversation Jarvis n'en injecte qu'une aujourd'hui, la fiche de
 * la marque active (`JarvisChat` · « seule Fiche marque est réelle »). On ne
 * prête pas à Jarvis des lectures qu'il ne fait pas · une source absente n'a
 * pas de pastille.
 */
export function sourcesJarvisAccueil(p: { marqueActive: boolean }): string[] {
  return p.marqueActive ? ['Fiche marque'] : [];
}

/** Le titre de la barre · la marque active si elle existe. */
export function titreJarvisAccueil(marque: string | null): string {
  const m = marque?.trim();
  return m ? `Comment je peux t’aider sur ${m} ?` : 'Comment je peux t’aider ?';
}
