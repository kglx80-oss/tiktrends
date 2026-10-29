/**
 * Spatial · Projet · onglet « Créations » · le mode HORS LIGNE du panneau
 * « Variantes et tests », porté du panneau V5 (`PanneauVariantes`, retiré avec
 * la fiche V5 le 28/10). Pur · ni navigateur, ni base.
 *
 * Quand le navigateur se sait hors ligne, les gestes qui partent au serveur
 * (retenir, itérer, relire, rattacher, préparer un lot) sont SUSPENDUS avant
 * l'envoi, et l'écran le dit en mots · les saisies restent en place. Le retour
 * en ligne rouvre les gestes, rien n'est rejoué tout seul.
 */

/** Le navigateur se sait-il hors ligne ? Inconnu (rendu serveur, propriété absente) ⇒ en ligne · on ne ferme rien sur une supposition. */
export function navigateurHorsLigne(nav: { onLine?: unknown } | null | undefined): boolean {
  return !!nav && nav.onLine === false;
}

/** Les mots du mode hors ligne · ceux du panneau V5. */
export const TEXTES_HORS_LIGNE = {
  pastille: 'Hors ligne',
  panneau: 'Hors ligne · les gestes sont suspendus, rien n’est envoyé. Tes saisies restent en place.',
  formulaire: 'Hors ligne · rien n’est envoyé, tes saisies restent ici.',
  bouton: 'Hors ligne · le geste reprendra quand la connexion sera rétablie',
} as const;
