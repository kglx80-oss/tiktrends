'use client';

import Link from 'next/link';
import { useEffect, useRef, type CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, type OngletPage } from '@tiktrends/core';

/**
 * La barre d'onglets de Réglages et d'Administration (lot 4c) · présentation
 * seulement, la liste arrive déjà filtrée par les droits (`OngletsReglages`).
 * Défile horizontalement sur mobile, l'onglet courant ramené dans la vue ·
 * aucun onglet n'est tronqué ni caché. Cibles de 44 px.
 */
export function BarreOnglets({ zone, libelle, onglets }: { zone: string; libelle: string; onglets: ReadonlyArray<OngletPage & { groupe?: string }> }) {
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
  return (
    <nav ref={ref} aria-label={libelle} data-zone={`onglets-${zone}`} style={barre}>
      {onglets.map((o, i) => {
        const nouveauGroupe = i > 0 && o.groupe !== undefined && o.groupe !== onglets[i - 1]!.groupe;
        return (
          <span key={o.cle} style={{ display: 'contents' }}>
            {nouveauGroupe && <span aria-hidden="true" data-separateur="groupe" style={separateur} />}
            <Link
              href={o.href}
              data-onglet={o.cle}
              aria-current={o.courant ? 'page' : undefined}
              style={{
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
