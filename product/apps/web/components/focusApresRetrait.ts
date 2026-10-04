'use client';

/**
 * Où va le focus quand une carte quitte une grille (archivage, suppression) ·
 * lot 13. Mesuré au navigateur · le bouton cliqué disparaissait avec sa carte
 * et le focus tombait sur <body>. Il passe à la carte qui prend la place (même
 * rang, sinon la dernière), sur son premier contrôle ; à défaut, au repli
 * (le titre de la galerie, focalisable par programme).
 */
export function focusApresRetrait(grille: HTMLElement | null, rang: number, repli: HTMLElement | null) {
  requestAnimationFrame(() => {
    const cartes = grille ? Array.from(grille.children) as HTMLElement[] : [];
    const carte = cartes[Math.min(rang, cartes.length - 1)];
    const cible = carte?.querySelector<HTMLElement>('button:not([disabled]), a[href]');
    (cible ?? repli)?.focus();
  });
}
