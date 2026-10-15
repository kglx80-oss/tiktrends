'use client';

import { useState } from 'react';
import { runStripeDiagnosticAction, type StripeDiagnostic } from '../../../actions/stripe-diagnostic';

const TON: Record<string, { bg: string; bd: string; fg: string; icone: string }> = {
  ok: { bg: 'color-mix(in srgb, var(--ok-text) 8%, transparent)', bd: 'color-mix(in srgb, var(--ok-text) 32%, transparent)', fg: 'var(--ok-text)', icone: '✓' },
  warn: { bg: 'color-mix(in srgb, var(--warn) 8%, transparent)', bd: 'color-mix(in srgb, var(--warn) 32%, transparent)', fg: 'var(--warn-text)', icone: '!' },
  fail: { bg: 'color-mix(in srgb, var(--err) 8%, transparent)', bd: 'color-mix(in srgb, var(--err) 32%, transparent)', fg: 'var(--err-strong)', icone: '×' },
};

export function StripeDiagnostic() {
  const [res, setRes] = useState<StripeDiagnostic | null>(null);
  const [busy, setBusy] = useState(false);

  async function lancer() {
    setBusy(true);
    setRes(await runStripeDiagnosticAction());
    setBusy(false);
  }

  const bloquants = res?.checks.filter((c) => c.level === 'fail').length ?? 0;

  return (
    <div>
      <button type="button" onClick={lancer} disabled={busy}
        style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 13, cursor: busy ? 'wait' : 'pointer', opacity: busy ? .7 : 1 }}>
        {busy ? 'Vérification…' : res ? 'Relancer la vérification' : 'Lancer la vérification'}
      </button>

      {res?.error && <p style={{ color: 'var(--err-strong)', fontSize: 13, marginTop: 12 }}>{res.error}</p>}

      {res && !res.error && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '.05em', padding: '4px 11px', borderRadius: 999,
              color: res.mode === 'live' ? 'var(--bg)' : 'var(--on-accent)', background: res.mode === 'live' ? 'linear-gradient(135deg, var(--ok-text), var(--ok))' : 'var(--grad-accent)',
            }}>
              MODE {res.mode.toUpperCase()}
            </span>
            <span style={{ fontSize: 12.5, color: bloquants ? 'var(--err-strong)' : 'var(--ok-text)', fontWeight: 700 }}>
              {bloquants ? `${bloquants} point(s) bloquant(s)` : 'Chaîne de paiement opérationnelle'}
            </span>
            {res.mode === 'test' && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>· aucun paiement réel n'est encaissé dans ce mode</span>
            )}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {res.checks.map((c, i) => {
              const t = TON[c.level]!;
              return (
                <div key={i} style={{ display: 'flex', gap: 11, padding: '11px 14px', borderRadius: 12, background: t.bg, border: `1px solid ${t.bd}` }}>
                  <span style={{ color: t.fg, fontWeight: 800, fontSize: 14, lineHeight: 1.4, width: 14, flexShrink: 0 }}>{t.icone}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{c.label}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.55 }}>{c.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
