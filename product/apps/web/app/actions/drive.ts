'use server';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { googleConfigured, drivePickerConfigured, googleAccessToken, storageFromEnv, syncDriveAssets, driveDownload, putObject } from '@tiktrends/integrations';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { getActiveBrand } from '../../lib/brands';
import { decryptSecret } from '../../lib/secrets';
import { logAndTranslate } from '../../lib/error-log';

/** Garde ADMIN+ + marque active : le Drive est branché marque par marque. */
async function guard() {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' as const };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'Action réservée aux administrateurs.' as const };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne une marque active pour brancher son Drive.' as const };
  return { s, brand };
}

export interface DriveState {
  available: boolean; pickerReady: boolean; needBrand: boolean; brandName: string | null;
  connected: boolean; folderId: string | null; folderName: string | null; syncedAt: string | null;
}

export async function getDriveState(): Promise<DriveState> {
  const s = await getSession();
  const available = googleConfigured();
  const pickerReady = drivePickerConfigured();
  const base = { available, pickerReady, needBrand: true, brandName: null, connected: false, folderId: null, folderName: null, syncedAt: null };
  if (!s || !db) return base;
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return base;
  const [b] = await db.select({ tok: schema.brands.driveRefreshToken, fid: schema.brands.driveFolderId, fname: schema.brands.driveFolderName, at: schema.brands.driveSyncedAt })
    .from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  return {
    available, pickerReady, needBrand: false, brandName: brand.name,
    connected: !!b?.tok, folderId: b?.fid ?? null, folderName: b?.fname ?? null, syncedAt: b?.at ? b.at.toISOString() : null,
  };
}

/** Config pour ouvrir le sélecteur Google natif (Picker) côté navigateur : jeton (de la marque) + clé API + ID projet. */
export async function getDrivePickerConfigAction(): Promise<{ token?: string; apiKey?: string; appId?: string; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  if (!drivePickerConfigured()) return { error: 'Sélecteur Drive non configuré (GOOGLE_API_KEY / GOOGLE_APP_ID).' };
  const [b] = await db!.select({ tok: schema.brands.driveRefreshToken }).from(schema.brands).where(eq(schema.brands.id, g.brand.id)).limit(1);
  const rt = decryptSecret(b?.tok);
  if (!rt) return { error: `Connecte d’abord Google Drive pour « ${g.brand.name} ».` };
  try {
    const token = await googleAccessToken(rt);
    return { token, apiKey: process.env.GOOGLE_API_KEY, appId: process.env.GOOGLE_APP_ID };
  } catch (e) { return { error: logAndTranslate('drive', e, { subject: 'la connexion', workspaceId: g.s.workspaceId }) }; }
}

export async function setDriveFolderAction(input: { folderId: string; folderName: string }): Promise<{ ok?: true; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  await db!.update(schema.brands).set({ driveFolderId: input.folderId, driveFolderName: input.folderName }).where(eq(schema.brands.id, g.brand.id));
  return { ok: true };
}

export async function syncDriveNowAction(): Promise<{ ok?: true; added?: number; skipped?: number; found?: number; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  const ws = g.s.workspaceId;
  const brandId = g.brand.id;
  const [b] = await db!.select({ tok: schema.brands.driveRefreshToken, fid: schema.brands.driveFolderId }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  const rt = decryptSecret(b?.tok);
  if (!rt || !b?.fid) return { error: 'Connecte Google Drive et choisis un dossier.' };
  try {
    const res = await syncDriveAssets({
      existingDriveIds: async () => {
        const rows = await db!.select({ id: schema.assets.externalId }).from(schema.assets).where(and(eq(schema.assets.brandId, brandId), eq(schema.assets.source, 'drive')));
        return new Set(rows.map((r) => r.id).filter((x): x is string => !!x));
      },
      insertAsset: async (a) => { await db!.insert(schema.assets).values({ workspaceId: ws, brandId, uploaderUserId: g.s.user.id, ...a }); },
    }, { storage: storageFromEnv(), refreshToken: rt, folderId: b.fid, workspaceId: ws, maxFiles: 200 });
    await db!.update(schema.brands).set({ driveSyncedAt: new Date() }).where(eq(schema.brands.id, brandId));
    return { ok: true, added: res.added, skipped: res.skipped, found: res.found };
  } catch (e) { return { error: logAndTranslate('drive', e, { subject: 'la connexion', workspaceId: g.s.workspaceId }) }; }
}

export interface PickedFile { id: string; name: string; mimeType: string; sizeBytes?: number }

/**
 * Synchro de fichiers Drive sélectionnés directement dans le Picker (multi-sélection), rattachés à la marque active.
 * Fiable même pour du contenu « Partagé avec moi » : l'accès drive.file est accordé fichier par fichier.
 * Images -> hébergées sur le bucket si dispo (utilisables par l'IA) ; sinon servies via proxy ; vidéos/audio -> lien Drive.
 */
export async function syncDriveFilesAction(files: PickedFile[]): Promise<{ ok?: true; added?: number; skipped?: number; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  if (!files?.length) return { error: 'Aucun fichier sélectionné.' };
  const ws = g.s.workspaceId;
  const brandId = g.brand.id;
  const [b] = await db!.select({ tok: schema.brands.driveRefreshToken }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  const rt = decryptSecret(b?.tok);
  if (!rt) return { error: 'Connecte d’abord Google Drive.' };
  try {
    const token = await googleAccessToken(rt);
    const storage = storageFromEnv();
    const rows = await db!.select({ id: schema.assets.externalId }).from(schema.assets).where(and(eq(schema.assets.brandId, brandId), eq(schema.assets.source, 'drive')));
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
      await db!.insert(schema.assets).values({ workspaceId: ws, brandId, uploaderUserId: g.s.user.id, name: (f.name || 'Fichier Drive').slice(0, 160), kind, source: 'drive', url, externalId: f.id, mimeType: mime, sizeBytes: f.sizeBytes });
      added++;
    }
    await db!.update(schema.brands).set({ driveSyncedAt: new Date() }).where(eq(schema.brands.id, brandId));
    return { ok: true, added, skipped };
  } catch (e) { return { error: logAndTranslate('drive', e, { subject: 'la connexion', workspaceId: g.s.workspaceId }) }; }
}

export async function disconnectDriveAction(): Promise<{ ok?: true; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  await db!.update(schema.brands).set({ driveRefreshToken: null, driveFolderId: null, driveFolderName: null }).where(eq(schema.brands.id, g.brand.id));
  return { ok: true };
}
