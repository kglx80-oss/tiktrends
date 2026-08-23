export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 620, textAlign: 'center' }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} /> Sprint 1
        </span>
        <h1 style={{ marginTop: 14, fontSize: 40, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--ink)' }}>
          TikTrends Creative Intelligence
        </h1>
        <p style={{ marginTop: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Ingestion (fixtures) → dédup → agrégation → Radar, de bout en bout.
        </p>
        <a href="/dashboard" style={{ display: 'inline-block', marginTop: 22, padding: '12px 22px', borderRadius: 999, background: 'var(--grad-accent)', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>
          Ouvrir le dashboard créas →
        </a>
        <div style={{ marginTop: 26, display: 'inline-flex', gap: 8, alignItems: 'center', padding: '7px 14px', borderRadius: 999, border: '1px solid var(--line)', fontSize: 12, color: 'var(--ink-2)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)' }} />
          Déploiement automatique actif · v1
        </div>
      </div>
    </main>
  );
}
