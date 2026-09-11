/**
 * Synchronise les fichiers d'un dossier Google Drive dans la bibliothèque d'assets.
 * L'accès DB est injecté (deps) pour rester découplé : web et worker fournissent le leur.
 * Images -> hébergées sur notre bucket (utilisables par l'IA) ; vidéos/audio -> lien Drive.
 */
import type { StorageConfig } from './storage';
import { putObject } from './storage';
import { googleAccessToken, driveListFilesDeep, driveDownload, driveThumbnailLink, driveThumbBytes } from './google-drive';

export type DriveAssetKind = 'image' | 'video' | 'audio' | 'other';
export interface DriveAssetInput {
  name: string; kind: DriveAssetKind; source: 'drive'; url: string; externalId: string; mimeType: string; sizeBytes?: number;
  /** Vraie miniature persistée sur notre bucket · vignette Drive (images ET vidéos). */
  thumbUrl?: string;
}

/**
 * Persiste la vraie vignette d'un fichier Drive sur notre bucket, et rend son
 * adresse publique et permanente. `null` sans bucket, sans vignette, ou sur
 * échec · l'appelant retombe alors sur l'ancien affichage (jamais bloquant).
 *
 * La `thumbnailLink` de Google est éphémère et exige un jeton · on la consomme
 * ici, tout de suite, et on garde une copie à nous. C'est ce qui fait qu'une
 * vidéo Drive montre enfin une image, sans re-télécharger la vidéo entière.
 */
export async function storeDriveThumb(o: {
  storage: StorageConfig | null; token: string; fileId: string; workspaceId: string; thumbnailLink?: string | null;
}): Promise<string | null> {
  if (!o.storage) return null;
  let link = o.thumbnailLink ?? null;
  if (!link) { try { link = await driveThumbnailLink(o.token, o.fileId); } catch { link = null; } }
  if (!link) return null;
  const bytes = await driveThumbBytes(o.token, link);
  if (!bytes) return null;
  try {
    return await putObject(o.storage, `assets/${o.workspaceId}/drive-${o.fileId}-thumb.jpg`, bytes, 'image/jpeg');
  } catch { return null; }
}
export interface SyncDriveDeps {
  existingDriveIds(): Promise<Set<string>>;
  insertAsset(a: DriveAssetInput): Promise<void>;
}

const kindOf = (mime: string): DriveAssetKind =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'other';

export async function syncDriveAssets(deps: SyncDriveDeps, o: {
  storage: StorageConfig | null; refreshToken: string; folderId: string; workspaceId: string; maxFiles?: number;
}): Promise<{ added: number; skipped: number; errors: number; found: number }> {
  const token = await googleAccessToken(o.refreshToken);
  const cap = o.maxFiles ?? 100;
  // Parcours récursif : le dossier choisi + tous ses sous-dossiers.
  const files = await driveListFilesDeep(token, o.folderId, { maxFiles: cap });
  const found = files.length;
  const existing = await deps.existingDriveIds();
  let added = 0, skipped = 0, errors = 0;

  for (const f of files.slice(0, cap)) {
    if (existing.has(f.id)) { skipped++; continue; }
    const kind = kindOf(f.mimeType);
    try {
      let url = f.webViewLink || '';
      // Images : on télécharge et on héberge sur notre bucket (pour <img> + IA).
      if (kind === 'image' && o.storage && (f.size ?? 0) < 15_000_000) {
        const bytes = await driveDownload(token, f.id);
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        url = await putObject(o.storage, `assets/${o.workspaceId}/drive-${f.id}.${ext}`, bytes, f.mimeType);
      }
      if (!url) { skipped++; continue; }
      // Vraie vignette (images ET vidéos) · captée maintenant, où la thumbnailLink
      // est fraîche, puis rangée chez nous. C'est ce qui remplace l'icône de repli.
      const thumbUrl = await storeDriveThumb({ storage: o.storage, token, fileId: f.id, workspaceId: o.workspaceId, thumbnailLink: f.thumbnailLink }) ?? undefined;
      await deps.insertAsset({ name: f.name.slice(0, 160), kind, source: 'drive', url, externalId: f.id, mimeType: f.mimeType, sizeBytes: f.size, thumbUrl });
      added++;
    } catch { errors++; }
  }
  return { added, skipped, errors, found };
}
