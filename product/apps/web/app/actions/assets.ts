'use server';

import { and, count, desc, eq, or, isNull, sql, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { storageFromEnv, presignPutUrl, newAssetKey, deleteObjectByUrl, googleAccessToken, driveDownload } from '@tiktrends/integrations';
import { driveRefreshTokenFor } from '../../lib/drive-token';
import { describeAssetImage } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { logAndTranslate } from '../../lib/error-log';
import { guardedAnthropic } from '../../lib/spend-guard';
import { GUARD } from '../../lib/guard-error';
import { servedAssetUrl, isPrivateDriveUrl } from '../../lib/asset-url';

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

function toItem(r: {
  id: string; name: string; kind: string; source: string; url: string; embarquee: boolean;
  brandId: string | null; useForAi: boolean; sizeBytes: number | null; tags: string[] | null; createdAt: Date;
}): AssetItem {
  return {
    id: r.id, name: r.name, kind: r.kind as AssetKind, source: r.source,
    // La règle vit dans `lib/asset-url` · elle s'y teste, ce qu'un fichier
    // `'use server'` interdit (tout export y devient un point d'entrée réseau).
    url: servedAssetUrl({ id: r.id, kind: r.kind, source: r.source, url: r.url, embedded: r.embarquee }),
    brandId: r.brandId, useForAi: r.useForAi, sizeBytes: r.sizeBytes,
    tags: r.tags ?? [], createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Liste les assets. Par défaut, scope sur la MARQUE active (+ assets communs sans marque) :
 * chaque marque voit sa propre bibliothèque. Sans marque active, renvoie tout l'espace.
 * `brandOnly` force le strict-marque (exclut les communs).
 */
export async function listAssets(filter?: { kind?: AssetKind; brandOnly?: boolean; limit?: number }): Promise<AssetItem[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const conds = [eq(schema.assets.workspaceId, s.workspaceId)];
  if (filter?.kind) conds.push(eq(schema.assets.kind, filter.kind));
  const brand = await getActiveBrand(s.workspaceId);
  if (brand) {
    conds.push((filter?.brandOnly ? eq(schema.assets.brandId, brand.id) : or(eq(schema.assets.brandId, brand.id), isNull(schema.assets.brandId)))!);
  }

  // `select()` remontait TOUTES les colonnes, dont `url` · qui contient jusqu'à
  // six mégaoctets de base64 par image téléversée. Quatre cents lignes de ce
  // genre traversaient la base, le serveur et la page, pour finir en vingt-quatre
  // vignettes. On demande donc les colonnes une par une, et on laisse le contenu
  // là où il est : le test `like 'data:%'` suffit à savoir qu'il faut le servir
  // par le proxy, sans jamais le lire.
  const rows = await db.select({
    id: schema.assets.id, name: schema.assets.name, kind: schema.assets.kind,
    source: schema.assets.source, brandId: schema.assets.brandId,
    useForAi: schema.assets.useForAi, sizeBytes: schema.assets.sizeBytes,
    tags: schema.assets.tags, createdAt: schema.assets.createdAt,
    embarquee: sql<boolean>`${schema.assets.url} like 'data:%'`,
    url: sql<string>`case when ${schema.assets.url} like 'data:%' then '' else ${schema.assets.url} end`,
  })
    .from(schema.assets).where(and(...conds))
    .orderBy(desc(schema.assets.createdAt))
    .limit(Math.max(1, Math.min(filter?.limit ?? 400, 400)));

  return rows.map(toItem);
}

/** Téléverse des images (data URI) dans la bibliothèque. */
export async function uploadImageAssetsAction(input: { items: Array<{ name: string; dataUri: string }>; common?: boolean }): Promise<{ ok?: true; count?: number; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
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
  if (!s || !db) return { error: GUARD.session() };
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
  if (!s || !db) return { error: GUARD.session() };
  await db.update(schema.assets).set({ useForAi: input.useForAi }).where(and(eq(schema.assets.id, input.id), eq(schema.assets.workspaceId, s.workspaceId)));
  return { ok: true };
}

/** Tague une image par l'IA (vision) · débite 1 crédit (tag_image). Rend les tags. */
export async function tagAssetAction(input: { id: string }): Promise<{ ok?: true; tags?: string[]; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const client = guardedAnthropic({ action: 'assets' });
  if (!client) return { error: GUARD.aiOff() };
  const [a] = await db.select({ id: schema.assets.id, kind: schema.assets.kind, url: schema.assets.url })
    .from(schema.assets).where(and(eq(schema.assets.id, input.id), eq(schema.assets.workspaceId, s.workspaceId))).limit(1);
  if (!a) return { error: 'Asset introuvable.' };
  if (a.kind !== 'image') return { error: 'Le tagging IA ne concerne que les images pour l’instant.' };

  // Débit atomique avant l'analyse (remboursé si elle échoue ou ne rend rien).
  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('tag_image', 1);
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Assets · tagging IA'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }

  let tags: string[] = [];
  try { ({ tags } = await describeAssetImage(client, a.url)); }
  catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · tagging IA');
    return { error: logAndTranslate('assets:tag', e, { subject: 'l’analyse de l’image', workspaceId: s.workspaceId }) };
  }
  if (!tags.length) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · tagging IA');
    return { error: "Aucun tag n'a pu être déduit." };
  }

  await db.update(schema.assets).set({ tags }).where(eq(schema.assets.id, a.id));
  return { ok: true, tags };
}

/** Nombre d'images non taguées (pour proposer le tagging en lot). */
export async function countUntaggedImages(): Promise<number> {
  const s = await getSession();
  if (!s || !db) return 0;
  // Compter se fait en SQL · on remontait toutes les images de l'espace pour
  // faire un `.length` en JavaScript.
  const [r] = await db.select({ n: count() }).from(schema.assets)
    .where(and(
      eq(schema.assets.workspaceId, s.workspaceId),
      eq(schema.assets.kind, 'image'),
      sql`(${schema.assets.tags} is null or cardinality(${schema.assets.tags}) = 0)`,
    ));
  return r?.n ?? 0;
}

/** Tague en lot les images non taguées (max 20 par appel), débit par image. */
export async function tagUntaggedImagesAction(): Promise<{ ok?: true; tagged?: number; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const client = guardedAnthropic({ action: 'assets' });
  if (!client) return { error: GUARD.aiOff() };
  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('tag_image', 1);

  // Le filtre « sans tags » se fait en SQL · il remontait deux cents lignes
  // entières, donc deux cents images en base64, pour en garder vingt.
  const todo = await db.select({ id: schema.assets.id, url: schema.assets.url })
    .from(schema.assets)
    .where(and(
      eq(schema.assets.workspaceId, s.workspaceId),
      eq(schema.assets.kind, 'image'),
      sql`(${schema.assets.tags} is null or cardinality(${schema.assets.tags}) = 0)`,
    ))
    .orderBy(desc(schema.assets.createdAt)).limit(20);
  if (!todo.length) return { ok: true, tagged: 0 };

  let tagged = 0;
  for (const a of todo) {
    // Une image = une réservation atomique ; on s'arrête net quand le solde est épuisé.
    if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Assets · tagging IA (lot)'))) break;
    let ok = false;
    try {
      const { tags } = await describeAssetImage(client, a.url);
      if (tags.length) {
        await db.update(schema.assets).set({ tags }).where(eq(schema.assets.id, a.id));
        tagged++;
        ok = true;
      }
    } catch { /* on continue */ }
    if (!ok && !unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · tagging IA (lot)');
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
  if (!s) return { error: GUARD.session() };
  const cfg = storageFromEnv();
  if (!cfg) return { error: 'Stockage objet non configuré sur le serveur.' };
  if (!input.filename || !input.contentType) return { error: 'Fichier invalide.' };
  if (input.sizeBytes > MAX_UPLOAD_BYTES) return { error: 'Fichier trop lourd (max 1 Go).' };
  const key = newAssetKey(s.workspaceId, input.filename);
  try {
    const { uploadUrl, publicUrl } = presignPutUrl(cfg, key);
    return { uploadUrl, publicUrl };
  } catch (e) {
    return { error: logAndTranslate('assets:upload', e, { subject: 'la préparation du téléversement', workspaceId: s.workspaceId }) };
  }
}

/** Enregistre un fichier déjà téléversé sur le bucket comme asset. */
export async function registerUploadedAssetAction(input: { name: string; url: string; mimeType: string; sizeBytes: number; common?: boolean }): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
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
  if (!s || !db) return { error: GUARD.session() };
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
/**
 * Convertit des lignes d'assets en URLs exploitables PAR L'IA (Fal).
 * Une image Drive privée n'est pas récupérable par Fal : on la télécharge et on
 * l'inline en data URI (comme les photos uploadées). Les images déjà publiques (bucket,
 * URL externe) passent telles quelles. Ce qu'on ne peut pas résoudre est ignoré (jamais bloquant).
 */
async function toAiImageUrls(workspaceId: string, rows: Array<{ url: string; externalId: string | null; mimeType: string | null }>, brandId?: string | null): Promise<string[]> {
  const needsDrive = rows.some((r) => r.url && isPrivateDriveUrl(r.url) && r.externalId);
  let token: string | null = null;
  if (needsDrive && db) {
    // Le jeton Drive vit sur la marque (jamais sur l'espace) · cf. lib/drive-token.
    const rt = await driveRefreshTokenFor(workspaceId, brandId);
    if (rt) { try { token = await googleAccessToken(rt); } catch { token = null; } }
  }
  const out: string[] = [];
  for (const r of rows) {
    if (!r.url) continue;
    if (isPrivateDriveUrl(r.url)) {
      if (r.externalId && token) {
        try {
          const bytes = await driveDownload(token, r.externalId);
          if (bytes.length <= 15_000_000) out.push(`data:${r.mimeType || 'image/jpeg'};base64,${bytes.toString('base64')}`);
        } catch { /* image non résolue : ignorée */ }
      }
      // sinon : on ignore (Fal ne peut pas récupérer un lien Drive privé)
    } else {
      out.push(r.url);
    }
  }
  return out;
}

/** Résout des URLs d'images de la bibliothèque à partir d'IDs (sélection explicite). */
export async function resolveAssetImageUrls(workspaceId: string, ids: string[], limit = 6): Promise<string[]> {
  if (!db || !ids.length) return [];
  // Le filtre par identifiants se fait en SQL · il se faisait en JavaScript
  // après avoir remonté quatre cents lignes, donc quatre cents images en base64
  // lues pour en garder six.
  const rows = await db.select({ id: schema.assets.id, url: schema.assets.url, externalId: schema.assets.externalId, mimeType: schema.assets.mimeType })
    .from(schema.assets)
    .where(and(
      eq(schema.assets.workspaceId, workspaceId),
      eq(schema.assets.kind, 'image'),
      inArray(schema.assets.id, ids.slice(0, 50)),
    ))
    .limit(limit);
  return toAiImageUrls(workspaceId, rows.filter((r) => r.url));
}

export async function listBrandAssetImageUrls(workspaceId: string, brandId: string, limit = 4): Promise<string[]> {
  if (!db) return [];
  const rows = await db.select({ url: schema.assets.url, externalId: schema.assets.externalId, mimeType: schema.assets.mimeType })
    .from(schema.assets)
    .where(and(
      eq(schema.assets.workspaceId, workspaceId),
      eq(schema.assets.kind, 'image'),
      eq(schema.assets.useForAi, true),
      or(eq(schema.assets.brandId, brandId), isNull(schema.assets.brandId)),
    ))
    .orderBy(desc(schema.assets.createdAt))
    .limit(limit);
  return toAiImageUrls(workspaceId, rows, brandId);
}
