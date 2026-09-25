import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';

/**
 * Le fond translucide d'une pastille posée SUR une créa · pronostic et verdict
 * dans la galerie, sélecteur de cadre, « Format d'origine » et compteur dans la
 * fiche. Un seul voile sombre magenté, identique de la galerie à la fiche · une
 * pastille sur image ne doit pas changer de teinte d'un écran du parcours à
 * l'autre. La galerie le portait déjà (carte + verdict) · la fiche recopiait
 * trois `rgba(0,0,0,.4x)` au hasard, qu'on fait converger ici.
 */
export const FOND_PASTILLE_MEDIA = 'rgba(8,5,10,.72)';

export const input: CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 12,
  border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)',
  fontSize: 14, outline: 'none',
};
// Boutons partagés · hauteur réelle ≥ CIBLE_TACTILE_MIN (mesurée, pas déduite du
// padding) · inline-flex centré pour que le minHeight tienne quel que soit le texte.
export const btn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minHeight: CIBLE_TACTILE_MIN, padding: '10px 16px', borderRadius: 999, border: 'none',
  background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
};
export const btnGhost: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minHeight: CIBLE_TACTILE_MIN, padding: '7px 14px', borderRadius: 999, border: '1px solid var(--line-2)',
  background: 'transparent', color: 'var(--ink-2)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
};
export const panel: CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', padding: 22, marginBottom: 20,
};
export const pageWrap: CSSProperties = { padding: '30px clamp(16px, 4vw, 36px) 60px', maxWidth: 860, margin: '0 auto' };

/**
 * Largeurs de contenu · quatre paliers, pas quinze valeurs au hasard.
 *
 * Les écrans avaient dérivé sur ~15 largeurs de 700 à 1320 sans logique · un
 * même type d'écran paraissait tassé ici, large là. On fixe le vocabulaire :
 *  - `table`  · une table/canvas large (Adsmap).
 *  - `data`   · le DÉFAUT d'un écran à grilles/données · déjà la largeur des
 *               meilleurs écrans (dashboard, veille, studio) · « exploite tout
 *               l'espace ».
 *  - `detail` · un écran plus resserré (détail, colonne mixte).
 *  - `prose`  · une mesure de lecture (texte long, réglages étroits).
 */
export const LARGEURS = { table: 1320, data: 1180, detail: 1040, prose: 760 } as const;
/**
 * Titres · alignés sur la charte (design.md) · titre de PAGE 32px desktop / 28px
 * mobile, titre de SECTION 18–20px, graisses SOBRES (plus de 800 · la charte
 * privilégie les graisses légères). Un seul jeton par niveau · une seule vérité.
 *
 * Le titre de page est responsive sans media query (styles en ligne obligent) :
 * `clamp(28px, 4vw, 32px)` vaut 28 sous ~700px de large, 32 au-delà · exactement
 * 28 mobile / 32 desktop.
 */
export const h1: CSSProperties = { margin: 0, fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' };
export const h2: CSSProperties = { margin: '0 0 4px', fontSize: 19, fontWeight: 600, color: 'var(--ink)' };
export const sub: CSSProperties = { color: 'var(--muted)', fontSize: 13, marginTop: 0, marginBottom: 16 };
export const lbl: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', display: 'block', marginBottom: 6 };

export function Msg({ kind, children }: { kind: 'ok' | 'err'; children: React.ReactNode }) {
  const ok = kind === 'ok';
  return (
    <div style={{
      margin: '0 0 16px', padding: '10px 13px', borderRadius: 12, fontSize: 13,
      border: `1px solid ${ok ? 'rgba(24,204,140,.4)' : 'rgba(255,77,109,.4)'}`,
      background: ok ? 'rgba(24,204,140,.10)' : 'rgba(255,77,109,.10)',
      color: ok ? '#7ee8bf' : '#ff9db0',
    }}>{children}</div>
  );
}
