import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { buildAnalysis, analysisTotals, BUCKETS, bucketDef } from '../../../lib/analysis';

export const dynamic = 'force-dynamic';

const eur = (n: number) => '€' + Math.round(n).toLocaleString('fr-FR');
const pct = (n: number) => (n * 100).toFixed(2).replace('.', ',') + ' %';
const num = (n: number) => n.toLocaleString('fr-FR');

export default async function AnalyticsPage() {
  const s = await getSession();
  if (!s) redirect('/login');

  const rows = buildAnalysis();
  const t = analysisTotals(rows);
  const topRoas = [...rows].filter((r) => r.eligible).sort((a, b) => b.convEff - a.convEff).slice(0, 6);
  const byPlatform = (['tiktok', 'meta'] as const).map((p) => {
    const rs = rows.filter((r) => r.platform === p);
    return { p, spend: rs.reduce((x, r) => x + r.spend, 0), count: rs.length };
  });
  const maxBucket = Math.max(1, ...BUCKETS.map((b) => rows.filter((r) => r.bucket === b.key).length));

  const kpis: Array<[string, string, string]> = [
    ['Dépense', eur(t.spend), 'total sur la période'],
    ['Impressions', num(t.impressions), `${t.count} créas`],
    ['CTR moyen', pct(t.avgCtr), 'pondéré par impressions'],
    ['ROAS moyen', t.avgRoas.toFixed(2) + '×', `${t.eligible} créas éligibles`],
  ];

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={h1}>Analytics</h1>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>KPI créas · fixtures</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 22 }}>
        Vue agrégée de tes créas : dépense, portée, efficacité, et répartition Radar. Branche un compte pour des données live.
      </p>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 26 }}>
        {kpis.map(([label, value, sub]) => (
          <div key={label} style={card}>
            <div style={cardLabel}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* Répartition Radar */}
        <section style={card}>
          <h2 style={h2}>Répartition Radar</h2>
          <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
            {BUCKETS.map((b) => {
              const n = rows.filter((r) => r.bucket === b.key).length;
              return (
                <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-2)', width: 108 }}>{b.label}</span>
                  <div style={{ flex: 1, height: 10, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${(n / maxBucket) * 100}%`, height: '100%', background: b.color, borderRadius: 999 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', width: 24, textAlign: 'right' }}>{n}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Par plateforme */}
        <section style={card}>
          <h2 style={h2}>Dépense par plateforme</h2>
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            {byPlatform.map(({ p, spend, count }) => (
              <div key={p}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: 'var(--ink)', fontWeight: 600, textTransform: 'capitalize' }}>{p}</span>
                  <span style={{ color: 'var(--ink-2)' }}>{eur(spend)} · {count} créas</span>
                </div>
                <div style={{ height: 10, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${t.spend ? (spend / t.spend) * 100 : 0}%`, height: '100%', background: 'var(--grad-accent)', borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Top ROAS */}
      <h2 style={{ ...h2, marginTop: 28, marginBottom: 12 }}>Top créas par ROAS</h2>
      <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ ...trow, background: 'var(--surface)', color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
          <span>Créa</span><span>Plateforme</span><span style={{ textAlign: 'right' }}>Dépense</span><span style={{ textAlign: 'right' }}>CTR</span><span style={{ textAlign: 'right' }}>ROAS</span><span style={{ textAlign: 'center' }}>Reco</span>
        </div>
        {topRoas.map((r) => {
          const b = bucketDef(r.bucket);
          return (
            <div key={r.platform + r.fingerprint} style={{ ...trow, borderTop: '1px solid var(--line)' }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
              <span style={{ color: 'var(--ink-2)', fontSize: 13, textTransform: 'capitalize' }}>{r.platform}</span>
              <span style={{ textAlign: 'right', color: 'var(--ink-2)', fontSize: 13 }}>{eur(r.spend)}</span>
              <span style={{ textAlign: 'right', color: 'var(--ink-2)', fontSize: 13 }}>{pct(r.ctr)}</span>
              <span style={{ textAlign: 'right', color: 'var(--ink)', fontSize: 13, fontWeight: 700 }}>{r.convEff.toFixed(2)}×</span>
              <span style={{ textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, color: '#fff', background: b.color }}>{b.action}</span></span>
            </div>
          );
        })}
      </div>
    </main>
  );
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1100, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
const h2 = { margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' } as const;
const card = { padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)' } as const;
const cardLabel = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 } as const;
const trow = { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', padding: '11px 16px', alignItems: 'center', gap: 8 } as const;
