'use client';

import { useState } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';

/**
 * Copier un texte (lien d'invitation…) · la copie de la page disait « copie le
 * lien ci-dessous » sans bouton pour le faire (recette #106). L'état copié est
 * annoncé (`role=status`), l'échec aussi.
 */
export function CopierTexte({ texte, libelle = 'Copier le lien' }: { texte: string; libelle?: string }) {
  const [etat, setEtat] = useState<'' | 'ok' | 'ko'>('');
  const copier = () => {
    void navigator.clipboard?.writeText(texte).then(() => setEtat('ok'), () => setEtat('ko'));
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" onClick={copier} style={{ minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
        {libelle}
      </button>
      <span role="status" style={{ fontSize: 12, color: etat === 'ko' ? '#ff9db0' : '#7ee8bf' }}>
        {etat === 'ok' ? 'Copié.' : etat === 'ko' ? 'Copie impossible · sélectionne le lien à la main.' : ''}
      </span>
    </span>
  );
}
