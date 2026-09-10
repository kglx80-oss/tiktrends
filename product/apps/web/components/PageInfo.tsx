import type { ReactNode } from 'react';

/**
 * Le mode d'emploi de la page · un « chip » repérable qui déplie une courte
 * explication (natif `<details>`, sans JS).
 *
 * Il existait déjà sur 26 pages, mais si discret (gris muet, minuscule) que le
 * propriétaire ne l'avait jamais vu. On le rend visible : une pastille bordée,
 * un « i » en accent, un libellé lisible · sans crier, mais on le trouve.
 */
export function PageInfo({ children, title = 'Mode d’emploi' }: { children: ReactNode; title?: string }) {
  return (
    <details style={{ position: 'relative', display: 'inline-block', marginBottom: 14 }}>
      <summary style={{
        listStyle: 'none', cursor: 'pointer', userSelect: 'none',
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '5px 12px 5px 7px', borderRadius: 999,
        border: '1px solid var(--line-2)', background: 'var(--surface)',
        fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)',
      }}>
        <span style={{
          display: 'inline-flex', width: 17, height: 17, borderRadius: '50%',
          background: 'var(--accent-soft)', color: 'var(--accent-strong)',
          alignItems: 'center', justifyContent: 'center', fontSize: 11, fontStyle: 'italic', fontWeight: 800,
        }}>i</span>
        <span>{title}</span>
        <span aria-hidden style={{ color: 'var(--muted)', fontSize: 10 }}>▾</span>
      </summary>
      <div style={{
        position: 'absolute', zIndex: 10, top: 'calc(100% + 6px)', left: 0, width: 360, maxWidth: '80vw',
        padding: '13px 15px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)',
        boxShadow: '0 14px 34px -10px rgba(0,0,0,.6)', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6,
      }}>
        {children}
      </div>
    </details>
  );
}
