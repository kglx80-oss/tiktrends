'use server';

import { and, desc, eq, inArray, or, isNull, isNotNull, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { storageFromEnv, presignPutUrl, newAssetKey, deleteObjectByUrl, basePubliqueStockage, objectKeyFromUrl, publicUrlFor, ecrireApresDepot, retirerDepotsSansLigne } from '@tiktrends/integrations';
import { describeAssetImage } from '@tiktrends/ai';
import { costFor, decisionDepot, dureeLienDepot, jetonDepotPour, lireUsageDepot, resoudreJetonDepot, REFUS_USAGE_DEPOT, TEXTES_REFUS_JETON_FICHIER, type UsageDepot, avecTemplate, estTemplateAsset, tagsVisibles, messageServiceInactif, typeMediaReel, cleTeleversable, idLienInterne, type OrigineStudioBibliotheque } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { getActiveBrand } from '../../lib/brands';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { logAndTranslate } from '../../lib/error-log';
import { referencesObjetEnBase } from '../../lib/references-objet';
import { lireJetonDepot, scellerJetonDepot } from '../../lib/jeton-depot';
import { guardedAnthropic } from '../../lib/spend-guard';
import { GUARD } from '../../lib/guard-error';
import { toItem } from '../../lib/asset-item';
import { lirePageBibliotheque } from '../../lib/bibliotheque-pages';
import { assetAiUrl } from '../../lib/asset-ai-url';
import { lireDebutObjetEspace } from '@tiktrends/integrations';
import { decisionDepotRelu, OCTETS_RELUS_DEPOT, MESSAGES_RELECTURE_DEPOT, validerIaSelection, validerSelectionFichiers, REFUS_SUPPRESSION_HORS_CORBEILLE, validerRenommageFichier, REFUS_FICHIER, contenuMedia, decisionRemplacement, REFUS_REMPLACEMENT, type ContenuMedia, lireDemandePage, type PageBibliotheque } from '@tiktrends/core';
import { safeFetch } from '@tiktrends/integrations/src/safe-fetch';
import { decideImportedImage, octetsDataUri } from '../../lib/import-image';
import { refusEcritureBibliotheque, refusLectureBibliotheque, TEXTE_REFUS_BIBLIOTHEQUE } from '../../lib/bibliotheque-acces';

type SessionBibliotheque = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/**
 * La feature `assets` du catalogue (`lib/rbac.ts` · rôle ET offre), appliquée à
 * chaque action qui ÉCRIT, réserve un crédit ou appelle l'IA · une action
 * serveur reste appelable directement, l'écran caché ne protège rien. Passe
 * AVANT toute lecture, écriture, réservation ou appel. Refus neutre · il ne
 * dépend jamais de l'objet visé.
 *
 * Tout nouvel export de ce fichier doit passer par une garde · le test
 * `securite-bibliotheque-db` énumère les exports et refuse un oubli.
 */
async function gardeBibliotheque(): Promise<{ s: SessionBibliotheque } | { error: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const refus = refusEcritureBibliotheque(s);
  if (refus) return { error: TEXTE_REFUS_BIBLIOTHEQUE[refus] };
  return { s };
}

/**
 * LECTURE seule · la règle d'avant (plancher de rôle, sans offre). Un espace
 * sous Core garde la vue sur ses médias existants.
 */
async function gardeLectureBibliotheque(): Promise<{ s: SessionBibliotheque } | { error: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const refus = refusLectureBibliotheque(s);
  if (refus) return { error: TEXTE_REFUS_BIBLIOTHEQUE[refus] };
  return { s };
}

export type AssetKind = 'image' | 'video' | 'audio' | 'other';
export interface AssetItem {
  id: string; name: string; kind: AssetKind; source: string; url: string;
  /** Vraie miniature (bucket) · vignette Drive persistée · null = repli sur `url`/type. */
  thumbUrl: string | null;
  brandId: string | null; useForAi: boolean; sizeBytes: number | null; tags: string[]; createdAt: string;
  /** Rangé dans les templates (coulisses) · booléen dérivé côté serveur · le
      marqueur technique ne traverse jamais le réseau. */
  isTemplate: boolean;
  /** Sortie LIVRÉE d'un projet Studios (`studio_assets`) · lecture seule dans la
      bibliothèque : ni suppression, ni bascule IA, ni template. Absent pour une
      ligne de la bibliothèque historique (`assets`). */
  studio?: OrigineStudioBibliotheque;
  /** Création d'un ANCIEN studio (retiré le 10/10) · lecture seule : ouvrir,
      télécharger, rien d'autre. Absent pour toute autre ligne. */
  historique?: { libelle: string; telecharger: string };
  /** Où vit le contenu (`contenuMedia`, noyau · stockage de l'application, base, ailleurs) · relu ici, jamais l'adresse elle-même. */
  contenu?: ContenuMedia;
}

const MAX_IMG_BYTES = 6_000_000; // garde-fou data URI (~6 Mo)
/** Téléversement sans bucket (data URI) · formats relus dans les octets. */
const FORMATS_TELEVERSES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Liste les assets. Par défaut, scope sur la MARQUE active (+ assets communs sans marque) :
 * chaque marque voit sa propre bibliothèque. Sans marque active, renvoie tout l'espace.
 * `brandOnly` force le strict-marque (exclut les communs).
 *
 * Corbeille · un fichier mis à la corbeille (`deleted_at` posé) n'est JAMAIS
 * rendu par défaut ; `corbeille: true` rend au contraire les seuls fichiers de
 * la corbeille (section « Corbeille » de la Bibliothèque), même portée.
 *
 * `id` · CE SEUL fichier, par la même lecture (même garde, même espace, même
 * portée, corbeille à part). La page `/assets` lit désormais ses médias par
 * `lib/bibliotheque-pages` (fenêtre, comptes, pages, lecture ciblée · même
 * portée). Un identifiant qui n'est pas un UUID ne lit rien.
 */
export async function listAssets(filter?: { kind?: AssetKind; brandOnly?: boolean; limit?: number; corbeille?: boolean; id?: string }): Promise<AssetItem[]> {
  const g = await gardeLectureBibliotheque();
  if ('error' in g) return [];
  const { s } = g;
  if (!db) return [];
  const cible = filter?.id === undefined ? null : idLienInterne(filter.id);
  if (filter?.id !== undefined && !cible) return [];
  const conds = [eq(schema.assets.workspaceId, s.workspaceId), filter?.corbeille ? isNotNull(schema.assets.deletedAt) : isNull(schema.assets.deletedAt)];
  if (cible) conds.push(eq(schema.assets.id, cible));
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
    externalId: schema.assets.externalId, thumbUrl: schema.assets.thumbUrl, objectEtag: schema.assets.objectEtag,
    embarquee: sql<boolean>`${schema.assets.url} like 'data:%'`,
    url: sql<string>`case when ${schema.assets.url} like 'data:%' then '' else ${schema.assets.url} end`,
  })
    .from(schema.assets).where(and(...conds))
    // À date égale, l'identifiant départage · le même ordre que le curseur des pages (`lirePageBibliotheque`).
    .orderBy(desc(schema.assets.createdAt), desc(schema.assets.id))
    .limit(cible ? 1 : Math.max(1, Math.min(filter?.limit ?? 400, 400)));

  return rows.map(toItem);
}

