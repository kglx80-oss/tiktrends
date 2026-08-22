export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 620, textAlign: 'center' }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} /> Sprint 0
        </span>
        <h1 style={{ marginTop: 14, fontSize: 40, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--ink)' }}>
          TikTrends Creative Intelligence
        </h1>
        <p style={{ marginTop: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Socle produit initialisé — DA reprise 1:1 de la maquette. Prochaine étape : OAuth TikTok/Meta + ingestion.
        </p>
        <a href="/" style={{ display: 'inline-block', marginTop: 22, padding: '12px 22px', borderRadius: 999, background: 'var(--grad-accent)', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>
          Commencer
        </a>
      </div>
    </main>
  );
}
