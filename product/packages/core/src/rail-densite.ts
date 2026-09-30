import { CIBLE_TACTILE_MIN } from './cible-tactile';

/**
 * La densité du rail de navigation · une rangée par pointeur.
 *
 * ── Le problème mesuré ───────────────────────────────────────────────────────
 *
 * Chaque rangée du rail imposait `CIBLE_TACTILE_MIN` (44) en hauteur, tête ET
 * sous-item. Un compte complet montre huit têtes plus quatre en-têtes de groupe ;
 * à 44 px la rangée, la pile des têtes seule dépasse la hauteur utile d'un écran
 * de 720 px une fois retirés l'identité, l'espace, la marque, les crédits et le
 * compte. Les entrées principales n'étaient donc plus toutes visibles à 720 sans
 * défiler · exactement ce que la refonte façon Flora doit régler.
 *
 * ── Deux hauteurs, selon le pointeur, jamais sous 44 au doigt ─────────────────
 *
 * La règle des 44 px (WCAG 2.5.5 AAA, Apple HIG) protège le POINTEUR GROSSIER
 * (le doigt). WCAG 2.5.8 (AA) l'abaisse à 24 px, et l'exception « cible ancrée »
 * autorise plus serré quand un pointeur FIN (souris) vise. On garde donc 44 au
 * tactile (mobile · le rail y est un tiroir pleine hauteur, aucune contrainte de
 * densité) et on descend à une rangée FINE au pointeur de précision, où la
 * densité débloque la visibilité à 720.
 *
 * La valeur fine est choisie DANS la fourchette 32-36 de la direction (30/09) ·
 * 32 px, MESURÉ pour que les entrées principales tiennent à 720 en desktop
 * (recette CDP · contenu de nav 419 px sous la fenêtre utile 427). Le texte de
 * rangée reste à 13-14 px (lisible), la cible reste cliquable à la souris.
 *
 * Ce module ne rend rien · il DÉCIDE la hauteur. Le rail lit `hauteurRangeeRail`
 * et un test la vérifie au RÉSULTAT (les nombres), pas en constatant un appel.
 */

/** Rangée au pointeur grossier (doigt) · jamais sous la cible tactile. */
export const HAUTEUR_RANGEE_TACTILE = CIBLE_TACTILE_MIN;

/**
 * Rangée au pointeur fin (souris) · dans la fourchette 32-36 de la direction,
 * avec marge sous 36. C'est elle qui rend les têtes visibles à 720 en desktop.
 */
export const HAUTEUR_RANGEE_FINE = 32;

/** Hauteur nominale d'un en-tête de groupe (libellé de section), en desktop. */
export const HAUTEUR_ENTETE_GROUPE = 20;

/**
 * La hauteur d'une rangée de navigation selon le pointeur.
 * `tactile` vrai (mobile · tiroir) → 44 ; faux (souris · desktop) → rangée fine.
 */
export function hauteurRangeeRail(tactile: boolean): number {
  return tactile ? HAUTEUR_RANGEE_TACTILE : HAUTEUR_RANGEE_FINE;
}

/**
 * La hauteur de la PILE des entrées principales du rail (têtes + en-têtes de
 * groupe), branches repliées. Sert à vérifier que les entrées tiennent dans la
 * hauteur utile à 720 en desktop · un RÉSULTAT mesurable, pas une intuition.
 * `entetes` compte les en-têtes de groupe RÉELLEMENT rendus (une entrée de tête
 * sans libellé de section, comme Accueil, n'en a pas).
 */
export function hauteurPileTetes({ tetes, entetes, tactile }: { tetes: number; entetes: number; tactile: boolean }): number {
  return tetes * hauteurRangeeRail(tactile) + entetes * HAUTEUR_ENTETE_GROUPE;
}
