'use client';

import { useCallback, useState } from 'react';
import { getDrivePickerConfigAction, setDriveFolderAction, syncDriveFilesAction, syncDriveNowAction } from '../../../app/actions/drive';

/**
 * Le sélecteur Google Drive (Google Picker) · repris de l'écran V5
 * `DriveConnect` : choisir LE dossier à synchroniser (`setDriveFolderAction`
 * puis `syncDriveNowAction`), ou importer des fichiers choisis un à un
 * (`syncDriveFilesAction`, utile pour « Partagé avec moi »). Le jeton et la
 * clé viennent du serveur (`getDrivePickerConfigAction`), jamais du code.
 * Module client · n'exporte qu'un hook (garde `spatial-fondation`).
 */

declare global { interface Window { gapi?: any; google?: any } }

function chargerPicker(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window;
    if (w.google?.picker) return resolve(w.google.picker);
    const pret = () => w.gapi.load('picker', { callback: () => resolve(w.google.picker), onerror: () => reject(new Error('Sélecteur Google indisponible.')) });
    if (w.gapi) return pret();
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = pret;
    s.onerror = () => reject(new Error('Chargement du sélecteur Google impossible.'));
    document.body.appendChild(s);
  });
}

const MIMES = 'image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav';

/** Résumé honnête d'un import · trouvés, importés, déjà là. */
const resume = (trouves: number, ajoutes: number, deja: number) =>
  trouves === 0 ? 'Le dossier ne contient aucun fichier importable (images, vidéos, audio).'
    : `${ajoutes} fichier${ajoutes > 1 ? 's' : ''} importé${ajoutes > 1 ? 's' : ''}${deja ? ` · ${deja} déjà là` : ''}`;

export function useSelecteurDrive(dire: (m: string) => void, rafraichir: () => void) {
  const [occupe, setOccupe] = useState<'' | 'dossier' | 'fichiers'>('');

  const ouvrir = useCallback(async (mode: 'dossier' | 'fichiers') => {
    if (occupe) return;
    setOccupe(mode);
    try {
      const cfg = await getDrivePickerConfigAction();
      if (cfg.error || !cfg.token) { dire(cfg.error || 'Connexion Google Drive requise.'); setOccupe(''); return; }
      const picker = await chargerPicker();
      const b = new picker.PickerBuilder().enableFeature(picker.Feature.SUPPORT_DRIVES).setDeveloperKey(cfg.apiKey).setOAuthToken(cfg.token);
      if (mode === 'dossier') {
        b.addView(new picker.DocsView(picker.ViewId.FOLDERS).setSelectFolderEnabled(true).setMode(picker.DocsViewMode.LIST)).setTitle('Choisis le dossier à synchroniser');
      } else {
        b.enableFeature(picker.Feature.MULTISELECT_ENABLED)
          .addView(new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setMimeTypes(MIMES))
          .addView(new picker.DocsView(picker.ViewId.DOCS).setOwnedByMe(false).setIncludeFolders(true).setSelectFolderEnabled(false).setMimeTypes(MIMES))
          .setTitle('Choisis les fichiers à importer');
      }
      b.setCallback(async (data: any) => {
        if (data.action === picker.Action.CANCEL) { setOccupe(''); return; }
        if (data.action !== picker.Action.PICKED) return;
        try {
          if (mode === 'dossier') {
            const doc = data.docs?.[0];
            if (!doc?.id) return;
            const r = await setDriveFolderAction({ folderId: doc.id, folderName: doc.name || 'Dossier Drive' });
            if (r.error) { dire(r.error); return; }
            const s = await syncDriveNowAction();
            dire(s.error ? s.error : `Dossier « ${doc.name || 'Drive'} » choisi · ${resume(s.found ?? 0, s.added ?? 0, s.skipped ?? 0)}`);
          } else {
            const files = (data.docs || []).map((d: any) => ({ id: d.id, name: d.name, mimeType: d.mimeType, sizeBytes: d.sizeBytes }));
            if (!files.length) return;
            const r = await syncDriveFilesAction(files);
            dire(r.error ? r.error : resume(files.length, r.added ?? 0, r.skipped ?? 0));
          }
          rafraichir();
        } finally { setOccupe(''); }
      });
      if (cfg.appId) b.setAppId(cfg.appId);
      b.build().setVisible(true);
    } catch (e) { dire((e as Error).message); setOccupe(''); }
  }, [occupe, dire, rafraichir]);

  return { occupe, choisirDossier: () => void ouvrir('dossier'), choisirFichiers: () => void ouvrir('fichiers') };
}
