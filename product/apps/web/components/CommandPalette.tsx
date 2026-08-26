'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface Command {
  id: string;
  label: string;
  group: string;
  href?: string;
  hint?: string;
  keywords?: string;
  emoji?: string;
  locked?: boolean;
}

/** Événement global pour ouvrir la palette depuis n'importe où (ex : bouton du rail). */
export const CMDK_EVENT = 'tt:cmdk';
export function openCommandPalette() { window.dispatchEvent(new Event(CMDK_EVENT)); }

/** Score de correspondance simple (sous-séquence + préfixe de mot), 0 = pas de match. */
function score(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase(); const t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at === 0) return 100;                       // préfixe exact
  if (at > 0) return t[at - 1] === ' ' ? 80 : 50; // début de mot / contenu
  // sous-séquence (lettres dans l'ordre)
  let i = 0;
  for (const c of t) { if (c === q[i]) i++; if (i === q.length) return 20; }
  return 0;
}

export function CommandPalette({ commands }: { commands: Command[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Raccourci global ⌘K / Ctrl+K + événement custom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    const onEvt = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(CMDK_EVENT, onEvt);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(CMDK_EVENT, onEvt); };
  }, []);

  // Reset + focus à l'ouverture ; verrouille le scroll du fond.
  useEffect(() => {
    if (open) {
      setQ(''); setIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
      return () => { clearTimeout(t); document.body.style.overflow = prev; };
    }
  }, [open]);

  const results = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: Math.max(score(q, c.label), score(q, c.keywords || '') * 0.6) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.c.label.localeCompare(b.c.label))
      .map((x) => x.c);
    return scored.slice(0, 30);
  }, [q, commands]);

  useEffect(() => { if (idx >= results.length) setIdx(0); }, [results.length, idx]);

  function run(c: Command | undefined) {
    if (!c || c.locked) return;
    setOpen(false);
    if (c.href) router.push(c.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[idx]); }
  }

  // Garde l'élément actif visible.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  if (!open) return null;

  // Groupement en préservant l'ordre de pertinence.
  const groups: { group: string; items: { c: Command; i: number }[] }[] = [];
  results.forEach((c, i) => {
    let g = groups.find((x) => x.group === c.group);
    if (!g) { g = { group: c.group, items: [] }; groups.push(g); }
    g.items.push({ c, i });
  });

  return (
    <div onMouseDown={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,4,8,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(640px, 92vw)', maxHeight: '70vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 16, boxShadow: '0 30px 80px -20px rgba(0,0,0,.7)', overflow: 'hidden' }}>
        {/* Champ de recherche */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKeyDown}
            placeholder="Rechercher une page, une action…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 15 }} />
          <kbd style={kbd}>esc</kbd>
        </div>

        {/* Résultats */}
        <div ref={listRef} style={{ overflowY: 'auto', padding: 8 }}>
          {results.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5 }}>Aucun résultat pour « {q} »</div>
          ) : groups.map((g) => (
            <div key={g.group} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '8px 10px 4px' }}>{g.group}</div>
              {g.items.map(({ c, i }) => {
                const active = i === idx;
                return (
                  <div key={c.id} data-i={i} onMouseEnter={() => setIdx(i)} onClick={() => run(c)}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 10, cursor: c.locked ? 'default' : 'pointer', background: active ? 'var(--accent-soft)' : 'transparent', opacity: c.locked ? 0.5 : 1 }}>
                    <span style={{ width: 22, textAlign: 'center', fontSize: 15 }}>{c.emoji || '›'}</span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: active ? 700 : 500, color: 'var(--ink)' }}>{c.label}</span>
                    {c.hint && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.hint}</span>}
                    {c.locked && <span style={{ fontSize: 12 }}>🔒</span>}
                    {active && !c.locked && <kbd style={kbd}>↵</kbd>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Pied : rappels clavier */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 14px', borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--muted)' }}>
          <span><kbd style={kbd}>↑</kbd><kbd style={kbd}>↓</kbd> naviguer</span>
          <span><kbd style={kbd}>↵</kbd> ouvrir</span>
          <span style={{ marginLeft: 'auto' }}><kbd style={kbd}>⌘</kbd><kbd style={kbd}>K</kbd> partout</span>
        </div>
      </div>
    </div>
  );
}

const kbd: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 4px', margin: '0 1px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink-2)', background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 5 };
