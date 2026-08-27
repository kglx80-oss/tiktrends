'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * Fenêtre modale réutilisable (pop-up). Base du système « tout en pop-up » :
 * overlay sombre, panneau centré, fermeture par Échap / clic extérieur / croix.
 * À réutiliser pour toute action courte plutôt que d'ouvrir une nouvelle page.
 */
export function Modal({
  open, onClose, title, subtitle, children, maxWidth = 460, icon,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: number;
  icon?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '10vh 16px 16px', background: 'rgba(6,4,8,.62)', backdropFilter: 'blur(3px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 18,
          boxShadow: '0 30px 70px -20px rgba(0,0,0,.7)', overflow: 'hidden', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px 14px', borderBottom: '1px solid var(--line)' }}>
          {icon && <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.5 }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{
            width: 30, height: 30, flexShrink: 0, borderRadius: 9, border: '1px solid var(--line-2)', background: 'var(--paper)',
            color: 'var(--muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>✕</button>
        </div>
        <div style={{ padding: '18px 20px 20px', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}