/**
 * Une PAGE de la Bibliothèque au-delà de ce que l'écran a chargé · « Charger
 * plus » d'un dossier ou de la corbeille, et la recherche sur TOUS les
 * fichiers de l'espace. LECTURE · la garde de lecture d'abord (plancher de
 * rôle, comme `listAssets`), puis la demande relue au noyau
 * (`lireDemandePage` · rien d'autre n'atteint la requête), puis la portée de
 * la session (espace, marque active et communs).
 */
export async function pageBibliothequeAction(demande: unknown): Promise<PageBibliotheque | { error: string }> {
  const g = await gardeLectureBibliotheque();
  if ('error' in g) return { error: g.error };
  const v = lireDemandePage(demande);
  if (!v.ok) return { error: v.raison };
  const marque = await getActiveBrand(g.s.workspaceId);
  return lirePageBibliotheque({ workspaceId: g.s.workspaceId, marque: marque?.id ?? null }, v.demande);
}

/** Téléverse des images (data URI) dans la bibliothèque. */
export async function uploadImageAssetsAction(input: { items: Array<{ name: string; dataUri: string }>; common?: boolean }): Promise<{ ok?: true; count?: number; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
  const brand = input.common ? null : await getActiveBrand(s.workspaceId);
  const rows = [] as Array<typeof schema.assets.$inferInsert>;
  for (const it of input.items || []) {
    const uri = (it.dataUri || '').trim();
    if (uri.length > MAX_IMG_BYTES) return { error: 'Image trop lourde (max ~4 Mo après compression).' };
    // Le préfixe `data:image/png` est écrit par le NAVIGATEUR · un SVG s'y
    // déguise sans effort. Le type se relit dans les octets, et le data URI est
    // reconstruit avec lui.
    const octets = octetsDataUri(uri);
    const type = octets ? typeMediaReel(octets) : null;
    if (!octets || !type || !FORMATS_TELEVERSES.has(type)) return { error: 'Formats acceptés : jpg, png, webp.' };
    rows.push({ workspaceId: s.workspaceId, brandId: brand?.id ?? null, uploaderUserId: s.user.id, name: (it.name || 'image').slice(0, 160), kind: 'image', source: 'upload', url: `data:${type};base64,${octets.toString('base64')}`, mimeType: type, sizeBytes: octets.length });
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
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
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

  let source: 'upload' | 'url' | 'drive' = drive.isDrive ? 'drive' : 'url';
  let externalId: string | null = drive.isDrive ? (drive.fileId ?? null) : null;
  let mimeType: string | null = null;

  // Image par lien NON-Drive · on en capture une copie DURABLE à l'import.
  //
  // Sans ça, l'aperçu dépendait d'une URL externe qui peut mourir (lien expiré,
  // hotlink, page supprimée) · l'aperçu cassait alors et retombait sur l'icône,
  // exactement le reproche remonté. On récupère l'image côté serveur (SSRF-safe,
  // plafonnée en taille), on la stocke en data URI embarqué (servi par nous,
  // comme un upload), et si ce n'est pas une image accessible on REFUSE plutôt
  // que de créer un asset qui pointe dans le vide. Drive garde son chemin proxy.
  if (!drive.isDrive && kind === 'image') {
    const fetched = await safeFetch(url);
    const decision = decideImportedImage(fetched);
    if (!decision.ok) return { error: decision.error };
    url = decision.dataUri;
    source = 'url';
    externalId = null;
    mimeType = decision.mimeType;
  }

  const brand = input.common ? null : await getActiveBrand(s.workspaceId);
  const rawName = (input.name || '').trim();
  // Le nom ne se dérive plus de l'URL quand elle est devenue un data URI (illisible).
  const fallbackName = url.startsWith('data:') ? 'image' : (url.split('/').pop()?.split('?')[0] || 'asset');
  const name = (rawName && rawName.toLowerCase() !== 'folders' ? rawName : fallbackName).slice(0, 160);
  await db.insert(schema.assets).values({
    workspaceId: s.workspaceId, brandId: brand?.id ?? null, uploaderUserId: s.user.id,
    // Sans l'id du fichier, un lien Drive était servi en « direct » vers une URL
    // Google qui renvoie du HTML, pas l'image · la miniature cassait puis tombait
    // sur l'icône. Avec l'id, il passe par le proxy /api/asset (comme la synchro
    // auto), qui télécharge le vrai fichier avec le jeton de l'espace.
    name, kind, source, url, externalId, mimeType,
    sizeBytes: url.startsWith('data:') ? Math.round(url.length * 0.75) : null,
  });
  return { ok: true };
}

/** Active/désactive l'usage d'un asset par l'IA. */
export async function toggleAssetAiAction(input: { id: string; useForAi: boolean }): Promise<{ ok?: true; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
  await db.update(schema.assets).set({ useForAi: input.useForAi }).where(and(eq(schema.assets.id, input.id), eq(schema.assets.workspaceId, s.workspaceId)));
  return { ok: true };
}

/** Levée DANS la transaction pour l'annuler · jamais sortie de ce fichier. */
class SelectionIncomplete extends Error {}

/**
 * Active/désactive l'usage par l'IA de PLUSIEURS fichiers d'un coup · « Servir
 * à l'IA » de la barre de sélection de la Bibliothèque. Même garde que le geste
 * unitaire (`toggleAssetAiAction`), AVANT toute lecture ; la liste et le
 * booléen sont validés au noyau (`validerIaSelection` · des UUID, dédoublonnés,
 * au plus `TAG_SELECTION_MAX`).
 *
 * TOUT OU RIEN · une seule mise à jour, dans une transaction, bornée à
 * l'espace de la session (même portée que les gestes unitaires) · si elle ne touche pas
 * EXACTEMENT chaque identifiant demandé (un fichier d'un autre espace, une
 * sortie Studios, un inconnu), la transaction est annulée et rien n'est écrit.
 * Aucune dépense · seul `use_for_ai` change.
 */
export async function basculerAssetsIaAction(input: { ids: string[]; useForAi: boolean }): Promise<{ ok?: true; n?: number; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
  const v = validerIaSelection(input?.ids, input?.useForAi);
  if (!v.ok) return { error: v.raison };
  const A = schema.assets;
  try {
    const n = await db.transaction(async (tx) => {
      const maj = await tx.update(A).set({ useForAi: v.useForAi })
        .where(and(eq(A.workspaceId, s.workspaceId), inArray(A.id, v.ids)))
        .returning({ id: A.id });
      if (maj.length !== v.ids.length) throw new SelectionIncomplete();
      return maj.length;
    });
    return { ok: true, n };
  } catch (e) {
    if (e instanceof SelectionIncomplete) return { error: 'Un fichier de la sélection est introuvable · rien n’a été modifié.' };
    throw e;
  }
}

/** La phrase d'une sélection de fichiers dont un identifiant n'est pas éligible · la même qu'un inconnu. */
const SELECTION_INTROUVABLE = 'Un fichier de la sélection est introuvable · rien n’a été modifié.';

/**
 * Met un ou PLUSIEURS fichiers à la CORBEILLE · « Mettre à la corbeille » de
 * l'aperçu (un id) et de la barre de sélection. Réversible : seule la colonne
 * `deleted_at` est posée · la ligne, son dossier, ses droits, son réglage IA
 * restent, et AUCUN objet du bucket n'est effacé (aucun appel au stockage).
 *
 * Même garde d'écriture que le reste de la Bibliothèque, AVANT toute lecture ;
 * la liste est validée au noyau (`validerSelectionFichiers` · des UUID,
 * dédoublonnés, au plus `TAG_SELECTION_MAX`). TOUT OU RIEN · une seule mise à
 * jour, dans une transaction, bornée à l'espace de la session et aux fichiers
 * VIVANTS · si elle ne touche pas EXACTEMENT chaque identifiant demandé (un
 * fichier d'un autre espace, déjà en corbeille, une sortie Studios, un
 * inconnu), la transaction est annulée et rien n'est écrit.
 */
export async function mettreAssetsCorbeilleAction(input: { ids: string[] }): Promise<{ ok?: true; n?: number; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
  const v = validerSelectionFichiers(input?.ids);
  if (!v.ok) return { error: v.raison };
  const A = schema.assets;
  try {
    const n = await db.transaction(async (tx) => {
      const maj = await tx.update(A).set({ deletedAt: new Date() })
        .where(and(eq(A.workspaceId, s.workspaceId), inArray(A.id, v.ids), isNull(A.deletedAt)))
        .returning({ id: A.id });
      if (maj.length !== v.ids.length) throw new SelectionIncomplete();
      return maj.length;
    });
    return { ok: true, n };
  } catch (e) {
    if (e instanceof SelectionIncomplete) return { error: SELECTION_INTROUVABLE };
    throw e;
  }
}

/**
 * Restaure un ou PLUSIEURS fichiers de la corbeille · `deleted_at` remis à
 * null, rien d'autre (le fichier revient dans son dossier, avec ses droits et
 * son réglage IA). Même garde, même validation, TOUT OU RIEN, bornée aux
 * fichiers de l'espace EN corbeille.
 */
export async function restaurerAssetsAction(input: { ids: string[] }): Promise<{ ok?: true; n?: number; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
  const v = validerSelectionFichiers(input?.ids);
  if (!v.ok) return { error: v.raison };
  const A = schema.assets;
  try {
    const n = await db.transaction(async (tx) => {
      const maj = await tx.update(A).set({ deletedAt: null })
        .where(and(eq(A.workspaceId, s.workspaceId), inArray(A.id, v.ids), isNotNull(A.deletedAt)))
        .returning({ id: A.id });
      if (maj.length !== v.ids.length) throw new SelectionIncomplete();
      return maj.length;
    });
    return { ok: true, n };
  } catch (e) {
    if (e instanceof SelectionIncomplete) return { error: SELECTION_INTROUVABLE };
    throw e;
  }
}

/** Un identifiant de média · `assets.id` est un UUID (une autre forme ferait échouer la requête). */
const ID_MEDIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Levée DANS la transaction du renommage pour l'annuler · porte la phrase du refus. */
class RenommageRefuse extends Error {}

/**
 * RENOMME un fichier de la bibliothèque (`assets.name`) · l'aperçu et le menu
 * « … » d'un fichier. Même garde d'écriture que le reste de la Bibliothèque,
 * AVANT toute lecture. Dans UNE transaction · le fichier est relu (ligne
 * verrouillée) dans l'espace de la session, VIVANT (hors corbeille) · un
 * fichier d'un autre espace, en corbeille, une sortie Studios ou une ancienne
 * création (absentes de `assets`), un identifiant illisible reçoivent la même
 * phrase qu'un inconnu. La règle du nom (`validerRenommageFichier` · rogné,
 * non vide, extension connue conservée, 160 caractères au plus, sans caractère
 * de contrôle ni invisible) vit au noyau (`nom-fichier.ts`). Seul `name`
 * change · ni l'objet du bucket, ni le type, ni le dossier.
 */
export async function renommerAssetAction(input: { id: string; nom: string }): Promise<{ ok?: true; nom?: string; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
  if (typeof input?.id !== 'string' || !ID_MEDIA.test(input.id)) return { error: REFUS_FICHIER.introuvable };
  const id = input.id.toLowerCase();
  const A = schema.assets;
  try {
    const nom = await db.transaction(async (tx) => {
      const [f] = await tx.select({ name: A.name }).from(A)
        .where(and(eq(A.id, id), eq(A.workspaceId, s.workspaceId), isNull(A.deletedAt))).for('update');
      const v = validerRenommageFichier(f ?? null, input?.nom);
      if (!v.ok) throw new RenommageRefuse(v.raison);
      const maj = await tx.update(A).set({ name: v.nom })
        .where(and(eq(A.id, id), eq(A.workspaceId, s.workspaceId), isNull(A.deletedAt)))
        .returning({ id: A.id });
      if (maj.length !== 1) throw new RenommageRefuse(REFUS_FICHIER.introuvable);
      return v.nom;
    });
    return { ok: true, nom };
  } catch (e) {
    if (e instanceof RenommageRefuse) return { error: e.message };
    throw e;
  }
}

/**
 * Range (ou retire) un asset dans les templates · les COULISSES · réservé à
 * l'agence (admin+). Le marqueur vit dans les tags (0 migration). Le client voit
 * et choisit les templates, mais ne peut jamais en poser · d'où la garde de rôle
 * AVANT toute écriture, en plus du cloisonnement d'espace.
 */
export async function basculerTemplateAction(input: { id: string; on: boolean }): Promise<{ ok?: true; isTemplate?: boolean; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'Seule l’agence (admin) gère les templates.' };
  const [a] = await db.select({ tags: schema.assets.tags }).from(schema.assets)
    .where(and(eq(schema.assets.id, input.id), eq(schema.assets.workspaceId, s.workspaceId))).limit(1);
  if (!a) return { error: 'Asset introuvable.' };
  const tags = avecTemplate(a.tags, input.on);
  await db.update(schema.assets).set({ tags }).where(and(eq(schema.assets.id, input.id), eq(schema.assets.workspaceId, s.workspaceId)));
  return { ok: true, isTemplate: input.on };
}

