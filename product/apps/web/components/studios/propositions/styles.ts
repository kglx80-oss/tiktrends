import type { CSSProperties } from 'react';
import { btn, btnGhost, surface, tuile, cadreSignal } from '../../ui';

/**
 * Styles en ligne du panneau de propositions · charte Jarvis par ses jetons
 * (`--bg`, `--surface`, `--ink`, `--accent-strong`…), cibles de 44 px, champs à
 * 16 px (pas de zoom forcé sur mobile). Le focus visible vient de la règle
 * globale `:focus-visible` (globals.css).
 */

export const CIBLE = 44;

export const panneau: CSSProperties = {
  ...surface, background: 'var(--surface)', padding: 'clamp(14px, 3vw, 22px)', color: 'var(--ink)',
  display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, boxSizing: 'border-box',
};
export const carte: CSSProperties = { ...tuile, background: 'var(--bg)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 };
export const titre: CSSProperties = { margin: 0, fontSize: 19, fontWeight: 500, color: 'var(--ink)' };
export const sousTitre: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 };
export const etiquette: CSSProperties = { display: 'block', fontSize: 13, color: 'var(--ink-2)', marginBottom: 6, fontWeight: 600 };
export const texte: CSSProperties = { margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, overflowWrap: 'anywhere' };
export const mini: CSSProperties = { margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, overflowWrap: 'anywhere' };

export const boutonPrimaire: CSSProperties = { ...btn, minHeight: CIBLE, fontSize: 14 };
export const boutonSecondaire: CSSProperties = { ...btnGhost, minHeight: CIBLE, fontSize: 14, color: 'var(--ink)', padding: '10px 16px' };
export const desactive: CSSProperties = { opacity: 0.5, cursor: 'not-allowed' };

export const champ: CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: CIBLE, padding: '10px 12px', borderRadius: 12,
  border: '1px solid var(--line-2)', background: 'var(--rail)', color: 'var(--ink)', fontSize: 16, fontFamily: 'inherit', lineHeight: 1.5,
};

export function signal(couleur: 'ok' | 'warn' | 'err' | 'info'): CSSProperties {
  const c = `var(--${couleur})`;
  return { ...cadreSignal(c, 'tuile'), background: 'var(--rail)', padding: '12px 14px', fontSize: 14, color: 'var(--ink)', lineHeight: 1.5, overflowWrap: 'anywhere' };
}

/** Pastille d'état · le statut est porté par un MOT, la couleur ne fait que l'appuyer. */
export function pastille(couleur: string): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
    border: `1px solid ${couleur}`, color: 'var(--ink)', background: 'var(--rail)', whiteSpace: 'nowrap',
  };
}

export const COULEUR_ETAT: Readonly<Record<string, string>> = {
  proposed: 'var(--accent-strong)', approved: 'var(--ok)', rejected: 'var(--muted)', expired: 'var(--warn)', draft: 'var(--line-2)',
};

export const rangee: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' };
