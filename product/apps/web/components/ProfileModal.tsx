'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { saveProfileAction } from '../app/actions/admin';
import { avatarToDataUri } from '../lib/avatar';
import { Modal } from './Modal';
import { input, lbl } from './ui';

interface Init { name: string; email: string; avatarUrl: string; hidePersonalInfo: boolean }

/** Édition rapide du profil en pop-up (photo, nom, confidentialité) · sans quitter la page. */
export function ProfileModal({ open, onClose, init }: { open: boolean; onClose: () => void; init: Init }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveProfileAction, null);
  const [avatarUrl, setAvatarUrl] = useState(init.avatarUrl);
  const [hide, setHide] = useState(init.hidePersonalInfo);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const initial = (init.name || init.email).slice(0, 1).toUpperCase();

  // À l'ouverture, on repart des valeurs courantes.
  useEffect(() => { if (open) { setAvatarUrl(init.avatarUrl); setHide(init.hidePersonalInfo); setErr(''); } }, [open, init.avatarUrl, init.hidePersonalInfo]);
  // Enregistré : on rafraîchit et on ferme.
  useEffect(() => { if (state?.ok) { router.refresh(); onClose(); } }, [state, router, onClose]);

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
    <Modal open={open} onClose={onClose} icon="👤" title="Mon profil" subtitle="Ta photo, ton nom et la confidentialité de tes informations.">
      <form action={formAction} style={{ display: 'grid', gap: 16 }}>
        {/* Photo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', overflow: 'hidden', background: 'var(--paper)', border: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {avatarUrl.trim()
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{initial}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'default' : 'pointer' }}>
                {busy ? 'Traitement…' : '⬆ Photo'}
              </button>
              {avatarUrl.trim() && <button type="button" onClick={() => setAvatarUrl('')} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--muted)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Retirer</button>}
            </div>
            {err && <div style={{ fontSize: 12, color: '#ff9db0', marginTop: 6 }}>{err}</div>}
            <input type="hidden" name="avatarUrl" value={avatarUrl} />
          </div>
        </div>

        {/* Nom */}
        <div>
          <label style={lbl}>Nom complet</label>
          <input name="name" defaultValue={init.name} placeholder="Ton nom" style={input} />
        </div>

        {/* E-mail (lecture seule) */}
        <div>
          <label style={lbl}>E-mail <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· identifiant</span></label>
          <input value={init.email} disabled style={{ ...input, opacity: .6 }} />
        </div>

        {/* Masquer infos perso */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <input type="checkbox" name="hidePersonalInfo" checked={hide} onChange={(e) => setHide(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
          <span style={{ position: 'relative', width: 40, height: 22, borderRadius: 999, background: hide ? 'var(--grad-accent)' : 'var(--line-2)', transition: 'background .2s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 2, left: hide ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Masquer mes informations personnelles<span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, color: 'var(--muted)' }}>Cache nom et e-mail dans les vues partagées.</span></span>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Link href="/profile" onClick={onClose} style={{ fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none' }}>Sécurité & options ›</Link>
          <button type="submit" disabled={pending} style={{ padding: '11px 22px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5, cursor: pending ? 'default' : 'pointer', background: 'var(--grad-accent)', color: '#0d070c', opacity: pending ? .6 : 1 }}>
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
