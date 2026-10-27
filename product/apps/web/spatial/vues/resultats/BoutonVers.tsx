'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { cheminPorte } from '@tiktrends/core';

/**
 * Un `<button>` de la maquette qui MÈNE quelque part (ex. `button.bladd`) · même
 * balise que la maquette, vraie navigation · client dans l'arbre Spatial quand
 * la destination est portée, rechargement sinon (comme `Lien`).
 */
export function BoutonVers({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <button type="button" className={className} onClick={() => (cheminPorte(href) ? router.push(href) : window.location.assign(href))}>
      {children}
    </button>
  );
}
