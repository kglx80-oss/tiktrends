'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { BrandSwitcher } from './BrandSwitcher';
import { NotificationBell } from './NotificationBell';
import { SupportWidget } from './SupportWidget';
import { CommandPalette, openCommandPalette, type Command } from './CommandPalette';
import { ProfileModal } from './ProfileModal';
import { QuickSettingsModal } from './QuickSettingsModal';
import { CreditsMenu } from './CreditsMenu';

// Coulisses plateforme (ADMIN+ · fondateur) : fond ambré + accent orange.
// Les pages « espace de travail » du client (marques, connexions, membres,
// abonnement, réglages) gardent la DA magenta standard.
// Navigation dédiée quand le fondateur entre en mode ADMIN+ (remplace le rail client).
const ADMIN_NAV: Array<{ key: string; label: string; href: string; icon: string }> = [
  { key: 'a-home', label: "Vue d'ensemble", href: '/admin', icon: 'grid' },
  { key: 'a-fin', label: 'Finance · MRR', href: '/admin/finance', icon: 'chart' },
  { key: 'a-signups', label: 'Inscriptions', href: '/admin/signups', icon: 'users' },
  { key: 'a-plans', label: 'Formules & crédits', href: '/admin/plans', icon: 'card' },
  { key: 'a-pay', label: 'Chaîne de paiement', href: '/admin/paiement', icon: 'gauge' },
  { key: 'a-incid', label: 'Incidents', href: '/admin/incidents', icon: 'radar' },
  { key: 'a-credits', label: 'Coûts & marges', href: '/credits', icon: 'coin' },
  { key: 'a-console', label: 'Console', href: '/console', icon: 'gauge' },
  { key: 'a-jarvis', label: 'Jarvis', href: '/jarvis', icon: 'brain' },
  { key: 'a-intel', label: 'Intelligence marché', href: '/admin/intelligence', icon: 'radar' },
];
// Note : /billing et /settings sont des pages CLIENTES. Les lister ici basculait
// toute la coquille en thème ADMIN+ dès qu'un membre du staff les ouvrait · le
// pilotage interne vit maintenant dans /admin/plans.
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
interface AccountGroup { section: string; items: NavItem[] }
interface Props {
  nav: Group[];
  accountGroups: AccountGroup[];
  isStaff: boolean;
  showUpgrade: boolean;
  brands: Brand[];
  activeBrandId: string | null;
  canManageBrands: boolean;
  creditBalance: number;
  creditsUnlimited: boolean;
  userName: string;
  userEmail: string;
  avatarUrl?: string;
  hidePersonalInfo?: boolean;
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
    film: 'M2 3h20v18H2zM7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5',
    image: 'M3 3h18v18H3zM3 15l5-5 4 4 3-3 6 6',
    trend: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
    store: 'M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16',
    plug: 'M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0zM12 16v6',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9',
    card: 'M2 5h20v14H2zM2 10h20',
    help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
    bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.2 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
    gauge: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4M13.4 10.6 19 5M4 20a8 8 0 1 1 16 0z',
    radar: 'M12 12a9 9 0 1 0 0 0.01M12 12a5 5 0 1 0 0 0.01M12 12l6-4',
    coin: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 7v10M9.5 9.2a2.5 2 0 0 1 2.5-1.2c1.4 0 2.5.8 2.5 1.8s-1.1 1.7-2.5 1.7-2.5.8-2.5 1.8 1.1 1.7 2.5 1.7a2.5 2 0 0 0 2.5-1.2',
    leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10zM2 21c0-3 1.85-5.36 5.08-6',
    brain: 'M9.5 2a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.6A3 3 0 0 0 6 16a3 3 0 0 0 3.5 3V2zM14.5 2a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.6A3 3 0 0 1 18 16a3 3 0 0 1-3.5 3V2z',
    layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
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

interface Branch { head: NavItem; subs: NavItem[] }
/** Reconstitue l'arborescence parent → sous-items à partir de la liste plate (ordre : parent puis ses subs). */
function branchesOf(items: NavItem[]): Branch[] {
  const out: Branch[] = [];
  for (const it of items) {
    if (it.isSub && out.length) out[out.length - 1]!.subs.push(it);
    else out.push({ head: it, subs: [] });
  }
  return out;
}

/** Menu dépliable : parent + chevron, sous-items révélés au clic. Ouvert d'office si la branche est active. */
function NavBranch({ b, isActive, open, onToggle }: { b: Branch; isActive: (href: string, isSub: boolean) => boolean; open: boolean; onToggle: () => void }) {
  const headActive = isActive(b.head.href, false);
  if (!b.subs.length) return <NavLink it={b.head} active={headActive} />;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <div style={{ flex: 1, minWidth: 0 }}><NavLink it={b.head} active={headActive} /></div>
        <button type="button" onClick={onToggle} aria-label={open ? 'Replier' : 'Déplier'} style={{
          width: 26, height: 26, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', borderRadius: 8,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginLeft: 4, borderLeft: '1px solid var(--line)', paddingLeft: 2 }}>
          {b.subs.map((su) => <NavLink key={su.key} it={su} active={isActive(su.href, true)} />)}
        </div>
      )}
    </div>
  );
}

