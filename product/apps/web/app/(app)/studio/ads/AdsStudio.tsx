'use client';

import { useRef, useState, useTransition } from 'react';
import { generateAdsAction, cloneAdAction, suggestAnglesAction, archiveAdAction, type AdItem, type SavedAdRef } from '../../../actions/ads';
import { setProductImagesAction, importAllProductImagesAction } from '../../../actions/image';
import { VISUAL_UNIVERSES, type AdTemplate, type AdAngle } from '@tiktrends/ai';

const fld = { width: '100%', padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 14, outline: 'none' } as const;

/** Redimensionne une image (navigateur) en data URI jpeg · léger pour l'analyse vision. */
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
  { key: 'ugc', label: 'UGC natif', emoji: '📱' },
  { key: 'stat', label: 'Chiffre-clé', emoji: '📊' },
  { key: 'offer', label: 'Offre / promo', emoji: '🏷️' },
];
const OBJECTIVES = ['Ventes', 'Prospection', 'Retargeting', 'Notoriété', 'Trafic', 'Considération', 'Lancement produit', 'Promo / soldes', 'Collecte d’avis', 'Génération de leads'];
const TPL_LABEL: Record<AdTemplate, string> = {
  problem_solution: 'Problème / solution', before_after: 'Avant / après', testimonial: 'Témoignage', benefits: 'Bénéfices',
  ugc: 'UGC natif', stat: 'Chiffre-clé', offer: 'Offre / promo',
};
// Aperçu couleur/gradient par univers (pour des cartes visuelles).
const UNIVERSE_SWATCH: Record<string, string> = {
  studio: 'linear-gradient(135deg,#e9e9ee,#c7c7d1)', lifestyle: 'linear-gradient(135deg,#f4c99a,#d98c5f)',
  editorial: 'linear-gradient(135deg,#2b2b33,#6b6b7a)', nature: 'linear-gradient(135deg,#8fd39a,#4c8a5a)',
  bold: 'linear-gradient(135deg,#ff5db1,#7a5bff)', cinematic: 'linear-gradient(135deg,#141420,#3a2b52)',
  flatlay: 'linear-gradient(135deg,#f0e6da,#cbb79b)', energy: 'linear-gradient(135deg,#ff8a3c,#ff3c6e)',
};

