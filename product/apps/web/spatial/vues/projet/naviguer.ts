'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cheminPorte } from '@tiktrends/core';

/**
 * Naviguer depuis un BOUTON de la maquette (`button.chip`, `button.vlev`…) ·
 * même règle que la brique `Lien` : navigation client vers un écran porté,
 * rechargement complet sinon (les deux interfaces ne partagent jamais une page).
 */
export function useNaviguer(): (href: string) => void {
  const router = useRouter();
  return useCallback((href: string) => {
    if (href.startsWith('/') && cheminPorte(href)) router.push(href);
    else window.location.assign(href);
  }, [router]);
}
