'use client';

import { useState, type CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, THEMES, type Theme } from '@tiktrends/core';
import { appliquerTheme, themeCourant } from '../lib/theme-preference';

/**
 * V5 · A4a · P02 · la bascule « Sombre / Clair » de la pop-up profil.
 *
 * Deux boutons radio NATIFS dans un `fieldset` légendé · le lecteur d'écran
 * annonce le groupe, le choix courant (« coché ») et la navigation aux
 * flèches, sans ARIA reconstruit à la main. Le changement passe par
 * `appliquerTheme` · cookie `tt_theme` (relu au rendu serveur suivant),
 * `data-theme` sur `<html>` (l'écran bascule tout de suite, sans
 * rechargement) et couleur de barre du navigateur. Une zone `role="status"`
 * confirme le thème appliqué.
 *
 * L'état initial se lit sur `<html>` · c'est le serveur qui l'y a posé depuis
 * le cookie. La pop-up ne se monte qu'à l'ouverture (côté client), la lecture
 * du document est donc sûre.
 */
const LIBELLES: Record<Theme, string> = { sombre: 'Sombre', clair: 'Clair' };

export function BasculeTheme() {
  const [theme, setTheme] = useState<Theme>(() => (typeof document === 'undefined' ? 'sombre' : themeCourant()));
  const [annonce, setAnnonce] = useState('');
  const choisir = (t: Theme) => {
    setTheme(appliquerTheme(t));
    setAnnonce(`Thème ${LIBELLES[t].toLowerCase()} appliqué`);
  };
  return (
    <fieldset data-zone="bascule-theme" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <legend style={masque}>Thème de l’interface</legend>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {THEMES.map((t) => {
          const coche = theme === t;
          return (
            <label key={t} data-theme-choix={t} style={{
              display: 'flex', alignItems: 'center', gap: 10, minHeight: CIBLE_TACTILE_MIN, padding: '0 12px',
              borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: coche ? 700 : 500,
              color: coche ? 'var(--ink)' : 'var(--ink-2)',
              background: coche ? 'var(--selected)' : 'transparent',
              border: `1px solid ${coche ? 'var(--accent-28)' : 'var(--line-2)'}`,
            }}>
              <input type="radio" name="tt-theme" value={t} checked={coche} onChange={() => choisir(t)}
                style={{ width: 18, height: 18, margin: 0, accentColor: 'var(--accent)', flexShrink: 0 }} />
              {LIBELLES[t]}
            </label>
          );
        })}
      </div>
      <span role="status" aria-live="polite" style={masque}>{annonce}</span>
    </fieldset>
  );
}

/** Lu par le lecteur d'écran, invisible à l'œil. */
const masque: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};
