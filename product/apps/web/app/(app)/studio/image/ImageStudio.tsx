'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { generateImageAction, suggestImageBriefAction, setProductImageAction, type BrandImage } from '../../../actions/image';
import { archiveCreativeAction } from '../../../actions/creatives';
import type { FalAspect } from '@tiktrends/integrations';
import { IMAGE_MODELS, imageModelByKey } from '@tiktrends/core';
import { Pager, PAGE_SIZE } from '../../../../components/Pager';
import { DropZone } from '../../../../components/DropZone';
import { CreativeActions } from '../../../../components/CreativeActions';
import { Empty } from '../../../../components/Empty';
import { Composer } from '../../../../components/Composer';
import { usePreflight } from '../../../../components/usePreflight';
import { useScenes } from '../../../../components/useScenes';

const RATIOS: FalAspect[] = ['9:16', '4:5', '1:1', '16:9'];
const fld = { width: '100%', padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 14, outline: 'none' } as const;

type Product = { id: string; name: string; hasImage: boolean };

/** Redimensionne et compresse une image côté navigateur en data URI (jpeg) · léger et directement exploitable par Fal. */
function fileToDataUri(file: File, maxSide = 1280, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponible.'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ImageStudio({ ready, aiReady, brandName, initial, products, brandColors }: {
  ready: boolean; aiReady: boolean; brandName: string | null; initial: BrandImage[];
  products: Product[]; brandColors: string[];
}) {
  const [mode, setMode] = useState<'t2i' | 'i2i'>('i2i');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploadedUri, setUploadedUri] = useState('');
  const [ratio, setRatio] = useState<FalAspect>('1:1');
  const [withText, setWithText] = useState(false);
  const [headline, setHeadline] = useState('');
  const [productId, setProductId] = useState('');
  const [prods, setProds] = useState<Product[]>(products);
  const [enhance, setEnhance] = useState(aiReady);
  // Le moteur · le studio Image n'en proposait aucun, il subissait celui de
  // l'environnement. Pubs IA le choisissait depuis toujours.
  const [model, setModel] = useState('nano');
  const modelSpec = imageModelByKey(model);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [images, setImages] = useState<BrandImage[]>(initial);
  const [imgPage, setImgPage] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [suggesting, startSuggest] = useTransition();
  const [saving, startSave] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  // La scène reprise, s'il y en a une · consignée à la génération, c'est ce qui
  // permet de lui bâtir un bilan. Toute frappe dans la barre la libère : un
  // texte retouché n'est plus la scène enregistrée, et lui en attribuer le
  // résultat fausserait le seul chiffre qui a de la valeur ici.
  const [sceneId, setSceneId] = useState('');
  // Ce que la mémoire dit de la description AVANT de payer la génération ·
  // le brief de pré-lancement n'arrivait qu'une fois la créa posée dans un lot,
  // c'est-à-dire après l'avoir fabriquée. Ici, il économise les deux.
  const preflight = usePreflight(prompt);
  const { scenes, enregistrer, erreur: sceneErreur, conseil } = useScenes('image');

  const selected = useMemo(() => prods.find((p) => p.id === productId) || null, [prods, productId]);
  // En mode « mise en scène », la source produit = photo uploadée, sinon la photo enregistrée sur le produit.
  const productPhotoReady = !!uploadedUri || !!selected?.hasImage;

  function suggest() {
    if (suggesting) return;
    setError('');
    startSuggest(async () => {
      const r = await suggestImageBriefAction({ productId: productId || undefined });
      if (r.error) setError(r.error);
      else if (r.text) { setPrompt(r.text); setSceneId(''); }
    });
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setNotice('');
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { setError('Formats acceptés : jpg, png, webp.'); return; }
    try {
      const uri = await fileToDataUri(file);
      setUploadedUri(uri);
      setImageUrl('');
    } catch (err) { setError((err as Error).message); }
  }

  function onDropImages(uris: string[]) {
    const uri = uris[0];
    if (!uri) return;
    setError(''); setNotice('');
    if (/^data:/.test(uri)) { setUploadedUri(uri); setImageUrl(''); }
    else { setImageUrl(uri); setUploadedUri(''); }
  }

  function saveForProduct() {
    if (!productId || !uploadedUri || saving) return;
    setError(''); setNotice('');
    startSave(async () => {
      const r = await setProductImageAction({ productId, dataUri: uploadedUri });
      if (r.error) { setError(r.error); return; }
      setProds((list) => list.map((p) => (p.id === productId ? { ...p, hasImage: true } : p)));
      setNotice(`Photo enregistrée pour « ${selected?.name ?? 'ce produit'} ». Elle sera réutilisée automatiquement.`);
    });
  }

  async function run() {
    if (busy) return;
    if (!prompt.trim()) { setError("Décris l'image à générer."); return; }
    const usesProduct = mode === 'i2i';
    const source = uploadedUri || imageUrl.trim();
    if (usesProduct && !source && !selected?.hasImage) {
      setError("Ajoute une photo de ton produit (ou colle un lien direct vers l'image).");
      return;
    }
    setError(''); setNotice(''); setBusy(true);
    const res = await generateImageAction({
      prompt, aspectRatio: ratio,
      imageUrl: usesProduct ? (source || undefined) : undefined,
      useProductImage: usesProduct,
      withText, enhance, count, productId: productId || undefined, headline: withText ? headline : undefined,
      presetId: sceneId || undefined, model,
    });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (res.images) {
      // Id réel « genId:url » quand disponible (permet note Jarvis + archivage immédiats).
      const fresh: BrandImage[] = res.images.map((url, i) => ({ id: res.generationId ? `${res.generationId}:${url}` : 'new-' + i + '-' + url, prompt: res.prompt || prompt, url, createdAt: new Date().toISOString(), rating: null }));
      setImages((list) => [...fresh, ...list]);
    }
  }

  /** Décline 3 variantes d'un visuel existant : même brief, nouvelles interprétations. */
  async function vary(im: BrandImage) {
    if (busy || !im.prompt) return;
    setError(''); setNotice(''); setBusy(true);
    const res = await generateImageAction({ prompt: im.prompt, aspectRatio: ratio, count: 3, model });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (res.images) {
      const fresh: BrandImage[] = res.images.map((url, i) => ({ id: res.generationId ? `${res.generationId}:${url}` : 'new-' + i + '-' + url, prompt: res.prompt || im.prompt, url, createdAt: new Date().toISOString(), rating: null }));
      setImages((list) => [...fresh, ...list]);
      setNotice('3 variantes ajoutées.');
    }
  }

  async function archiveImage(id: string) {
    setImages((list) => list.filter((im) => im.id !== id));
    if (!id.startsWith('new-')) await archiveCreativeAction({ id });
  }

  return (
    <div>
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', padding: 22, marginBottom: 28 }}>
        {!ready && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(245,166,35,.4)', background: 'rgba(245,166,35,.10)', marginBottom: 18 }}>
            <span style={{ fontSize: 20 }}>🔒</span>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              <b style={{ color: 'var(--ink)' }}>Image IA en attente de la clé Fal.</b> Cette fonction utilise Fal.ai (Flux / Ideogram / Kontext).
              Une fois <code style={{ fontSize: 12 }}>FAL_KEY</code> posée sur le serveur, elle s'active ici.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([['i2i', 'Mise en scène produit'], ['t2i', 'Texte → Image']] as const).map(([k, label]) => (
            <button key={k} type="button" disabled={!ready} onClick={() => setMode(k)} style={{
              fontSize: 13, fontWeight: mode === k ? 800 : 600, padding: '9px 15px', borderRadius: 12, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : .55,
              border: `1px solid ${mode === k ? 'transparent' : 'var(--line-2)'}`,
              background: mode === k ? 'var(--grad-accent)' : 'transparent', color: mode === k ? '#0d070c' : 'var(--ink-2)',
            }}>{label}</button>
          ))}
        </div>

        {/* Contexte marque : produit + DA appliqués automatiquement */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {prods.length > 0 && (
            <div>
              <label style={lbl}>Produit de la marque</label>
              <select value={productId} onChange={(e) => { setProductId(e.target.value); setUploadedUri(''); setNotice(''); }} disabled={!ready} style={{ ...fld, width: 'auto', minWidth: 200, padding: '9px 10px' }}>
                <option value="">· Aucun (générique)</option>
                {prods.map((p) => <option key={p.id} value={p.id}>{p.name}{p.hasImage ? ' · 📷' : ''}</option>)}
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
          <DropZone onImages={onDropImages} onError={setError} disabled={!ready || busy} hint="Déposer la photo produit" style={{ marginBottom: 12, padding: 14, border: '1px solid var(--line-2)', background: 'rgba(255,255,255,.02)' }}>
            <label style={lbl}>Photo de ton produit <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· on garde ton vrai packaging, on ne change que la scène (Kontext) · <b style={{ color: 'var(--ink-2)' }}>glisse-dépose une photo</b></span></label>

            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {/* Aperçu : upload en cours, sinon photo déjà enregistrée sur le produit */}
              {uploadedUri ? (
                 
                <img src={uploadedUri} alt="" style={thumb} />
              ) : selected?.hasImage ? (
                <div style={{ ...thumb, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 11, color: 'var(--muted)', padding: 8 }}>📷 Photo<br />enregistrée</div>
              ) : (
                <div style={{ ...thumb, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: 'var(--muted)' }}>📦</div>
              )}

              <div style={{ flex: '1 1 260px', minWidth: 220 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickFile} disabled={!ready || busy} style={{ display: 'none' }} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={!ready || busy} style={{
                    fontSize: 12.5, fontWeight: 800, padding: '8px 13px', borderRadius: 999, cursor: ready && !busy ? 'pointer' : 'default',
                    border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', opacity: ready ? 1 : .55,
                  }}>⬆ {uploadedUri ? 'Changer la photo' : 'Importer une photo'}</button>
                  {uploadedUri && productId && (
                    <button type="button" onClick={saveForProduct} disabled={saving} style={{
                      fontSize: 12.5, fontWeight: 800, padding: '8px 13px', borderRadius: 999, cursor: saving ? 'default' : 'pointer',
                      border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--accent-strong)',
                    }}>{saving ? 'Enregistrement…' : '💾 Enregistrer pour ce produit'}</button>
                  )}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                  {selected?.hasImage && !uploadedUri
                    ? `La photo enregistrée de « ${selected.name} » sera utilisée. Importe-en une autre pour la remplacer.`
                    : "Importe le visuel packshot de ton produit (jpg, png, webp). Redimensionné automatiquement."}
                </p>
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer' }}>ou coller un lien direct vers l'image</summary>
                  <input value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); setUploadedUri(''); }} disabled={!ready || busy} placeholder="https://…/produit.jpg" style={{ ...fld, marginTop: 8 }} />
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>Lien direct vers le fichier image, pas la page produit (clic droit → « Copier l'adresse de l'image »).</p>
                </details>
              </div>
            </div>
          </DropZone>
        )}

        {/* La barre de composition · la description prend toute la place, les
            réglages deviennent des pastilles, le prix est sur le bouton. */}
        <Composer
          value={prompt}
          onChange={(v) => { setPrompt(v); setSceneId(''); }}
          placeholder={mode === 't2i'
            ? 'Décris la scène que tu imagines · ex : boisson énergisante sur un bureau lumineux, ambiance productive, gros plan'
            : 'Décris la scène autour du produit · ex : posé sur une table en marbre, lumière douce du matin, feuillage flou en arrière-plan'}
          disabled={!ready}
          busy={busy}
          scenes={scenes}
          onPickScene={(s) => setSceneId(s.id)}
          advice={conseil(sceneId)}
          preflight={preflight}
          onSaveScene={enregistrer}
          onAttach={mode === 'i2i' ? () => fileRef.current?.click() : undefined}
          attachLabel="Ajouter la photo de ton produit"
          attachedCount={uploadedUri || imageUrl.trim() || selected?.hasImage ? 1 : 0}
          controls={[
            {
              key: 'ratio', title: 'Format', icon: '⬚',
              options: RATIOS.map((r) => ({ value: r, label: r })),
              value: ratio, onChange: (v) => setRatio(v as FalAspect),
            },
            {
              key: 'count', title: 'Nombre de visuels', icon: '⧉',
              options: [1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n} image${n > 1 ? 's' : ''}` })),
              value: String(count), onChange: (v) => setCount(Number(v)),
            },
            {
              key: 'modele', title: 'Moteur d’image', icon: '✦',
              options: IMAGE_MODELS.map((m) => ({ value: m.key, label: `${m.label}${m.recommended ? ' · recommandé' : ''}` })),
              value: model, onChange: setModel,
            },
          ]}
          toggles={[
            { key: 'withText', label: 'Texte lisible', value: withText, onChange: setWithText },
            { key: 'enhance', label: 'Prompt optimisé', value: enhance, onChange: setEnhance, disabled: !aiReady },
          ]}
          extra={
            <>
              <button type="button" onClick={suggest} disabled={!ready || !aiReady || suggesting} title={aiReady ? 'Propose une description à partir de ta marque et du produit' : 'IA non configurée'} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 999,
                cursor: ready && aiReady && !suggesting ? 'pointer' : 'default', whiteSpace: 'nowrap',
                border: '1px solid var(--line-2)', background: 'transparent', color: aiReady ? 'var(--accent-strong)' : 'var(--muted)', opacity: ready && aiReady ? 1 : .55,
              }}>✦ {suggesting ? 'Rédaction…' : 'Proposer une description'}</button>
              {withText && (
                <input value={headline} onChange={(e) => setHeadline(e.target.value)} disabled={!ready}
                  placeholder="Accroche à écrire sur l’image"
                  style={{ ...fld, width: 'auto', flex: '1 1 200px', minWidth: 160, padding: '7px 11px', fontSize: 12.5, borderRadius: 999 }} />
              )}
            </>
          }
          cost={{
            credits: modelSpec.credits * count,
            note: `${modelSpec.label} · ${modelSpec.credits} crédits par visuel · ${modelSpec.note}${mode === 'i2i' && !productPhotoReady ? ' · ajoute une photo produit pour l’édition fidèle' : ''}`,
          }}
          onGenerate={run}
          generateLabel="Générer"
        />
        {sceneErreur && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(255,77,109,.4)', background: 'rgba(255,77,109,.10)', color: '#ff9db0' }}>{sceneErreur}</div>}
        {notice && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(120,220,150,.4)', background: 'rgba(120,220,150,.10)', color: '#9fe6b3' }}>{notice}</div>}
        {error && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(255,77,109,.4)', background: 'rgba(255,77,109,.10)', color: '#ff9db0' }}>{error}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Tes visuels {brandName ? <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>· {brandName}</span> : null}</h2>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{images.length}</span>
      </div>
      {images.length === 0 ? (
        <Empty
          tone="wait" title="Aucun visuel pour l’instant."
          why="Décris ce que tu veux voir dans le champ ci-dessus · les visuels générés s’empilent ici."
        />
      ) : (
        <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {images.slice(imgPage * PAGE_SIZE, (imgPage + 1) * PAGE_SIZE).map((im) => (
            <div key={im.id} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
              {im.url && (
                <button type="button" onClick={() => setPreview(im.url)} style={{ display: 'block', width: '100%', padding: 0, border: 'none', cursor: 'zoom-in', background: 'transparent' }}>
                  { }
                  <img src={im.url} alt="" loading="lazy" decoding="async" style={{ width: '100%', display: 'block', aspectRatio: '1/1', objectFit: 'cover' }} />
                </button>
              )}
              <div style={{ padding: '9px 11px' }}>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{im.prompt}</p>
                <div style={{ marginTop: 8 }}>
                  <CreativeActions genId={im.id} rating={im.rating} onOpen={im.url ? () => setPreview(im.url) : undefined} downloadUrl={im.url} onArchive={() => archiveImage(im.id)} />
                </div>
                {im.prompt && (
                  <button type="button" onClick={() => vary(im)} disabled={busy || !ready} title="3 variantes du même brief" style={{
                    marginTop: 6, width: '100%', padding: '6px 10px', borderRadius: 9, fontSize: 11.5, fontWeight: 700,
                    border: '1px solid rgba(254,44,85,.3)', background: 'transparent', color: 'var(--accent-strong)',
                    cursor: busy || !ready ? 'default' : 'pointer', opacity: busy || !ready ? .5 : 1,
                  }}>✨ Varier (3)</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <Pager page={imgPage} total={images.length} onPage={setImgPage} /></>
      )}

      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}>
          { }
          <img src={preview} alt="" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 12, boxShadow: '0 30px 80px -20px rgba(0,0,0,.8)' }} />
          <button type="button" onClick={() => setPreview(null)} aria-label="Fermer" style={{ position: 'fixed', top: 18, right: 20, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
      )}
    </div>
  );
}

const lbl = { fontSize: 13, color: 'var(--ink-2)', display: 'block', marginBottom: 6 } as const;
const thumb = { width: 88, height: 88, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--line-2)', background: 'rgba(255,255,255,.03)', flexShrink: 0 } as const;
