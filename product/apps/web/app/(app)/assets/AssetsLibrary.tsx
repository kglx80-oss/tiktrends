'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadImageAssetsAction, importAssetAction, deleteAssetAction, toggleAssetAiAction, presignAssetUploadAction, registerUploadedAssetAction, tagAssetAction, tagUntaggedImagesAction, type AssetItem, type AssetKind } from '../../actions/assets';
import { Pager, PAGE_SIZE } from '../../../components/Pager';
import { GoogleDriveIcon } from '../../../components/BrandIcons';

const KINDS: Array<{ key: AssetKind | 'all'; label: string }> = [
  { key: 'all', label: 'Tous' }, { key: 'image', label: 'Images' }, { key: 'video', label: 'Vidéos' }, { key: 'audio', label: 'Audio' }, { key: 'other', label: 'Autres' },
];

/** Compresse une image navigateur en data URI léger. */
function fileToDataUri(file: File, maxSide = 1400, quality = 0.85): Promise<string> {
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

const kindIcon: Record<string, string> = { image: '🖼️', video: '🎬', audio: '🎵', other: '📎' };

/** PUT direct vers le bucket avec suivi de progression. */
function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('HTTP ' + xhr.status)));
    xhr.onerror = () => reject(new Error('Réseau / CORS'));
    xhr.send(file);
  });
}