/** Tague une image par l'IA (vision) · débite 1 crédit (tag_image). Rend les tags. */
export async function tagAssetAction(input: { id: string }): Promise<{ ok?: true; tags?: string[]; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
  const client = guardedAnthropic({ workspaceId: s.workspaceId, action: 'assets' });
  if (!client) return { error: GUARD.aiOff() };
  // Un fichier en corbeille n'est pas analysé (aucun crédit, aucune IA) · même réponse qu'un inconnu.
  const [a] = await db.select({ id: schema.assets.id, kind: schema.assets.kind, url: schema.assets.url, tags: schema.assets.tags })
    .from(schema.assets).where(and(eq(schema.assets.id, input.id), eq(schema.assets.workspaceId, s.workspaceId), isNull(schema.assets.deletedAt))).limit(1);
  if (!a) return { error: 'Asset introuvable.' };
  if (a.kind !== 'image') return { error: 'Le tagging IA ne concerne que les images pour l’instant.' };

  const imageUrl = assetAiUrl(a.url, s.workspaceId);
  if (!imageUrl) return { error: 'Image inaccessible dans cet espace.' };

  // Débit atomique avant l'analyse (remboursé si elle échoue ou ne rend rien).
  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('tag_image', 1);
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Assets · tagging IA'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }

  let tags: string[] = [];
  try { ({ tags } = await describeAssetImage(client, imageUrl)); }
  catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · tagging IA');
    return { error: logAndTranslate('assets:tag', e, { subject: 'l’analyse de l’image', workspaceId: s.workspaceId }) };
  }
  if (!tags.length) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · tagging IA');
    return { error: "Aucun tag n'a pu être déduit." };
  }

  // Le tagging IA réécrit TOUS les tags · il doit assainir la sortie du modèle
  // (jamais poser le marqueur de template · réservé aux coulisses) ET préserver
  // le statut template existant (jamais le retirer par un chemin non gardé).
  const finaux = avecTemplate(tagsVisibles(tags), estTemplateAsset(a.tags));
  await db.update(schema.assets).set({ tags: finaux }).where(eq(schema.assets.id, a.id));
  return { ok: true, tags: tagsVisibles(tags) };
}

