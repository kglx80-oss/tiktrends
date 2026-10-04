'use client';

import { focusApresVidage } from '@tiktrends/core';

/**
 * Lot 16 · reprise du focus quand la bibliothèque devient entièrement vide.
 * Le retrait du dernier concurrent visible DEMANDE la reprise ; l'état
 * « Ta bibliothèque est encore vide », monté par le rendu serveur, la PREND
 * une seule fois · seulement si la demande est récente et que le focus est
 * perdu (`focusApresVidage`, noyau). Une simple visite ne déplace rien.
 * En mémoire de l'onglet seulement · rien n'est stocké.
 */
let demandeA: number | null = null;

export function demanderFocusApresVidage(): void {
  demandeA = Date.now();
}

/** Consomme la demande (une seule fois) · vrai si le focus doit être repris. */
export function prendreFocusApresVidage(): boolean {
  const actif = typeof document === 'undefined' ? null : document.activeElement;
  const ok = focusApresVidage({ demandeA, maintenant: Date.now(), focusPerdu: !actif || actif === document.body });
  demandeA = null;
  return ok;
}
