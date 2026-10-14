'use server';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { googleConfigured, drivePickerConfigured, googleAccessToken, storageFromEnv, syncDriveAssets, driveDownload, driveFileMeta, putObject, storeDriveThumb } from '@tiktrends/integrations';
import { DRIVE_SELECTEUR_INACTIF, texteMessageClient, TYPES_MEDIA_SERVIS, typeMediaRetenu, type DernierSyncDrive } from '@tiktrends/core';
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
  /** Bilan de la dernière TENTATIVE (succès ou échec) · distinct du dernier succès. */
  dernier: DernierSyncDrive | null;
}

export async function getDriveState(): Promise<DriveState> {
  const s = await getSession();
  const available = googleConfigured();
  const pickerReady = drivePickerConfigured();
  const base = { available, pickerReady, needBrand: true, brandName: null, connected: false, folderId: null, folderName: null, syncedAt: null, dernier: null };
  if (!s || !db) return base;
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return base;
  const [b] = await db.select({ tok: schema.brands.driveRefreshToken, fid: schema.brands.driveFolderId, fname: schema.brands.driveFolderName, at: schema.brands.driveSyncedAt, dernier: schema.brands.driveLastSync })
    .from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  return {
    available, pickerReady, needBrand: false, brandName: brand.name,
    connected: !!b?.tok, folderId: b?.fid ?? null, folderName: b?.fname ?? null,
    syncedAt: b?.at ? b.at.toISOString() : null,
    dernier: (b?.dernier as DernierSyncDrive | null) ?? null,
  };
}

/** Config pour ouvrir le sélecteur Google natif (Picker) côté navigateur : jeton (de la marque) + clé API + ID projet. */
export async function getDrivePickerConfigAction(): Promise<{ token?: string; apiKey?: string; appId?: string; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  // Copie client · aucun nom de variable n'atteint l'écran (recette #106).
  if (!drivePickerConfigured()) return { error: texteMessageClient(DRIVE_SELECTEUR_INACTIF) };
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

export async function syncDriveNowAction(): Promise<{ ok?: true; added?: number; skipped?: number; found?: number; errors?: number; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  const ws = g.s.workspaceId;
  const brandId = g.brand.id;
  const [b] = await db!.select({ tok: schema.brands.driveRefreshToken, fid: schema.brands.driveFolderId }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  const rt = decryptSecret(b?.tok);
  if (!rt || !b?.fid) return { error: 'Connecte Google Drive et choisis un dossier.' };
  const at = new Date();
  try {
    const res = await syncDriveAssets({
      existingDriveIds: async () => {
        const rows = await db!.select({ id: schema.assets.externalId }).from(schema.assets).where(and(eq(schema.assets.brandId, brandId), eq(schema.assets.source, 'drive')));
        return new Set(rows.map((r) => r.id).filter((x): x is string => !!x));
      },
      insertAsset: async (a) => { await db!.insert(schema.assets).values({ workspaceId: ws, brandId, uploaderUserId: g.s.user.id, ...a }); },
    }, { storage: storageFromEnv(), refreshToken: rt, folderId: b.fid, workspaceId: ws, maxFiles: 200 });
    // Le SUCCÈS met à jour le dernier succès ET la dernière tentative (avec bilan).
    const bilan: DernierSyncDrive = { at: at.toISOString(), ok: true, found: res.found, added: res.added, skipped: res.skipped, errors: res.errors };
    await db!.update(schema.brands).set({ driveSyncedAt: at, driveLastSync: bilan }).where(eq(schema.brands.id, brandId));
    return { ok: true, added: res.added, skipped: res.skipped, found: res.found, errors: res.errors };
  } catch (e) {
    // L'ÉCHEC enregistre la tentative SANS toucher au dernier succès · l'ancien
    // `driveSyncedAt` ne masque plus l'échec, il coexiste avec lui (N09).
    const echec: DernierSyncDrive = { at: at.toISOString(), ok: false };
    await db!.update(schema.brands).set({ driveLastSync: echec }).where(eq(schema.brands.id, brandId)).catch(() => {});
    return { error: logAndTranslate('drive', e, { subject: 'la connexion', workspaceId: g.s.workspaceId }) };
  }
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
      // Seul l'IDENTIFIANT vient du navigateur · borné aux caractères d'un id
      // Drive, il ne peut pas réécrire le chemin de l'API ni la clé d'objet.
      const fileId = typeof f?.id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(f.id) ? f.id : null;
      if (!fileId || existing.has(fileId)) { skipped++; continue; }
      // Type, taille et nom relus CHEZ DRIVE · `f.mimeType` (déclaré par le
      // client) est ignoré : un `text/html` annoncé ne décide plus de rien.
      const meta = await driveFileMeta(token, fileId);
      let retenu = typeMediaRetenu(meta.mimeType);
      if (!retenu) { skipped++; continue; }
      let url = `https://drive.google.com/file/d/${fileId}/view`;
      if (retenu.kind === 'image' && storage && (meta.size ?? 0) < 15_000_000) {
        const bytes = await driveDownload(token, fileId);
        // Le type posé sur l'objet et gardé en base est celui des OCTETS.
        retenu = typeMediaRetenu(meta.mimeType, bytes);
        if (!retenu) { skipped++; continue; }
        url = await putObject(storage, `assets/${ws}/drive-${fileId}.${TYPES_MEDIA_SERVIS[retenu.type].extension}`, bytes, retenu.type);
      }
      // Vraie vignette (images ET vidéos) · le Picker ne la fournit pas, on la
      // demande à Drive puis on la range chez nous. Remplace l'icône de repli.
      const thumbUrl = await storeDriveThumb({ storage, token, fileId, workspaceId: ws }) ?? undefined;
      await db!.insert(schema.assets).values({ workspaceId: ws, brandId, uploaderUserId: g.s.user.id, name: (meta.name || f.name || 'Fichier Drive').slice(0, 160), kind: retenu.kind, source: 'drive', url, thumbUrl, externalId: fileId, mimeType: retenu.type, sizeBytes: meta.size ?? null });
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
