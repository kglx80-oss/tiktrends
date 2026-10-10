'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { Icon } from './Icon';

interface Entree { key: string; label: string; href: string; icon: string; locked: boolean; isSub: boolean; soon?: boolean }

/**
 * Les ONGLETS d'une section du rail (UX V2) · l'entrée de la section puis ses
 * sous-écrans visibles pour ce rôle (la liste vient de `railNav`, déjà filtrée
 * par les droits · rien n'est élargi ici). Un onglet verrouillé par la formule
 * reste visible avec son cadenas, sans lien (même promesse que le rail).
 *
 * Défile horizontalement sur mobile · aucune entrée n'est tronquée ni cachée.
 */
export function OngletsSection({ section, estActif }: { section: { tete: Entree; onglets: Entree[] }; estActif: (href: string) => boolean }) {
  const entrees = [section.tete, ...section.onglets];
  return (
    <nav aria-label={`${section.tete.label} · sous-rubriques`} data-zone="onglets-section" style={barre}>
      {entrees.map((e) => {
        const actif = estActif(e.href);
        const bloque = e.locked || e.soon;
        const style: CSSProperties = {
          ...onglet,
          color: actif ? 'var(--ink)' : 'var(--ink-2)',
          borderColor: actif ? 'var(--accent-strong)' : 'var(--line-2)',
          background: actif ? 'var(--accent-soft)' : 'transparent',
          fontWeight: actif ? 700 : 500,
          opacity: bloque ? 0.55 : 1,
        };
        return bloque ? (
          <span key={e.key} data-onglet={e.key} title={e.locked ? 'Nécessite un abonnement supérieur' : 'Bientôt disponible'} style={{ ...style, cursor: 'default' }}>
            {e.label} <Icon name="lock" size={12} />
          </span>
        ) : (
          <Link key={e.key} href={e.href} data-onglet={e.key} aria-current={actif ? 'page' : undefined} style={style}>{e.label}</Link>
        );
      })}
    </nav>
  );
}

const barre: CSSProperties = {
  display: 'flex', gap: 8, overflowX: 'auto', padding: '12px clamp(16px, 4vw, 32px) 4px', scrollbarWidth: 'thin',
};
const onglet: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', borderRadius: 8,
  border: '1px solid var(--line-2)', fontSize: 13.5, whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0, boxSizing: 'border-box',
};
