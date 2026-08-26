import type { ReactNode } from 'react';

export function LegalDoc({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 80px' }}>
      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>{title}</h1>
      {subtitle && <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted)' }}>{subtitle}</p>}
      <div style={{ marginTop: 26, display: 'grid', gap: 22 }}>{children}</div>
    </main>
  );
}

export function LSection({ h, children }: { h: string; children: ReactNode }) {
  return (
    <section>
      <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{h}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)' }}>{children}</div>
    </section>
  );
}

/** Ligne clé/valeur (mentions légales). */
export function LRow({ k, v }: { k: string; v: string }) {
  const todo = /À COMPLÉTER/i.test(v);
  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
      <span style={{ minWidth: 210, fontWeight: 700, color: 'var(--ink)', fontSize: 13.5 }}>{k}</span>
      <span style={{ fontSize: 13.5, color: todo ? '#f5a623' : 'var(--ink-2)' }}>{v}</span>
    </div>
  );
}
