import type { ReactNode, CSSProperties } from 'react';

export const field: CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 12,
  border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)',
  fontSize: 14, outline: 'none',
};
export const primaryBtn: CSSProperties = {
  marginTop: 4, padding: '12px 18px', borderRadius: 999, border: 'none',
  background: 'var(--grad-accent)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
};
export function errorBox(msg: string) {
  return (
    <div style={{
      marginBottom: 14, padding: '10px 12px', borderRadius: 12,
      border: '1px solid rgba(255,77,109,.4)', background: 'rgba(255,77,109,.10)',
      color: '#ff9db0', fontSize: 13,
    }}>{msg}</div>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
      {/* Panneau de marque */}
      <section style={{
        position: 'relative', overflow: 'hidden', padding: '48px 44px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        borderRight: '1px solid var(--line)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--grad-accent)' }} />
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-.01em' }}>TikTrends</span>
        </div>
        <div>
          <h2 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-.02em', maxWidth: 420 }}>
            Creative Intelligence, <span style={{ color: 'var(--accent-strong)' }}>TikTok-first</span>, pour agences.
          </h2>
          <p style={{ marginTop: 14, color: 'var(--ink-2)', fontSize: 14, maxWidth: 420, lineHeight: 1.6 }}>
            Radar prescriptif, tagging IA, Inspo concurrentielle et gestion multi-marques —
            avec des droits par équipe et par client.
          </p>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          Hébergé en Europe · RGPD · souverain
        </div>
      </section>

      {/* Panneau formulaire */}
      <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.01em' }}>{title}</h1>
          <p style={{ marginTop: 6, marginBottom: 22, color: 'var(--muted)', fontSize: 14 }}>{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
