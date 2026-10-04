'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cibleSelonPointeur } from '@tiktrends/core';
import { useIsMobile } from './useIsMobile';

/**
 * Un lien d'action AUTONOME (hors phrase) rendu depuis une page serveur · 44 px
 * au doigt, densité gardée à la souris (`cibleSelonPointeur`). Radar créatif ·
 * « Retravailler au Studio » mesurait 18 px (recette #106, point 6).
 */
export function LienCible({ href, style, children }: { href: string; style?: CSSProperties; children: ReactNode }) {
  const tactile = useIsMobile('(pointer: coarse), (max-width: 768px)');
  return <a href={href} style={{ ...style, display: 'inline-flex', alignItems: 'center', minHeight: cibleSelonPointeur(tactile) }}>{children}</a>;
}
