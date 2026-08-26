'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getDrivePickerConfigAction, setDriveFolderAction, syncDriveNowAction, syncDriveFilesAction, disconnectDriveAction, type DriveState } from '../../actions/drive';
import { GoogleDriveIcon } from '../../../components/BrandIcons';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { gapi?: any; google?: any } }

/** Charge le script Google API + le module Picker (une seule fois). */
function loadPicker(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window;
    if (w.google?.picker) return resolve(w.google.picker);
    const done = () => w.gapi.load('picker', { callback: () => resolve(w.google.picker), onerror: () => reject(new Error('Picker indisponible.')) });
    if (w.gapi) return done();
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = done;
    s.onerror = () => reject(new Error('Chargement du sélecteur Google impossible.'));
    document.body.appendChild(s);
  });
}

/** Connexion automatique Google Drive : dossier choisi via le sélecteur natif, synchronisé en continu. */
export function DriveConnect({ state }: { state: DriveState }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<'' | 'pick' | 'sync' | 'files'>('');
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  // Après connexion OAuth (?ok=drive), on ouvre d'office le sélecteur si aucun dossier choisi.
  useEffect(() => {
    if (state.connected && !state.folderId && state.pickerReady) void openPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.connected, state.folderId, state.pickerReady]);

  async function openPicker() {
    if (busy) return;
    setBusy('pick'); setMsg('');
    try {
      const cfg = await getDrivePickerConfigAction();
      if (cfg.error || !cfg.token) { setMsg(cfg.error || 'Connexion Drive requise.'); setBusy(''); return; }
      const picker = await loadPicker();
      const view = new picker.DocsView(picker.ViewId.FOLDERS).setSelectFolderEnabled(true).setMode(picker.DocsViewMode.LIST);
      const builder = new picker.PickerBuilder()
        .enableFeature(picker.Feature.SUPPORT_DRIVES)
        .setDeveloperKey(cfg.apiKey)
        .setOAuthToken(cfg.token)
        .addView(view)
        .setTitle('Choisis le dossier à synchroniser')
        .setCallback(async (data: any) => {
          if (data.action === picker.Action.PICKED) {
            const doc = data.docs?.[0];
            if (doc?.id) { await onFolderPicked(doc.id, doc.name || 'Dossier Drive'); }
          }
          if (data.action === picker.Action.PICKED || data.action === picker.Action.CANCEL) setBusy('');
        });
      if (cfg.appId) builder.setAppId(cfg.appId);
      builder.build().setVisible(true);
    } catch (e) { setMsg((e as Error).message); setBusy(''); }
  }

  async function onFolderPicked(folderId: string, folderName: string) {
    const r = await setDriveFolderAction({ folderId, folderName });
    if (r.error) { setMsg(r.error); return; }
    refresh();
    void doSync();
  }

  // Mode fiable : sélection directe de fichiers (marche même pour « Partagé avec moi »).
  async function openFilePicker() {
    if (busy) return;
    setBusy('files'); setMsg('');
    try {
      const cfg = await getDrivePickerConfigAction();
      if (cfg.error || !cfg.token) { setMsg(cfg.error || 'Connexion Drive requise.'); setBusy(''); return; }
      const picker = await loadPicker();
      const mimes = 'image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav';
      const mine = new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setMimeTypes(mimes);
      const shared = new picker.DocsView(picker.ViewId.DOCS).setOwnedByMe(false).setIncludeFolders(true).setSelectFolderEnabled(false).setMimeTypes(mimes);
      const builder = new picker.PickerBuilder()
        .enableFeature(picker.Feature.MULTISELECT_ENABLED)
        .enableFeature(picker.Feature.SUPPORT_DRIVES)
        .setDeveloperKey(cfg.apiKey)
        .setOAuthToken(cfg.token)
        .addView(mine)
        .addView(shared)
        .setTitle('Choisis les fichiers à importer (multi-sélection)')
        .setCallback(async (data: any) => {
          if (data.action === picker.Action.PICKED) {
            const files = (data.docs || []).map((d: any) => ({ id: d.id, name: d.name, mimeType: d.mimeType, sizeBytes: d.sizeBytes }));
            await syncPickedFiles(files);
          }
          if (data.action === picker.Action.CANCEL) setBusy('');
        });
      if (cfg.appId) builder.setAppId(cfg.appId);
      builder.build().setVisible(true);
    } catch (e) { setMsg((e as Error).message); setBusy(''); }
  }

  async function syncPickedFiles(files: Array<{ id: string; name: string; mimeType: string; sizeBytes?: number }>) {
    if (!files.length) { setBusy(''); return; }
    setMsg(`Import de ${files.length} fichier(s)…`);
    const r = await syncDriveFilesAction(files);
    setBusy('');
    if (r.error) { setMsg(r.error); return; }
    setMsg(`${r.added ?? 0} fichier(s) importé(s)${r.skipped ? ` · ${r.skipped} déjà présent(s)` : ''}.`);
    refresh();
  }

  async function doSync() {
    setBusy('sync'); setMsg('');
    const r = await syncDriveNowAction();
    setBusy('');
    if (r.error) { setMsg(r.error); return; }
    if ((r.found ?? 0) === 0) {
      setMsg('0 fichier média trouvé dans ce dossier. Google (scope drive.file) ne renvoie que les fichiers/dossiers que TU as sélectionnés dans le sélecteur. Clique « Changer de dossier » et re-sélectionne le dossier (ou choisis un sous-dossier qui contient directement des images/vidéos).');
      return;
    }
    setMsg(`${r.found} fichier(s) trouvé(s) · ${r.added ?? 0} ajouté(s)${r.skipped ? ` · ${r.skipped} déjà présent(s)` : ''}.`);
    refresh();
  }

  async function disconnect() {
    setBusy('sync'); setMsg('');
    await disconnectDriveAction();
    setBusy('');
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
            Connecte ton compte Google en 1 clic, puis choisis un dossier via le sélecteur Google : ses images, vidéos et audio
            remontent automatiquement dans la bibliothèque et deviennent mobilisables par l'IA. Synchro quotidienne + à la demande.
          </p>
          <a href="/api/oauth/google" style={{ ...primary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <GoogleDriveIcon size={15} /> Connecter Google Drive
          </a>
          <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--muted)' }}>Accès limité au seul dossier que tu choisis (scope <code>drive.file</code>) · aucune autre donnée n'est lue.</p>
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

          {state.pickerReady ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" onClick={openFilePicker} disabled={!!busy} style={primary}>
                {busy === 'files' ? 'Sélecteur…' : '✓ Choisir des fichiers'}
              </button>
              <button type="button" onClick={openPicker} disabled={!!busy} style={ghost}>
                {busy === 'pick' ? 'Sélecteur…' : state.folderId ? 'Changer de dossier' : 'Choisir un dossier'}
              </button>
              {state.folderId && (
                <button type="button" onClick={doSync} disabled={!!busy} style={ghost}>
                  {busy === 'sync' ? 'Synchro…' : '⟳ Synchroniser le dossier'}
                </button>
              )}
              <button type="button" onClick={disconnect} disabled={!!busy} style={{ ...ghost, color: '#ff9db0', borderColor: 'var(--line-2)' }}>Déconnecter</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <span style={{ fontSize: 11.5, color: '#ffcf8f' }}>Sélecteur non configuré (GOOGLE_API_KEY / GOOGLE_APP_ID).</span>
              <button type="button" onClick={disconnect} disabled={!!busy} style={{ ...ghost, color: '#ff9db0', borderColor: 'var(--line-2)' }}>Déconnecter</button>
            </div>
          )}
          <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
            <b>Choisir des fichiers</b> = le plus fiable (marche aussi pour « Partagé avec moi » · multi-sélection).
            <b> Choisir un dossier</b> = synchro auto d'un dossier que tu possèdes.
          </p>
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
