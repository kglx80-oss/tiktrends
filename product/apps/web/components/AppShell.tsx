'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface FeatureVM { key: string; label: string; href: string; icon: string; locked: boolean; soon?: boolean }
interface Props {
  features: FeatureVM[];
  userName: string;
  userEmail: string;
  roleLabel: string;
  planLabel: string;
  workspaceName: string;
  logout: () => Promise<void>;
  children: ReactNode;
}

function Icon({ name }: { name: string }) {
  const p: Record<string, string> = {
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    tag: 'M20.6 13.4 12 22l-9-9V4h9zM7.5 7.5h.01',
    bulb: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2h6c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z',
    spark: 'M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4',
    store: 'M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16',
    plug: 'M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0zM12 16v6',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9',
    card: 'M2 5h20v14H2zM2 10h20',
    help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.2 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  };
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={p[name] || p.grid} />
    </svg>
  );
}

export function AppShell(props: Props) {
  const { features, userName, userEmail, roleLabel, planLabel, workspaceName, logout, children } = props;
  const pathname = usePathname();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '248px minmax(0,1fr)', minHeight: '100vh' }}>
      <aside style={{
        background: 'var(--rail)', borderRight: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column', padding: '16px 12px', position: 'sticky', top: 0, height: '100vh',
      }}>
        {/* Marque + workspace */}
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', textDecoration: 'none' }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--grad-accent)' }} />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>TikTrends</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{workspaceName}</div>
          </div>
        </Link>

        {/* Navigation */}
        <nav style={{ marginTop: 18, display: 'grid', gap: 2 }}>
          {features.map((f) => {
            const active = pathname === f.href;
            const disabled = f.locked || f.soon;
            const inner = (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 10,
                fontSize: 14, fontWeight: active ? 700 : 500,
                color: disabled ? 'var(--muted)' : active ? 'var(--ink)' : 'var(--ink-2)',
                background: active ? 'var(--accent-soft)' : 'transparent',
                opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : 'pointer',
              }}>
                <Icon name={f.icon} />
                <span style={{ flex: 1 }}>{f.label}</span>
                {f.soon && <span style={pill('#8a6d3b', 'rgba(245,166,35,.15)')}>Bientôt</span>}
                {!f.soon && f.locked && <span style={pill('var(--muted)', 'rgba(255,255,255,.06)')}>🔒</span>}
              </span>
            );
            return disabled
              ? <div key={f.key} title={f.locked ? 'Nécessite un abonnement supérieur' : 'Bientôt disponible'}>{inner}</div>
              : <Link key={f.key} href={f.href} style={{ textDecoration: 'none' }}>{inner}</Link>;
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Pied : utilisateur + plan + déconnexion */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'grid', gap: 10 }}>
          <Link href="/profile" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px', borderRadius: 10, textDecoration: 'none' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', background: 'var(--paper)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)',
            }}>{(userName || userEmail).slice(0, 1).toUpperCase()}</div>
            <div style={{ lineHeight: 1.2, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName || userEmail}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{roleLabel} · {planLabel}</div>
            </div>
          </Link>
          <form action={logout}>
            <button type="submit" style={{
              width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)',
              background: 'transparent', color: 'var(--ink-2)', fontSize: 13, cursor: 'pointer',
            }}>Se déconnecter</button>
          </form>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function pill(color: string, bg: string) {
  return { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color, background: bg } as const;
}
