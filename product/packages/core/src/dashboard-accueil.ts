/**
 * La composition de l'accueil (dashboard) · ce qui passe DEVANT.
 *
 * Le cap veut l'itération d'abord. Ce qu'on met en tête dépend d'un seul état :
 * le parcours d'installation est-il fini ?
 *
 * - Tant qu'un parcours EXISTE et n'est PAS complet · c'est l'installation qui
 *   guide (« Ta prochaine étape »). La subtilité qui a coûté : ne jamais
 *   travestir une étape d'installation (brancher un compte, créer une marque)
 *   en hypothèse analytique · une étape d'install n'est pas une itération.
 * - Sinon (parcours complet, ou pas de parcours calculable faute de marque) ·
 *   on prépare l'itération, sans pseudo-recommandation ni KPI inventé, en
 *   ouvrant les accès réels (Adsmap, Veille).
 *
 * Pur : ni base, ni réseau, ni modèle · donc testable.
 */
export type ModeProchaineEtape = 'installation' | 'iteration';

export function modeProchaineEtape(o: { parcoursPresent: boolean; journeyComplete: boolean }): ModeProchaineEtape {
  return o.parcoursPresent && !o.journeyComplete ? 'installation' : 'iteration';
}