/** Tague en lot les images non taguées (max 20 par appel), débit par image. */
export async function tagUntaggedImagesAction(): Promise<{ ok?: true; tagged?: number; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
  const client = guardedAnthropic({ workspaceId: s.workspaceId, action: 'assets' });
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
      // La corbeille n'est jamais analysée · aucun crédit ne part sur un fichier jeté.
      isNull(schema.assets.deletedAt),
      sql`(${schema.assets.tags} is null or cardinality(${schema.assets.tags}) = 0)`,
    ))
    .orderBy(desc(schema.assets.createdAt)).limit(20);
  if (!todo.length) return { ok: true, tagged: 0 };

  let tagged = 0;
  for (const a of todo) {
    const imageUrl = assetAiUrl(a.url, s.workspaceId);
    if (!imageUrl) continue;
    // Une image = une réservation atomique ; on s'arrête net quand le solde est épuisé.
    if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Assets · tagging IA (lot)'))) break;
    let ok = false;
    try {
      const { tags } = await describeAssetImage(client, imageUrl);
      // Assainir la sortie du modèle · elle ne doit jamais poser le marqueur de
      // template (réservé admin). Ces images n'en ont pas (filtre « sans tags »).
      const propres = tagsVisibles(tags);
      if (propres.length) {
        await db.update(schema.assets).set({ tags: propres }).where(eq(schema.assets.id, a.id));
        tagged++;
        ok = true;
      }
    } catch { /* on continue */ }
    if (!ok && !unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · tagging IA (lot)');
  }
  return { ok: true, tagged };
}

