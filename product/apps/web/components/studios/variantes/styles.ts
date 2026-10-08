import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { surface, tuile } from '../../ui';

/**
 * Styles partagés de « Variantes et tests » · charte Jarvis par les jetons
 * existants (`--surface`, `--paper`, `--ink`, `--accent`…), cadres du noyau
 * (`surface`, `tuile`), cibles de 44 px, champs de 16 px (pas de zoom mobile).
 */

export const bloc: CSSProperties = { ...surface, background: 'var(--surface)', padding: '16px 18px', boxSizing: 'border-box', minWidth: 0 };
export const sousBloc: CSSProperties = { ...tuile, background: 'var(--paper)', padding: '12px 14px', boxSizing: 'border-box', minWidth: 0 };
export const titre2: CSSProperties = { margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: 'var(--ink)' };
export const titre3: CSSProperties = { margin: 0, fontSize: 15.5, fontWeight: 600, color: 'var(--ink)', overflowWrap: 'anywhere' };
export const texte: CSSProperties = { margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)' };
export const petit: CSSProperties = { margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted)' };
export const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12, overflowWrap: 'anywhere' };
export const grille = (min: number): CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`, gap: 12 });
export const rangee: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' };

export const champ: CSSProperties = {
  width: '100%', minHeight: CIBLE_TACTILE_MIN, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12,
  border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 16, fontFamily: 'inherit',
};
export const etiquette: CSSProperties = { display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 };

export const boutonPrimaire: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, padding: '10px 16px',
  borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
};
export const boutonSecondaire: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, padding: '10px 14px',
  borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 600, fontSize: 14,
  cursor: 'pointer', textDecoration: 'none',
};
export const desactive: CSSProperties = { opacity: 0.55, cursor: 'not-allowed' };

const TEINTE: Record<string, string> = { ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)', info: 'var(--info)', neutre: 'var(--muted)', accent: 'var(--accent)' };

/** Le statut porte un MOT · la couleur ne fait que l'accompagner. */
export function pastille(ton: keyof typeof TEINTE | string): CSSProperties {
  const c = TEINTE[ton] ?? 'var(--muted)';
  return { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, border: `1px solid ${c}`, color: 'var(--ink)', whiteSpace: 'nowrap' };
}
export const point = (ton: string): CSSProperties => ({ width: 7, height: 7, borderRadius: 999, background: TEINTE[ton] ?? 'var(--muted)', flex: '0 0 auto' });

/** Vignette neutre aux proportions du média (jamais déformée). */
export function vignette(ratio: string): CSSProperties {
  return {
    aspectRatio: ratio, width: '100%', borderRadius: 12, border: '1px solid var(--line)', boxSizing: 'border-box',
    background: 'linear-gradient(135deg, var(--paper), var(--surface))', overflow: 'hidden',
  };
}
