/**
 * Les gabarits du Studio, et le mécanisme ADSMAP qu'ils portent.
 *
 * ── Pourquoi cette table quitte la passerelle ────────────────────────────────
 *
 * Elle vivait dans `adsmap-bridge.ts`, un fichier `'use server'`. Deux
 * conséquences : elle n'était pas testable, et le jour où un deuxième appelant
 * en a eu besoin il aurait fallu la recopier · deux tables finissent toujours
 * par diverger, et celle qui se trompe ne le dit pas.
 *
 * ── Ce que la table cachait ──────────────────────────────────────────────────
 *
 * Elle était écrite `Record<string, string>` avec des clés inventées au fil de
 * l'eau · `benefit_stack`, `listicle`, `comparison`, `story`, `demo`,
 * `social_proof`. Aucune n'existe dans la liste réelle des gabarits, et
 * `benefits` — qui existe, lui — n'y figurait PAS.
 *
 * Toute créa « Bénéfices annotés » retombait donc sur le mécanisme par défaut,
 * `demo`, depuis toujours. Ses tests s'accumulaient sous une étiquette qui
 * n'était pas la sienne, et la mémoire de Jarvis en tirait des conclusions sur
 * un mécanisme qu'elle n'avait pas mesuré.
 *
 * Le type `Record<StudioTemplate, string>` rend l'oubli impossible à compiler ·
 * un gabarit ajouté sans mécanisme casse la construction au lieu de se ranger
 * en silence sous `demo`.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

/**
 * Les gabarits proposés dans le composeur.
 *
 * Cette liste double `AD_TEMPLATES` de `@tiktrends/ai` · les deux paquets ne se
 * dépendent pas. Un test dans l'application, qui voit les deux, échoue si elles
 * divergent · c'est là que le doublon est rattrapé, pas dans un commentaire.
 */
export const STUDIO_TEMPLATES = [
  'problem_solution', 'before_after', 'testimonial', 'benefits', 'ugc', 'stat', 'offer',
] as const;

export type StudioTemplate = typeof STUDIO_TEMPLATES[number];

/** Le mécanisme ADSMAP sous lequel les tests d'un gabarit s'accumulent. */
export const TEMPLATE_MECHANISM: Record<StudioTemplate, string> = {
  problem_solution: 'problem_agitate',
  before_after: 'comparison',
  testimonial: 'social_proof',
  benefits: 'listicle',
  ugc: 'story',
  stat: 'statistic_shock',
  offer: 'scarcity',
};

/** Le nom affiché · un seul endroit, pour que l'écran et le serveur disent pareil. */
export const TEMPLATE_LABEL: Record<StudioTemplate, string> = {
  problem_solution: 'Problème / solution',
  before_after: 'Avant / après',
  testimonial: 'Témoignage / note',
  benefits: 'Bénéfices annotés',
  ugc: 'UGC natif',
  stat: 'Chiffre-clé',
  offer: 'Offre / promo',
};

export function isStudioTemplate(t: unknown): t is StudioTemplate {
  return typeof t === 'string' && (STUDIO_TEMPLATES as readonly string[]).includes(t);
}

/**
 * Le mécanisme d'un gabarit · `null` quand on ne sait pas.
 *
 * Rendre `null` plutôt qu'un mécanisme par défaut est délibéré : l'appelant qui
 * DOIT écrire quelque chose choisit son repli et l'assume, celui qui ne fait que
 * lire se tait. Un défaut caché ici reproduirait exactement la panne de
 * `benefits`.
 */
export function mechanismForTemplate(t: string | null | undefined): string | null {
  return isStudioTemplate(t) ? TEMPLATE_MECHANISM[t] : null;
}
