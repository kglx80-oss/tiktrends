'use client';

import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

/**
 * Un `<details>` natif qu'Échap referme · le focus revient à son titre
 * (`<summary>`) pour que le clavier reparte d'où il a ouvert (recette #106 ·
 * l'aide repliable de 15 écrans et les « Filtres » de la Veille restaient
 * ouverts à Échap). Entrée et Espace restent ceux du navigateur.
 */
export function DepliableEchap({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const surTouche = (e: KeyboardEvent<HTMLDetailsElement>) => {
    const d = ref.current;
    if (e.key !== 'Escape' || !d?.open) return;
    e.stopPropagation();
    d.open = false;
    d.querySelector('summary')?.focus();
  };
  return <details ref={ref} onKeyDown={surTouche} style={style}>{children}</details>;
}
