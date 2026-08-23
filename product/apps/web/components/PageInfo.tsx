import type { ReactNode } from 'react';

/** Petite note d'aide discrète (natif <details>, sans JS) : un « ⓘ » dans le coin
 *  qui déplie une courte explication de la page. */
export function PageInfo({ children, title = 'Informations' }: { children: ReactNode; title?: string }) {
  return (
    <details style={{ position: 'relative', display: 'inline-block', marginBottom: 14 }}>
      <summary style={{ listStyle: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', userSelect: 'none' }}>
        <span style={{ display: 'inline-flex', width: 15, height: 15, borderRadius: '50%', border: '1px solid var(--line-2)', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontStyle: 'italic', fontWeight: 800 }}>i</span>
        {title}
      </summary>
      <div style={{
        position: 'absolute', zIndex: 10, top: 'calc(100% + 6px)', left: 0, width: 340, maxWidth: '80vw',
        padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)',
        boxShadow: '0 14px 34px -10px rgba(0,0,0,.6)', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55,
      }}>
        {children}
      </div>
    </details>
  );
}
