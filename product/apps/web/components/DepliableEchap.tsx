'use client';

import { useRef, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';

/**
 * Un `<details>` natif qu'Échap referme · le focus revient à son titre
 * (`<summary>`) pour que le clavier reparte d'où il a ouvert (recette #106 ·
 * l'aide repliable de 15 écrans et les « Filtres » de la Veille restaient
 * ouverts à Échap). Entrée et Espace restent ceux du navigateur.
 *
 * `fermerEnSortant` · pour une bulle posée PAR-DESSUS la page (l'aide) · le
 * focus clavier qui la quitte la referme. Mesuré (Chrome, 390 et 1280) · Tab
 * sortait de l'aide, la bulle restait ouverte sur le contenu et Échap n'avait
 * plus de prise. Un dépliable dans le flux (Filtres de la Veille) n'en a pas besoin.
 */
export function DepliableEchap({ children, style, fermerEnSortant = false }: { children: ReactNode; style?: CSSProperties; fermerEnSortant?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const surTouche = (e: KeyboardEvent<HTMLDetailsElement>) => {
    const d = ref.current;
    if (e.key !== 'Escape' || !d?.open) return;
    e.stopPropagation();
    d.open = false;
    d.querySelector('summary')?.focus();
  };
  const surSortie = (e: FocusEvent<HTMLDetailsElement>) => {
    const d = ref.current;
    const vers = e.relatedTarget as Node | null;
    // Seulement un focus qui part AILLEURS (Tab) · un clic hors de tout champ
    // (relatedTarget nul) garde le comportement natif.
    if (fermerEnSortant && d?.open && vers && !d.contains(vers)) d.open = false;
  };
  return <details ref={ref} onKeyDown={surTouche} onBlur={surSortie} style={style}>{children}</details>;
}