export function AssetsLibrary({ initial, brandName, storageEnabled }: { initial: AssetItem[]; brandName: string | null; storageEnabled: boolean }) {
  const router = useRouter();
  const [assets, setAssets] = useState(initial);
  const [filter, setFilter] = useState<AssetKind | 'all'>('all');
  const [common, setCommon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showDrive, setShowDrive] = useState(false);
  const [driveText, setDriveText] = useState('');
  const [driveKind, setDriveKind] = useState<AssetKind>('video');
  const [imp, setImp] = useState({ name: '', url: '', kind: 'video' as AssetKind });
  const [search, setSearch] = useState('');
  const [tagging, setTagging] = useState<string | 'bulk' | ''>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const [page, setPage] = useState(0);

  // Après un router.refresh() (import Drive, upload…), adopter les données serveur fraîches.
  const initialIds = initial.map((a) => a.id).join(',');
  useEffect(() => { setAssets(initial); setPage(0); }, [initialIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = search.trim().toLowerCase();
  const filtered = assets
    .filter((a) => filter === 'all' || a.kind === filter)
    .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.tags || []).some((t) => t.toLowerCase().includes(q)));
  const shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const untagged = assets.filter((a) => a.kind === 'image' && (!a.tags || a.tags.length === 0)).length;
  const refresh = () => startTransition(() => router.refresh());

  async function tagOne(a: AssetItem) {
    if (tagging) return;
    setTagging(a.id); setMsg('');
    const r = await tagAssetAction({ id: a.id });
    setTagging('');
    if (r.error) { setMsg(r.error); return; }
    if (r.tags) setAssets((s) => s.map((x) => x.id === a.id ? { ...x, tags: r.tags! } : x));
  }
  async function tagBulk() {
    if (tagging) return;
    setTagging('bulk'); setMsg('');
    const r = await tagUntaggedImagesAction();
    setTagging('');
    if (r.error) { setMsg(r.error); return; }
    setMsg(`${r.tagged ?? 0} image(s) analysée(s).`);
    refresh();
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = '';
    if (!files.length) return;
    setMsg(''); setBusy(true);

    // Stockage objet configuré : upload direct de TOUT type (images, vidéos, audio) vers le bucket.
    if (storageEnabled) {
      let ok = 0; const errs: string[] = [];
      for (const f of files) {
        try {
          const pre = await presignAssetUploadAction({ filename: f.name, contentType: f.type || 'application/octet-stream', sizeBytes: f.size });
          if (pre.error || !pre.uploadUrl || !pre.publicUrl) { errs.push(`${f.name}: ${pre.error || 'échec'}`); continue; }
          setProgress({ name: f.name, pct: 0 });
          await putWithProgress(pre.uploadUrl, f, (pct) => setProgress({ name: f.name, pct }));
          const reg = await registerUploadedAssetAction({ name: f.name, url: pre.publicUrl, mimeType: f.type, sizeBytes: f.size, common });
          if (reg.error) { errs.push(`${f.name}: ${reg.error}`); continue; }
          ok++;
        } catch (e) { errs.push(`${f.name}: ${(e as Error).message}`); }
      }
      setProgress(null); setBusy(false);
      setMsg(errs.length ? `${ok} fichier(s) ajouté(s). Échecs : ${errs.slice(0, 3).join(' · ')}` : `${ok} fichier(s) ajouté(s).`);
      refresh();
      return;
    }

    // Fallback (pas de stockage objet) : images compressées en data URI, le reste par lien.
    try {
      const imgs = files.filter((f) => /^image\//.test(f.type));
      const others = files.filter((f) => !/^image\//.test(f.type));
      if (imgs.length) {
        const items = await Promise.all(imgs.map(async (f) => ({ name: f.name, dataUri: await fileToDataUri(f) })));
        const r = await uploadImageAssetsAction({ items, common });
        if (r.error) { setMsg(r.error); setBusy(false); return; }
      }
      setBusy(false);
      setMsg(others.length
        ? `${imgs.length} image(s) ajoutée(s). Sans stockage objet, les vidéos/audio s'ajoutent par lien.`
        : `${imgs.length} image(s) ajoutée(s).`);
      refresh();
    } catch { setBusy(false); setMsg('Échec du téléversement.'); }
  }

  async function doImport() {
    if (busy) return;
    setMsg(''); setBusy(true);
    const r = await importAssetAction({ ...imp, common });
    setBusy(false);
    if (r.error) { setMsg(r.error); return; }
    setImp({ name: '', url: '', kind: 'video' }); setShowImport(false);
    refresh();
  }

  async function importDrive() {
    if (busy) return;
    const links = driveText.split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l));
    if (!links.length) { setMsg('Colle au moins un lien Google Drive valide.'); return; }
    // Un lien de DOSSIER ne peut pas être déplié ici : on oriente vers la connexion automatique.
    if (links.some((l) => /\/folders\//i.test(l))) {
      setMsg('Un des liens est un DOSSIER Drive. Pour synchroniser tout un dossier, utilise « Google Drive · connexion automatique » en haut. Ici, colle plutôt le lien de partage de chaque fichier.');
      return;
    }
    setMsg(''); setBusy(true);
    let ok = 0; const errs: string[] = [];
    for (const url of links) {
      const name = decodeURIComponent(url.split('/').filter(Boolean).slice(-2, -1)[0] || 'Drive');
      const r = await importAssetAction({ name, url, kind: driveKind, common });
      if (r.error) errs.push(r.error); else ok++;
    }
    setBusy(false);
    setMsg(errs.length ? `${ok} importé(s) · ${errs[0]}` : `${ok} fichier(s) importé(s) depuis Drive.`);
    if (ok) { setDriveText(''); setShowDrive(false); }
    refresh();
  }

  async function toggleAi(a: AssetItem) {
    setAssets((s) => s.map((x) => x.id === a.id ? { ...x, useForAi: !x.useForAi } : x));
    await toggleAssetAiAction({ id: a.id, useForAi: !a.useForAi });
  }
  async function remove(a: AssetItem) {
    setAssets((s) => s.filter((x) => x.id !== a.id));
    await deleteAssetAction({ id: a.id });
  }

  return (
    <div>
      {/* Barre d'actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input ref={fileRef} type="file" accept={storageEnabled ? 'image/*,video/*,audio/*' : 'image/*'} multiple onChange={onFiles} style={{ display: 'none' }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} style={primary}>
          {busy ? 'Traitement…' : storageEnabled ? '⬆ Téléverser des fichiers' : '⬆ Téléverser des images'}
        </button>
        <button type="button" onClick={() => { setShowDrive((v) => !v); setShowImport(false); }} style={{ ...ghost, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <GoogleDriveIcon size={15} /> Google Drive
        </button>
        <button type="button" onClick={() => { setShowImport((v) => !v); setShowDrive(false); }} style={ghost}>🔗 Importer par lien</button>
        {progress && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-2)' }}>
            <span style={{ width: 90, height: 6, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${progress.pct}%`, background: 'var(--grad-accent)' }} />
            </span>
            {progress.pct}% · {progress.name.slice(0, 22)}
          </span>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={common} onChange={(e) => setCommon(e.target.checked)} />
          Commun à l'espace {brandName && <span style={{ color: 'var(--muted)' }}>(sinon rattaché à {brandName})</span>}
        </label>
        {msg && <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexBasis: '100%' }}>{msg}</span>}
      </div>

      {/* Google Drive · import de liens (fichiers ou dossier partagé) */}
      {showDrive && (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 14, background: 'linear-gradient(180deg, rgba(66,133,244,.06), var(--surface))', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <GoogleDriveIcon size={18} />
            <b style={{ fontSize: 14, color: 'var(--ink)' }}>Importer depuis Google Drive</b>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            Colle un ou plusieurs <b>liens de partage Drive</b> (un par ligne). Assure-toi que le partage est réglé sur
            « Tous les utilisateurs disposant du lien ». Les fichiers deviennent des assets utilisables par l'IA.
          </p>
          <textarea value={driveText} onChange={(e) => setDriveText(e.target.value)} placeholder={'https://drive.google.com/file/d/…\nhttps://drive.google.com/file/d/…'}
            style={{ ...fld, minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--ink-2)' }}>Type&nbsp;
              <select value={driveKind} onChange={(e) => setDriveKind(e.target.value as AssetKind)} style={{ ...fld, width: 130, padding: '7px 9px', display: 'inline-block' }}>
                <option value="video">Vidéo</option><option value="image">Image</option><option value="audio">Audio</option><option value="other">Autre</option>
              </select>
            </label>
            <button type="button" onClick={importDrive} disabled={busy} style={primary}>{busy ? 'Import…' : 'Importer depuis Drive'}</button>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--muted)' }}>Astuce : pour une synchro continue d'un dossier entier, utilise la <b>connexion Drive automatique</b> (encadré ci-dessus, ADMIN+). Cet import par lien reste pratique pour quelques fichiers ponctuels.</p>
        </div>
      )}

      {/* Import par lien */}
      {showImport && (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 14, background: 'var(--surface)', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 300px' }}><label style={lbl}>URL (vidéo, audio, image, Google Drive…)</label><input value={imp.url} onChange={(e) => setImp((s) => ({ ...s, url: e.target.value }))} placeholder="https://…" style={fld} /></div>
            <div style={{ flex: '1 1 160px' }}><label style={lbl}>Nom</label><input value={imp.name} onChange={(e) => setImp((s) => ({ ...s, name: e.target.value }))} placeholder="Rush produit 01" style={fld} /></div>
            <div><label style={lbl}>Type</label>
              <select value={imp.kind} onChange={(e) => setImp((s) => ({ ...s, kind: e.target.value as AssetKind }))} style={{ ...fld, width: 130 }}>
                <option value="video">Vidéo</option><option value="image">Image</option><option value="audio">Audio</option><option value="other">Autre</option>
              </select>
            </div>
            <button type="button" onClick={doImport} disabled={busy} style={primary}>Importer</button>
          </div>
        </div>
      )}

      {/* Recherche + tagging IA */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Rechercher par nom ou tag (IA)…"
          style={{ ...fld, flex: '1 1 260px', maxWidth: 420 }} />
        {untagged > 0 && (
          <button type="button" onClick={tagBulk} disabled={!!tagging} style={{ ...ghost, borderColor: 'var(--accent-strong)', color: 'var(--accent-strong)' }}>
            {tagging === 'bulk' ? 'Analyse…' : `✦ Analyser ${untagged} image(s)`}
          </button>
        )}
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>1 crédit / image</span>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {KINDS.map((k) => {
          const active = filter === k.key;
          const n = k.key === 'all' ? assets.length : assets.filter((a) => a.kind === k.key).length;
          return (
            <button key={k.key} type="button" onClick={() => { setFilter(k.key); setPage(0); }} style={{ padding: '7px 13px', borderRadius: 999, border: `1px solid ${active ? 'transparent' : 'var(--line-2)'}`, background: active ? 'var(--grad-accent)' : 'transparent', color: active ? '#0d070c' : 'var(--ink-2)', fontWeight: active ? 800 : 600, fontSize: 12.5, cursor: 'pointer' }}>
              {k.label} <span style={{ opacity: .7 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Grille */}
      {shown.length === 0 ? (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 30 }}>🗂️</div>
          <p style={{ margin: '10px 0 0', fontSize: 13.5 }}>Aucun asset. Téléverse tes images ou importe tes rushs par lien · l'IA s'en servira automatiquement.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          {shown.map((a) => (
            <div key={a.id} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ aspectRatio: '1 / 1', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {a.kind === 'image'
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={a.url} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : a.kind === 'video' && a.source === 'upload'
                    ? <video src={a.url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 40 }}>{kindIcon[a.kind]}</span>}
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>{a.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--muted)' }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>{a.kind}</span>
                  {a.brandId ? <span>· marque</span> : <span>· commun</span>}
                  {a.source !== 'upload' && <span>· lien</span>}
                </div>
                {/* Tags IA */}
                {a.tags && a.tags.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {a.tags.slice(0, 4).map((t) => (
                      <span key={t} style={{ fontSize: 10, color: 'var(--ink-2)', background: 'rgba(255,255,255,.05)', border: '1px solid var(--line)', borderRadius: 999, padding: '1px 7px' }}>{t}</span>
                    ))}
                  </div>
                ) : a.kind === 'image' ? (
                  <button type="button" onClick={() => tagOne(a)} disabled={!!tagging} style={{ alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 700, color: 'var(--accent-strong)', background: 'transparent', border: '1px solid var(--line-2)', borderRadius: 999, padding: '3px 9px', cursor: tagging ? 'default' : 'pointer' }}>
                    {tagging === a.id ? 'Analyse…' : '✦ Analyser (1 cr.)'}
                  </button>
                ) : null}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
                  <label title="Utilisable par l'IA" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: a.useForAi ? '#7ee8bf' : 'var(--muted)', cursor: 'pointer', flex: 1 }}>
                    <input type="checkbox" checked={a.useForAi} onChange={() => toggleAi(a)} style={{ accentColor: '#7ee8bf' }} />
                    IA
                  </label>
                  {a.source !== 'upload' && <a href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'none' }}>ouvrir ↗</a>}
                  <button type="button" onClick={() => remove(a)} style={{ fontSize: 11, color: '#ff9db0', background: 'transparent', border: 'none', cursor: 'pointer' }}>Suppr.</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pager page={page} total={filtered.length} onPage={setPage} />
    </div>
  );
}

const fld = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 13.5, outline: 'none' } as const;
const lbl = { fontSize: 12, color: 'var(--ink-2)', display: 'block', marginBottom: 5 } as const;
const primary = { padding: '10px 16px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13, cursor: 'pointer' } as const;
const ghost = { padding: '10px 16px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer' } as const;
