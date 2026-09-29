'use client';

import { useState, type CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { Icon } from '../../../../components/Icon';

/**
 * La palette de la marque · au REPOS, des cercles de couleur, rien d'autre.
 *
 * ── Pourquoi ce composant existe ─────────────────────────────────────────────
 *
 * L'aperçu affichait chaque couleur avec son HEX collé dessous · un mur de codes
 * gris que personne ne lit et qui étouffe l'identité visuelle. On garde les
 * cercles (ce qu'on RECONNAÎT), et on range le HEX dans un détail qui ne
 * s'ouvre qu'au clic ou à Entrée · avec un bouton Copier, puisque c'est la seule
 * chose qu'on fait d'un HEX.
 *
 * L'accès ne dépend PAS du survol · chaque pastille est un vrai bouton, atteint
 * au clavier (focus visible, cible ≥ 44), l'ouverture répond aussi à Entrée et
 * Espace. Le pointeur seul laissait le clavier dehors.
 */
export function PaletteMarque({ colors }: { colors: string[] }) {
  // La couleur dont le détail (HEX + Copier) est ouvert · une seule à la fois.
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Retour visuel de la copie, indexé par couleur · pas de « Copié » fantôme
  // qui traînerait d'une pastille à l'autre.
  const [copiee, setCopiee] = useState<string | null>(null);
  // Focus clavier · l'anneau se pose sans survol (les styles en ligne ne portent
  // pas de `:focus-visible`, on suit donc le focus à la main).
  const [focus, setFocus] = useState<string | null>(null);

  if (colors.length === 0) return <span style={{ fontSize: 12, color: 'var(--muted)' }}>·</span>;

  function copier(c: string) {
    setCopiee(c);
    // Le presse-papier peut être absent (contexte non sécurisé) · le HEX reste
    // lisible et sélectionnable, on ne jette pas pour autant.
    try { void navigator.clipboard?.writeText(c)?.catch(() => {}); } catch { /* pas de presse-papier */ }
  }

  function basculer(c: string) {
    setOuverte((v) => (v === c ? null : c));
    setCopiee(null);
  }

  return (
    <div>
      <div role="group" aria-label="Palette de la marque" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {colors.map((c) => {
          const actif = ouverte === c;
          return (
            <button
              key={c}
              type="button"
              data-pastille={c}
              aria-label={`Couleur ${c}`}
              aria-expanded={actif}
              onClick={() => basculer(c)}
              onKeyDown={(e) => {
                // Entrée et Espace ouvrent le détail · le clavier fait ce que fait
                // le clic, sans dépendre du navigateur pour synthétiser l'un depuis
                // l'autre.
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer(c); }
              }}
              onFocus={() => setFocus(c)}
              onBlur={() => setFocus((v) => (v === c ? null : v))}
              style={{
                ...cibleStyle,
                boxShadow: focus === c ? '0 0 0 3px var(--accent-strong)' : 'none',
              }}
            >
              <span style={{
                width: 30, height: 30, borderRadius: '50%', background: c,
                border: '1px solid rgba(255,255,255,.12)',
                boxShadow: actif ? 'inset 0 0 0 2px var(--surface), 0 0 0 2px var(--ink-2)' : 'inset 0 1px 0 rgba(255,255,255,.14)',
              }} />
            </button>
          );
        })}
      </div>

      {/* Le HEX, seulement au clic · avec le seul geste qu'on en fait, Copier. */}
      {ouverte && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'var(--surface-2, rgba(255,255,255,.03))', maxWidth: 260 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: ouverte, border: '1px solid rgba(255,255,255,.12)', flexShrink: 0 }} />
          <code style={{ fontSize: 13, color: 'var(--ink)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '.02em', flex: 1 }}>{ouverte}</code>
          <button
            type="button"
            onClick={() => copier(ouverte)}
            style={copierStyle}
          >
            {copiee === ouverte
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="check" size={13} /> Copié</span>
              : 'Copier'}
          </button>
        </div>
      )}
    </div>
  );
}

// La cible cliquable atteint le minimum (44) · le cercle reste petit à l'intérieur,
// on ÉLARGIT la zone plutôt que de grossir le visuel (cf. cible-tactile.ts).
const cibleStyle: CSSProperties = {
  minWidth: CIBLE_TACTILE_MIN, minHeight: CIBLE_TACTILE_MIN,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 0, border: 'none', borderRadius: 999, background: 'transparent', cursor: 'pointer',
};

const copierStyle: CSSProperties = {
  minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', borderRadius: 999,
  border: '1px solid rgba(255,255,255,.12)', background: 'transparent',
  color: 'var(--ink-2)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', flexShrink: 0,
};
