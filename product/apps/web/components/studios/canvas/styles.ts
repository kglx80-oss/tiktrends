import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, type NatureCarteCanvas } from '@tiktrends/core';
import { btn, btnGhost, surface, tuile } from '../../ui';

/** Bordure d'un cadre en propriétés détaillées · ne jamais mêler `border` et `borderColor` (React le signale). */
function detailler(b: CSSProperties['border']): CSSProperties {
  const [largeur = '1px', trait = 'solid', couleur = 'var(--line)'] = String(b ?? '').split(' ');
  return { borderWidth: largeur, borderStyle: trait as CSSProperties['borderStyle'], borderColor: couleur };
}
const { border: bordGhost, ...ghost } = btnGhost;
const { border: bordTuile, ...cadreTuile } = tuile;
const COULEUR_TUILE = String(detailler(bordTuile).borderColor);

/**
 * Styles en ligne du canvas métier · jetons de la charte (`--bg`, `--surface`,
 * `--ink`, `--accent-strong`…), cibles de 44 px. Le focus visible vient de la
 * règle globale `:focus-visible` (globals.css) · aucun `outline: none` ici.
 */

export const section: CSSProperties = { ...surface, background: 'var(--surface)', padding: 'clamp(14px, 3vw, 18px)', display: 'grid', gap: 12, minWidth: 0 };
export const titre: CSSProperties = { margin: 0, fontSize: 17, fontWeight: 500, color: 'var(--ink)' };
export const texte: CSSProperties = { margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, overflowWrap: 'anywhere' };
export const mini: CSSProperties = { margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, overflowWrap: 'anywhere' };
export const etiquette: CSSProperties = { fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' };

export const bouton: CSSProperties = { ...ghost, ...detailler(bordGhost), minHeight: CIBLE_TACTILE_MIN, minWidth: CIBLE_TACTILE_MIN, fontSize: 13.5, color: 'var(--ink)', padding: '8px 12px', justifyContent: 'center' };
export const boutonActif: CSSProperties = { background: 'var(--accent-soft)', borderColor: 'var(--accent-strong)' };
export const boutonPrimaire: CSSProperties = { ...btn, minHeight: CIBLE_TACTILE_MIN, fontSize: 14 };
export const desactive: CSSProperties = { opacity: 0.5, cursor: 'not-allowed' };
export const rangee: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' };

/** Couleur d'appui par nature · le MOT (Entrée, Génération, Calcul) porte toujours l'information. */
export const COULEUR_NATURE: Readonly<Record<NatureCarteCanvas, string>> = {
  entree: 'var(--line-2)',
  generation: 'var(--accent-strong)',
  calcul: 'var(--ok)',
};

export function styleCarte(nature: NatureCarteCanvas, choisie: boolean): CSSProperties {
  const cadre = choisie ? 'var(--accent-strong)' : COULEUR_TUILE;
  return {
    ...cadreTuile,
    borderStyle: 'solid',
    borderWidth: '1px 1px 1px 4px',
    borderColor: `${cadre} ${cadre} ${cadre} ${COULEUR_NATURE[nature]}`,
    boxShadow: choisie ? '0 0 0 2px var(--accent-strong)' : 'none',
    boxSizing: 'border-box',
    background: 'var(--bg)',
    color: 'var(--ink)',
    textAlign: 'left',
    cursor: 'pointer',
    font: 'inherit',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minHeight: CIBLE_TACTILE_MIN,
  };
}

export const pastilleNature: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: '1px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 600,
  border: '1px solid var(--line-2)', color: 'var(--ink-2)', background: 'var(--rail)', whiteSpace: 'nowrap',
};
