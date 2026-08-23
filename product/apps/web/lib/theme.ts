import type { CSSProperties } from 'react';

/** Thème « Espace admin » : même univers sombre, mais accent ambre/orange
 *  au lieu du magenta. À poser sur le <main> d'une page admin (les enfants héritent). */
export const ADMIN_THEME = {
  '--accent': '#f5a623',
  '--accent-strong': '#ffca6b',
  '--accent-soft': '#2a2110',
  '--grad-accent': 'linear-gradient(135deg,#f5a623 0%,#ff8c42 100%)',
} as unknown as CSSProperties;
