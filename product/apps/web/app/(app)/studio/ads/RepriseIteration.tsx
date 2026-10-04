'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, CLE_ITERATION_EN_COURS, repriseIteration, type IterationEnCours } from '@tiktrends/core';

/**
 * Lot 17 · le brief d'itération se perdait en changeant d'onglet du Studio ·
 * Pubs IA › Image › Pubs IA rouvrait le Studio sans `?iter` (mesuré) · panneau
 * disparu, saisie rangée sous la clé de l'itération devenue invisible. On
 * retient le brief ouvert (mémoire de l'onglet, par marque) et on propose de le
 * reprendre · le lien rétablit `?iter`, le Studio retrouve brief et saisie.
 */

/** Posé par le panneau du brief · retient le dernier brief ouvert dans cet onglet. */
export function MemoIteration({ brandId, adId, titre }: IterationEnCours) {
  useEffect(() => {
    try { sessionStorage.setItem(CLE_ITERATION_EN_COURS, JSON.stringify({ brandId, adId, titre })); } catch { /* stockage indisponible */ }
  }, [brandId, adId, titre]);
  return null;
}

/** Sur Pubs IA SANS `?iter` · propose de reprendre le brief laissé en changeant d'onglet. */
export function RepriseIteration({ brandId }: { brandId: string }) {
  const [reprise, setReprise] = useState<{ href: string; titre: string } | null>(null);
  useEffect(() => {
    let memo: unknown = null;
    try { memo = JSON.parse(sessionStorage.getItem(CLE_ITERATION_EN_COURS) ?? 'null'); } catch { memo = null; }
    setReprise(repriseIteration(memo, { brandId, iterDansUrl: false }));
  }, [brandId]);
  if (!reprise) return null;
  const ignorer = () => {
    try { sessionStorage.removeItem(CLE_ITERATION_EN_COURS); } catch { /* stockage indisponible */ }
    setReprise(null);
    // Le bandeau part avec le bouton · le focus va au titre de la page, pas sur <body>.
    const h1 = document.querySelector<HTMLElement>('main h1');
    if (h1) { h1.tabIndex = -1; h1.focus(); }
  };
  return (
    <div role="status" style={bandeau}>
      <span style={{ flex: '1 1 240px', minWidth: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        Brief d’itération en cours · <b style={{ color: 'var(--ink)' }}>{reprise.titre}</b> · ta saisie y est gardée.
      </span>
      <Link href={reprise.href} style={lien}>Reprendre le brief ›</Link>
      <button type="button" onClick={ignorer} style={bouton}>Ignorer</button>
    </div>
  );
}

const bandeau: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14, padding: '8px 14px', borderRadius: 14, border: '1px dashed var(--line-2)', background: 'var(--paper)' };
const lien: CSSProperties = { display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, fontSize: 12.5, fontWeight: 800, color: 'var(--accent-strong)', textDecoration: 'none' };
const bouton: CSSProperties = { minHeight: CIBLE_TACTILE_MIN, padding: '0 12px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