/**
 * Demande une URL présignée pour téléverser un fichier directement vers le
 * bucket. Type, taille et extension sont décidés par le noyau
 * (`decisionDepot` · liste blanche, plafond par famille, extension forcée) ;
 * le type retenu est SIGNÉ dans l'adresse · le client doit l'envoyer tel quel
 * (`contentType` rendu) dans l'en-tête du PUT, sinon le bucket refuse. La
 * taille validée est signée en `Content-Length` · le client envoie le fichier
 * dont il a déclaré la taille (`File.size`), le bucket refuse toute autre
 * longueur.
 */
/**
 * Prépare un dépôt direct · l'adresse de PUT présignée, le type signé, et le
 * JETON DE DÉPÔT opaque (`jetonDepot`, scellé côté serveur · espace,
 * utilisateur, usage, clé, type et taille signés dans le lien, expiration
 * courte · `packages/core/src/jeton-depot.ts`). Aucune autre adresse du
 * stockage ne sort · le navigateur renvoie le jeton, jamais une adresse, à
 * l'action déclarée par `usage` (`envoi` · `registerUploadedAssetAction`,
 * `remplacement` · `remplacerAssetAction`, `logo` · `saveBrandDAAction`), qui
 * le résout en clé d'objet puis relit l'objet.
 */
