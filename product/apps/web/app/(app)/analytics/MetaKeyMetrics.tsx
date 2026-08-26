import type { MetaAdsInsights, MetaKpiSet } from '@tiktrends/integrations';

function fmt(n: number, cur: string, kind: 'money' | 'x' | 'num' | 'pct'): string {
  if (kind === 'x') return `${n.toFixed(2)}×`;
  if (kind === 'pct') return `${n.toFixed(2)} %`;
  if (kind === 'num') return Math.round(n).toLocaleString('fr-FR');
  const v = n >= 1000 ? Math.round(n).toLocaleString('fr-FR') : n.toFixed(2);
  return `${v} ${cur}`;
}
function delta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

interface Metric { key: keyof MetaKpiSet; label: string; kind: 'money' | 'x' | 'num' | 'pct'; goodUp: boolean }
const METRICS: Metric[] = [
  { key: 'spend', label: 'Dépense', kind: 'money', goodUp: true },
  { key: 'cpa', label: 'CPA', kind: 'money', goodUp: false },
  { key: 'roas', label: 'ROAS', kind: 'x', goodUp: true },
  { key: 'revenue', label: 'Valeur d’achat', kind: 'money', goodUp: true },
  { key: 'aov', label: 'Panier moyen', kind: 'money', goodUp: true },
  { key: 'cpcAll', label: 'CPC (tous)', kind: 'money', goodUp: false },
  { key: 'cpcLink', label: 'CPC (lien)', kind: 'money', goodUp: false },
  { key: 'cpm', label: 'CPM', kind: 'money', goodUp: false },
];

export function MetaKeyMetrics({ insights, syncedAt }: { insights: MetaAdsInsights; syncedAt: string | null }) {
  const cur = insights.currency || '€';
  const w = insights.window; const p = insights.previous;
  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Key Metrics <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· Meta Ads · 30 j vs 30 j précédents</span></h2>
        <span style={{ flex: 1 }} />
        {insights.accountName && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{insights.accountName}{syncedAt ? ` · synchro ${new Date(syncedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}` : ''}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {METRICS.map((m) => {
          const d = delta(w[m.key], p[m.key]);
          const good = d == null ? null : (m.goodUp ? d >= 0 : d <= 0);
          return (
            <div key={m.key} style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '15px 17px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 7 }}>{m.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 23, fontWeight: 800, color: 'var(--ink)' }}>{fmt(w[m.key], cur, m.kind)}</span>
                {d != null && (
                  <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, color: good ? '#0d3d2a' : '#5a1220', background: good ? 'rgba(126,232,191,.22)' : 'rgba(255,120,140,.18)' }}>
                    {d >= 0 ? '+' : ''}{d} %
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Top performing ads */}
      {insights.topAds?.length ? (
        <>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Top créas (par ROAS)</h3>
          <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px', gap: 8, padding: '10px 16px', background: 'var(--surface)', color: 'var(--muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <span>Créa</span><span style={{ textAlign: 'right' }}>ROAS</span><span style={{ textAlign: 'right' }}>CPA</span><span style={{ textAlign: 'right' }}>Dépense</span>
            </div>
            {insights.topAds.slice(0, 8).map((a, i) => (
              <div key={a.name + i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px', gap: 8, padding: '11px 16px', borderTop: '1px solid var(--line)', fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <span style={{ textAlign: 'right', fontWeight: 800, color: a.roas >= 2 ? '#7ee8bf' : 'var(--ink)' }}>{a.roas}×</span>
                <span style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{fmt(a.cpa, cur, 'money')}</span>
                <span style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{fmt(a.spend, cur, 'money')}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
