'use client';

import { useEffect } from 'react';
import { estAncreCarteVeille } from '@tiktrends/core';

/**
 * Lot 18B · revenir à SA carte · l'URL de retour porte l'ancre de la carte
 * (`#ad-<plateforme>-<id>`), mais le défilement natif vers l'ancre ne tenait pas
 * (mesuré · retour sur la bonne page, défilement remis en haut, la carte hors
 * de l'écran). Au montage, on centre la carte et on lui donne le focus · au
 * clavier, la tabulation repart de la carte d'où l'on était parti.
 */
export function DefileAncreVeille() {
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (!estAncreCarteVeille(h)) return;
    const carte = document.getElementById(h);
    if (!carte) return;
    carte.scrollIntoView({ block: 'center' });
    if (!carte.hasAttribute('tabindex')) carte.setAttribute('tabindex', '-1');
    carte.focus({ preventScroll: true });
  }, []);
  return null;
}
