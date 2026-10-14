'use client';

import type { CSSProperties, ReactNode } from 'react';
import { libelleZoom, MARGE_ZONE_EDITEUR } from '@tiktrends/core';
import { bouton, boutonInactif, legende } from './styles';
import type { ZoomEditeur } from './use-zoom-editeur';

/**
 * La zone de travail de l'éditeur · le document dans une boîte défilante, et
 * sa barre d'outils (spec UX V2 § 3 · capture 03 : − · 100 % · + · Calques).
 *
 * Zoom : − et + au centre de la zone, Ctrl/⌘ + molette ou pincement autour
 * du pointeur, « Ajuster » cadre le document entier, la valeur affichée
 * ramène à la taille réelle (100 %). La molette seule fait défiler la zone
 * (déplacement de la vue). Avant la mesure de la zone (rendu serveur), le
 * document s'ajuste en CSS, comme avant le zoom.
 */

const barre: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 };

export function ZoneTravail({
  zoom, hauteur, surface, versionsOuvert, onVersions, idVersions, mobile,
}: {
  zoom: ZoomEditeur;
  /** Hauteur de la zone (CSS) · 72vh sur ordinateur, 60vh sur téléphone. */
  hauteur: string;
  /** Rend la surface du document · largeur imposée quand le zoom est connu, sinon hauteur max de l'ajustement CSS. */
  surface: (o: { largeurPx?: number; hauteurMax: string }) => ReactNode;
  versionsOuvert: boolean;
  onVersions: () => void;
  idVersions: string;
  mobile: boolean;
}) {
  const { zoom: z, disposition: d, mode } = zoom;
  const mesure = z !== null;
  const inactif = (x: boolean) => (x ? boutonInactif : {});
  const actif: CSSProperties = { border: '1px solid var(--accent-strong)', color: 'var(--accent-strong)' };
  const valeur = mesure ? libelleZoom(z) : 'Ajusté';

  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <div role="toolbar" aria-label="Affichage du document" data-barre="zoom" style={barre}>
        <button type="button" onClick={() => zoom.agir('moins')} aria-disabled={!mesure || zoom.auMin} aria-label="Zoom arrière"
          aria-keyshortcuts="Control+- Meta+-" title="Zoom arrière (Ctrl −)" data-zoom-action="moins" style={{ ...bouton, ...inactif(!mesure || zoom.auMin) }}>−</button>
        <button type="button" onClick={() => zoom.agir('reelle')} aria-disabled={!mesure} data-zoom-action="reelle"
          aria-label={`Zoom ${valeur} · revenir à la taille réelle (100 %)`} title="Taille réelle (100 %)"
          style={{ ...bouton, minWidth: 72, fontVariantNumeric: 'tabular-nums', ...inactif(!mesure) }}>
          <span data-zoom-valeur>{valeur}</span>
        </button>
        <button type="button" onClick={() => zoom.agir('plus')} aria-disabled={!mesure || zoom.auMax} aria-label="Zoom avant"
          aria-keyshortcuts="Control+= Meta+= Control++ Meta++" title="Zoom avant (Ctrl +)" data-zoom-action="plus" style={{ ...bouton, ...inactif(!mesure || zoom.auMax) }}>+</button>
        <button type="button" onClick={() => zoom.agir('ajuster')} aria-pressed={mode === 'ajuste'} aria-keyshortcuts="Control+0 Meta+0"
          title="Cadrer le document entier dans la zone (Ctrl 0)" data-zoom-action="ajuster"
          style={{ ...bouton, ...(mode === 'ajuste' ? actif : {}) }}>Ajuster</button>
        <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)', margin: '0 4px' }} />
        <button type="button" onClick={onVersions} aria-expanded={versionsOuvert} aria-controls={idVersions} data-action="versions"
          style={{ ...bouton, ...(versionsOuvert ? actif : {}) }}>Versions</button>
      </div>

      <div
        ref={zoom.refZone}
        data-zone-travail
        data-zoom={mesure ? String(Math.round(z * 1000) / 1000) : 'css'}
        data-mode-zoom={mode}
        style={{
          position: 'relative', height: hauteur, overflow: 'auto', borderRadius: 10, minWidth: 0,
          background: 'var(--paper)', border: '1px solid var(--line)', scrollbarGutter: 'stable', overscrollBehavior: 'contain',
        }}
      >
        {d ? (
          <div style={{ position: 'relative', width: d.contenu.largeur, height: d.contenu.hauteur }}>
            <div style={{ position: 'absolute', left: d.origine.x, top: d.origine.y, width: d.document.largeur }}>
              {surface({ largeurPx: d.document.largeur, hauteurMax: hauteur })}
            </div>
          </div>
        ) : (
          <div style={{ boxSizing: 'border-box', height: '100%', padding: MARGE_ZONE_EDITEUR, display: 'grid', alignContent: 'center' }}>
            {surface({ hauteurMax: `calc(${hauteur} - ${2 * MARGE_ZONE_EDITEUR}px)` })}
          </div>
        )}
      </div>
      {!mobile && (
        <p style={legende}>
          Zoom · Ctrl + molette ou pincement autour du pointeur · Ctrl+ et Ctrl− par paliers · Ctrl+0 ajuste. La molette seule déplace la vue. Le zoom ne modifie pas le document.
        </p>
      )}
    </div>
  );
}
