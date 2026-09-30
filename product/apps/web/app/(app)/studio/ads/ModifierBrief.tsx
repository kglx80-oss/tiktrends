'use client';

import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, EVT_MODIFIER_BRIEF } from '@tiktrends/core';

/**
 * Du brief aux vrais champs · le panneau (serveur) promet « modifiable », ce
 * bouton y mène. Il ne génère rien et n'écrit rien · il demande au Studio
 * d'ouvrir ses réglages et de placer le focus sur l'angle.
 */
export function ModifierBrief() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_MODIFIER_BRIEF))} style={bouton}>
      Modifier l’angle et l’audience ›
    </button>
  );
}

const bouton: CSSProperties = {
  justifySelf: 'start', display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, marginTop: 2,
  padding: '0 13px', borderRadius: 999, border: '1px solid var(--accent-strong)', background: 'transparent',
  color: 'var(--accent-strong)', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
};
