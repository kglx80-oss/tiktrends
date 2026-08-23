import type { ReactNode } from 'react';

/** Encart « Informations » repliable (natif <details>, sans JS) :
 *  à quoi sert la page + comment elle fonctionne. */
export function PageInfo({ children, title = 'À quoi sert cette page ?' }: { children: ReactNode; title?: string }) {
  return (
    <details style={{ marginBottom: 20, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
      <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
        <span style={{ display: 'inline-flex', width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-strong)', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontStyle: 'italic', fontWeight: 800 }}>i</span>
        Informations
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{title}</span>
      </summary>
      <div style={{ padding: '2px 16px 14px 40px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        {children}
      </div>
    </details>
  );
}
