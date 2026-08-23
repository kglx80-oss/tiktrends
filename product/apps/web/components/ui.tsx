import type { CSSProperties } from 'react';

export const input: CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 12,
  border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)',
  fontSize: 14, outline: 'none',
};
export const btn: CSSProperties = {
  padding: '10px 16px', borderRadius: 999, border: 'none',
  background: 'var(--grad-accent)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
};
export const btnGhost: CSSProperties = {
  padding: '7px 12px', borderRadius: 999, border: '1px solid var(--line-2)',
  background: 'transparent', color: 'var(--ink-2)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
};
export const panel: CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', padding: 22, marginBottom: 20,
};
export const pageWrap: CSSProperties = { padding: '30px 36px 60px', maxWidth: 860, margin: '0 auto' };
export const h1: CSSProperties = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' };
export const h2: CSSProperties = { margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--ink)' };
export const sub: CSSProperties = { color: 'var(--muted)', fontSize: 13, marginTop: 0, marginBottom: 16 };
export const lbl: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', display: 'block', marginBottom: 6 };

export function Msg({ kind, children }: { kind: 'ok' | 'err'; children: React.ReactNode }) {
  const ok = kind === 'ok';
  return (
    <div style={{
      margin: '0 0 16px', padding: '10px 13px', borderRadius: 12, fontSize: 13,
      border: `1px solid ${ok ? 'rgba(24,204,140,.4)' : 'rgba(255,77,109,.4)'}`,
      background: ok ? 'rgba(24,204,140,.10)' : 'rgba(255,77,109,.10)',
      color: ok ? '#7ee8bf' : '#ff9db0',
    }}>{children}</div>
  );
}
