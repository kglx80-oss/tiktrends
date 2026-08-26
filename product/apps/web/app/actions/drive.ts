'use server';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { googleConfigured, drivePickerConfigured, googleAccessToken, storageFromEnv, syncDriveAssets, driveDownload, putObject } from '@tiktrends/integrations';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { decryptSecret } from '../../lib/secrets';

async function guard() {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' as const };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'Action réservée aux administrateurs.' as const };
  return { s };
}

export interface DriveState { available: boolean; pickerReady: boolean; connected: boolean; folderId: string | null; folderName: string | null; syncedAt: string | null }

export async function getDriveState(): Promise<DriveState> {
  const s = await getSession();
  const available = googleConfigured();
  const pickerReady = drivePickerConfigured();
  if (!s || !db) return { available, pickerReady, connected: false, folderId: null, folderName: null, syncedAt: null };
  const [w] = await db.select({ tok: schema.workspaces.driveRefreshToken, fid: schema.workspaces.driveFolderId, fname: schema.workspaces.driveFolderName, at: schema.workspaces.driveSyncedAt }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
  return { available, pickerReady, connected: !!w?.tok, folderId: w?.fid ?? null, folderName: w?.fname ?? null, syncedAt: w?.at ? w.at.toISOString() : null };
}

/** Config pour ouvrir le sélecteur Google natif (Picker) côté navigateur : jeton + clé API + ID projet. */
export async function getDrivePickerConfigAction(): Promise<{ token?: string; apiKey?: string; appId?: string; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  if (!drivePickerConfigured()) return { error: 'Sélecteur Drive non configuré (GOOGLE_API_KEY / GOOGLE_APP_ID).' };
  const [w] = await db!.select({ tok: schema.workspaces.driveRefreshToken }).from(schema.workspaces).where(eq(schema.workspaces.id, g.s.workspaceId)).limit(1);
  const rt = decryptSecret(w?.tok);
  if (!rt) return { error: 'Connecte d’abord Google Drive.' };
  try {
    const token = await googleAccessToken(rt);
    return { token, apiKey: process.env.GOOGLE_API_KEY, appId: process.env.GOOGLE_APP_ID };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function setDriveFolderAction(input: { folderId: string; folderName: string }): Promise<{ ok?: true; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  await db!.update(schema.workspaces).set({ driveFolderId: input.folderId, driveFolderName: input.folderName }).where(eq(schema.workspaces.id, g.s.workspaceId));
  return { ok: true };
}

export async function syncDriveNowAction(): Promise<{ ok?: true; added?: number; skipped?: number; found?: number; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  const ws = g.s.workspaceId;
  const [w] = await db!.select({ tok: schema.workspaces.driveRefreshToken, fid: schema.workspaces.driveFolderId }).from(schema.workspaces).where(eq(schema.workspaces.id, ws)).limit(1);
  const rt = decryptSecret(w?.tok);
  if (!rt || !w?.fid) return { error: 'Connecte Google Drive et choisis un dossier.' };
  try {
    const res = await syncDriveAssets({
      existingDriveIds: async () => {
        const rows = await db!.select({ id: schema.assets.externalId }).from(schema.assets).where(and(eq(schema.assets.workspaceId, ws), eq(schema.assets.source, 'drive')));
        return new Set(rows.map((r) => r.id).filter((x): x is string => !!x));
      },
      insertAsset: async (a) => { await db!.insert(schema.assets).values({ workspaceId: ws, brandId: null, uploaderUserId: g.s.user.id, ...a }); },
    }, { storage: storageFromEnv(), refreshToken: rt, folderId: w.fid, workspaceId: ws, maxFiles: 200 });
    await db!.update(schema.workspaces).set({ driveSyncedAt: new Date() }).where(eq(schema.workspaces.id, ws));
    return { ok: true, added: res.added, skipped: res.skipped, found: res.found };
  } catch (e) { return { error: (e as Error).message }; }
}

export interface PickedFile { id: string; name: string; mimeType: string; sizeBytes?: number }

/**
 * Synchro de fichiers Drive sélectionnés directement dans le Picker (multi-sélection).
 * Fiable même pour du contenu « Partagé avec moi » : l'accès drive.file est accordé fichier par fichier.
 * Images -> hébergées sur le bucket (utilisables par l'IA) ; vidéos/audio -> lien Drive.
 */
export async function syncDriveFilesAction(files: PickedFile[]): Promise<{ ok?: true; added?: number; skipped?: number; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  if (!files?.length) return { error: 'Aucun fichier sélectionné.' };
  const ws = g.s.workspaceId;
  const [w] = await db!.select({ tok: schema.workspaces.driveRefreshToken }).from(schema.workspaces).where(eq(schema.workspaces.id, ws)).limit(1);
  const rt = decryptSecret(w?.tok);
  if (!rt) return { error: 'Connecte d’abord Google Drive.' };
  try {
    const token = await googleAccessToken(rt);
    const storage = storageFromEnv();
    const rows = await db!.select({ id: schema.assets.externalId }).from(schema.assets).where(and(eq(schema.assets.workspaceId, ws), eq(schema.assets.source, 'drive')));
    const existing = new Set(rows.map((r) => r.id).filter((x): x is string => !!x));
    let added = 0, skipped = 0;
    for (const f of files.slice(0, 300)) {
      if (!f?.id || existing.has(f.id)) { skipped++; continue; }
      const mime = f.mimeType || '';
      const kind: 'image' | 'video' | 'audio' | 'other' = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'other';
      let url = `https://drive.google.com/file/d/${f.id}/view`;
      if (kind === 'image' && storage && (f.sizeBytes ?? 0) < 15_000_000) {
        const bytes = await driveDownload(token, f.id);
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        url = await putObject(storage, `assets/${ws}/drive-${f.id}.${ext}`, bytes, mime);
      }
      await db!.insert(schema.assets).values({ workspaceId: ws, brandId: null, uploaderUserId: g.s.user.id, name: (f.name || 'Fichier Drive').slice(0, 160), kind, source: 'drive', url, externalId: f.id, mimeType: mime, sizeBytes: f.sizeBytes });
      added++;
    }
    await db!.update(schema.workspaces).set({ driveSyncedAt: new Date() }).where(eq(schema.workspaces.id, ws));
    return { ok: true, added, skipped };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function disconnectDriveAction(): Promise<{ ok?: true; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  await db!.update(schema.workspaces).set({ driveRefreshToken: null, driveFolderId: null, driveFolderName: null }).where(eq(schema.workspaces.id, g.s.workspaceId));
  return { ok: true };
}
