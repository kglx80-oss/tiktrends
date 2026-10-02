/**
 * Changer de marque dans le rail (lot 14 · registre n° 29).
 *
 * ── Le défaut mesuré ─────────────────────────────────────────────────────────
 *
 * La bascule passait par `setActiveBrand` puis `router.refresh()`, un
 * rafraîchissement SOUPLE du routeur client. Le cookie et les deux réponses du
 * serveur portaient bien la nouvelle marque, mais l'écran gardait l'ancienne.
 * Mesuré en local, 24 bascules (4 écrans × 2 cycles × 3 marques), seuil 8 s :
 *
 * | Build                                        | Échecs |
 * | -------------------------------------------- | ------ |
 * | d820645, sans tête                           | 10/24, puis 9/24  |
 * | d820645, navigateur graphique (Xvfb)         | 13/24  |
 * | db53467 (avant lot 13)                       | 10/24  |
 * | sans `router.refresh()` (hypothèse réfutée)  | 14/24  |
 *
 * Le diagnostic, dans l'ordre :
 * - le serveur répond en 20 à 50 ms, réponse COMPLÈTE comprise ;
 * - l'action et l'appel au rafraîchissement aboutissent en ~50 ms, puis la
 *   transition reste `pending` · la nouvelle marque n'arrive en props qu'au
 *   prochain passage d'une AUTRE action du routeur (la cloche, toutes les 25 s ·
 *   6 bascules sur 8, validées à 35 ms de cet appel) ou au clic suivant ;
 * - un `router.refresh()` SEUL, cookie posé à la main, cale 6 fois sur 12 ;
 * - hors du gabarit `(app)` (/legal/cgv, /tarifs, /invite/…, /c/…) · 0 sur 32 ;
 *   avec un gabarit `(app)` réduit à `{children}` · toujours 4 sur 24 ;
 * - état de la racine React pendant le blocage · la voie de transition est
 *   `pending` ET `suspended`, `pingedLanes` = 0, aucun rendu programmé, aucune
 *   validation différée, aucune promesse en attente (seuls des blocs Flight
 *   `resolved_model` / `resolved_module`). Le rendu attend une relance qui
 *   ne vient jamais · le défaut est dans la transition du routeur client
 *   (Next 15.5.23, React 19.2.0-canary-0bdb9206), pas dans nos données. C'est
 *   la même famille que la recette #106b (`chargementCompletRequis`).
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Changer de marque est une REMISE À ZÉRO du contexte (galeries, produits,
 * brouillons semés depuis la marque · cf. F01). On la confie au navigateur ·
 * le cookie posé, la page est rechargée en entier, et le rail, le contenu et le
 * cookie sortent du même rendu serveur. Ni second essai, ni temporisation · un
 * seul chargement, déterministe. Choisir la marque déjà active ne recharge rien.
 */

/** Faut-il recharger ? Seulement si la marque choisie diffère de l'active. `''` = « Toutes les marques ». */
export function basculeMarqueNecessaire(choisie: string, active: string | null): boolean {
  return (choisie || null) !== (active || null);
}

/**
 * Clé de session · posée juste avant le rechargement, lue une fois au retour
 * pour rendre le focus au sélecteur (sinon il tombe sur le document, et un
 * utilisateur au clavier perd sa place).
 */
export const CLE_FOCUS_BASCULE_MARQUE = 'tt_focus_bascule_marque';

export const BASCULE_MARQUE_EN_COURS = 'Changement de marque…';

export const ECHEC_BASCULE_MARQUE = 'Le changement de marque n’a pas abouti · la marque active n’a pas changé. Tu peux réessayer.';

/** Nom accessible du sélecteur · la marque active en entier, puis ce que fait le bouton. */
export function nomSelecteurMarque(active: string | null): string {
  return `Marque active : ${active ?? 'toutes les marques'} · changer de marque`;
}
