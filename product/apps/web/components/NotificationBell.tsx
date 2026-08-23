'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, type NotifItem } from '../app/actions/notifications';

const ICON: Record<string, string> = { ticket_new: '🎫', ticket_reply: '💬', ticket_status: '✅', system: '★' };

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  return `il y a ${j} j`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const r = await fetchNotifications();
      setItems(r.items);
      setUnread(r.unread);
    } catch { /* silencieux : le polling réessaiera */ }
  }

  // Polling léger (quasi temps réel) : au montage puis toutes les 25 s.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 25000);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function onItem(n: NotifItem) {
    if (!n.read) {
      setItems((s) => s.map((x) => x.id === n.id ? { ...x, read: true } : x));
      setUnread((u) => Math.max(0, u - 1));
      startTransition(() => { markNotificationRead(n.id); });
    }
    setOpen(false);
    if (n.href) router.push(n.href);
  }

  function onMarkAll() {
    setItems((s) => s.map((x) => ({ ...x, read: true })));
    setUnread(0);
    startTransition(() => { markAllNotificationsRead(); });
  }

  return (
    <div ref={boxRef} style={{ position: 'fixed', top: 16, right: 20, zIndex: 40 }}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) refresh(); }}
        aria-label="Notifications"
        style={{
          position: 'relative', width: 40, height: 40, borderRadius: 12, cursor: 'pointer',
          border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px -8px rgba(0,0,0,.5)',
        }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
            background: 'var(--grad-accent)', color: '#0d070c', fontSize: 11, fontWeight: 800,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg, #0d070c)',
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 48, right: 0, width: 360, maxWidth: '90vw', maxHeight: '70vh', overflowY: 'auto',
          borderRadius: 16, border: '1px solid var(--line-2)', background: 'var(--surface)',
          boxShadow: '0 20px 50px -12px rgba(0,0,0,.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 15px', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--surface)' }}>
            <b style={{ fontSize: 14, color: 'var(--ink)' }}>Notifications</b>
            <span style={{ flex: 1 }} />
            {unread > 0 && <button type="button" onClick={onMarkAll} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-strong)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Tout marquer lu</button>}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucune notification pour l'instant.</div>
          ) : (
            items.map((n) => (
              <button key={n.id} type="button" onClick={() => onItem(n)} style={{
                display: 'flex', gap: 11, width: '100%', textAlign: 'left', padding: '12px 15px', cursor: 'pointer',
                border: 'none', borderBottom: '1px solid var(--line)', background: n.read ? 'transparent' : 'rgba(254,44,85,.06)',
              }}>
                <span style={{ fontSize: 16, lineHeight: '20px' }}>{ICON[n.type] ?? '•'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: n.read ? 600 : 800, color: 'var(--ink)' }}>{n.title}</span>
                  {n.body && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</span>}
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>{timeAgo(n.createdAt)}</span>
                </span>
                {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-strong)', flexShrink: 0, marginTop: 5 }} />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
