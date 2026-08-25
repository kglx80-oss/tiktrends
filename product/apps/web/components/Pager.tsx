'use client';

/** Pagination simple · 24 éléments par page pour limiter le chargement (images). */
export const PAGE_SIZE = 24;

export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const btn = (active: boolean, disabled?: boolean) => ({
    minWidth: 32, height: 32, padding: '0 10px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
    border: `1px solid ${active ? 'transparent' : 'var(--line-2)'}`, background: active ? 'var(--grad-accent)' : 'transparent',
    color: active ? '#0d070c' : disabled ? 'var(--muted)' : 'var(--ink-2)', opacity: disabled ? 0.5 : 1,
  } as const);
  // Fenêtre de pages autour de la page courante.
  const nums: number[] = [];
  const start = Math.max(0, Math.min(page - 2, pages - 5));
  for (let i = start; i < Math.min(pages, start + 5); i++) nums.push(i);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
      <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} style={btn(false, page === 0)}>‹</button>
      {start > 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>…</span>}
      {nums.map((n) => <button key={n} type="button" onClick={() => onPage(n)} style={btn(n === page)}>{n + 1}</button>)}
      {start + 5 < pages && <span style={{ color: 'var(--muted)', fontSize: 12 }}>…</span>}
      <button type="button" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} style={btn(false, page >= pages - 1)}>›</button>
      <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 8 }}>{from}–{to} sur {total}</span>
    </div>
  );
}
