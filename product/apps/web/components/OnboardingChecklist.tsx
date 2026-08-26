'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export interface OnboardStep { key: string; label: string; desc: string; href: string; done: boolean }

const DISMISS_KEY = 'tt_onboard_dismissed_v1';

/** Checklist de démarrage (à la Linear/Notion) : guide pas à pas, masquable, disparaît une fois complète. */
export function OnboardingChecklist({ steps, firstName }: { steps: OnboardStep[]; firstName: string }) {
  const [hidden, setHidden] = useState(true); // caché jusqu'à lecture du localStorage (évite le flash)
  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch { /* stockage indispo */ }
    setHidden(dismissed);
  }, []);

  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const allDone = done === total;

  if (hidden || allDone) return null;

  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } setHidden(true); };

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 18, background: 'linear-gradient(135deg, rgba(255,60,120,.07), var(--surface) 60%)', padding: '20px 22px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <Ring pct={pct} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Bien démarrer, {firstName}</h2>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>{done}/{total} étapes · configure ton espace en quelques minutes.</p>
        </div>
        <button type="button" onClick={dismiss} style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Masquer</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 16 }}>
        {steps.map((s, i) => (
          <Link key={s.key} href={s.href} style={{
            display: 'flex', alignItems: 'flex-start', gap: 11, padding: '12px 13px', borderRadius: 12, textDecoration: 'none',
            border: `1px solid ${s.done ? 'rgba(126,232,191,.35)' : 'var(--line)'}`, background: s.done ? 'rgba(126,232,191,.06)' : 'var(--surface)',
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, marginTop: 1,
              background: s.done ? '#18cc8c' : 'transparent', color: s.done ? '#04140d' : 'var(--muted)',
              border: s.done ? 'none' : '1.5px solid var(--line-2)',
            }}>{s.done ? '✓' : i + 1}</span>
            <span>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? 0.7 : 1 }}>{s.label}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>{s.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 20, c = 2 * Math.PI * r, off = c - (pct / 100) * c;
  return (
    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--line-2)" strokeWidth="4" />
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--accent-strong)" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset .4s' }} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>{pct}%</span>
    </div>
  );
}