export async function presignAssetUploadAction(input: { filename: string; contentType: string; sizeBytes: number; usage: UsageDepot }): Promise<{ uploadUrl?: string; contentType?: string; jetonDepot?: string; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  const usage = lireUsageDepot(input?.usage);
  if (!usage) return { error: REFUS_USAGE_DEPOT };
  const cfg = storageFromEnv();
  // Copie client · aucun nom de clé ni de « serveur » (recette #106b).
  if (!cfg) return { error: messageServiceInactif('stockage') };
  const d = decisionDepot({ nom: input?.filename, type: input?.contentType, taille: input?.sizeBytes });
  if (!d.ok) return { error: d.erreur };
  const key = newAssetKey(s.workspaceId, d.nomFichier);
  try {
    // Validité proportionnée à la taille VALIDÉE (`dureeLienDepot`, noyau) · une
    // image de 2 Mo n'a plus 15 minutes de ré-écriture après son envoi.
    const { uploadUrl } = presignPutUrl(cfg, key, { contentType: d.contentType, contentLength: d.contentLength }, dureeLienDepot(d.contentLength));
    const jetonDepot = scellerJetonDepot(jetonDepotPour({ espace: s.workspaceId, utilisateur: s.user.id, usage, cle: key, type: d.contentType, taille: d.contentLength, maintenant: Date.now() }));
    return { uploadUrl, contentType: d.contentType, jetonDepot };
  } catch (e) {
    return { error: logAndTranslate('assets:upload', e, { subject: 'la préparation du téléversement', workspaceId: s.workspaceId }) };
  }
}

/**
 * Le jeton de dépôt reçu, résolu en ADRESSE canonique de l'objet (celle
 * qu'enregistre la ligne) · refusé avec sa phrase s'il est absent, altéré,
 * d'un autre espace, d'un autre utilisateur, pour un autre usage ou expiré
 * (`resoudreJetonDepot`, noyau). Les vérifications d'avant s'appliquent
 * ensuite à l'adresse résolue (appartenance, relecture, ETag).
 */
function adresseDuJeton(jeton: unknown, s: SessionBibliotheque, usage: UsageDepot, cfg: NonNullable<ReturnType<typeof storageFromEnv>>): { url: string } | { error: string } {
  const r = resoudreJetonDepot(lireJetonDepot(jeton), { espace: s.workspaceId, utilisateur: s.user.id, usage, maintenant: Date.now() });
  if (!r.ok) return { error: r.erreur };
  return { url: publicUrlFor(cfg, r.cle) };
}

