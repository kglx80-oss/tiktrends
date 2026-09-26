'use client';

import { useRef, type ReactNode } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { usePiegeFocus } from './use-piege-focus';
import { Portail } from './Portail';

/**
 * Fenêtre modale réutilisable (pop-up). Base du système « tout en pop-up » :
 * overlay sombre, panneau centré, fermeture par Échap / clic extérieur / croix.
 * À réutiliser pour toute action courte plutôt que d'ouvrir une nouvelle page.
 *
 * ── Rendue via un PORTAIL vers <body> ────────────────────────────────────────
 *
 * Sans ça, la modale héritait du CONTEXTE D'EMPILEMENT de l'endroit d'où on
 * l'ouvre · le rail latéral, ou un ancêtre transformé (`transform`) du tableau
 * de bord. Un `position: fixed` sous un ancêtre transformé n'est plus relatif à
 * l'écran mais à cet ancêtre · l'overlay ne couvrait plus la page, et le chrome
 * de page (sélecteur « équipe & invitations », cartes) passait PAR-DESSUS la
 * modale. Montée sur <body>, elle est au niveau racine · son overlay couvre
 * vraiment l'écran et son z-index domine tout le chrome. (Le voile · clic
 * extérieur · Échap · piège à focus sont inchangés.)
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
  // Le piège à focus partagé · même comportement (focus entrant, Tab piégé,
  // Échap, verrou du défilement, retour au déclencheur), éprouvé une seule fois.
  usePiegeFocus(panelRef, { actif: open, onFermer: onClose });

  if (!open) return null;

  return (
    <Portail><div
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
            <div style={{ fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.5 }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{
            width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, flexShrink: 0, borderRadius: 9, border: '1px solid var(--line-2)', background: 'var(--paper)',
            color: 'var(--muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>✕</button>
        </div>
        <div style={{ padding: '18px 20px 20px', overflowY: 'auto' }}>{children}</div>
      </div>
    </div></Portail>
  );
}
