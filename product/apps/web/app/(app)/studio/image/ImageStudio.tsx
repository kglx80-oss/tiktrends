'use client';

import { useState } from 'react';
import { generateImageAction, type BrandImage } from '../../../actions/image';
import type { FalAspect } from '@tiktrends/integrations';

const RATIOS: FalAspect[] = ['9:16', '4:5', '1:1', '16:9'];
const fld = { width: '100%', padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 14, outline: 'none' } as const;

export function ImageStudio({ ready, aiReady, brandName, initial, products, brandColors }: {
  ready: boolean; aiReady: boolean; brandName: string | null; initial: BrandImage[];
  products: Array<{ id: string; name: string }>; brandColors: string[];
}) {
  const [mode, setMode] = useState<'t2i' | 'i2i'>('t2i');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [ratio, setRatio] = useState<FalAspect>('1:1');
  const [withText, setWithText] = useState(false);
  const [headline, setHeadline] = useState('');
  const [productId, setProductId] = useState('');
  const [enhance, setEnhance] = useState(aiReady);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [images, setImages] = useState<BrandImage[]>(initial);
  const [preview, setPreview] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    if (!prompt.trim()) { setError("Décris l'image à générer."); return; }
    if (mode === 'i2i' && !imageUrl.trim()) { setError("Ajoute l'URL de ton image produit."); return; }
    setError(''); setBusy(true);
    const res = await generateImageAction({ prompt, aspectRatio: ratio, imageUrl: mode === 'i2i' ? imageUrl : undefined, withText, enhance, count, productId: productId || undefined, headline: withText ? headline : undefined });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (res.images) {
      const fresh: BrandImage[] = res.images.map((url, i) => ({ id: 'new-' + i + '-' + url, prompt: res.prompt || prompt, url, createdAt: new Date().toISOString() }));
      setImages((list) => [...fresh, ...list]);
    }
  }

  return (
    <div>
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', padding: 22, marginBottom: 28 }}>
        {!ready && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(245,166,35,.4)', background: 'rgba(245,166,35,.10)', marginBottom: 18 }}>
            <span style={{ fontSize: 20 }}>🔒</span>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              <b style={{ color: 'var(--ink)' }}>Image IA en attente de la clé Fal.</b> Cette fonction utilise Fal.ai (Flux / Ideogram).
              Une fois <code style={{ fontSize: 12 }}>FAL_KEY</code> posée sur le serveur, elle s'active ici.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([['t2i', 'Texte → Image'], ['i2i', 'Mise en scène produit']] as const).map(([k, label]) => (
            <button key={k} type="button" disabled={!ready} onClick={() => setMode(k)} style={{
              fontSize: 13, fontWeight: mode === k ? 800 : 600, padding: '9px 15px', borderRadius: 12, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : .55,
              border: `1px solid ${mode === k ? 'transparent' : 'var(--line-2)'}`,
              background: mode === k ? 'var(--grad-accent)' : 'transparent', color: mode === k ? '#0d070c' : 'var(--ink-2)',
            }}>{label}</button>
          ))}
        </div>

        {/* Contexte marque : produit + DA appliqués automatiquement */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {products.length > 0 && (
            <div>
              <label style={lbl}>Produit de la marque</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!ready} style={{ ...fld, width: 'auto', minWidth: 200, padding: '9px 10px' }}>
                <option value="">— Aucun (générique)</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {brandColors.length > 0 && (
            <div>
              <label style={lbl}>DA appliquée</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: 38 }}>
                {brandColors.slice(0, 6).map((c, i) => <span key={i} title={c} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--line-2)', background: c }} />)}
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>couleurs de {brandName ?? 'la marque'}</span>
              </div>
            </div>
          )}
        </div>

        {mode === 'i2i' && (
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>URL de ton image produit <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— lien direct vers le fichier image (jpg / png / webp)</span></label>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} disabled={!ready || busy} placeholder="https://…/produit.jpg" style={fld} />
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>Pas la page produit : clic droit sur l'image → « Copier l'adresse de l'image ». (L'upload de fichier arrive bientôt.)</p>
          </div>
        )}

        <label style={lbl}>{mode === 't2i' ? "Décris l'image" : 'Décris la scène autour du produit'}</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={!ready || busy}
          placeholder={mode === 't2i' ? 'Ex : boisson énergisante sur un bureau lumineux, ambiance productive, gros plan' : 'Ex : mon produit posé sur une table en marbre, lumière douce du matin'}
          style={{ ...fld, minHeight: 88, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {RATIOS.map((r) => (
              <button key={r} type="button" disabled={!ready || busy} onClick={() => setRatio(r)} style={{
                fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 999, cursor: ready && !busy ? 'pointer' : 'default',
                border: `1px solid ${ratio === r ? 'transparent' : 'var(--line-2)'}`,
                background: ratio === r ? 'var(--grad-accent)' : 'transparent', color: ratio === r ? '#0d070c' : 'var(--ink-2)',
              }}>{r}</button>
            ))}
          </div>
          <label style={chk}><input type="checkbox" checked={withText} onChange={(e) => setWithText(e.target.checked)} disabled={!ready} /> Texte lisible sur l'image</label>
          {withText && <input value={headline} onChange={(e) => setHeadline(e.target.value)} disabled={!ready} placeholder="Accroche à écrire (ex : Focus. Toute la journée.)" style={{ ...fld, flex: '1 1 220px', padding: '8px 10px' }} />}
          <label style={{ ...chk, opacity: aiReady ? 1 : .5 }}><input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} disabled={!ready || !aiReady} /> Optimiser le prompt (Claude)</label>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={!ready} style={{ ...fld, width: 'auto', padding: '8px 10px' }}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} image{n > 1 ? 's' : ''}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>4 crédits / image · {withText ? 'Ideogram (texte)' : mode === 'i2i' ? 'Flux (image→image)' : 'Flux'}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={run} disabled={!ready || busy || !prompt.trim()} style={{
            padding: '10px 18px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5,
            cursor: ready && !busy && prompt.trim() ? 'pointer' : 'default', background: 'var(--grad-accent)', color: '#0d070c', opacity: ready && !busy && prompt.trim() ? 1 : .5,
          }}>{busy ? 'Génération…' : '✦ Générer'}</button>
        </div>
        {error && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(255,77,109,.4)', background: 'rgba(255,77,109,.10)', color: '#ff9db0' }}>{error}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Tes visuels {brandName ? <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>· {brandName}</span> : null}</h2>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{images.length}</span>
      </div>
      {images.length === 0 ? (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 16, padding: '28px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5 }}>Aucun visuel pour l'instant.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {images.map((im) => (
            <div key={im.id} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
              {im.url && (
                <button type="button" onClick={() => setPreview(im.url)} style={{ display: 'block', width: '100%', padding: 0, border: 'none', cursor: 'zoom-in', background: 'transparent' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt="" style={{ width: '100%', display: 'block', aspectRatio: '1/1', objectFit: 'cover' }} />
                </button>
              )}
              <div style={{ padding: '9px 11px' }}>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{im.prompt}</p>
                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                  {im.url && <button type="button" onClick={() => setPreview(im.url)} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Aperçu ⛶</button>}
                  {im.url && <a href={im.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-strong)' }}>Télécharger ↗</a>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 12, boxShadow: '0 30px 80px -20px rgba(0,0,0,.8)' }} />
          <button type="button" onClick={() => setPreview(null)} aria-label="Fermer" style={{ position: 'fixed', top: 18, right: 20, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
      )}
    </div>
  );
}

const lbl = { fontSize: 13, color: 'var(--ink-2)', display: 'block', marginBottom: 6 } as const;
const chk = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' } as const;
