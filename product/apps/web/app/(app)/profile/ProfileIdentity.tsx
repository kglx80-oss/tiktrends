'use client';

import { useRef, useState } from 'react';
import { updateProfileAction } from '../../actions/admin';
import { input, lbl } from '../../../components/ui';

/** Redimensionne une photo (navigateur) en petit data URI carré · léger pour la BDD. */
function avatarToDataUri(file: File, side = 256, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture impossible.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible.'));
      img.onload = () => {
        // Recadrage centré carré.
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
        const canvas = document.createElement('canvas'); canvas.width = side; canvas.height = side;
        const ctx = canvas.getContext('2d'); if (!ctx) return reject(new Error('Canvas indisponible.'));
        ctx.drawImage(img, sx, sy, min, min, 0, 0, side, side);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ProfileIdentity({ init }: {
  init: { name: string; email: string; avatarUrl: string; hidePersonalInfo: boolean };
}) {
  const [name, setName] = useState(init.name);
  const [avatarUrl, setAvatarUrl] = useState(init.avatarUrl);
  const [hide, setHide] = useState(init.hidePersonalInfo);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const initial = (init.name || init.email).slice(0, 1).toUpperCase();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    if (!/^image\//.test(file.type)) { setErr('Choisis un fichier image (jpg, png, webp).'); return; }
    setBusy(true);
    try { setAvatarUrl(await avatarToDataUri(file)); }
    catch { setErr('Impossible de lire cette image.'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  return (
    <form action={updateProfileAction} style={{ display: 'grid', gap: 18 }}>
      {/* Photo de profil */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 66, height: 66, borderRadius: '50%', overflow: 'hidden', background: 'var(--paper)', border: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {avatarUrl.trim()
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>{initial}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={lbl}>Photo de profil</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} style={{ padding: '9px 15px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: busy ? 'default' : 'pointer' }}>
              {busy ? 'Traitement…' : '⬆ Téléverser une photo'}
            </button>
            {avatarUrl.trim() && <button type="button" onClick={() => setAvatarUrl('')} style={{ padding: '9px 13px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--muted)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Retirer</button>}
          </div>
          {err && <div style={{ fontSize: 12, color: '#ff9db0', marginTop: 6 }}>{err}</div>}
          <p style={{ margin: '7px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>JPG, PNG ou WebP · recadrée en carré et optimisée automatiquement.</p>
          {/* La valeur (data URI ou URL) est envoyée avec le formulaire. */}
          <input type="hidden" name="avatarUrl" value={avatarUrl} />
        </div>
      </div>

      {/* Nom complet */}
      <div>
        <label style={lbl}>Nom complet</label>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ton nom" style={input} />
      </div>

      {/* E-mail (lecture seule) */}
      <div>
        <label style={lbl}>E-mail <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· identifiant de connexion</span></label>
        <input value={init.email} disabled style={{ ...input, opacity: .6 }} />
      </div>

      {/* Masquer les informations personnelles */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
        <input type="checkbox" name="hidePersonalInfo" checked={hide} onChange={(e) => setHide(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <span style={{ position: 'relative', width: 40, height: 22, borderRadius: 999, background: hide ? 'var(--grad-accent)' : 'var(--line-2)', transition: 'background .2s', flexShrink: 0 }}>
          <span style={{ position: 'absolute', top: 2, left: hide ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
        </span>
        <span>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Masquer les informations personnelles</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>Cache ton nom et ton e-mail dans les vues partagées (captures, démos).</span>
        </span>
      </label>

      <div>
        <button type="submit" style={{ padding: '11px 22px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', background: 'var(--grad-accent)', color: '#0d070c' }}>Enregistrer</button>
      </div>
    </form>
  );
}
