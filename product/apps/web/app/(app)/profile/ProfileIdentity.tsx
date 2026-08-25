'use client';

import { useState } from 'react';
import { updateProfileAction } from '../../actions/admin';
import { input, lbl } from '../../../components/ui';

export function ProfileIdentity({ init }: {
  init: { name: string; email: string; avatarUrl: string; hidePersonalInfo: boolean };
}) {
  const [name, setName] = useState(init.name);
  const [avatarUrl, setAvatarUrl] = useState(init.avatarUrl);
  const [hide, setHide] = useState(init.hidePersonalInfo);
  const initial = (init.name || init.email).slice(0, 1).toUpperCase();

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
          <label style={lbl}>Photo de profil <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· URL d'image</span></label>
          <input name="avatarUrl" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…/photo.jpg" style={input} />
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
