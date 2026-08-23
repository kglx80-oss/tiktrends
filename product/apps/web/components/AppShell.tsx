'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { BrandSwitcher } from './BrandSwitcher';

// Pages « espace admin » : fond ambré + accent orange (même univers sombre).
const ADMIN_ROUTES = ['/console', '/settings', '/team', '/billing'];
const ADMIN_CONTENT = {
  '--accent': '#f5a623',
  '--accent-strong': '#ffca6b',
  '--accent-soft': '#2a2110',
  '--grad-accent': 'linear-gradient(135deg,#f5a623 0%,#ff8c42 100%)',
  backgroundColor: '#130d07',
  backgroundImage:
    'radial-gradient(1100px 560px at 50% -12%, rgba(245,166,35,0.20), transparent 60%),' +
    'radial-gradient(760px 520px at 90% 2%, rgba(255,140,66,0.13), transparent 55%),' +
    'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),' +
    'linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
  backgroundSize: '100% 100%, 100% 100%, 36px 36px, 36px 36px',
  backgroundAttachment: 'fixed',
} as unknown as CSSProperties;

interface NavItem { key: string; label: string; href: string; icon: string; locked: boolean; isSub: boolean; soon?: boolean }
interface Group { group: string; items: NavItem[] }
interface Brand { id: string; name: string; logoUrl?: string | null }
interface Props {
  nav: Group[];
  account: NavItem[];
  brands: Brand[];
  activeBrandId: string | null;
  canManageBrands: boolean;
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
    bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.2 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
    gauge: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4M13.4 10.6 19 5M4 20a8 8 0 1 1 16 0z',
    radar: 'M12 12a9 9 0 1 0 0 0.01M12 12a5 5 0 1 0 0 0.01M12 12l6-4',
  };
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={p[name] || p.grid} />
    </svg>
  );
}

function NavLink({ it, active }: { it: NavItem; active: boolean }) {
  const disabled = it.locked || it.soon;
  const inner = (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: it.isSub ? '7px 10px 7px 30px' : '9px 10px', borderRadius: 10,
      fontSize: it.isSub ? 13 : 14, fontWeight: active ? 700 : 500,
      color: disabled ? 'var(--muted)' : active ? 'var(--ink)' : 'var(--ink-2)',
      background: active ? 'var(--accent-soft)' : 'transparent',
      opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : 'pointer',
    }}>
      {it.isSub ? <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? 'var(--accent)' : 'var(--line-2)' }} /> : <Icon name={it.icon} />}
      <span style={{ flex: 1 }}>{it.label}</span>
      {it.soon && <span style={pill('#8a6d3b', 'rgba(245,166,35,.15)')}>Bientôt</span>}
      {!it.soon && it.locked && <span style={pill('var(--muted)', 'rgba(255,255,255,.06)')}>🔒</span>}
    </span>
  );
  return disabled
    ? <div title={it.locked ? 'Nécessite un abonnement supérieur' : 'Bientôt disponible'}>{inner}</div>
    : <Link href={it.href} style={{ textDecoration: 'none' }}>{inner}</Link>;
}

export function AppShell(props: Props) {
  const { nav, account, brands, activeBrandId, canManageBrands, userName, userEmail, roleLabel, planLabel, workspaceName, logout, children } = props;
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = ADMIN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', minHeight: '100vh' }}>
      <aside style={{ background: 'var(--rail)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', padding: '16px 12px', position: 'sticky', top: 0, height: '100vh' }}>
        {/* Marque + workspace */}
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', textDecoration: 'none' }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--grad-accent)' }} />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>TikTrends</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{workspaceName}</div>
          </div>
        </Link>

        {/* Sélecteur de marque */}
        <BrandSwitcher brands={brands} activeId={activeBrandId} canManage={canManageBrands} />

        {/* Navigation groupée */}
        <nav style={{ marginTop: 14, display: 'grid', gap: 4, overflowY: 'auto', flex: 1 }}>
          {nav.map((grp) => (
            <div key={grp.group} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '6px 10px 2px' }}>{grp.group}</div>
              <div style={{ display: 'grid', gap: 1 }}>
                {grp.items.map((it) => <NavLink key={it.key} it={it} active={pathname === it.href} />)}
              </div>
            </div>
          ))}
        </nav>

        {/* Compte : chip + menu déroulant */}
        <div style={{ position: 'relative', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
              <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 14, boxShadow: 'var(--sh-lift, 0 14px 34px -10px rgba(0,0,0,.6))', overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{workspaceName}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</div>
                </div>
                <div style={{ padding: 6 }}>
                  <Link href="/profile" onClick={() => setMenuOpen(false)} style={menuItem}>Mon profil</Link>
                  {account.map((it) => (it.locked || it.soon)
                    ? <div key={it.key} style={{ ...menuItem, color: 'var(--muted)', opacity: .6, cursor: 'default' }}>{it.label}{it.soon && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--warn)' }}>Bientôt</span>}</div>
                    : <Link key={it.key} href={it.href} onClick={() => setMenuOpen(false)} style={menuItem}>{it.label}</Link>)}
                  <div style={{ ...menuItem, color: 'var(--muted)', opacity: .6, cursor: 'default', display: 'flex', justifyContent: 'space-between' }}>Langue<span style={{ fontSize: 11 }}>FR</span></div>
                </div>
                <form action={logout} style={{ borderTop: '1px solid var(--line)', padding: 6, margin: 0 }}>
                  <button type="submit" style={{ ...menuItem, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: '#ff9db0', cursor: 'pointer' }}>Déconnexion</button>
                </form>
              </div>
            </>
          )}
          <button type="button" onClick={() => setMenuOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 6, borderRadius: 10, border: 'none', background: menuOpen ? 'var(--surface)' : 'transparent', cursor: 'pointer' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{(userName || userEmail).slice(0, 1).toUpperCase()}</div>
            <div style={{ lineHeight: 1.2, minWidth: 0, textAlign: 'left', flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName || userEmail}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{roleLabel} · {planLabel}</div>
            </div>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{menuOpen ? '▾' : '▴'}</span>
          </button>
        </div>
      </aside>

      <div style={{ minWidth: 0, minHeight: '100vh', ...(isAdmin ? ADMIN_CONTENT : null) }}>{children}</div>
    </div>
  );
}

const menuItem = { display: 'block', padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none' } as const;
function pill(color: string, bg: string) {
  return { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color, background: bg } as const;
}
