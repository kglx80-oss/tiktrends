import type { CSSProperties } from 'react';
import { natureLot, LIBELLE_NATURE_LOT } from '@tiktrends/core';

/**
 * L'affichage de la NATURE d'un lot · badge + réserve. La règle vit au noyau
 * (`natureLot`, pur, testé) · ici on ne fait que la rendre. Deux pièces séparées
 * parce qu'elles vont à deux endroits · le badge dans l'en-tête, à côté du
 * statut ; la réserve en bloc, sous l'en-tête, quand elle mérite une phrase.
 *
 * CDC v8 · R04 · un lot importé « Analysé » avec des ads « Brouillon » n'est pas
 * une contradiction · sa nature l'explique, à l'écran, pas dans le code seul.
 */

/** Le badge de nature · rien pour un lot suivi (pas de bruit inutile). */
export function BadgeNatureLot({ status, launchedAt }: { status: string; launchedAt: string | null }) {
  const lib = LIBELLE_NATURE_LOT[natureLot({ status, launchedAt })];
  if (!lib.court) return null;
  return <span style={badgeImporte}>{lib.court}</span>;
}

/** La réserve de nature · la phrase qui explique la coexistence, quand il y en a une. */
export function ReserveNatureLot({ status, launchedAt }: { status: string; launchedAt: string | null }) {
  const lib = LIBELLE_NATURE_LOT[natureLot({ status, launchedAt })];
  if (!lib.phrase) return null;
  return (
    <p style={reserve}>{lib.phrase}</p>
  );
}

const badgeImporte: CSSProperties = {
  padding: '2px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
  color: 'var(--muted)', border: '1px dashed var(--line-2)', whiteSpace: 'nowrap',
};

const reserve: CSSProperties = {
  margin: '10px 0 0', padding: '10px 13px', borderRadius: 11,
  border: '1px dashed var(--line-2)', background: 'var(--paper)',
  fontSize: 11.5, lineHeight: 1.55, color: 'var(--muted)',
};
