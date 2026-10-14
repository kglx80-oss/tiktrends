import { CIBLE_TACTILE_MIN, type LienPilotage } from '@tiktrends/core';

/**
 * UX V2 · lot 5 · « Piloter ton activité » · Résultats, Activité et coûts,
 * Jarvis. Les liens viennent du noyau (`liensPilotage`) · un accès que le rôle
 * n'ouvre pas est ABSENT. Aucun chiffre ni KPI · des destinations réelles et
 * ce qu'on y trouve. Liste vide ⇒ rien n'est rendu.
 */
export function PilotageActivite({ liens }: { liens: readonly LienPilotage[] }) {
  if (liens.length === 0) return null;
  return (
    <section aria-label="Piloter ton activité" data-accueil-pilotage style={{ marginBottom: 26 }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-.01em' }}>Piloter ton activité</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', columnGap: 28 }}>
        {liens.map((l) => (
          <a key={l.href} href={l.href} data-pilotage={l.href} style={{
            display: 'flex', alignItems: 'center', gap: 12, minHeight: CIBLE_TACTILE_MIN, padding: '12px 2px', minWidth: 0,
            textDecoration: 'none', borderBottom: '1px solid var(--line)',
          }}>
            <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <b style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{l.titre}</b>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{l.sous}</span>
            </span>
            <span aria-hidden style={{ flex: 1 }} />
            <span aria-hidden style={{ color: 'var(--muted)', fontWeight: 800 }}>›</span>
          </a>
        ))}
      </div>
    </section>
  );
}
