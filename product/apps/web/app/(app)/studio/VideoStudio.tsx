'use client';

import { useEffect, useRef, useState } from 'react';
import { startVideoAction, pollVideoAction } from '../../actions/video';

type Phase = 'idle' | 'starting' | 'processing' | 'done' | 'error';
const RATIOS: Array<'9:16' | '1:1' | '16:9'> = ['9:16', '1:1', '16:9'];

export function VideoStudio({ ready }: { ready: boolean }) {
  const [prompt, setPrompt] = useState('');
  const [ratio, setRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function poll(jobId: string, generationId?: string, tries = 0) {
    timer.current = setTimeout(async () => {
      const r = await pollVideoAction(jobId, generationId);
      if (r.status === 'completed' && r.videoUrl) { setVideoUrl(r.videoUrl); setPhase('done'); return; }
      if (r.status === 'failed') { setError(r.error || 'La génération a échoué.'); setPhase('error'); return; }
      if (tries > 80) { setError("Délai dépassé. Réessaie ou vérifie la source vidéo."); setPhase('error'); return; }
      poll(jobId, generationId, tries + 1);
    }, 5000);
  }

  async function run() {
    if (!prompt.trim() || phase === 'starting' || phase === 'processing') return;
    setError(''); setVideoUrl(''); setPhase('starting');
    const res = await startVideoAction({ prompt, aspectRatio: ratio, durationS: 5 });
    if (res.error) { setError(res.error); setPhase('error'); return; }
    if (res.jobId) { setPhase('processing'); poll(res.jobId, res.generationId); }
  }

  const busy = phase === 'starting' || phase === 'processing';

  return (
    <section style={{ marginTop: 34, border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Vidéo IA</h2>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>HIGGSFIELD</span>
        {!ready && <span style={{ fontSize: 12, color: 'var(--muted)' }}>· s'active dès que la clé est posée</span>}
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-2)' }}>
        Décris ta vidéo (scène, produit, ambiance, mouvement) : on la génère en format vertical prêt pour TikTok.
      </p>

      <textarea
        value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={!ready || busy}
        placeholder="Ex : gros plan sur une boisson énergisante posée sur un bureau, lumière du matin, léger travelling avant, ambiance productive"
        style={{ width: '100%', minHeight: 90, padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 14, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, outline: 'none' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {RATIOS.map((r) => (
            <button key={r} type="button" disabled={!ready || busy} onClick={() => setRatio(r)} style={{
              fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 999, cursor: ready && !busy ? 'pointer' : 'default',
              border: `1px solid ${ratio === r ? 'transparent' : 'var(--line-2)'}`,
              background: ratio === r ? 'var(--grad-accent)' : 'transparent', color: ratio === r ? '#0d070c' : 'var(--ink-2)',
            }}>{r}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>12 crédits / vidéo</span>
        <button type="button" onClick={run} disabled={!ready || busy || !prompt.trim()} style={{
          padding: '10px 18px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5, cursor: ready && !busy && prompt.trim() ? 'pointer' : 'default',
          background: 'var(--grad-accent)', color: '#0d070c', opacity: ready && !busy && prompt.trim() ? 1 : .5,
        }}>{phase === 'starting' ? 'Lancement…' : phase === 'processing' ? 'Génération…' : '✦ Générer la vidéo'}</button>
      </div>

      {busy && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, padding: 14, border: '1px solid var(--line)', borderRadius: 12 }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--line-2)', borderTopColor: 'var(--accent-strong)', animation: 'ttspin 1s linear infinite' }} />
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>La vidéo se génère, ça prend en général 1 à 3 minutes. Tu peux rester sur la page.</span>
          <style>{'@keyframes ttspin{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}
      {error && <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(255,77,109,.4)', background: 'rgba(255,77,109,.10)', color: '#ff9db0' }}>{error}</div>}
      {phase === 'done' && videoUrl && (
        <div style={{ marginTop: 16 }}>
          <video src={videoUrl} controls style={{ width: '100%', maxWidth: ratio === '9:16' ? 300 : 520, borderRadius: 14, border: '1px solid var(--line)', display: 'block' }} />
          <a href={videoUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)' }}>Ouvrir / télécharger ↗</a>
        </div>
      )}
    </section>
  );
}
