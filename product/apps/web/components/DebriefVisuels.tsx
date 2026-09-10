import type { DebriefVisuels } from '@tiktrends/core';

/**
 * Le débrief d'un lot de visuels · « sur N jugés, X retenus ». Vert quand tout
 * est retenu, neutre sinon. La décision (compter, ne pas conclure) vit dans
 * `debriefVisuels` (core) · ici on rend.
 */
export function DebriefVisuelsStrip({ d }: { d: DebriefVisuels }) {
  const vert = d.toutBon;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '9px 13px', borderRadius: 12,
      border: `1px solid ${vert ? 'rgba(126,232,191,.4)' : 'var(--line-2)'}`,
      background: vert ? 'rgba(126,232,191,.07)' : 'var(--surface)',
      fontSize: 12.5, color: vert ? '#7ee8bf' : 'var(--ink-2)', lineHeight: 1.5,
    }}>
      <span aria-hidden>{vert ? '✓' : '◑'}</span>
      <span>{d.resume}</span>
    </div>
  );
}
