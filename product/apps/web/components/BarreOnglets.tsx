'use client';

import Link from 'next/link';
import { useEffect, useRef, type CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, type OngletPage } from '@tiktrends/core';

/**
 * La barre d'onglets de Réglages et d'Administration (lot 4c) · présentation
 * seulement, la liste arrive déjà filtrée par les droits (`OngletsReglages`).
 * Défile horizontalement sur mobile, l'onglet courant ramené dans la vue ·
 * aucun onglet n'est tronqué ni caché. Cibles de 44 px.
 *
 * Deux styles · `pills` (défaut · Réglages, Administration · chaque onglet un
 * cadre) et `segment` (Résultats V5 · un seul conteneur, l'onglet courant une
 * pastille claire ombrée, les autres sans cadre · la maquette de Kevin). Le
 * style ne change ni la structure, ni l'accessibilité (`aria-current`, focus
 * clavier via `:focus-visible` global), ni le défilement mobile.
 */
export function BarreOnglets({ zone, libelle, onglets, variant = 'pills' }: { zone: string; libelle: string; onglets: ReadonlyArray<OngletPage & { groupe?: string }>; variant?: 'pills' | 'segment' }) {
  const ref = useRef<HTMLElement>(null);
  // Sur mobile, l'onglet courant peut tomber hors de la barre · on l'amène
  // dans la vue (sans faire défiler la page verticalement).
  useEffect(() => {
    const nav = ref.current;
    const courant = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !courant) return;
    const o = courant.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    if (o.right > n.right || o.left < n.left) nav.scrollLeft = Math.max(0, nav.scrollLeft + o.left - n.left - 16);
  }, []);
  if (onglets.length === 0) return null;
  const segment = variant === 'segment';
  return (
    <nav ref={ref} aria-label={libelle} data-zone={`onglets-${zone}`} data-variante={variant} style={segment ? barreSegment : barre}>
      {onglets.map((o, i) => {
        const nouveauGroupe = i > 0 && o.groupe !== undefined && o.groupe !== onglets[i - 1]!.groupe;
        return (
          <span key={o.cle} style={{ display: 'contents' }}>
            {nouveauGroupe && !segment && <span aria-hidden="true" data-separateur="groupe" style={separateur} />}
            <Link
              href={o.href}
              data-onglet={o.cle}
              aria-current={o.courant ? 'page' : undefined}
              style={segment ? {
                ...ongletSegment,
                color: o.courant ? 'var(--ink)' : 'var(--ink-2)',
                background: o.courant ? 'var(--surface)' : 'transparent',
                boxShadow: o.courant ? 'var(--sh-sm)' : 'none',
                fontWeight: o.courant ? 700 : 500,
              } : {
                ...onglet,
                color: o.courant ? 'var(--ink)' : 'var(--ink-2)',
                borderColor: o.courant ? 'var(--accent-strong)' : 'var(--line-2)',
                background: o.courant ? 'var(--accent-soft)' : 'transparent',
                fontWeight: o.courant ? 700 : 500,
              }}
            >
              {o.libelle}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}

const barre: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', maxWidth: '100%', minWidth: 0,
  padding: '0 0 6px', marginBottom: 18, scrollbarWidth: 'thin',
};
const onglet: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', borderRadius: 8,
  border: '1px solid var(--line-2)', fontSize: 13.5, whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0, boxSizing: 'border-box',
};
const separateur: CSSProperties = { width: 1, height: 24, background: 'var(--line-2)', flexShrink: 0, margin: '0 2px' };

/* Segment (V5) · un seul conteneur ceinturé, les onglets dedans · l'actif est
   une pastille claire ombrée, les autres sans cadre. `inline-flex` pour que le
   cadre épouse les onglets et ne barre pas la largeur. */
const barreSegment: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', minWidth: 0, overflowX: 'auto',
  padding: 4, marginBottom: 18, scrollbarWidth: 'thin',
  border: '1px solid var(--line)', borderRadius: 12, background: 'var(--paper)',
};
// Chaque onglet reste une cible de 44 px (CIBLE_TACTILE_MIN) · le conteneur
// ajoute sa marge de 4 px autour, jamais au détriment de la cible.
const ongletSegment: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '0 15px', borderRadius: 8,
  fontSize: 13.5, whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0, boxSizing: 'border-box',
};
