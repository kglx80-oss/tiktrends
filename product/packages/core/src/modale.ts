/**
 * La fenêtre modale V5 · ses mesures et sa présentation selon la largeur.
 *
 * ── D'où viennent les nombres ────────────────────────────────────────────────
 *
 * Relevés dans le prototype V5 (proto5 · `tt-v5.css`, `tt-v5-r13.css`), ouvert
 * dans Chromium et mesuré par `getComputedStyle` le 14/10, une fenêtre longue
 * (14 champs + pied) à 1440 × 720 et 390 × 720 :
 *
 * | Mesure                    | 1440 × 720 (centrée)     | 390 × 720 (feuille)       |
 * | ------------------------- | ------------------------ | ------------------------- |
 * | Panneau · rayon           | 18 px                    | 20 px 20 px 0 0           |
 * | Panneau · hauteur max     | min(84vh, 760px)         | 88vh                      |
 * | Panneau · largeur         | min(580, 100vw − 32)     | 100 %                     |
 * | En-tête · padding         | 16 20 16 28              | 10 20 12 18               |
 * | Corps · padding           | 24 28 0 (+24 en fin)     | 18 18 0 (+18 en fin)      |
 * | Pied · padding            | 14 28 18                 | 12 18 16                  |
 * | Croix · cible             | 44 × 44, rayon 10        | 44 × 44, rayon 10         |
 * | Poignée (feuille)         | ·                        | 40 × 4, 10 px du haut     |
 * | Voile · flou              | blur(3px)                | blur(3px)                 |
 * | Bascule en feuille        | `@media (max-width: 600px)`                          |
 *
 * Une seule divergence assumée · le rayon de la fenêtre CENTRÉE reste celui du
 * rôle `surface` de la charte (`--r-card`, 20 px · lot 19D, gardé par
 * `lot19d-cadres-source`) plutôt que les 18 px du prototype · deux pixels,
 * pour ne pas rouvrir une règle de cadre tranchée.
 *
 * Pur · aucune dépendance au DOM. Le composant (`apps/web/components/Modal.tsx`)
 * lit ces valeurs et la présentation calculée ici.
 */

/** Largeur d'écran (px) à partir de laquelle, et en dessous, la fenêtre devient une feuille ancrée en bas. */
export const MODALE_SEUIL_FEUILLE_PX = 600;

/** La requête média qui fait passer la fenêtre en feuille · ≤ 600 px, comme le prototype. */
export const MEDIA_FEUILLE_MODALE = `(max-width: ${MODALE_SEUIL_FEUILLE_PX}px)`;

/** Les mesures V5 par présentation · relevées, voir le tableau ci-dessus. */
export const MODALE_V5 = {
  centree: {
    hauteurMax: 'min(84vh, 760px)',
    margeEcran: 16,
    enTete: '16px 20px 16px 28px',
    corps: '24px 28px 0',
    finCorps: 24,
    pied: '14px 28px 18px',
  },
  feuille: {
    hauteurMax: '88dvh',
    rayonHaut: 'var(--r-card)',
    enTete: '10px 20px 12px 18px',
    corps: '18px 18px 0',
    finCorps: 18,
    pied: '12px 18px 16px',
    poignee: { largeur: 40, hauteur: 4, margeHaut: 10 },
    /** Fondu du bas du corps tant qu'il reste à défiler (comme les rangées défilantes V5 · 28 px). */
    masque: 28,
  },
  croixRayon: 10,
  flouVoile: 'blur(3px)',
} as const;

export type PresentationModale = 'centree' | 'feuille' | 'plein-ecran';

/**
 * Comment présenter la fenêtre · centrée avec voile au-dessus du seuil, feuille
 * ancrée en bas en dessous, plein écran seulement quand l'écran le DEMANDE et
 * qu'on est sur téléphone (cahier Studios §153).
 */
export function presentationModale({ feuille, telephone, pleinEcranDemande }: {
  /** L'écran est sous le seuil de feuille (`MEDIA_FEUILLE_MODALE`). */
  feuille: boolean;
  /** L'écran est un téléphone (≤ 480 px). */
  telephone: boolean;
  /** La fenêtre demande le plein écran sur téléphone. */
  pleinEcranDemande: boolean;
}): PresentationModale {
  if (pleinEcranDemande && telephone) return 'plein-ecran';
  if (feuille || telephone) return 'feuille';
  return 'centree';
}
