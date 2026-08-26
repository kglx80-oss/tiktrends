'use server';

import { and, desc, eq, or, isNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { storageFromEnv, presignPutUrl, newAssetKey, deleteObjectByUrl } from '@tiktrends/integrations';
import { anthropicFromEnv, describeAssetImage } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { unlimitedCredits } from '../../lib/credits';

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
  brandId: string | null; useForAi: boolean; sizeBytes: number | null; tags: string[]; createdAt: string;
}

const MAX_IMG_BYTES = 6_000_000; // garde-fou data URI (~6 Mo)

/** Vrai si l'URL est un lien Drive privé (non affichable directement dans une balise <img>). */
function isPrivateDriveUrl(url: string): boolean {
  return /drive\.google\.com|googleusercontent\.com/.test(url);
}

function toItem(r: typeof schema.assets.$inferSelect): AssetItem {
  // Image Drive privée : servie via notre proxy authentifié (sinon l'aperçu casse).
  const url = r.kind === 'image' && r.source === 'drive' && isPrivateDriveUrl(r.url) ? `/api/drive-img/${r.id}` : r.url;
  return { id: r.id, name: r.name, kind: r.kind as AssetKind, source: r.source, url, brandId: r.brandId, useForAi: r.useForAi, sizeBytes: r.sizeBytes, tags: r.tags ?? [], createdAt: r.createdAt.toISOString() };
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
/** Analyse un lien Google Drive : dossier (à rejeter) ou fichier (id + lien direct). */
function parseDriveUrl(url: string): { isDrive: boolean; isFolder: boolean; fileId?: string } {
  const isDrive = /drive\.google\.com|docs\.google\.com/i.test(url);
  if (!isDrive) return { isDrive: false, isFolder: false };
  if (/\/folders\//i.test(url)) return { isDrive: true, isFolder: true };
  const m = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/);
  return { isDrive: true, isFolder: false, fileId: m?.[1] };
}

export async function importAssetAction(input: { name: string; url: string; kind: AssetKind; common?: boolean }): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  let url = (input.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return { error: 'Entre une URL valide (https://…).' };
  const kind: AssetKind = (['image', 'video', 'audio', 'other'] as AssetKind[]).includes(input.kind) ? input.kind : 'other';

  const drive = parseDriveUrl(url);
  if (drive.isFolder) {
    return { error: 'Ce lien est un DOSSIER Drive, pas un fichier. Pour importer tout un dossier automatiquement, utilise « Google Drive · connexion automatique » ci-dessus. Sinon, colle le lien de partage de chaque fichier (un par ligne).' };
  }
  // Lien de fichier Drive : on le convertit en lien direct pour que l'image s'affiche vraiment.
  if (drive.isDrive && drive.fileId && kind === 'image') {
    url = `https://drive.google.com/uc?export=view&id=${drive.fileId}`;
  }

  const brand = input.common ? null : await getActiveBrand(s.workspaceId);
  const rawName = (input.name || '').trim();
  const name = (rawName && rawName.toLowerCase() !== 'folders' ? rawName : (url.split('/').pop()?.split('?')[0] || 'asset')).slice(0, 160);
  await db.insert(schema.assets).values({
    workspaceId: s.workspaceId, brandId: brand?.id ?? null, uploaderUserId: s.user.id,
    name, kind, source: drive.isDrive ? 'drive' : 'url', url,
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

/** Tague une image par l'IA (vision) · débite 1 crédit (tag_image). Rend les tags. */
export async function tagAssetAction(input: { id: string }): Promise<{ ok?: true; tags?: string[]; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const client = anthropicFromEnv();
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };
  const [a] = await db.select().from(schema.assets).where(and(eq(schema.assets.id, input.id), eq(schema.assets.workspaceId, s.workspaceId))).limit(1);
  if (!a) return { error: 'Asset introuvable.' };
  if (a.kind !== 'image') return { error: 'Le tagging IA ne concerne que les images pour l’instant.' };

  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('tag_image', 1);
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
  const credits = w?.c ?? 0;
  if (!unlimited && credits < cost) return { error: `Crédits insuffisants (${cost} requis).` };

  let tags: string[] = [];
  try { ({ tags } = await describeAssetImage(client, a.url)); }
  catch (e) { return { error: 'Analyse impossible : ' + (e as Error).message }; }
  if (!tags.length) return { error: "Aucun tag n'a pu être déduit." };

  await db.update(schema.assets).set({ tags }).where(eq(schema.assets.id, a.id));
  if (!unlimited) {
    try {
      await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, credits - cost) }).where(eq(schema.workspaces.id, s.workspaceId));
      await db.insert(schema.creditLedger).values({ workspaceId: s.workspaceId, delta: -cost, reason: 'Assets · tagging IA' });
    } catch { /* débit best-effort */ }
  }
  return { ok: true, tags };
}

/** Nombre d'images non taguées (pour proposer le tagging en lot). */
export async function countUntaggedImages(): Promise<number> {
  const s = await getSession();
  if (!s || !db) return 0;
  const rows = await db.select({ id: schema.assets.id, tags: schema.assets.tags })
    .from(schema.assets).where(and(eq(schema.assets.workspaceId, s.workspaceId), eq(schema.assets.kind, 'image')));
  return rows.filter((r) => !r.tags || r.tags.length === 0).length;
}

/** Tague en lot les images non taguées (max 20 par appel), débit par image. */
export async function tagUntaggedImagesAction(): Promise<{ ok?: true; tagged?: number; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const client = anthropicFromEnv();
  if (!client) return { error: "L'IA n'est pas configurée sur le serveur." };
  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('tag_image', 1);

  const rows = await db.select().from(schema.assets)
    .where(and(eq(schema.assets.workspaceId, s.workspaceId), eq(schema.assets.kind, 'image')))
    .orderBy(desc(schema.assets.createdAt)).limit(200);
  const todo = rows.filter((r) => !r.tags || r.tags.length === 0).slice(0, 20);
  if (!todo.length) return { ok: true, tagged: 0 };

  let tagged = 0;
  for (const a of todo) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    const credits = w?.c ?? 0;
    if (!unlimited && credits < cost) break;
    try {
      const { tags } = await describeAssetImage(client, a.url);
      if (tags.length) {
        await db.update(schema.assets).set({ tags }).where(eq(schema.assets.id, a.id));
        tagged++;
        if (!unlimited) {
          await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, credits - cost) }).where(eq(schema.workspaces.id, s.workspaceId));
          await db.insert(schema.creditLedger).values({ workspaceId: s.workspaceId, delta: -cost, reason: 'Assets · tagging IA (lot)' });
        }
      }
    } catch { /* on continue */ }
  }
  return { ok: true, tagged };
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
/** Résout des URLs d'images de la bibliothèque à partir d'IDs (sélection explicite). */
export async function resolveAssetImageUrls(workspaceId: string, ids: string[], limit = 6): Promise<string[]> {
  if (!db || !ids.length) return [];
  const rows = await db.select({ id: schema.assets.id, url: schema.assets.url, kind: schema.assets.kind })
    .from(schema.assets)
    .where(and(eq(schema.assets.workspaceId, workspaceId), eq(schema.assets.kind, 'image')))
    .limit(400);
  const set = new Set(ids);
  return rows.filter((r) => set.has(r.id) && r.url).map((r) => r.url).slice(0, limit);
}

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
