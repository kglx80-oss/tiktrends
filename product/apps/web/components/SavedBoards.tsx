'use client';

import { useMemo, useRef, useState, useTransition, type CSSProperties } from 'react';
import type { InspoAd } from '@tiktrends/integrations';
import { AdCard } from './AdCard';
import { setSavedAdFolder } from '../app/actions/inspo';

export interface SavedItem { ad: InspoAd; folder: string | null; externalId: string; platform: string }

/**
 * Boards / dossiers de rangement pour les créas sauvegardées (façon Foreplay/Atria).
 * Onglets par board + rangement d'une créa dans un board (existant ou nouveau), en direct.
 */
export function SavedBoards({ items, followKeys }: { items: SavedItem[]; followKeys: string[] }) {
  const [list, setList] = useState<SavedItem[]>(items);
  const [tab, setTab] = useState<string>('__all');
  const [, start] = useTransition();
  const following = useMemo(() => new Set(followKeys), [followKeys]);

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const it of list) if (it.folder) set.add(it.folder);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [list]);

  const countIn = (f: string) => f === '__all' ? list.length : f === '__none' ? list.filter((i) => !i.folder).length : list.filter((i) => i.folder === f).length;
  const shown = list.filter((it) => tab === '__all' ? true : tab === '__none' ? !it.folder : it.folder === tab);

  const move = (it: SavedItem, folder: string | null) => {
    const value = folder?.trim() || null;
    setList((l) => l.map((x) => (x.externalId === it.externalId && x.platform === it.platform ? { ...x, folder: value } : x)));
    start(async () => { await setSavedAdFolder({ platform: it.platform, externalId: it.externalId, folder: value }); });
  };

  if (!list.length) {
    return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucune créa sauvegardée. Va dans l'Inspo et clique ★ sur une annonce.</p>;
  }

  const tabBtn = (key: string, label: string): CSSProperties => ({
    padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    border: '1px solid ' + (tab === key ? 'transparent' : 'var(--line-2)'),
    background: tab === key ? 'var(--grad-accent)' : 'var(--surface)',
    color: tab === key ? '#0d070c' : 'var(--ink-2)',
  });

  return (
    <>
      {/* Onglets des boards */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <button type="button" onClick={() => setTab('__all')} style={tabBtn('__all', 'Toutes')}>Toutes · {countIn('__all')}</button>
        {folders.map((f) => (
          <button key={f} type="button" onClick={() => setTab(f)} style={tabBtn(f, f)}>📁 {f} · {countIn(f)}</button>
        ))}
        {list.some((i) => !i.folder) && <button type="button" onClick={() => setTab('__none')} style={tabBtn('__none', 'Sans dossier')}>Sans dossier · {countIn('__none')}</button>}
      </div>

      {/* Grille */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
        {shown.map((it) => (
          <div key={it.platform + it.externalId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <AdCard ad={it.ad} saved following={following.has(it.ad.platform + ':' + (it.ad.advertiserName || ''))} />
            <FolderPicker current={it.folder} folders={folders} onPick={(f) => move(it, f)} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Petit sélecteur « ranger dans un board » : dossiers existants + création à la volée. */
function FolderPicker({ current, folders, onPick }: { current: string | null; folders: string[]; onPick: (f: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const create = () => { const v = draft.trim(); if (v) { onPick(v); setDraft(''); setOpen(false); } };

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 9,
        border: '1px solid var(--line-2)', background: 'var(--paper)', color: current ? 'var(--ink)' : 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
      }}>
        <span>📁</span>
        <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current || 'Ranger dans un board'}</span>
        <span style={{ color: 'var(--muted)', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 12, boxShadow: '0 14px 34px -10px rgba(0,0,0,.5)', overflow: 'hidden', padding: 6 }}>
            {folders.map((f) => (
              <button key={f} type="button" onClick={() => { onPick(f); setOpen(false); }} style={row(f === current)}>📁 {f}{f === current && <span style={{ marginLeft: 'auto', color: 'var(--accent-strong)' }}>✓</span>}</button>
            ))}
            {current && <button type="button" onClick={() => { onPick(null); setOpen(false); }} style={row(false)}>✕ Retirer du board</button>}
            <div style={{ display: 'flex', gap: 6, padding: '6px 4px 2px', borderTop: folders.length ? '1px solid var(--line)' : 'none', marginTop: folders.length ? 4 : 0 }}>
              <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} placeholder="Nouveau board…"
                style={{ flex: 1, minWidth: 0, padding: '6px 9px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 12, outline: 'none' }} />
              <button type="button" onClick={create} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>+</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const row = (active: boolean): CSSProperties => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
  border: 'none', background: active ? 'var(--accent-soft)' : 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, textAlign: 'left',
});