export function AppShell(props: Props) {
  // useSearchParams (pour l'état actif des onglets de marque) nécessite une frontière Suspense.
  return (
    <Suspense fallback={null}>
      <AppShellInner {...props} />
    </Suspense>
  );
}

function AppShellInner(props: Props) {
  const { nav, accountGroups, isStaff, showUpgrade, brands, activeBrandId, canManageBrands, creditBalance, creditsUnlimited, userName, userEmail, avatarUrl, hidePersonalInfo, roleLabel, planLabel, workspaceName, logout, children } = props;
  // Menu profil : « Compte » (personnel) + « Espace de travail » (marques, membres,
  // connexions, abonnement, réglages). Les coulisses plateforme (ADMIN+) restent
  // réservées au fondateur/staff.
  const personalItems = accountGroups.find((g) => g.section === 'Compte')?.items ?? [];
  const workspaceItems = accountGroups.find((g) => g.section === 'Espace')?.items ?? [];
  const pathname = usePathname();
  const search = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Barre repliable (« plus d'espace ») · préférence mémorisée par navigateur.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem('tt_rail_collapsed') === '1'); } catch { /* stockage indispo */ } }, []);
  const toggleCollapsed = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem('tt_rail_collapsed', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  // Mode ADMIN+ (fondateur uniquement) : navigation + DA dédiées sur les routes plateforme.
  const onAdminPath = ADMIN_NAV.some((x) => pathname === x.href || pathname.startsWith(x.href + '/'));
  const inAdmin = isStaff && onAdminPath;

  // État actif d'un item de nav : gère les routes imbriquées et l'onglet (?tab=) des marques.
  const currentTab = search.get('tab') || 'overview';
  const isNavActive = (href: string, isSub: boolean): boolean => {
    const [path, query] = href.split('?');
    if (query) {
      const tab = new URLSearchParams(query).get('tab') || 'overview';
      return pathname === path && currentTab === tab;
    }
    if (isSub) return pathname === path;
    // Parent : actif en exact ou sur une sous-route (met en évidence le fil de navigation).
    return pathname === path || pathname.startsWith(path + '/');
  };

  // Commandes de la palette ⌘K : navigation (rail + compte) + actions + admin.
  const emojiFor: Record<string, string> = {
    grid: '🏠', chart: '📊', radar: '🛰️', tag: '🏷️', bulb: '💡', spark: '✨', film: '🎬',
    image: '🖼️', trend: '📈', store: '🏪', plug: '🔌', users: '👥', card: '💳', help: '🆘', bookmark: '🔖', layers: '🗂️',
  };
  const commands: Command[] = [];
  for (const g of nav) for (const it of g.items) commands.push({ id: 'nav-' + it.key, label: it.label, group: g.group, href: it.href, emoji: emojiFor[it.icon] || '›', locked: it.locked, keywords: it.label });
  // Verbes d'action : lancer une tâche directement depuis ⌘K (pas seulement naviguer).
  commands.push(
    { id: 'do-ads', label: 'Générer des pubs IA', group: 'Actions', href: '/studio/ads', emoji: '✨', keywords: 'créer pub génération ads publicité' },
    { id: 'do-clone', label: 'Cloner une pub gagnante', group: 'Actions', href: '/studio/ads?mode=clone', emoji: '🧬', keywords: 'cloner copier pub concurrent référence' },
    { id: 'do-image', label: 'Générer une image', group: 'Actions', href: '/studio/image', emoji: '🖼️', keywords: 'image visuel produit scène' },
    { id: 'do-video', label: 'Générer une vidéo', group: 'Actions', href: '/studio/video', emoji: '🎬', keywords: 'vidéo animation clip' },
    { id: 'do-inspo', label: 'Chercher dans la veille', group: 'Actions', href: '/inspo', emoji: '🔎', keywords: 'inspo veille concurrent recherche pub' },
    { id: 'do-scale', label: 'Voir ce qui scale', group: 'Actions', href: '/inspo/scale', emoji: '📈', keywords: 'scale tendance croissance winner' },
    { id: 'act-brand', label: 'Nouvelle marque', group: 'Actions', href: '/brands/new', emoji: '➕', keywords: 'créer marque ajouter' },
  );
  // Sauter à une marque de l'espace.
  for (const b of brands) commands.push({ id: 'brand-' + b.id, label: b.name, group: 'Marques', href: `/brands/${b.id}`, emoji: '🏷️', keywords: 'marque ' + b.name });
  commands.push({ id: 'act-profile', label: 'Mon profil', group: 'Compte', href: '/profile', emoji: '👤', keywords: 'profil compte photo' });
  for (const it of personalItems) commands.push({ id: 'acc-' + it.key, label: it.label, group: 'Compte', href: it.href, emoji: '›', locked: it.locked, keywords: it.label });
  for (const it of workspaceItems) commands.push({ id: 'ws-' + it.key, label: it.label, group: 'Espace de travail', href: it.href, emoji: emojiFor[it.icon] || '›', locked: it.locked, keywords: it.label });
  if (isStaff) {
    commands.push(
      { id: 'adm-home', label: 'ADMIN+ · Coulisses', group: 'Plateforme', href: '/admin', emoji: '🎛️', keywords: 'admin backstage console' },
      { id: 'adm-fin', label: 'Finance · MRR & marges', group: 'Plateforme', href: '/admin/finance', emoji: '📈', keywords: 'mrr revenu marge chiffre' },
      { id: 'adm-signups', label: 'Inscriptions & onboarding', group: 'Plateforme', href: '/admin/signups', emoji: '🧭', keywords: 'inscriptions comptes profils' },
      { id: 'adm-plans', label: 'Formules & crédits · pilotage', group: 'Plateforme', href: '/admin/plans', emoji: '◈', keywords: 'formule plan crédit offrir ajuster' },
      { id: 'adm-pay', label: 'Vérifier la chaîne de paiement', group: 'Plateforme', href: '/admin/paiement', emoji: '💳', keywords: 'stripe paiement webhook prix test carte' },
      { id: 'adm-incid', label: 'Incidents techniques', group: 'Plateforme', href: '/admin/incidents', emoji: '⚠️', keywords: 'erreur panne echec quota fournisseur log' },
      { id: 'adm-credits', label: 'Coûts & marges', group: 'Plateforme', href: '/credits', emoji: '％', keywords: 'crédits coût marge rentabilité' },
      { id: 'adm-jarvis', label: 'Jarvis', group: 'Plateforme', href: '/jarvis', emoji: '🧠', keywords: 'jarvis règles ia' },
      { id: 'adm-intel', label: 'Intelligence marché', group: 'Plateforme', href: '/admin/intelligence', emoji: '🔭', keywords: 'concurrents atria' },
      { id: 'adm-console', label: 'Console', group: 'Plateforme', href: '/console', emoji: '📟', keywords: 'console système diagnostics' },
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${collapsed ? 72 : 250}px minmax(0,1fr)`, minHeight: '100vh' }}>
      <CommandPalette commands={commands} />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} init={{ name: userName, email: userEmail, avatarUrl: avatarUrl || '', hidePersonalInfo: !!hidePersonalInfo }} />
      <QuickSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} workspaceName={workspaceName} showAdvanced={workspaceItems.some((i) => i.key === 'settings')} />
      <aside style={{ background: 'var(--rail)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', padding: collapsed ? '16px 10px' : '16px 12px', position: 'sticky', top: 0, height: '100vh' }}>
        {/* En-tête : menu d'espace (façon Pletor) + repli de la barre */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={() => collapsed ? toggleCollapsed() : setWsMenuOpen((o) => !o)}
            title={collapsed ? workspaceName : undefined}
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? 4 : '6px 8px', borderRadius: 10, border: 'none', background: wsMenuOpen ? 'var(--surface)' : 'transparent', cursor: 'pointer', justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--grad-accent)', flexShrink: 0 }} />
            {!collapsed && (
              <>
                <div style={{ lineHeight: 1.1, minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>TikTrends</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{workspaceName}</div>
                </div>
                <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>⌄</span>
              </>
            )}
          </button>
          {!collapsed && (
            <button type="button" onClick={toggleCollapsed} title="Replier la barre" aria-label="Replier la barre" style={collapseBtn}>
              <CollapseIcon dir="left" />
            </button>
          )}

          {/* Menu d'espace */}
          {wsMenuOpen && !collapsed && (
            <>
              <div onClick={() => setWsMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 14, boxShadow: '0 14px 34px -10px rgba(0,0,0,.6)', overflow: 'hidden' }}>
                <div style={{ padding: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
                    <div style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--grad-accent)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{workspaceName}</span>
                    <span style={{ color: 'var(--accent-strong)', fontSize: 13 }}>✓</span>
                  </div>
                  {workspaceItems.length > 0 && <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />}
                  {workspaceItems.map((it) => {
                    if (it.locked || it.soon) return <div key={it.key} style={{ ...menuItemIcon, color: 'var(--muted)', opacity: .6, cursor: 'default' }}><Icon name={it.icon} />{it.label}{it.soon && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--warn)' }}>Bientôt</span>}</div>;
                    if (it.key === 'settings') return <button key={it.key} type="button" onClick={() => { setWsMenuOpen(false); setSettingsOpen(true); }} style={{ ...menuItemIcon, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer' }}><Icon name={it.icon} />{it.label}</button>;
                    return <Link key={it.key} href={it.href} onClick={() => setWsMenuOpen(false)} style={menuItemIcon}><Icon name={it.icon} />{it.label}</Link>;
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sélecteur de marque (masqué en mode replié ou en mode ADMIN+) */}
        {!collapsed && !inAdmin && <BrandSwitcher brands={brands} activeId={activeBrandId} canManage={canManageBrands} />}

        {/* Recherche universelle ⌘K */}
        {collapsed ? (
          <button type="button" onClick={openCommandPalette} title="Rechercher · ⌘K" style={{ ...railIconBtn, marginTop: 10 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          </button>
        ) : (
          <button type="button" onClick={openCommandPalette} style={{
            marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10,
            border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--muted)', cursor: 'pointer', fontSize: 13,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
            <span style={{ flex: 1, textAlign: 'left' }}>Rechercher…</span>
            <span style={{ display: 'inline-flex', gap: 2 }}>
              <kbd style={kbdRail}>⌘</kbd><kbd style={kbdRail}>K</kbd>
            </span>
          </button>
        )}

        {/* Navigation · rail client OU rail ADMIN+ (fondateur en coulisses) */}
        <nav style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: collapsed ? 4 : (inAdmin ? 2 : 10), alignItems: collapsed ? 'center' : 'stretch', overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
          {inAdmin ? (
            <>
              {/* Retour à la vue SaaS (app) */}
              <Link href="/dashboard" title="Retour à l'app" style={collapsed
                ? { ...railIconBtn, marginBottom: 6 }
                : { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, marginBottom: 8, textDecoration: 'none', border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 13, fontWeight: 700 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                {!collapsed && <span>Retour à l'app</span>}
              </Link>
              {!collapsed && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '2px 10px 4px' }}>ADMIN+ · Plateforme</div>}
              {ADMIN_NAV.map((it) => {
                const active = pathname === it.href;
                return collapsed ? (
                  <Link key={it.key} href={it.href} title={it.label} style={{ ...railIconBtn, color: active ? 'var(--ink)' : 'var(--ink-2)', background: active ? 'var(--accent-soft)' : 'transparent' }}>
                    <Icon name={it.icon} />
                  </Link>
                ) : (
                  <Link key={it.key} href={it.href} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 10, fontSize: 14, fontWeight: active ? 700 : 500, color: active ? 'var(--ink)' : 'var(--ink-2)', background: active ? 'var(--accent-soft)' : 'transparent', textDecoration: 'none' }}>
                    <Icon name={it.icon} /><span>{it.label}</span>
                  </Link>
                );
              })}
            </>
          ) : collapsed
            ? nav.flatMap((grp) => branchesOf(grp.items).map((b) => (
                <Link key={b.head.key} href={b.head.locked || b.head.soon ? '#' : b.head.href} title={b.head.label} style={{
                  ...railIconBtn,
                  color: isNavActive(b.head.href, false) ? 'var(--ink)' : 'var(--ink-2)',
                  background: isNavActive(b.head.href, false) ? 'var(--accent-soft)' : 'transparent',
                  opacity: (b.head.locked || b.head.soon) ? .5 : 1,
                }}>
                  <Icon name={b.head.icon} />
                </Link>
              )))
            : nav.map((grp) => (
              <div key={grp.group} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '2px 10px 4px' }}>{grp.group}</div>
                {branchesOf(grp.items).map((b) => {
                  const branchActive = isNavActive(b.head.href, false) || b.subs.some((su) => isNavActive(su.href, true));
                  const open = expanded[b.head.key] ?? branchActive;
                  return (
                    <NavBranch key={b.head.key} b={b} isActive={isNavActive} open={open}
                      onToggle={() => setExpanded((e) => ({ ...e, [b.head.key]: !(e[b.head.key] ?? branchActive) }))} />
                  );
                })}
              </div>
            ))}
        </nav>

        {/* Ré-ouvrir la barre (mode replié) */}
        {collapsed && (
          <button type="button" onClick={toggleCollapsed} title="Déplier la barre" aria-label="Déplier la barre" style={{ ...railIconBtn, marginBottom: 8 }}>
            <CollapseIcon dir="right" />
          </button>
        )}

        {/* Crédits (solde réel) · visible en direct, clic = recharge / offre */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginBottom: 8 }}>
          <CreditsMenu balance={creditBalance} unlimited={creditsUnlimited} planLabel={planLabel} showUpgrade={showUpgrade} collapsed={collapsed} />
        </div>

        {/* Compte : chip + menu déroulant */}
        <div style={{ position: 'relative' }}>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
              <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, width: collapsed ? 240 : 'auto', right: collapsed ? 'auto' : 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 14, boxShadow: 'var(--sh-lift, 0 14px 34px -10px rgba(0,0,0,.6))', overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{userName || workspaceName}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</div>
                </div>
                <div style={{ padding: 6 }}>
                  <button type="button" onClick={() => { setMenuOpen(false); setProfileOpen(true); }} style={{ ...menuItemIcon, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer' }}><Icon name="user" />Mon profil</button>
                  {personalItems.map((it) => (it.locked || it.soon)
                    ? <div key={it.key} style={{ ...menuItemIcon, color: 'var(--muted)', opacity: .6, cursor: 'default' }}><Icon name={it.icon} />{it.label}{it.soon && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--warn)' }}>Bientôt</span>}</div>
                    : <Link key={it.key} href={it.href} onClick={() => setMenuOpen(false)} style={menuItemIcon}><Icon name={it.icon} />{it.label}</Link>)}

                  {/* ADMIN+ · coulisses plateforme, réservées au fondateur/staff. */}
                  {isStaff && (
                    <Link href="/admin" onClick={() => setMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', margin: '8px 0 2px', borderRadius: 11, textDecoration: 'none', background: 'linear-gradient(135deg, rgba(245,166,35,.16), rgba(255,140,66,.08))', border: '1px solid rgba(245,166,35,.32)' }}>
                      <span style={{ fontSize: 15 }}>🎛️</span>
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#ffca6b' }}>ADMIN+ · Coulisses</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>MRR, inscriptions, console, IA maison</span>
                      </span>
                      <span style={{ color: '#ffca6b', fontSize: 13 }}>›</span>
                    </Link>
                  )}

                  <div style={{ ...menuItem, color: 'var(--muted)', opacity: .6, cursor: 'default', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>Langue<span style={{ fontSize: 11 }}>FR</span></div>
                </div>
                <form action={logout} style={{ borderTop: '1px solid var(--line)', padding: 6, margin: 0 }}>
                  <button type="submit" style={{ ...menuItemIcon, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: '#ff9db0', cursor: 'pointer' }}><Icon name="logout" />Déconnexion</button>
                </form>
              </div>
            </>
          )}
          <button type="button" onClick={() => setMenuOpen((o) => !o)} title={collapsed ? (userName || userEmail) : undefined} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 6, borderRadius: 10, border: 'none', background: menuOpen ? 'var(--surface)' : 'transparent', cursor: 'pointer', justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>
              {avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (userName || userEmail).slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div style={{ lineHeight: 1.2, minWidth: 0, textAlign: 'left', flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName || userEmail}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{roleLabel} · {planLabel}</div>
                </div>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>{menuOpen ? '▾' : '▴'}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div style={{ minWidth: 0, minHeight: '100vh', ...(inAdmin ? ADMIN_CONTENT : null) }}>
        <NotificationBell />
        {children}
        <SupportWidget firstName={(userName || 'toi').trim().split(/\s+/)[0] || 'toi'} />
      </div>
    </div>
  );
}

const menuItem = { display: 'block', padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none' } as const;
const menuItemIcon = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none' } as const;
// Bouton icône (rail replié) : carré centré, tooltip via title.
const railIconBtn = { width: 44, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', textDecoration: 'none', flexShrink: 0 } as const;
const collapseBtn = { width: 28, height: 28, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--muted)', cursor: 'pointer' } as const;
/** Icône « replier / déplier le panneau » (barre verticale + flèche). */
function CollapseIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      {dir === 'left' ? <path d="M16 9l-3 3 3 3" /> : <path d="M14 9l3 3-3 3" />}
    </svg>
  );
}
const kbdRail = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 4 } as const;
function pill(color: string, bg: string) {
  return { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color, background: bg } as const;
}
