'use client';

import { useState, type ReactNode, type CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';

/**
 * Une révélation repliable du cumul « appris » (Essais, Score Jarvis, Relectures).
 *
 * Native `<details>` sans JS, l'étiquette de droite resterait figée sur
 * « déplier ▾ » même une fois ouverte · on suit donc l'état d'ouverture (client)
 * pour basculer « déplier ▾ » ↔ « replier ▴ ». Le contenu (rendu côté serveur)
 * passe en `children` · aucune logique métier ici.
 *
 * `scrollMarginTop` = hauteur de la barre mobile collante (65px mesurés) + marge ·
 * sinon un lien profond (#essais…) poserait le titre SOUS la barre.
 */

/** Dégagement d'ancre · la barre mobile collante fait 65px, on pose sous elle. */
export const MARGE_ANCRE = 80;

export function Revelation({ id, titre, badge, borderColor, children }: {
  id: string; titre: string; badge: string; borderColor: string; children: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <details
      id={id}
      onToggle={(e) => setOuvert((e.currentTarget as HTMLDetailsElement).open)}
      style={{
        marginBottom: 12, padding: '14px 18px', borderRadius: 14,
        border: `1px solid ${borderColor}`, background: 'var(--surface)', scrollMarginTop: MARGE_ANCRE,
      }}
    >
      <summary style={sommaire}>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{titre}</span>
        <span style={etiquette}>{badge}</span>
        <span aria-hidden style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>
          {ouvert ? 'replier ▴' : 'déplier ▾'}
        </span>
      </summary>
      {children}
    </details>
  );
}

const sommaire: CSSProperties = {
  listStyle: 'none', cursor: 'pointer', userSelect: 'none',
  display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
  minHeight: CIBLE_TACTILE_MIN,
};

const etiquette: CSSProperties = {
  fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em',
  color: 'var(--muted)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)',
};
