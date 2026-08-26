export interface CreativeStats {
  score: number;
  total: number;
  templates: Array<{ key: string; label: string; n: number }>;
  tags: Array<{ tag: string; n: number }>;
}

function level(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'Élevée', color: '#7ee8bf' };
  if (score >= 45) return { label: 'Modérée', color: '#f5a623' };
  return { label: 'Faible', color: '#ff6b6b' };
}

export function CreativeIntel({ stats }: { stats: CreativeStats }) {
  const lv = level(stats.score);
  const maxTpl = Math.max(1, ...stats.templates.map((t) => t.n));
  const maxTag = Math.max(1, ...stats.tags.map((t) => t.n));
  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Diversité créative <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· tes générations & tags</span></h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* Score + gabarits */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <span style={{ position: 'relative', width: 60, height: 60, borderRadius: '50%', background: `conic-gradient(${lv.color} ${stats.score * 3.6}deg, var(--line-2) 0)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{stats.score}</span>
            </span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: lv.color }}>{lv.label}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{stats.total} créa(s) analysée(s)</div>
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Répartition des gabarits</div>
          {stats.templates.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>Génère des pubs pour voir la diversité.</p> : (
            <div style={{ display: 'grid', gap: 7 }}>
              {stats.templates.map((t) => (
                <div key={t.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><span style={{ color: 'var(--ink-2)' }}>{t.label}</span><span style={{ color: 'var(--muted)' }}>{t.n}</span></div>
                  <div style={{ height: 8, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${(t.n / maxTpl) * 100}%`, height: '100%', background: 'var(--grad-accent)', borderRadius: 999 }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top tags */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Top tags créatifs (IA)</div>
          {stats.tags.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>Tag tes assets (bouton « Analyser » dans Assets) pour voir tes thèmes dominants.</p> : (
            <div style={{ display: 'grid', gap: 7 }}>
              {stats.tags.map((t) => (
                <div key={t.tag}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><span style={{ color: 'var(--ink-2)', textTransform: 'capitalize' }}>{t.tag}</span><span style={{ color: 'var(--muted)' }}>{t.n}</span></div>
                  <div style={{ height: 8, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${(t.n / maxTag) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#7a5aff,#e6007e)', borderRadius: 999 }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
