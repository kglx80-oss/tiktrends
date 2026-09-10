'use client';

import { useEffect, useState } from 'react';

/**
 * « Est-on sur un écran étroit ? » · via matchMedia.
 *
 * Styles inline uniquement dans ce dépôt · pas de media query CSS. Le responsive
 * passe donc par le JS · ce hook renvoie un booléen, les composants adaptent
 * leurs styles en ligne.
 *
 * On démarre à `false` (desktop) · le rendu serveur et la première peinture
 * valent desktop, puis l'effet corrige au montage. Un booléen d'état, pas une
 * lecture pendant le rendu · c'est ce qui évite l'écart d'hydratation.
 */
export function useIsMobile(query = '(max-width: 768px)'): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const suivre = () => setMobile(mq.matches);
    suivre();
    mq.addEventListener('change', suivre);
    return () => mq.removeEventListener('change', suivre);
  }, [query]);
  return mobile;
}