/** Un jeton ne fait entrer son objet qu'UNE fois · verrou de transaction sur l'adresse, le temps de vérifier et d'écrire. */
async function verrouDepot(tx: Pick<NonNullable<typeof db>, 'execute'>, url: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`depot:${url}`}))`);
}

/** Levée DANS la transaction de l'enregistrement pour l'annuler · porte la phrase du refus. */
class DepotDejaEmploye extends Error {}

/**
 * Enregistre un fichier déjà téléversé sur le bucket comme asset · le dépôt
 * est désigné par son JETON (`presignAssetUploadAction`, usage `envoi`),
 * jamais par une adresse venue du navigateur.
 */
export async function registerUploadedAssetAction(input: { name: string; jetonDepot: string; mimeType: string; sizeBytes: number; common?: boolean }): Promise<{ ok?: true; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
  const cfg = storageFromEnv();
  if (!cfg) return { error: messageServiceInactif('stockage') };
  const resolu = adresseDuJeton(input?.jetonDepot, s, 'envoi', cfg);
  if ('error' in resolu) return { error: resolu.error };
  const { url } = resolu;
  // Un téléversement ne s'enregistre que s'il est rangé chez CET espace
  // (`assets/<espace>/…` sous la base publique du bucket) · relu sur
  // l'adresse résolue, comme avant sur l'adresse reçue.
  // Une clé `drive-…` est celle de la synchro Drive, jamais un téléversement.
  const cle = cleTeleversable(url, basePubliqueStockage(cfg), s.workspaceId);
  if (!cle) return { error: MESSAGES_RELECTURE_DEPOT.hors_espace };
  // Rejoué · l'objet est déjà cité par une ligne, rien n'est relu ni retiré.
  const [dejaVu] = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.url, url)).limit(1);
  if (dejaVu) return { error: TEXTES_REFUS_JETON_FICHIER.deja_employe };
  // Le type et la taille se RELISENT dans l'objet (HEAD + début, liens signés
  // vers le stockage configuré · l'adresse n'est jamais requêtée telle quelle),
  // jamais ceux que le navigateur déclare (`decisionDepotRelu`, noyau).
  const lu = await lireDebutObjetEspace(cfg, url, s.workspaceId, OCTETS_RELUS_DEPOT);
  if (!lu.ok) return { error: MESSAGES_RELECTURE_DEPOT[lu.raison] };
  const d = decisionDepotRelu({ nom: cle.split('/').pop()!, typeDeclare: input.mimeType ?? '', octets: lu.octets, taille: lu.taille });
  if (!d.ok) {
    // Refusé · l'objet qu'on vient de déposer est retiré du bucket, sauf si une
    // ligne existante le référence déjà (aucune donnée existante n'est touchée).
    const [deja] = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.url, url)).limit(1);
    if (!deja) { try { await deleteObjectByUrl(cfg, url, s.workspaceId); } catch { /* best-effort */ } }
    return { error: d.erreur };
  }
  const brand = input.common ? null : await getActiveBrand(s.workspaceId);
  const base = db;
  // L'insertion qui échoue retire l'objet déposé, sauf si une ligne le cite
  // déjà (règle `decisionRetraitDepot`), puis l'erreur remonte comme avant.
  try {
    await ecrireApresDepot({
      storage: cfg, workspaceId: s.workspaceId, deposes: [url], references: referencesObjetEnBase,
      ecrire: () => base.transaction(async (tx) => {
        // Deux envois concurrents du même jeton · le second attend, puis voit la ligne du premier.
        await verrouDepot(tx, url);
        const [deja] = await tx.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.url, url)).limit(1);
        if (deja) throw new DepotDejaEmploye(TEXTES_REFUS_JETON_FICHIER.deja_employe);
        await tx.insert(schema.assets).values({
          workspaceId: s.workspaceId, brandId: brand?.id ?? null, uploaderUserId: s.user.id,
          name: (input.name || 'fichier').slice(0, 160), kind: d.kind,
          source: 'upload', url, mimeType: d.contentType, sizeBytes: d.taille,
          // L'ETag relu (et exigé à la lecture du début) · révèle un remplacement
          // ultérieur par le même lien de dépôt (`etatEmpreinte`, noyau).
          objectEtag: lu.empreinte,
        });
      }),
    });
  } catch (e) {
    if (e instanceof DepotDejaEmploye) return { error: e.message };
    throw e;
  }
  return { ok: true };
}

/** Levée DANS la transaction du remplacement pour l'annuler · porte la phrase du refus. */
class RemplacementRefuse extends Error {}

/**
 * REMPLACE un fichier de la bibliothèque par une nouvelle version, SOUS LE
 * MÊME IDENTIFIANT · « Remplacer » de l'aperçu et du menu « … » (V5 L35). Les
 * projets Studios qui citent `bib_<id>` relisent la ligne à chaque lecture
 * (catalogue, devis, génération) · ils liront la nouvelle adresse.
 *
 * Le navigateur a déposé la nouvelle version par `presignAssetUploadAction`
 * (usage `remplacement` · type, taille et durée signés), sous une NOUVELLE
 * clé, et ne renvoie que le JETON de ce dépôt. Ici, dans l'ordre :
 *  1. la garde d'écriture de la Bibliothèque, AVANT toute lecture ;
 *  2. le jeton est résolu en adresse (espace, utilisateur, usage, expiration ·
 *     `resoudreJetonDepot`) ; l'objet est rangé chez CET espace (`cleTeleversable`), puis
 *     RELU (HEAD + début, `If-Match` · `lireDebutObjetEspace`) et jugé comme
 *     un téléversement (`decisionDepotRelu` · type réel, taille relue) ;
 *  3. dans UNE transaction, la ligne est relue VERROUILLÉE dans l'espace,
 *     vivante (hors corbeille · une sortie Studios ou une ancienne création
 *     n'est pas dans `assets`), et jugée au noyau (`decisionRemplacement` ·
 *     un téléversement du stockage, même famille relue, autre objet) ; aucune
 *     autre ligne ne doit déjà citer le dépôt ;
 *  4. seules `url`, `mime_type`, `size_bytes`, `object_etag` changent, et
 *     `thumb_url` est vidée (une vignette décrivait l'ancien objet) · le nom,
 *     le dossier, les droits, le réglage IA, les tags et la date restent.
 * Tout refus après le dépôt, et tout échec d'écriture, RETIRE le nouvel objet
 * (`retirerDepotsSansLigne`, `ecrireApresDepot` · sauf si une ligne le cite).
 * L'ANCIEN objet n'est jamais effacé · plus cité par la ligne, il devient
 * candidat de l'inventaire des orphelins seulement si plus rien ne le cite.
 * Aucune dépense.
 */
export async function remplacerAssetAction(input: { id: string; jetonDepot: string; mimeType: string }): Promise<{ ok?: true; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
  const cfg = storageFromEnv();
  if (!cfg) return { error: REFUS_REMPLACEMENT.stockage };
  const resolu = adresseDuJeton(input?.jetonDepot, s, 'remplacement', cfg);
  if ('error' in resolu) return { error: resolu.error };
  const { url } = resolu;
  const cle = cleTeleversable(url, basePubliqueStockage(cfg), s.workspaceId);
  if (!cle) return { error: MESSAGES_RELECTURE_DEPOT.hors_espace };
  const references = referencesObjetEnBase;
  const retirer = async () => { try { await retirerDepotsSansLigne({ storage: cfg, workspaceId: s.workspaceId, deposes: [url], references }); } catch { /* au mieux · compté par l'inventaire */ } };
  if (typeof input?.id !== 'string' || !ID_MEDIA.test(input.id)) { await retirer(); return { error: REFUS_REMPLACEMENT.introuvable }; }
  const id = input.id.toLowerCase();
  // Le type et la taille se RELISENT dans l'objet déposé, jamais ceux que le navigateur déclare.
  const lu = await lireDebutObjetEspace(cfg, url, s.workspaceId, OCTETS_RELUS_DEPOT);
  if (!lu.ok) return { error: MESSAGES_RELECTURE_DEPOT[lu.raison] };
  const d = decisionDepotRelu({ nom: cle.split('/').pop()!, typeDeclare: typeof input?.mimeType === 'string' ? input.mimeType : '', octets: lu.octets, taille: lu.taille });
  if (!d.ok) { await retirer(); return { error: d.erreur }; }
  const A = schema.assets;
  const base = db;
  try {
    await ecrireApresDepot({
      storage: cfg, workspaceId: s.workspaceId, deposes: [url], references,
      ecrire: () => base.transaction(async (tx) => {
        // Un jeton ne sert qu'une fois · deux remplacements concurrents du même dépôt sont mis en file.
        await verrouDepot(tx, url);
        const vivant = and(eq(A.id, id), eq(A.workspaceId, s.workspaceId), isNull(A.deletedAt));
        const [f] = await tx.select({ kind: A.kind, source: A.source, url: A.url }).from(A).where(vivant).for('update');
        const v = decisionRemplacement(f ? { kind: f.kind, source: f.source, url: f.url, contenu: contenuMedia(f.url, objectKeyFromUrl(cfg, f.url) !== null) } : null, { kind: d.kind, url });
        if (!v.ok) throw new RemplacementRefuse(v.raison);
        const [deja] = await tx.select({ id: A.id }).from(A).where(eq(A.url, url)).limit(1);
        if (deja) throw new RemplacementRefuse(REFUS_REMPLACEMENT.dejaEnregistre);
        const maj = await tx.update(A)
          .set({ url, mimeType: d.contentType, sizeBytes: d.taille, objectEtag: lu.empreinte, thumbUrl: null })
          .where(vivant).returning({ id: A.id });
        if (maj.length !== 1) throw new RemplacementRefuse(REFUS_REMPLACEMENT.introuvable);
      }),
    });
    return { ok: true };
  } catch (e) {
    // `ecrireApresDepot` a déjà retiré le nouvel objet (sauf s'il est cité) · la phrase du refus remonte.
    if (e instanceof RemplacementRefuse) return { error: e.message };
    throw e;
  }
}

/**
 * Supprime DÉFINITIVEMENT un asset (+ l'objet physique sur le bucket si
 * téléversé) · réservé à un fichier DÉJÀ dans la corbeille (« Supprimer
 * définitivement », confirmé dans l'aperçu). Un fichier vivant, d'un autre
 * espace ou inconnu reçoit le même refus, rien n'est touché. Le reste du
 * comportement est celui d'avant. Aucune purge automatique n'appelle cette action.
 */
export async function deleteAssetAction(input: { id: string }): Promise<{ ok?: true; error?: string }> {
  const g = await gardeBibliotheque();
  if ('error' in g) return { error: g.error };
  const { s } = g;
  if (!db) return { error: GUARD.session() };
  if (typeof input?.id !== 'string' || !input.id) return { error: REFUS_SUPPRESSION_HORS_CORBEILLE };
  const enCorbeille = and(eq(schema.assets.id, input.id), eq(schema.assets.workspaceId, s.workspaceId), isNotNull(schema.assets.deletedAt));
  const [row] = await db.select({ url: schema.assets.url, source: schema.assets.source })
    .from(schema.assets).where(enCorbeille).limit(1);
  if (!row) return { error: REFUS_SUPPRESSION_HORS_CORBEILLE };
  await db.delete(schema.assets).where(enCorbeille);
  // Suppression physique best-effort du fichier stocké sur le bucket ·
  // seulement s'il est rangé chez CET espace (`deleteObjectByUrl` relit la
  // règle `cleObjetDeLEspace` et n'envoie rien sinon). Une ligne ancienne qui
  // pointerait ailleurs perd sa ligne, jamais l'objet d'un autre espace.
  const cfg = storageFromEnv();
  // Et seulement si plus AUCUNE ligne ne référence le même objet (doublon,
  // ligne d'un autre espace qui partagerait l'adresse) · supprimer l'objet
  // casserait l'autre ligne.
  if (cfg && row?.source === 'upload' && row.url) {
    const [autre] = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.url, row.url)).limit(1);
    if (!autre) { try { await deleteObjectByUrl(cfg, row.url, s.workspaceId); } catch { /* best-effort */ } }
  }
  return { ok: true };
}
