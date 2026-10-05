'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from './Icon';
import { surface } from './ui';
import { useRouter } from 'next/navigation';
import { generateScenarioImageAction } from '../app/actions/brand-detail';

/**
 * Scénario d'usage avec vignette : le contexte devient visuel, ce qui aide à choisir
 * le bon décor avant de lancer une créa. La vignette est générée à la demande.
 */
export function ScenarioCard({ brandId, scenarioId, title, context, imageUrl, cost, canGenerate, children }: {
  brandId: string; scenarioId: string; title: string; context: string | null;
  imageUrl: string | null; cost: number; canGenerate: boolean; children?: React.ReactNode;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(imageUrl);
  const [busy, start] = useTransition();
  const [err, setErr] = useState('');
  // Lot 16 · le bouton se désactive pendant l'essai, ce qui lui retire le focus
  // (mesuré · <body> 4 fois sur 4 après « Crédits insuffisants »). L'échec rend
  // le focus au bouton et l'annonce (`role="alert"`).
  const btnRef = useRef<HTMLButtonElement>(null);
  const [essai, setEssai] = useState(0);
  useEffect(() => { if (essai && err && !busy) btnRef.current?.focus(); }, [essai, err, busy]);

  const generate = () => start(async () => {
    setErr('');
    const r = await generateScenarioImageAction({ brandId, scenarioId });
    if (r.error) { setErr(r.error); setEssai((n) => n + 1); return; }
    if (r.url) { setUrl(r.url); router.refresh(); }
  });

  return (
    <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start', ...surface, background: 'var(--surface)', padding: 13, marginBottom: 10 }}>
      {/* Vignette */}
      <div style={{ width: 86, height: 86, flexShrink: 0, borderRadius: 11, overflow: 'hidden', background: 'var(--paper)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {url
           
          ? <img src={url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : busy
            ? <span style={{ fontSize: 10.5, color: 'var(--muted)', textAlign: 'center', padding: 6 }}>Création…</span>
            : <span style={{ display: 'inline-flex', opacity: .35 }}><Icon name="film" size={22} /></span>}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <b style={{ color: 'var(--ink)', fontSize: 14, flex: 1 }}>{title}</b>
          {children}
        </div>
        {context && <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{context}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          {canGenerate && (
            <button ref={btnRef} type="button" onClick={generate} disabled={busy} aria-describedby={err ? `scenario-err-${scenarioId}` : undefined} style={{
              fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, cursor: busy ? 'default' : 'pointer',
              border: '1px solid rgba(254,44,85,.35)', background: 'transparent', color: 'var(--accent-strong)', opacity: busy ? .6 : 1,
            }}>{busy ? 'Génération…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="sparkles" size={13} /> {url ? `Régénérer · ${cost} cr.` : `Générer le visuel · ${cost} cr.`}</span>}</button>
          )}
          {err && <span id={`scenario-err-${scenarioId}`} role="alert" style={{ fontSize: 11.5, color: '#ff9db0' }}>{err}</span>}
        </div>
      </div>
    </div>
  );
}
