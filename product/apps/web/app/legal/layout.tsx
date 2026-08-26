import Link from 'next/link';
import type { ReactNode } from 'react';
import { LEGAL_NAV } from '../../lib/legal';

export const dynamic = 'force-dynamic';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0d070c)', color: 'var(--ink, #eee)' }}>
      <header style={{ borderBottom: '1px solid var(--line)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--grad-accent)' }} />
          <b style={{ fontSize: 15, color: 'var(--ink)' }}>TikTrends</b>
        </Link>
        <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {LEGAL_NAV.map((l) => (
            <Link key={l.href} href={l.href} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', textDecoration: 'none', padding: '6px 10px', borderRadius: 8 }}>{l.label}</Link>
          ))}
        </nav>
      </header>
      {children}
      <footer style={{ borderTop: '1px solid var(--line)', padding: '20px 24px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
        © {new Date().getFullYear()} TikTrends · <Link href="/login" style={{ color: 'var(--accent-strong)', textDecoration: 'none' }}>Se connecter</Link>
      </footer>
    </div>
  );
}
