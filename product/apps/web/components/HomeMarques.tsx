'use client';

import Link from 'next/link';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { BrandTile } from './BrandIcons';

/**
 * Les marques du compte, façon « Recent Projects » (Kevin, 30/09, inspiration
 * Flora) · on reprend vite une marque là où on l'a laissée.
 *
 * ── Ce qu'une carte montre, et rien de plus ──────────────────────────────────
 *
 * Un visuel (le logo réel s'il existe, sinon la pastille d'initiale colorée ·
 * jamais un faux logo), le nom, et l'invite à reprendre. La marque ACTIVE passe
 * en tête (on la reprend le plus souvent) et se signale `aria-current`.
 *
 * ── Les états, tous réels ────────────────────────────────────────────────────
 *
 * Zéro marque · pas de fausse carte, une invite à en créer une. Une ou
 * plusieurs · la grille. Les noms longs sont tronqués (ellipsis) sans casser la
 * carte ni déborder.
 */
export interface MarqueCarte {
  id: string;
  name: string;
  logoUrl?: string | null;
}

const carte = {
  display: 'flex', alignItems: 'center', gap: 12, minHeight: CIBLE_TACTILE_MIN,
  padding: '12px 14px', textDecoration: 'none', minWidth: 0,
  border: '1px solid var(--line-2)', borderRadius: 14, background: 'var(--surface)',
} as const;

const tuile = { width: 40, height: 40, borderRadius: 10, flexShrink: 0 } as const;

export function HomeMarques({ marques, activeId }: { marques: MarqueCarte[]; activeId: string | null }) {
  // La marque active d'abord · le reste garde l'ordre reçu (récent en premier
  // côté serveur). Tri stable · on ne déplace QUE l'active en tête.
  const ordre = [...marques].sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0));

  return (
    <section aria-label="Tes marques" style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-.01em' }}>Tes marques</h2>
        <Link href="/brands" style={{ display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none' }}>
          Toutes les marques ›
        </Link>
      </div>

      {marques.length === 0 ? (
        // État zéro · aucune fausse carte, on invite à créer la première marque.
        <Link href="/brands/new" style={{ ...carte, color: 'var(--ink-2)' }}>
          <span aria-hidden style={{ ...tuile, background: 'var(--paper)', border: '1px solid var(--line-2)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>+</span>
          <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <b style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Crée ta première marque</b>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Observe, teste, itère marque par marque</span>
          </span>
        </Link>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 12 }}>
          {ordre.map((m) => {
            const actif = m.id === activeId;
            return (
              <Link key={m.id} href={`/brands/${m.id}`} aria-current={actif ? 'true' : undefined} style={carte}>
                {m.logoUrl
                  ? <img src={m.logoUrl} alt="" style={{ ...tuile, objectFit: 'cover', border: '1px solid var(--line-2)' }} />
                  : <span aria-hidden style={{ display: 'inline-flex' }}><BrandTile name={m.name} tile={40} /></span>}
                <span style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</b>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{actif ? 'Marque active · reprendre' : 'Ouvrir'}</span>
                </span>
                <span aria-hidden style={{ color: 'var(--muted)', fontWeight: 800, flexShrink: 0 }}>›</span>
              </Link>
            );
          })}
          {/* Ajouter une marque · action réelle, en fin de grille. */}
          <Link href="/brands/new" style={{ ...carte, color: 'var(--ink-2)', borderStyle: 'dashed' }}>
            <span aria-hidden style={{ ...tuile, background: 'var(--paper)', border: '1px solid var(--line-2)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>+</span>
            <span style={{ minWidth: 0 }}><b style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Nouvelle marque</b></span>
          </Link>
        </div>
      )}
    </section>
  );
}
