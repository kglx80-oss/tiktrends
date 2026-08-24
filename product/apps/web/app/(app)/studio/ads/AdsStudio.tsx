'use client';

import { useRef, useState } from 'react';
import { generateAdsAction, cloneAdAction, type AdItem } from '../../../actions/ads';
import type { AdTemplate } from '@tiktrends/ai';

const fld = { width: '100%', padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 14, outline: 'none' } as const;

/** Redimensionne une image (navigateur) en data URI jpeg — léger pour l'analyse vision. */
function fileToDataUri(file: File, maxSide = 1100, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture impossible.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d'); if (!ctx) return reject(new Error('Canvas indisponible.'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const TEMPLATES: { key: AdTemplate; label: string; emoji: string }[] = [
  { key: 'problem_solution', label: 'Problème / solution', emoji: '⚡' },
  { key: 'before_after', label: 'Avant / après', emoji: '🔀' },
  { key: 'testimonial', label: 'Témoignage / note', emoji: '⭐' },
  { key: 'benefits', label: 'Bénéfices annotés', emoji: '✅' },
];
const OBJECTIVES = ['Ventes', 'Notoriété', 'Trafic', 'Considération'];
const TPL_LABEL: Record<AdTemplate, string> = {
  problem_solution: 'Problème / solution', before_after: 'Avant / après', testimonial: 'Témoignage', benefits: 'Bénéfices',
};

