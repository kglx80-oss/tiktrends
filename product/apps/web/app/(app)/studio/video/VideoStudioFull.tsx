'use client';

import { useEffect, useRef, useState } from 'react';
import { startVideoAction, startImageVideoAction, pollVideoAction, type BrandVideo } from '../../../actions/video';

type Ratio = '9:16' | '1:1' | '16:9';
const RATIOS: Ratio[] = ['9:16', '1:1', '16:9'];
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  processing: { label: 'Génération', color: '#7aa2ff' }, queued: { label: 'En file', color: '#f5a623' },
  completed: { label: 'Prête', color: '#18cc8c' }, failed: { label: 'Échec', color: '#ff4d6d' },
};

const fld = { width: '100%', padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 14, outline: 'none' } as const;

export function VideoStudioFull({ ready, brandName, initialVideos, initialPrompt }: {
  ready: boolean; brandName: string | null; initialVideos: BrandVideo[]; initialPrompt?: string;
}) {
  const [mode, setMode] = useState<'t2v' | 'i2v'>('t2v');
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [imageUrl, setImageUrl] = useState('');
  const [ratio, setRatio] = useState<Ratio>('9:16');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [videos, setVideos] = useState<BrandVideo[]>(initialVideos);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  function poll(id: string, jobId: string, tries = 0) {
    const t = setTimeout(async () => {
      const r = await pollVideoAction(jobId, id.startsWith('tmp-') ? undefined : id);
      setVideos((list) => list.map((v) => v.id === id ? { ...v, status: r.status === 'unknown' ? v.status : r.status, videoUrl: r.videoUrl ?? v.videoUrl } : v));
      if (r.status === 'completed' || r.status === 'failed') return;
      if (tries > 80) return;
      poll(id, jobId, tries + 1);
    }, 5000);
    timers.current.push(t);
  }

  async function generate() {
    if (busy) return;
    if (mode === 't2v' && !prompt.trim()) { setError('Décris la vidéo à générer.'); return; }
    if (mode === 'i2v' && !imageUrl.trim()) { setError("Ajoute l'URL d'une image de départ."); return; }
    setError(''); setBusy(true);
    const res = mode === 't2v'
      ? await startVideoAction({ prompt, aspectRatio: ratio })
      : await startImageVideoAction({ prompt, imageUrl, aspectRatio: ratio });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (res.jobId) {
      const id = res.generationId ?? `tmp-${res.jobId}`;
      const fresh: BrandVideo = { id, prompt: prompt.trim() || '(image animée)', mode, status: 'processing', jobId: res.jobId, videoUrl: null, createdAt: new Date().toISOString() };
      setVideos((list) => [fresh, ...list]);
      poll(id, res.jobId);
      if (mode === 't2v') setPrompt('');
    }
  }

  function recheck(v: BrandVideo) {
    if (!v.jobId) return;
    setVideos((list) => list.map((x) => x.id === v.id ? { ...x, status: 'processing' } : x));
    poll(v.id, v.jobId);
  }

  return (
    <div>
      {/* Générateur */}
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', padding: 22, marginBottom: 28 }}>
        {!ready && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(245,166,35,.4)', background: 'rgba(245,166,35,.10)', marginBottom: 18 }}>
            <span style={{ fontSize: 20 }}>🔒</span>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              <b style={{ color: 'var(--ink)' }}>Vidéo IA en attente de la clé Fal.</b> La génération vidéo (Kling 2) utilise Fal.ai · la même clé que l'Image IA.
              Une fois <code style={{ fontSize: 12 }}>FAL_KEY</code> posée sur le serveur, elle s'active ici.
              En attendant, le <b>Studio IA</b> (scripts, hooks) et l'<b>assistant</b> fonctionnent déjà avec Claude.
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([['t2v', 'Texte → Vidéo'], ['i2v', 'Image → Vidéo']] as const).map(([k, label]) => (
            <button key={k} type="button" disabled={!ready} onClick={() => setMode(k)} style={{
              fontSize: 13, fontWeight: mode === k ? 800 : 600, padding: '9px 15px', borderRadius: 12, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : .55,
              border: `1px solid ${mode === k ? 'transparent' : 'var(--line-2)'}`,
              background: mode === k ? 'var(--grad-accent)' : 'transparent', color: mode === k ? '#0d070c' : 'var(--ink-2)',
            }}>{label}</button>
          ))}
        </div>

        {mode === 'i2v' && (
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>URL de l'image de départ</label>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} disabled={!ready || busy} placeholder="https://…/mon-image.jpg" style={fld} />
          </div>
        )}

        <label style={lbl}>{mode === 't2v' ? 'Décris ta vidéo' : 'Consigne de mouvement (optionnel)'}</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={!ready || busy}
          placeholder={mode === 't2v' ? 'Ex : gros plan sur une boisson posée sur un bureau, lumière du matin, léger travelling avant' : 'Ex : léger zoom, la vapeur monte, ambiance chaleureuse'}
          style={{ ...fld, minHeight: 88, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />

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
          <button type="button" onClick={generate} disabled={!ready || busy} style={{
            padding: '10px 18px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5,
            cursor: ready && !busy ? 'pointer' : 'default', background: 'var(--grad-accent)', color: '#0d070c', opacity: ready && !busy ? 1 : .5,
          }}>{busy ? 'Lancement…' : '✦ Générer la vidéo'}</button>
        </div>
        {!ready && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>La vidéo IA s'active dès que la clé Higgsfield est posée sur le serveur.</p>}
        {error && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(255,77,109,.4)', background: 'rgba(255,77,109,.10)', color: '#ff9db0' }}>{error}</div>}
      </div>

      {/* Galerie */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Tes vidéos {brandName ? <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>· {brandName}</span> : null}</h2>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{videos.length}</span>
      </div>

      {videos.length === 0 ? (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 16, padding: '28px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5 }}>
          Aucune vidéo pour l'instant. Génère la première ci-dessus.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
          {videos.map((v) => {
            const st = STATUS_LABEL[v.status] ?? STATUS_LABEL.processing!;
            const pending = v.status === 'processing' || v.status === 'queued';
            return (
              <div key={v.id} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
                <div style={{ aspectRatio: '9 / 16', background: '#120c15', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {v.status === 'completed' && v.videoUrl
                    ? <video src={v.videoUrl} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : v.status === 'failed'
                      ? <span style={{ fontSize: 26 }}>⚠️</span>
                      : <span style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--line-2)', borderTopColor: 'var(--accent-strong)', animation: 'ttspin 1s linear infinite' }} />}
                  <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 999, color: st.color, background: 'rgba(0,0,0,.55)' }}>{st.label}</span>
                  <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 999, color: 'var(--ink-2)', background: 'rgba(0,0,0,.5)' }}>{v.mode === 'i2v' ? 'IMG' : 'TXT'}</span>
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.prompt}</p>
                  <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
                    {v.status === 'completed' && v.videoUrl && <a href={v.videoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-strong)' }}>Télécharger ↗</a>}
                    {pending && v.jobId && <button type="button" onClick={() => recheck(v)} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Vérifier</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{'@keyframes ttspin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}

const lbl = { fontSize: 13, color: 'var(--ink-2)', display: 'block', marginBottom: 6 } as const;
