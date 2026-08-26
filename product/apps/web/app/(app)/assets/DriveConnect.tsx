'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { listDriveFoldersAction, setDriveFolderAction, syncDriveNowAction, disconnectDriveAction, type DriveState } from '../../actions/drive';
import { GoogleDriveIcon } from '../../../components/BrandIcons';

type Folder = { id: string; name: string };

/** Connexion automatique Google Drive : dossier synchronisé en continu vers la bibliothèque. */
export function DriveConnect({ state }: { state: DriveState }) {
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<'' | 'folders' | 'pick' | 'sync'>('');
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  // Après connexion OAuth (?ok=drive), on ouvre d'office le sélecteur de dossier.
  useEffect(() => {
    if (state.connected && !state.folderId) setOpen(true);
  }, [state.connected, state.folderId]);

  async function loadFolders() {
    setBusy('folders'); setMsg('');
    const r = await listDriveFoldersAction();
    setBusy('');
    if (r.error) { setMsg(r.error); return; }
    setFolders(r.folders ?? []);
    setOpen(true);
  }
  async function pick(f: Folder) {
    setBusy('pick'); setMsg('');
    const r = await setDriveFolderAction({ folderId: f.id, folderName: f.name });
    setBusy('');
    if (r.error) { setMsg(r.error); return; }
    setOpen(false);
    refresh();
    // Première synchro immédiate.
    void doSync();
  }
  async function doSync() {
    setBusy('sync'); setMsg('');
    const r = await syncDriveNowAction();
    setBusy('');
    if (r.error) { setMsg(r.error); return; }
    setMsg(`${r.added ?? 0} asset(s) ajouté(s)${r.skipped ? ` · ${r.skipped} déjà présent(s)` : ''}.`);
    refresh();
  }
  async function disconnect() {
    setBusy('sync'); setMsg('');
    await disconnectDriveAction();
    setBusy(''); setFolders(null); setOpen(false);
    refresh();
  }

  if (!state.available) {
    return (
      <div style={card}>
        <Head />
        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          La connexion Drive automatique n'est pas encore configurée (variables <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code>).
          En attendant, l'import par lien reste disponible ci-dessous.
        </p>
      </div>
    );
  }

  return (
    <div style={card}>
      <Head />
      {!state.connected ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            Connecte ton compte Google et choisis un dossier : ses images, vidéos et audio remontent automatiquement
            dans la bibliothèque et deviennent mobilisables par l'IA. Synchro quotidienne + à la demande.
          </p>
          <a href="/api/oauth/google" style={{ ...primary, textDecoration: 'none', display: 'inline-block' }}>Connecter Google Drive</a>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, color: 'var(--ink-2)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: '#7ee8bf', display: 'inline-block' }} /> Connecté
            </span>
            {state.folderName
              ? <span>· Dossier <b style={{ color: 'var(--ink)' }}>{state.folderName}</b></span>
              : <span style={{ color: '#ffcf8f' }}>· Aucun dossier sélectionné</span>}
            {state.syncedAt && <span style={{ color: 'var(--muted)' }}>· Dernière synchro {new Date(state.syncedAt).toLocaleString('fr-FR')}</span>}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" onClick={loadFolders} disabled={!!busy} style={ghost}>
              {busy === 'folders' ? 'Chargement…' : state.folderId ? 'Changer de dossier' : 'Choisir un dossier'}
            </button>
            {state.folderId && (
              <button type="button" onClick={doSync} disabled={!!busy} style={primary}>
                {busy === 'sync' ? 'Synchro…' : '⟳ Synchroniser maintenant'}
              </button>
            )}
            <button type="button" onClick={disconnect} disabled={!!busy} style={{ ...ghost, color: '#ff9db0', borderColor: 'var(--line-2)' }}>Déconnecter</button>
          </div>

          {open && folders && (
            <div style={{ marginTop: 12, border: '1px solid var(--line-2)', borderRadius: 12, background: 'var(--surface)', maxHeight: 240, overflow: 'auto' }}>
              {folders.length === 0
                ? <p style={{ margin: 0, padding: 14, fontSize: 12.5, color: 'var(--muted)' }}>Aucun dossier trouvé sur ce compte Drive.</p>
                : folders.map((f) => (
                  <button key={f.id} type="button" onClick={() => pick(f)} disabled={!!busy}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer' }}>
                    <span aria-hidden>📁</span> {f.name}
                    {state.folderId === f.id && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#7ee8bf' }}>actuel</span>}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
      {msg && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-2)' }}>{msg}</p>}
    </div>
  );
}

function Head() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <GoogleDriveIcon size={19} />
      <b style={{ fontSize: 14, color: 'var(--ink)' }}>Google Drive · connexion automatique</b>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '2px 8px', borderRadius: 999, color: 'var(--ink-2)', border: '1px solid var(--line-2)' }}>ADMIN+</span>
    </div>
  );
}

const card = { border: '1px solid var(--line-2)', borderRadius: 16, background: 'linear-gradient(180deg, rgba(66,133,244,.06), var(--surface))', padding: 18, marginBottom: 16 } as const;
const primary = { padding: '10px 16px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13, cursor: 'pointer' } as const;
const ghost = { padding: '10px 16px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer' } as const;