export function AdsStudio({ ready, aiReady, brandName, initial, products, personas }: {
  ready: boolean; aiReady: boolean; brandName: string | null; initial: AdItem[];
  products: Array<{ id: string; name: string; hasImage: boolean }>; personas: Array<{ id: string; name: string }>;
}) {
  const [mode, setMode] = useState<'brand' | 'clone'>('brand');
  const [productId, setProductId] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [objective, setObjective] = useState('Ventes');
  const [templates, setTemplates] = useState<AdTemplate[]>(['problem_solution', 'before_after', 'testimonial', 'benefits']);
  const [refUri, setRefUri] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ads, setAds] = useState<AdItem[]>(initial);
  const [preview, setPreview] = useState<string | null>(null);
  const refInput = useRef<HTMLInputElement>(null);

  const selected = products.find((p) => p.id === productId) || null;

  function toggle(t: AdTemplate) {
    setTemplates((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  }

  async function onRefFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { setError('Formats acceptés : jpg, png, webp.'); return; }
    try { setRefUri(await fileToDataUri(file)); } catch (err) { setError((err as Error).message); }
  }

  async function run() {
    if (busy) return;
    setError('');
    if (mode === 'clone') {
      if (!refUri) { setError('Importe une pub de référence à cloner.'); return; }
      setBusy(true);
      const res = await cloneAdAction({ referenceDataUri: refUri, productId: productId || undefined, personaId: personaId || undefined, objective });
      setBusy(false);
      if (res.error) { setError(res.error); return; }
      if (res.ads?.length) setAds((list) => [...res.ads!, ...list]);
      return;
    }
    if (!templates.length) { setError('Choisis au moins un gabarit.'); return; }
    setBusy(true);
    const res = await generateAdsAction({ productId: productId || undefined, personaId: personaId || undefined, objective, templates });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (res.ads?.length) setAds((list) => [...res.ads!, ...list]);
  }

  return (
    <div>
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', padding: 22, marginBottom: 28 }}>
        {!ready && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(245,166,35,.4)', background: 'rgba(245,166,35,.10)', marginBottom: 18 }}>
            <span style={{ fontSize: 20 }}>🔒</span>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              <b style={{ color: 'var(--ink)' }}>Pubs IA en attente de la clé Fal.</b> Une fois <code style={{ fontSize: 12 }}>FAL_KEY</code> posée sur le serveur, elle s'active ici.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([['brand', 'Depuis la marque'], ['clone', 'Cloner une pub gagnante']] as const).map(([k, label]) => (
            <button key={k} type="button" disabled={!ready} onClick={() => { setMode(k); setError(''); }} style={{
              fontSize: 13, fontWeight: mode === k ? 800 : 600, padding: '9px 15px', borderRadius: 12, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : .55,
              border: `1px solid ${mode === k ? 'transparent' : 'var(--line-2)'}`,
              background: mode === k ? 'var(--grad-accent)' : 'transparent', color: mode === k ? '#0d070c' : 'var(--ink-2)',
            }}>{label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={lbl}>Produit</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!ready} style={{ ...fld, padding: '9px 10px' }}>
              <option value="">— Aucun (générique)</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.hasImage ? ' · 📷' : ''}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={lbl}>Persona</label>
            <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} disabled={!ready} style={{ ...fld, padding: '9px 10px' }}>
              <option value="">— Auto</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={lbl}>Objectif</label>
            <select value={objective} onChange={(e) => setObjective(e.target.value)} disabled={!ready} style={{ ...fld, padding: '9px 10px' }}>
              {OBJECTIVES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {productId && !selected?.hasImage && (
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)' }}>
            💡 Astuce : ajoute une photo à ce produit dans <b>Image IA</b> (Mise en scène produit → Enregistrer) pour que ton vrai packaging apparaisse dans les pubs.
          </p>
        )}

        {mode === 'brand' ? (
          <>
            <label style={lbl}>Gabarits</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              {TEMPLATES.map((t) => {
                const on = templates.includes(t.key);
                return (
                  <button key={t.key} type="button" disabled={!ready} onClick={() => toggle(t.key)} style={{
                    fontSize: 12.5, fontWeight: on ? 800 : 600, padding: '9px 14px', borderRadius: 12, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : .55,
                    border: `1px solid ${on ? 'transparent' : 'var(--line-2)'}`,
                    background: on ? 'var(--grad-accent)' : 'transparent', color: on ? '#0d070c' : 'var(--ink-2)',
                  }}>{t.emoji} {t.label}</button>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--line-2)', background: 'rgba(255,255,255,.02)' }}>
            <label style={lbl}>Pub gagnante à cloner <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— l'IA reprend l'angle et la structure, avec TON produit</span></label>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {refUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={refUri} alt="" style={{ width: 96, height: 120, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--line-2)', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 96, height: 120, borderRadius: 10, border: '1px dashed var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: 'var(--muted)', flexShrink: 0 }}>🏆</div>
              )}
              <div style={{ flex: '1 1 240px', minWidth: 220 }}>
                <input ref={refInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={onRefFile} disabled={!ready || busy} style={{ display: 'none' }} />
                <button type="button" onClick={() => refInput.current?.click()} disabled={!ready || busy} style={{
                  fontSize: 12.5, fontWeight: 800, padding: '8px 13px', borderRadius: 999, cursor: ready && !busy ? 'pointer' : 'default',
                  border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', opacity: ready ? 1 : .55,
                }}>⬆ {refUri ? 'Changer la référence' : 'Importer une pub'}</button>
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Capture d'une pub qui marche (concurrent, veille, bibliothèque). L'IA en déduit le gabarit et recompose avec ta marque. Astuce : retrouve des gagnantes dans la <b>Veille</b>.
                </p>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{mode === 'clone' ? '4 crédits · 1 pub clonée' : `4 crédits / pub · ${templates.length} pub${templates.length > 1 ? 's' : ''}`}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={run} disabled={!ready || busy || (mode === 'brand' ? !templates.length : !refUri)} style={{
            padding: '11px 20px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5,
            cursor: ready && !busy ? 'pointer' : 'default', background: 'var(--grad-accent)', color: '#0d070c', opacity: ready && !busy && (mode === 'brand' ? templates.length : refUri) ? 1 : .5,
          }}>{busy ? (mode === 'clone' ? 'Clonage…' : 'Création des pubs…') : mode === 'clone' ? '✨ Cloner la pub' : '✨ Générer les pubs'}</button>
        </div>
        {busy && <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--muted)' }}>{mode === 'clone' ? 'Analyse de la référence, génération de la scène et composition…' : 'Écriture des concepts, génération des scènes et composition… (~20-40 s)'}</p>}
        {error && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(255,77,109,.4)', background: 'rgba(255,77,109,.10)', color: '#ff9db0' }}>{error}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Tes pubs {brandName ? <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>· {brandName}</span> : null}</h2>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{ads.length}</span>
      </div>
      {ads.length === 0 ? (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 16, padding: '28px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5 }}>Aucune pub pour l'instant. Lance ta première série ci-dessus.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {ads.map((a) => (
            <div key={a.id} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
              <button type="button" onClick={() => setPreview(a.url)} style={{ display: 'block', width: '100%', padding: 0, border: 'none', cursor: 'zoom-in', background: 'transparent' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.headline} style={{ width: '100%', display: 'block', aspectRatio: '4/5', objectFit: 'cover' }} />
              </button>
              <div style={{ padding: '9px 11px' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--accent-strong)' }}>{TPL_LABEL[a.template]}</span>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--ink-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.headline}</p>
                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                  <button type="button" onClick={() => setPreview(a.url)} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Aperçu ⛶</button>
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-strong)' }}>Télécharger ↗</a>
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
