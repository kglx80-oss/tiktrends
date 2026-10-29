'use client';

import { useSyncExternalStore } from 'react';
import { navigateurHorsLigne } from '@tiktrends/core';

function suivreConnexion(f: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', f);
  window.addEventListener('offline', f);
  return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); };
}

/**
 * Vrai quand le navigateur se sait hors ligne (`navigator.onLine`), suivi aux
 * événements `online` / `offline` · le mode hors ligne du panneau V5
 * « Variantes et tests ». Le rendu serveur vaut « en ligne » · on ne ferme
 * rien sur une supposition (règle `navigateurHorsLigne`).
 */
export function useHorsLigne(): boolean {
  return useSyncExternalStore(suivreConnexion, () => navigateurHorsLigne(typeof navigator === 'undefined' ? null : navigator), () => false);
}
