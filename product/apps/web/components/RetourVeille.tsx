import { lienRetourVeille, termeRetourVeille, CIBLE_TACTILE_MIN } from '@tiktrends/core';

/**
 * Lot 18B · « Revenir à ta recherche » · le même lien dans la Veille (après
 * « Ses annonces dans la Veille ») et dans le Studio (arrivé d'une carte de
 * Veille). La cible est toujours `/veille`, critères relus un par un
 * (`lienRetourVeille`) · l'ancre ramène à la carte d'où l'on est parti.
 * Rien à afficher sans contexte de retour.
 */
export function RetourVeille({ rv, libelle = 'Revenir à ta recherche' }: { rv: string | string[] | null | undefined; libelle?: string }) {
  const href = lienRetourVeille(rv);
  if (!href) return null;
  const terme = termeRetourVeille(rv);
  return (
    <a href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, maxWidth: '100%', fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', overflowWrap: 'anywhere' }}>
      <span aria-hidden>‹</span>
      <span>{libelle}{terme ? <> · <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>« {terme} »</span></> : null}</span>
    </a>
  );
}
