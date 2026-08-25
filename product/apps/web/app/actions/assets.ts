'use server';

import { and, desc, eq, or, isNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { storageFromEnv, presignPutUrl, newAssetKey, deleteObjectByUrl } from '@tiktrends/integrations';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';

const MAX_UPLOAD_BYTES = 1_073_741_824; // 1 Go

function kindFromMime(mime: string): AssetKind {
  if (/^image\//.test(mime)) return 'image';
  if (/^video\//.test(mime)) return 'video';
  if (/^audio\//.test(mime)) return 'audio';
  return 'other';
}

export type AssetKind = 'image' | 'video' | 'audio' | 'other';
export interface AssetItem {
  id: string; name: string; kind: AssetKind; source: string; url: string;
  brandId: string | null; useForAi: boolean; sizeBytes: number | null; createdAt: string;
}

const MAX_IMG_BYTES = 6_000_000; // garde-fou data URI (~6 Mo)

function toItem(r: typeof schema.assets.$inferSelect): AssetItem {
  return { id: r.id, name: r.name, kind: r.kind as AssetKind, source: r.source, url: r.url, brandId: r.brandId, useForAi: r.useForAi, sizeBytes: r.sizeBytes, createdAt: r.createdAt.toISOString() };
}

/** Liste les assets de l'espace (optionnellement filtrés). */
export async function listAssets(filter?: { kind?: AssetKind; brandOnly?: boolean }): Promise<AssetItem[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const conds = [eq(schema.assets.workspaceId, s.workspaceId)];
  if (filter?.kind) conds.push(eq(schema.assets.kind, filter.kind));
  if (filter?.brandOnly) {
    const brand = await getActiveBrand(s.workspaceId);
    if (brand) conds.push(eq(schema.assets.brandId, brand.id));
  }
  const rows = await db.select().from(schema.assets).where(and(...conds)).orderBy(desc(schema.assets.createdAt)).limit(400);
  return rows.map(toItem);
}

/** Téléverse des images (data URI) dans la bibliothèque. */
export async function uploadImageAssetsAction(input: { items: Array<{ name: string; dataUri: string }>; common?: boolean }): Promise<{ ok?: true; count?: number; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const brand = input.common ? null : await getActiveBrand(s.workspaceId);
  const rows = [] as Array<typeof schema.assets.$inferInsert>;
  for (const it of input.items || []) {
    const uri = (it.dataUri || '').trim();
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(uri)) return { error: 'Formats acceptés : jpg, png, webp.' };
    if (uri.length > MAX_IMG_BYTES) return { error: 'Image trop lourde (max ~4 Mo après compression).' };
    rows.push({ workspaceId: s.workspaceId, brandId: brand?.id ?? null, uploaderUserId: s.user.id, name: (it.name || 'image').slice(0, 160), kind: 'image', source: 'upload', url: uri, mimeType: 'image/jpeg', sizeBytes: Math.round(uri.length * 0.75) });
  }
  if (!rows.length) return { error: 'Aucune image valide.' };
  await db.insert(schema.assets).values(rows);
  return { ok: true, count: rows.length };
}

/** Importe un asset par URL (image/vidéo/audio externe ou lien Drive). */
export async function importAssetAction(input: { name: string; url: string; kind: AssetKind; common?: boolean }): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const url = (input.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return { error: 'Entre une URL valide (https://…).' };
  const isDrive = /drive\.google\.com|docs\.google\.com/i.test(url);
  const brand = input.common ? null : await getActiveBrand(s.workspaceId);
  const kind: AssetKind = (['image', 'video', 'audio', 'other'] as AssetKind[]).includes(input.kind) ? input.kind : 'other';
  await db.insert(schema.assets).values({
    workspaceId: s.workspaceId, brandId: brand?.id ?? null, uploaderUserId: s.user.id,
    name: (input.name || url.split('/').pop() || 'asset').slice(0, 160), kind,
    source: isDrive ? 'drive' : 'url', url,
  });
  return { ok: true };
}

/** Active/désactive l'usage d'un asset par l'IA. */
export async function toggleAssetAiAction(input: { id: string; useForAi: boolean }): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  await db.update(schema.assets).set({ useForAi: input.useForAi }).where(and(eq(schema.assets.id, input.id), eq(schema.assets.workspaceId, s.workspaceId)));
  return { ok: true };
}

/** Le stockage objet est-il configuré côté serveur ? (upload direct des gros fichiers) */
export async function storageAvailableAction(): Promise<boolean> {
  return !!storageFromEnv();
}

/** Demande une URL présignée pour téléverser un fichier directement vers le bucket. */
export async function presignAssetUploadAction(input: { filename: string; contentType: string; sizeBytes: number }): Promise<{ uploadUrl?: string; publicUrl?: string; error?: string }> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée.' };
  const cfg = storageFromEnv();
  if (!cfg) return { error: 'Stockage objet non configuré sur le serveur.' };
  if (!input.filename || !input.contentType) return { error: 'Fichier invalide.' };
  if (input.sizeBytes > MAX_UPLOAD_BYTES) return { error: 'Fichier trop lourd (max 1 Go).' };
  const key = newAssetKey(s.workspaceId, input.filename);
  try {
    const { uploadUrl, publicUrl } = presignPutUrl(cfg, key);
    return { uploadUrl, publicUrl };
  } catch (e) {
    return { error: 'Impossible de préparer le téléversement : ' + (e as Error).message };
  }
}

/** Enregistre un fichier déjà téléversé sur le bucket comme asset. */
export async function registerUploadedAssetAction(input: { name: string; url: string; mimeType: string; sizeBytes: number; common?: boolean }): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const url = (input.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return { error: 'URL invalide.' };
  const brand = input.common ? null : await getActiveBrand(s.workspaceId);
  await db.insert(schema.assets).values({
    workspaceId: s.workspaceId, brandId: brand?.id ?? null, uploaderUserId: s.user.id,
    name: (input.name || 'fichier').slice(0, 160), kind: kindFromMime(input.mimeType || ''),
    source: 'upload', url, mimeType: input.mimeType || null, sizeBytes: input.sizeBytes || null,
  });
  return { ok: true };
}

/** Supprime un asset (+ l'objet physique sur le bucket si téléversé). */
export async function deleteAssetAction(input: { id: string }): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const [row] = await db.select({ url: schema.assets.url, source: schema.assets.source })
    .from(schema.assets).where(and(eq(schema.assets.id, input.id), eq(schema.assets.workspaceId, s.workspaceId))).limit(1);
  await db.delete(schema.assets).where(and(eq(schema.assets.id, input.id), eq(schema.assets.workspaceId, s.workspaceId)));
  // Suppression physique best-effort du fichier stocké sur le bucket.
  const cfg = storageFromEnv();
  if (cfg && row?.source === 'upload' && row.url) { try { await deleteObjectByUrl(cfg, row.url); } catch { /* best-effort */ } }
  return { ok: true };
}

/**
 * URLs d'images de la bibliothèque utilisables comme références par l'IA, pour une marque
 * (images de la marque + images communes à l'espace), dédiées à l'IA (use_for_ai).
 * Sert à ce que « quand c'est rempli, l'IA s'en serve forcément ».
 */
export async function listBrandAssetImageUrls(workspaceId: string, brandId: string, limit = 4): Promise<string[]> {
  if (!db) return [];
  const rows = await db.select({ url: schema.assets.url })
    .from(schema.assets)
    .where(and(
      eq(schema.assets.workspaceId, workspaceId),
      eq(schema.assets.kind, 'image'),
      eq(schema.assets.useForAi, true),
      or(eq(schema.assets.brandId, brandId), isNull(schema.assets.brandId)),
    ))
    .orderBy(desc(schema.assets.createdAt))
    .limit(limit);
  return rows.map((r) => r.url).filter(Boolean);
}
