'use client';

import { useEffect } from 'react';
import { ficheARouvrir, type VueAdsmap } from '@tiktrends/core';

/**
 * Avant (ou Retour) vers l'entrée d'une fiche · la liste de la vue qui l'avait
 * ouverte la rouvre (recette #106 · `ficheARouvrir`). Fermer reste l'affaire
 * du panneau (bouton, Échap, Retour).
 */
export function useRouvrirFiche(vue: VueAdsmap, ouvrir: (adId: string) => void): void {
  useEffect(() => {
    const surHistorique = (e: PopStateEvent) => {
      const id = ficheARouvrir(e.state ?? window.history.state, vue, window.location.search);
      if (id) ouvrir(id);
    };
    window.addEventListener('popstate', surHistorique);
    return () => window.removeEventListener('popstate', surHistorique);
  }, [vue, ouvrir]);
}
