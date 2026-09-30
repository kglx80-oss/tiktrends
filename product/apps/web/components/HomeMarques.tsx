'use client';

import Link from 'next/link';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';

/**
 * Les marques du compte, façon « Recent Projects » (Kevin, 30/09, inspiration
 * Flora) · on reprend vite une marque là où on l'a laissée.
 *
 * ── Une carte VISUELLE, pas une ligne de liste ───────────────────────────────
 *
 * Chaque carte a une SURFACE D'APERÇU substantielle en haut · le logo/l'image
 * réelle de la marque si elle existe (couvre la surface), sinon un repli soigné
 * (initiale sur un fond dégradé, jamais un faux logo). Sous l'aperçu · le nom et
 * l'invite à reprendre. Grille en desktop, une colonne en mobile.
 *
 * ── Les états, tous réels ────────────────────────────────────────────────────
 *
 * Zéro (invite à créer, aucune fausse carte), une, plusieurs. La marque ACTIVE
 * passe en tête, porte un repère « Active » et `aria-current`. Noms longs
 * tronqués (ellipsis) sans casser la carte.
 */
export interface MarqueCarte {
  id: string;
  name: string;
  logoUrl?: string | null;
}

const carte = {
  display: 'flex', flexDirection: 'column', textDecoration: 'none', minWidth: 0,
  border: '1px solid var(--line-2)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface)',
} as const;

const apercu = {
  position: 'relative', aspectRatio: '16 / 10', width: '100%',
  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
} as const;

const pied = { padding: '11px 13px', minHeight: CIBLE_TACTILE_MIN, display: 'grid', gap: 2, alignContent: 'center', minWidth: 0 } as const;

/** Repli soigné · l'initiale de la marque sur un fond dégradé sobre, centrée et
 *  lisible · remplit toute la surface d'aperçu quand il n'y a pas d'image. */
function ReplInitiale({ name }: { name: string }) {
  const initiales = name.trim().replace(/\s+/g, ' ').split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '·';
  return (
    <div style={{
      ...apercu,
      background: 'radial-gradient(120% 120% at 30% 20%, rgba(254,44,85,.16), transparent 55%), linear-gradient(160deg, var(--paper), var(--surface))',
    }}>
      <span aria-hidden style={{ fontSize: 'clamp(28px, 6vw, 40px)', fontWeight: 800, letterSpacing: '-.02em', color: 'var(--ink)', opacity: 0.9 }}>{initiales}</span>
    </div>
  );
}

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
        <Link href="/brands/new" style={{ ...carte, maxWidth: 300 }}>
          <div style={{ ...apercu, background: 'linear-gradient(160deg, var(--paper), var(--surface))' }}>
            <span aria-hidden style={{ fontSize: 34, fontWeight: 800, color: 'var(--accent-strong)' }}>+</span>
          </div>
          <div style={pied}>
            <b style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Crée ta première marque</b>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Observe, teste, itère marque par marque</span>
          </div>
        </Link>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
          {ordre.map((m) => {
            const actif = m.id === activeId;
            return (
              <Link key={m.id} href={`/brands/${m.id}`} aria-current={actif ? 'true' : undefined} style={carte}>
                <div style={apercu}>
                  {m.logoUrl
                    ? <img src={m.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <ReplInitiale name={m.name} />}
                  {actif && (
                    <span style={{ position: 'absolute', top: 8, left: 8, padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>Active</span>
                  )}
                </div>
                <div style={pied}>
                  <b style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</b>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{actif ? 'Marque active · reprendre' : 'Ouvrir'}</span>
                </div>
              </Link>
            );
          })}
          {/* Ajouter une marque · action réelle, même gabarit de carte. */}
          <Link href="/brands/new" style={{ ...carte, borderStyle: 'dashed' }}>
            <div style={{ ...apercu, background: 'linear-gradient(160deg, var(--paper), var(--surface))' }}>
              <span aria-hidden style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent-strong)' }}>+</span>
            </div>
            <div style={pied}>
              <b style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Nouvelle marque</b>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Ajouter au compte</span>
            </div>
          </Link>
        </div>
      )}
    </section>
  );
}
