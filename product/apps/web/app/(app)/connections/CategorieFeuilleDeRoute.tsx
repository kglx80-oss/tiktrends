'use client';

import { useState, type ReactNode } from 'react';
import { cibleSelonPointeur } from '@tiktrends/core';
import { useIsMobile } from '../../../components/useIsMobile';

/**
 * Une catégorie de la feuille de route · un `<details>` natif (Entrée et Espace
 * l'ouvrent et le ferment, l'état ouvert est annoncé par le navigateur).
 *
 * Recette A (#120), mesuré au navigateur · la flèche restait « ▾ » une fois la
 * catégorie fermée, et l'en-tête faisait 24 px partout, téléphone compris. La
 * flèche suit maintenant l'état ; la hauteur suit le pointeur (44 au doigt,
 * 24 à la souris · `cibleSelonPointeur`), la densité desktop ne bouge pas.
 */
export function CategorieFeuilleDeRoute({ cat, nombre, children }: { cat: string; nombre: number; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(true);
  // Doigt ou écran étroit · même convention que le rail (useIsMobile), plus le
  // pointeur grossier d'une tablette ou d'un portable tactile large.
  const tactile = useIsMobile('(pointer: coarse), (max-width: 768px)');
  return (
    <details open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)} style={{ marginBottom: 14 }}>
      <summary data-categorie-feuille={cat} style={{ listStyle: 'none', cursor: 'pointer', margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8, minHeight: cibleSelonPointeur(tactile) }}>
        <span aria-hidden data-fleche={ouvert ? 'ouverte' : 'fermee'} style={{ color: 'var(--muted)', fontSize: 12, width: 12, textAlign: 'center' }}>{ouvert ? '▾' : '▸'}</span>{cat}
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>({nombre})</span>
      </summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 10, marginTop: 12 }}>
        {children}
      </div>
    </details>
  );
}
