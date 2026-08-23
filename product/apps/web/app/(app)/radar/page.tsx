import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../lib/rbac';
import { buildAnalysis, BUCKETS, bucketDef, type AnalysisRow } from '../../../lib/analysis';

export const dynamic = 'force-dynamic';
const feature = FEATURES.find((f) => f.key === 'radar')!;

const GRADE_COLOR: Record<string, string> = { A: '#18cc8c', B: '#7aa2ff', C: '#f5a623', D: '#ff4d6d' };
const eur = (n: number) => '€' + Math.round(n).toLocaleString('fr-FR');

function Grade({ label, g }: { label: string; g: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', background: GRADE_COLOR[g] || '#9a8a98' }}>{g}</div>
    </div>
  );
}

function Row({ r }: { r: AnalysisRow }) {
  const b = bucketDef(r.bucket);
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{r.title}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 999, padding: '1px 7px' }}>{r.platform}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{eur(r.spend)} dépensé · {r.impressions.toLocaleString('fr-FR')} impr. · {r.daysActive} j</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Grade label="Hook" g={r.grades.hook} />
          <Grade label="Hold" g={r.grades.hold} />
          <Grade label="CTR" g={r.grades.ctr} />
          <Grade label="Conv" g={r.grades.conv} />
        </div>
        <div style={{ textAlign: 'center', minWidth: 64 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--muted)' }}>Score</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{r.globalScore.toFixed(2)}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, padding: '6px 14px', borderRadius: 999, color: '#fff', background: b.color }}>{b.action}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-2)' }}>
        {r.diagnosis.map((d, i) => <span key={i} style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 9px' }}>→ {d}</span>)}
      </div>
    </div>
  );
}

export default async function RadarPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess({ role: s.role, plan: s.plan }, feature)) {
    const why = denyReason({ role: s.role, plan: s.plan }, feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Radar</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 10 }}>{why === 'plan' ? 'Le Radar est inclus à partir du plan Core.' : 'Accès réservé.'}</p>
        </div>
      </main>
    );
  }

  const rows = buildAnalysis();
  const byBucket = BUCKETS.map((b) => ({ b, items: rows.filter((r) => r.bucket === b.key) })).filter((g) => g.items.length > 0);

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={h1}>Radar</h1>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>scoring prescriptif · fixtures</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 20 }}>
        Chaque créa est notée <b>Hook / Hold / CTR / Conv</b> (A→D, en percentiles du compte) puis rangée en
        recommandation : <b>scaler, pousser, itérer, rafraîchir, couper</b>. Branche un compte pour des données live.
      </p>

      {/* Résumé buckets */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        {BUCKETS.map((b) => {
          const n = rows.filter((r) => r.bucket === b.key).length;
          return (
            <div key={b.key} style={{ flex: '1 1 120px', padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: b.color }} />
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{b.label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{n}</div>
            </div>
          );
        })}
      </div>

      {byBucket.map(({ b, items }) => (
        <section key={b.key} style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: b.color }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{b.label}</h2>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {b.action} ({items.length})</span>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((r) => <Row key={r.platform + r.fingerprint} r={r} />)}
          </div>
        </section>
      ))}
    </main>
  );
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1100, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
