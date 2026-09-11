'use client';

import { useEffect, useRef, type ReactNode } from 'react';

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
  icon?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Qui avait le focus avant l'ouverture · on le lui rend à la fermeture,
    // sinon le focus retombe en haut de page et le clavier repart de zéro.
    const rendreA = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((el) => el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      // Piège à focus · le Tab ne doit pas s'échapper derrière la fenêtre.
      if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) { e.preventDefault(); panelRef.current?.focus(); return; }
        const premier = els[0]!, dernier = els[els.length - 1]!;
        const actif = document.activeElement;
        if (e.shiftKey && (actif === premier || !panelRef.current?.contains(actif))) {
          e.preventDefault(); dernier.focus();
        } else if (!e.shiftKey && actif === dernier) {
          e.preventDefault(); premier.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Porter le focus dans la fenêtre à l'ouverture · premier champ utile, sinon
    // le panneau lui-même (il est `tabIndex=-1`).
    const t = setTimeout(() => { (focusables()[0] ?? panelRef.current)?.focus(); }, 20);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
      rendreA?.focus?.();
    };
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
        ref={panelRef}
        role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
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