export function AdsStudio({ ready, aiReady, brandName, initial, products, personas, savedRefs }: {
  ready: boolean; aiReady: boolean; brandName: string | null; initial: AdItem[];
  products: Array<{ id: string; name: string; hasImage: boolean }>; personas: Array<{ id: string; name: string }>;
  savedRefs: SavedAdRef[];
}) {
  const [mode, setMode] = useState<'brand' | 'clone'>('brand');
  const [prods, setProds] = useState(products);
  // S'il n'y a qu'un seul produit, on le sélectionne d'office (évite le piège « Aucun »).
  const [productId, setProductId] = useState(products.length === 1 ? products[0]!.id : '');
  const [prodThumbs, setProdThumbs] = useState<string[]>([]);
  const [prodMsg, setProdMsg] = useState('');
  const [prodBusy, setProdBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [bulkOk, setBulkOk] = useState(true);
  const prodImgInput = useRef<HTMLInputElement>(null);
  const [personaId, setPersonaId] = useState('');
  const [objective, setObjective] = useState('Ventes');
  const [templates, setTemplates] = useState<AdTemplate[]>(['problem_solution', 'before_after', 'testimonial', 'benefits']);
  const [angle, setAngle] = useState('');
  const [universe, setUniverse] = useState('auto');
  const [count, setCount] = useState(4);
  const [angles, setAngles] = useState<AdAngle[]>([]);
  const [anglesBusy, startAngles] = useTransition();
  const [refUri, setRefUri] = useState('');
  const [savedAdId, setSavedAdId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ads, setAds] = useState<AdItem[]>(initial);
  const [preview, setPreview] = useState<string | null>(null);
  const refInput = useRef<HTMLInputElement>(null);

  const selected = prods.find((p) => p.id === productId) || null;

  function toggle(t: AdTemplate) {
    setTemplates((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  }

  async function archive(id: string) {
    setAds((list) => list.filter((a) => a.id !== id)); // retrait optimiste
    await archiveAdAction({ id });
  }

  function proposeAngles() {
    if (anglesBusy) return;
    setError('');
    startAngles(async () => {
      const r = await suggestAnglesAction({ productId: productId || undefined });
      if (r.error) setError(r.error);
      else setAngles(r.angles ?? []);
    });
  }

  function markHasImage() {
    setProds((list) => list.map((p) => (p.id === productId ? { ...p, hasImage: true } : p)));
  }

  async function addProductFiles(files: File[]) {
    if (!productId) { setError('Sélectionne d\'abord un produit ci-dessus.'); return; }
    const imgs = files.filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type)).slice(0, 6);
    if (!imgs.length) { setError('Formats acceptés : jpg, png, webp.'); return; }
    setError(''); setProdMsg(''); setProdBusy(true);
    try {
      const uris = await Promise.all(imgs.map((f) => fileToDataUri(f, 1280)));
      const r = await setProductImagesAction({ productId, dataUris: uris, append: true });
      if (r.error) setError(r.error);
      else { setProdThumbs(r.imageUrls ?? uris); markHasImage(); setProdMsg(`${(r.imageUrls ?? uris).length} photo(s) produit enregistrée(s). Elles serviront de référence.`); }
    } catch (err) { setError((err as Error).message); }
    setProdBusy(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) void addProductFiles(files);
  }

  async function importAll() {
    if (bulkBusy) return;
    setError(''); setBulkMsg(''); setBulkBusy(true);
    const r = await importAllProductImagesAction();
    if (r.error) setError(r.error);
    else {
      if (r.updatedIds.length) setProds((list) => list.map((p) => (r.updatedIds.includes(p.id) ? { ...p, hasImage: true } : p)));
      const allDone = r.updated === 0 && !r.note;
      setBulkOk(r.updated > 0 || allDone);
      setBulkMsg(r.updated > 0 ? `${r.updated} photo(s) produit récupérée(s) depuis le site.` : (r.note || 'Toutes les photos produit sont déjà récupérées ✓'));
    }
    setBulkBusy(false);
  }

  async function onRefFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { setError('Formats acceptés : jpg, png, webp.'); return; }
    try { setRefUri(await fileToDataUri(file)); setSavedAdId(''); } catch (err) { setError((err as Error).message); }
  }

  const hasRef = !!refUri || !!savedAdId;

  async function run() {
    if (busy) return;
    setError('');
    if (mode === 'clone') {
      if (!hasRef) { setError('Choisis une pub de référence (veille ou upload).'); return; }
      setBusy(true);
      const res = await cloneAdAction({ referenceDataUri: refUri || undefined, savedAdId: savedAdId || undefined, productId: productId || undefined, personaId: personaId || undefined, objective, universe, count });
      setBusy(false);
      if (res.error) { setError(res.error); return; }
      if (res.ads?.length) setAds((list) => [...res.ads!, ...list]);
      return;
    }
    if (!templates.length) { setError('Choisis au moins un gabarit.'); return; }
    setBusy(true);
    const res = await generateAdsAction({ productId: productId || undefined, personaId: personaId || undefined, objective, templates, angle: angle.trim() || undefined, universe, count });
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

        {/* Récupération auto au chargement ; ce rappel n'apparaît que s'il reste des photos manquantes. */}
        {prods.some((p) => !p.hasImage) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14, padding: '10px 14px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'rgba(255,255,255,.02)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
              📷 Photos produit : <b>{prods.filter((p) => p.hasImage).length}/{prods.length}</b> · certaines manquent.
            </span>
            <button type="button" onClick={importAll} disabled={!ready || bulkBusy} style={{ ...miniBtn, opacity: ready && !bulkBusy ? 1 : .6 }}>
              {bulkBusy ? 'Récupération…' : '🔗 Réessayer depuis le site'}
            </button>
            {bulkMsg && <span style={{ fontSize: 11.5, color: bulkOk ? '#9fe6b3' : '#f5b043' }}>{bulkMsg}</span>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={lbl}>Produit</label>
            <select value={productId} onChange={(e) => { setProductId(e.target.value); setProdThumbs([]); setProdMsg(''); }} disabled={!ready} style={{ ...fld, padding: '9px 10px' }}>
              <option value="">· Aucun (générique)</option>
              {prods.map((p) => <option key={p.id} value={p.id}>{p.name}{p.hasImage ? ' · 📷' : ''}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={lbl}>Persona</label>
            <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} disabled={!ready} style={{ ...fld, padding: '9px 10px' }}>
              <option value="">· Auto</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={lbl}>Objectif</label>
            <select value={objective} onChange={(e) => setObjective(e.target.value)} disabled={!ready} style={{ ...fld, padding: '9px 10px' }}>
              {OBJECTIVES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label style={lbl}>Quantité</label>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={!ready} style={{ ...fld, padding: '9px 10px' }}>
              {[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} pub{n > 1 ? 's' : ''}</option>)}
            </select>
          </div>
        </div>

        {!productId && prods.some((p) => p.hasImage) && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(245,166,35,.4)', background: 'rgba(245,166,35,.07)', fontSize: 12.5, color: '#f5b043' }}>
            ⚠️ Sélectionne ton <b>produit</b> ci-dessus (pas « Aucun ») pour que ton vrai packaging apparaisse dans les pubs.
          </div>
        )}

        {productId && (
          <div
            onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => prodImgInput.current?.click()}
            style={{
              display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, padding: 14, borderRadius: 14, cursor: 'pointer',
              border: `1.5px dashed ${dragOver ? 'var(--accent-strong)' : selected?.hasImage ? 'rgba(120,220,150,.5)' : 'rgba(245,166,35,.5)'}`,
              background: dragOver ? 'var(--accent-soft)' : selected?.hasImage ? 'rgba(120,220,150,.07)' : 'rgba(245,166,35,.07)',
            }}
          >
            <input ref={prodImgInput} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) void addProductFiles(fs); e.currentTarget.value = ''; }} disabled={!ready || prodBusy} style={{ display: 'none' }} />
            {prodThumbs.length > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {prodThumbs.slice(0, 4).map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={u} alt="" style={{ width: 56, height: 56, borderRadius: 9, objectFit: 'cover', border: '1px solid var(--line-2)' }} />
                ))}
              </div>
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: 10, border: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>{selected?.hasImage ? '📷' : '📥'}</div>
            )}
            <div style={{ flex: '1 1 240px', minWidth: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                {selected?.hasImage || prodThumbs.length ? 'Photo(s) produit prête(s) ✓ · ton vrai packaging sera utilisé' : 'Glisse-dépose une ou plusieurs photos de ton produit'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                Glisser-déposer ici, ou clique pour choisir. Plusieurs angles = meilleure fidélité (jpg, png, webp).
              </div>
              {prodBusy && <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--muted)' }}>Traitement…</div>}
              {prodMsg && <div style={{ marginTop: 6, fontSize: 11.5, color: '#9fe6b3' }}>{prodMsg}</div>}
            </div>
          </div>
        )}

        {mode === 'brand' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>Angle <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· l'itération porte sur cet angle précis</span></label>
              <button type="button" onClick={proposeAngles} disabled={!ready || anglesBusy} style={{
                fontSize: 11.5, fontWeight: 800, padding: '4px 10px', borderRadius: 999, cursor: ready && !anglesBusy ? 'pointer' : 'default',
                border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--accent-strong)', opacity: ready ? 1 : .55,
              }}>✦ {anglesBusy ? 'Analyse veille…' : 'Proposer des angles'}</button>
            </div>
            <input value={angle} onChange={(e) => setAngle(e.target.value)} disabled={!ready} placeholder="Ex : Focus sans caféine ni crash · pour créateurs en surrégime" style={{ ...fld, padding: '10px 12px' }} />
            {angles.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {angles.map((a, i) => (
                  <button key={i} type="button" onClick={() => setAngle(a.title)} title={a.rationale} style={{
                    fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', maxWidth: 300,
                    border: `1px solid ${angle === a.title ? 'transparent' : 'var(--line-2)'}`,
                    background: angle === a.title ? 'var(--grad-accent)' : 'transparent', color: angle === a.title ? '#0d070c' : 'var(--ink-2)',
                  }}>{a.title}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Univers visuel · commun aux deux modes */}
        <label style={lbl}>Univers visuel <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· l'ambiance des visuels</span></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
          {[{ key: 'auto', label: '✦ Varié (auto)' }, ...VISUAL_UNIVERSES].map((u) => {
            const on = universe === u.key;
            return (
              <button key={u.key} type="button" disabled={!ready} onClick={() => setUniverse(u.key)} style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 12, cursor: ready ? 'pointer' : 'default',
                border: `1.5px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`, background: on ? 'var(--accent-soft)' : 'transparent', textAlign: 'left',
              }}>
                <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: UNIVERSE_SWATCH[u.key] || 'var(--grad-accent)', border: '1px solid rgba(255,255,255,.15)' }} />
                <span style={{ fontSize: 12, fontWeight: on ? 800 : 600, color: on ? 'var(--ink)' : 'var(--ink-2)' }}>{u.label}</span>
              </button>
            );
          })}
        </div>

        {mode === 'brand' ? (
          <>
            <label style={lbl}>Gabarits <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· exécutions autorisées ({templates.length} sélectionné{templates.length > 1 ? 's' : ''})</span></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 4 }}>
              {TEMPLATES.map((t) => {
                const on = templates.includes(t.key);
                return (
                  <button key={t.key} type="button" disabled={!ready} onClick={() => toggle(t.key)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '12px 13px', borderRadius: 14, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : .55,
                    border: `1.5px solid ${on ? 'transparent' : 'var(--line-2)'}`,
                    background: on ? 'var(--grad-accent)' : 'transparent', color: on ? '#0d070c' : 'var(--ink-2)',
                  }}>
                    <span style={{ fontSize: 22 }}>{t.emoji}</span>
                    <span style={{ fontSize: 12.5, fontWeight: on ? 800 : 600 }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--line-2)', background: 'rgba(255,255,255,.02)' }}>
            <label style={lbl}>Pub gagnante à cloner <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· l'IA reprend l'angle + la structure, sur TON produit, en {count} variation{count > 1 ? 's' : ''}</span></label>

            {savedRefs.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>Depuis ta Veille (sauvegardes)</div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {savedRefs.map((r) => {
                    const on = savedAdId === r.id;
                    return (
                      <button key={r.id} type="button" disabled={!ready || busy} onClick={() => { setSavedAdId(on ? '' : r.id); setRefUri(''); }} title={r.brandName ?? ''} style={{
                        padding: 0, borderRadius: 10, flexShrink: 0, cursor: ready && !busy ? 'pointer' : 'default', background: 'transparent',
                        border: `2px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`,
                      }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.imageUrl} alt="" style={{ width: 74, height: 94, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
                }}>⬆ {refUri ? 'Changer la capture' : 'Importer une capture'}</button>
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                  {savedRefs.length ? 'Choisis une pub de ta Veille ci-dessus, ou importe une capture.' : "Capture d'une pub qui marche (concurrent, veille, bibliothèque)."} L'IA en déduit l'angle + le gabarit et produit {count} variation{count > 1 ? 's' : ''} sur ta marque et ton produit.
                </p>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>4 crédits / pub · {count} pub{count > 1 ? 's' : ''}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={run} disabled={!ready || busy || (mode === 'brand' ? !templates.length : !hasRef)} style={{
            padding: '11px 20px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5,
            cursor: ready && !busy ? 'pointer' : 'default', background: 'var(--grad-accent)', color: '#0d070c', opacity: ready && !busy && (mode === 'brand' ? templates.length : hasRef) ? 1 : .5,
          }}>{busy ? (mode === 'clone' ? 'Clonage…' : 'Création des pubs…') : mode === 'clone' ? `✨ Cloner en ${count}` : '✨ Générer les pubs'}</button>
        </div>
        {busy && <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--muted)' }}>{mode === 'clone' ? 'Analyse de la référence, déclinaison en variations et composition… (~20-40 s)' : 'Écriture des concepts, génération des scènes et composition… (~20-40 s)'}</p>}
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
                <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center' }}>
                  <button type="button" onClick={() => setPreview(a.url)} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Aperçu ⛶</button>
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-strong)' }}>Télécharger ↗</a>
                  <span style={{ flex: 1 }} />
                  <button type="button" onClick={() => archive(a.id)} title="Archiver ce rendu" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Archiver ✕</button>
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
const miniBtn = { fontSize: 12, fontWeight: 800, padding: '7px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)' } as const;
