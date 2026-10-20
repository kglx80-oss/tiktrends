import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';

/**
 * Les onglets des Studios (alignement V5, image 5.webp) · « Projets » actif.
 *
 * « Prompts conseillés » n'a AUCUN service dans le code réel (absent de
 * l'inventaire docs/ux-v5, aucune table ni action) · c'est une « décision
 * Kevin / à créer ». On ne le simule pas : l'onglet est rendu DÉSACTIVÉ, avec un
 * libellé qui le dit (« bientôt »), jamais un onglet mort muet qui ouvrirait un
 * contenu inventé.
 */

const base: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN, padding: '0 16px', borderRadius: 999,
  fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', boxSizing: 'border-box',
};

export function OngletsStudios() {
  return (
    <nav aria-label="Vues des Studios" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 999, background: 'var(--paper)', marginBottom: 20 }}>
      <span data-onglet="projets" aria-current="page" style={{ ...base, background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, border: '1px solid var(--line)', boxShadow: 'var(--sh-sm)' }}>
        Concepts créatifs
      </span>
      <span data-onglet="prompts" aria-disabled="true" title="Bientôt · prompts conseillés par Jarvis"
        style={{ ...base, color: 'var(--muted)', cursor: 'not-allowed' }}>
        Prompts conseillés
        <span aria-hidden style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--muted)', padding: '2px 6px', borderRadius: 6, border: '1px solid var(--line-2)' }}>Bientôt</span>
      </span>
    </nav>
  );
}
