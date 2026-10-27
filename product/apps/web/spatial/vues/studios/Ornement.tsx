'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * La barre d'action flottante de la maquette (`#orn`, fonction `orn()` du
 * prototype) · la coquille la pose vide et masquée ; un écran qui a un geste
 * de flux y rend ses boutons. Brique LOCALE (la coquille n'expose pas d'API) ·
 * on ne touche qu'au contenu de `#orn`, et on le rend masqué en partant.
 */
export function Ornement({ children }: { children: ReactNode }) {
  const [cible, setCible] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.getElementById('orn');
    if (!el) return;
    el.hidden = false;
    setCible(el);
    return () => { el.hidden = true; };
  }, []);
  return cible ? createPortal(children, cible) : null;
}
