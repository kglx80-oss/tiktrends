import type { CSSProperties } from 'react';

/** Thème « Espace admin » : même univers, mais accent ambre/orange au lieu du
 *  magenta. À poser sur le <main> d'une page admin (les enfants héritent).
 *  Les rôles « ambre » vivent dans tokens.css · mêmes valeurs en sombre,
 *  mesurées en clair. */
export const ADMIN_THEME = {
  '--accent': 'var(--ambre)',
  '--accent-strong': 'var(--ambre-strong)',
  '--accent-soft': 'var(--ambre-soft)',
  '--grad-accent': 'var(--grad-ambre)',
} as unknown as CSSProperties;
