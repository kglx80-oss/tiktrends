/**
 * Ancien point d'entrée du clavier de la fiche (#1032) · la brique vit
 * désormais dans `./action-serveur` (bouton d'action serveur, `FERME`,
 * replacement du focus). Ce module ne fait que la RÉEXPORTER pour les écrans
 * hors rubrique qui l'importent encore (Résultats, Studios, Veille) · aucune
 * copie ici, et la rubrique projet ne l'importe plus (garde de source
 * `studios-brique-action-serveur`).
 */
export { FERME, focaliserApres, pendantAction } from './action-serveur';
