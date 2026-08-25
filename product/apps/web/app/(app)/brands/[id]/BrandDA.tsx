'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { importBrandDAAction } from '../../../actions/brand-detail';

export function BrandDA({ brandId, logoUrl, colors, fonts }: { brandId: string; logoUrl: string | null; colors: string[]; fonts: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(true);
  const [da, setDa] = useState<{ logoUrl: string | null; colors: string[]; fonts: string[] }>({ logoUrl, colors, fonts });

  async function fetchDA() {
    if (busy) return;
    setBusy(true); setMsg('');
    const r = await importBrandDAAction({ brandId });
    setBusy(false);
    if (r.error) { setOk(false); setMsg(r.error); return; }
    setOk(true);
    setDa({ logoUrl: r.logoUrl ?? null, colors: r.colors ?? [], fonts: r.fonts ?? [] });
    setMsg('DA récupérée depuis le site.');
    router.refresh();
  }

  const has = !!da.logoUrl || da.colors.length > 0 || da.fonts.length > 0;

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px', margin: '4px 0 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>🎨 Identité visuelle (DA)</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>Logo, couleurs et polices récupérés depuis le site, appliqués automatiquement à tes pubs.</div>
        </div>
        <button type="button" onClick={fetchDA} disabled={busy} style={{ padding: '10px 18px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13, cursor: busy ? 'default' : 'pointer', background: 'var(--grad-accent)', color: '#0d070c', opacity: busy ? .6 : 1, whiteSpace: 'nowrap' }}>
          {busy ? 'Récupération…' : '✦ Récupérer la DA'}
        </button>
      </div>

      {has && (
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginTop: 16, alignItems: 'flex-start' }}>
          <div>
            <div style={daLbl}>Logo</div>
            {da.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={da.logoUrl} alt="" style={{ height: 44, maxWidth: 160, objectFit: 'contain', background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: 6 }} />
              : <span style={{ fontSize: 12, color: 'var(--muted)' }}>·</span>}
          </div>
          <div>
            <div style={daLbl}>Couleurs</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {da.colors.length ? da.colors.map((c) => (
                <span key={c} title={c} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: c, border: '1px solid var(--line-2)' }} />
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>{c}</span>
                </span>
              )) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>·</span>}
            </div>
          </div>
          <div>
            <div style={daLbl}>Polices</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {da.fonts.length ? da.fonts.map((f) => <span key={f} style={{ fontSize: 13, color: 'var(--ink-2)' }}>{f}</span>) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>·</span>}
            </div>
          </div>
        </div>
      )}
      {msg && <div style={{ marginTop: 12, fontSize: 12.5, color: ok ? '#9fe6b3' : '#f5b043' }}>{msg}</div>}
    </div>
  );
}

const daLbl = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 7 };
