/**
 * Stockage objet S3-compatible (OVH Object Storage, AWS S3, etc.).
 * Upload direct navigateur -> bucket via URL présignée (SigV4), sans faire transiter
 * les gros fichiers par notre serveur. Aucune clé n'est exposée côté client.
 *
 * Variables d'environnement :
 *   S3_ENDPOINT           hôte du service (ex : s3.gra.io.cloud.ovh.net)
 *   S3_REGION             région (ex : gra) · défaut « gra »
 *   S3_BUCKET             nom du bucket / conteneur
 *   S3_ACCESS_KEY_ID      clé d'accès
 *   S3_SECRET_ACCESS_KEY  clé secrète
 *   S3_PUBLIC_BASE_URL    (option) base publique/CDN de lecture · défaut https://{endpoint}/{bucket}
 *
 * Prérequis côté bucket : objets privés + CORS autorisant PUT depuis l'app.
 */
import { createHash, createHmac, randomUUID } from 'crypto';
import { cleObjetDeLEspace } from '@tiktrends/core';

export interface StorageConfig {
  endpoint: string;      // hôte sans schéma
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
}

export function storageFromEnv(): StorageConfig | null {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    region: process.env.S3_REGION || 'gra',
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, ''),
  };
}

export function storageConfigured(): boolean {
  return !!storageFromEnv();
}

function enc(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
function encKey(key: string): string {
  return key.split('/').map(enc).join('/');
}

/** URL publique de lecture d'un objet. */
export function publicUrlFor(cfg: StorageConfig, key: string): string {
  if (cfg.publicBaseUrl) return `${cfg.publicBaseUrl}/${encKey(key)}`;
  return `https://${cfg.endpoint}/${cfg.bucket}/${encKey(key)}`;
}

/** Génère une clé d'objet unique et sûre pour un fichier. */
export function newAssetKey(workspaceId: string, filename: string): string {
  const safe = (filename || 'file').toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'file';
  return `assets/${workspaceId}/${Date.now()}-${randomUUID().slice(0, 8)}-${safe}`;
}

/**
 * URL présignée (SigV4, query-auth) pour un PUT direct. Le client téléverse le fichier
 * en PUT sur `uploadUrl`, puis on enregistre `publicUrl` comme URL de l'asset.
 */
function presignObjectUrl(cfg: StorageConfig, key: string, method: 'PUT' | 'GET' | 'HEAD', expiresSeconds: number): string {
  if (!key || key.startsWith('/') || key.split('/').some(p => !p || p === '.' || p === '..') || /[\\\x00-\x1f\x7f]/.test(key)) throw new Error('Clé objet invalide');
  if (!Number.isInteger(expiresSeconds) || expiresSeconds < 1 || expiresSeconds > 900) throw new Error('Durée du lien invalide');
  const host = cfg.endpoint;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const amzDate = `${dateStamp}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const canonicalUri = `/${cfg.bucket}/${encKey(key)}`;
  const credential = `${cfg.accessKeyId}/${dateStamp}/${cfg.region}/s3/aws4_request`;

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k]!)}`).join('&');
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

  const kDate = createHmac('sha256', 'AWS4' + cfg.secretAccessKey).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(cfg.region).digest();
  const kService = createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const uploadUrl = `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  return uploadUrl;
}

export function presignPutUrl(cfg: StorageConfig, key: string, expiresSeconds = 900): { uploadUrl: string; publicUrl: string } {
  return { uploadUrl: presignObjectUrl(cfg, key, 'PUT', expiresSeconds), publicUrl: publicUrlFor(cfg, key) };
}

/** Accès temporaire, émis uniquement après vérification de la portée par l'appelant. Jamais persisté. */
export function presignGetUrl(cfg: StorageConfig, key: string, expiresSeconds = 300): string {
  return presignObjectUrl(cfg, key, 'GET', expiresSeconds);
}

export function presignHeadUrl(cfg: StorageConfig, key: string, expiresSeconds = 300): string {
  return presignObjectUrl(cfg, key, 'HEAD', expiresSeconds);
}

/** Reconnaît uniquement une adresse canonique du bucket configuré, jamais une URL arbitraire. */
export function objectKeyFromUrl(cfg: StorageConfig, url: string): string | null {
  try {
    const u = new URL(url);
    if (u.username || u.password || u.search || u.hash || u.protocol !== 'https:') return null;
    const bases = [basePubliqueStockage(cfg), `https://${cfg.endpoint}/${cfg.bucket}`, `https://${cfg.bucket}.${cfg.endpoint}`];
    for (const base of bases) {
      const b = new URL(base);
      const prefix = b.pathname.replace(/\/+$/, '') + '/';
      if (u.origin !== b.origin || !u.pathname.startsWith(prefix)) continue;
      const key = decodeURIComponent(u.pathname.slice(prefix.length));
      if (!key || /[\\\x00-\x1f\x7f]/.test(key) || key.split('/').some(p => !p || p === '.' || p === '..')) return null;
      return key;
    }
  } catch { /* adresse non canonique */ }
  return null;
}

export function privateObjectUrl(cfg: StorageConfig, url: string, workspaceId: string, expiresSeconds = 300): string | null {
  if (!workspaceId || /[\/\\]/.test(workspaceId)) return null;
  const key = objectKeyFromUrl(cfg, url);
  return key?.startsWith(`assets/${workspaceId}/`) ? presignGetUrl(cfg, key, expiresSeconds) : null;
}

/* ============ Requêtes S3 signées (SigV4, header Authorization) ============ */

function pad(n: number): string { return String(n).padStart(2, '0'); }
function amzTimes(d = new Date()) {
  const dateStamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const amzDate = `${dateStamp}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  return { dateStamp, amzDate };
}

/** Exécute une requête S3 signée (SigV4). `path` = chemin déjà encodé (ex: /bucket/key). */
async function s3SignedFetch(cfg: StorageConfig, method: string, path: string, query: Record<string, string>, body: Buffer, extra: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  const host = cfg.endpoint;
  const { dateStamp, amzDate } = amzTimes();
  const payloadHash = createHash('sha256').update(body).digest('hex');

  // En-têtes signés (noms en minuscules).
  const headers: Record<string, string> = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  for (const [k, v] of Object.entries(extra)) headers[k.toLowerCase()] = v;

  const signedKeys = Object.keys(headers).sort();
  const canonicalHeaders = signedKeys.map((k) => `${k}:${String(headers[k]).trim()}`).join('\n') + '\n';
  const signedHeaders = signedKeys.join(';');
  const canonicalQuery = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k]!)}`).join('&');
  const canonicalRequest = [method, path, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const kDate = createHmac('sha256', 'AWS4' + cfg.secretAccessKey).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(cfg.region).digest();
  const kService = createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${path}${canonicalQuery ? '?' + canonicalQuery : ''}`;
  // On ne repasse pas « host » à fetch (undici le pose depuis l'URL).
  const sendHeaders: Record<string, string> = { authorization, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  for (const [k, v] of Object.entries(extra)) sendHeaders[k] = v;

  const res = await fetch(url, { method, headers: sendHeaders, body: body.length ? new Uint8Array(body) : undefined });
  return { status: res.status, text: await res.text() };
}

/** Applique une politique de lecture publique (GET) sur le bucket. */
export async function putBucketPublicRead(cfg: StorageConfig): Promise<{ ok: boolean; status: number; detail: string }> {
  const policy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{ Sid: 'PublicRead', Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: `arn:aws:s3:::${cfg.bucket}/*` }],
  });
  const r = await s3SignedFetch(cfg, 'PUT', `/${cfg.bucket}`, { policy: '' }, Buffer.from(policy), { 'content-type': 'application/json' });
  return { ok: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 400) };
}

/** Configure le CORS du bucket (PUT/GET/HEAD depuis les origines données). */
export async function putBucketCors(cfg: StorageConfig, origins: string[]): Promise<{ ok: boolean; status: number; detail: string }> {
  const originXml = origins.map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration><CORSRule>${originXml}<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>3000</MaxAgeSeconds></CORSRule></CORSConfiguration>`;
  const body = Buffer.from(xml);
  const md5 = createHash('md5').update(body).digest('base64');
  const r = await s3SignedFetch(cfg, 'PUT', `/${cfg.bucket}`, { cors: '' }, body, { 'content-type': 'application/xml', 'content-md5': md5 });
  return { ok: r.status >= 200 && r.status < 300, status: r.status, detail: r.text.slice(0, 400) };
}

/** Test bout en bout : upload d'un objet témoin, lecture publique, suppression. */
export async function storageSelfTest(cfg: StorageConfig): Promise<{ put: boolean; publicRead: boolean; deleted: boolean; publicUrl: string; error?: string }> {
  const key = `assets/_healthcheck/${randomUUID()}.txt`;
  const body = Buffer.from('tiktrends-ok');
  const path = `/${cfg.bucket}/${encKey(key)}`;
  const publicUrl = publicUrlFor(cfg, key);
  try {
    const put = await s3SignedFetch(cfg, 'PUT', path, {}, body, { 'content-type': 'text/plain' });
    const putOk = put.status >= 200 && put.status < 300;
    let publicRead = false;
    if (putOk) {
      try { const g = await fetch(publicUrl); publicRead = g.ok && (await g.text()).includes('tiktrends-ok'); } catch { publicRead = false; }
    }
    const del = await s3SignedFetch(cfg, 'DELETE', path, {}, Buffer.alloc(0));
    return { put: putOk, publicRead, deleted: del.status >= 200 && del.status < 300, publicUrl, error: putOk ? undefined : `Upload refusé (HTTP ${put.status}) ${put.text.slice(0, 200)}` };
  } catch (e) {
    return { put: false, publicRead: false, deleted: false, publicUrl, error: (e as Error).message };
  }
}

export interface StorageDiagnostic {
  cible: 'ecriture' | 'lecture_signee' | 'bucket_anonyme' | 'lecture_configuree_anonyme' | 'suppression';
  statut: number | null;
  resultat: 'ok' | 'refus' | 'accessible' | 'introuvable' | 'redirection' | 'contenu_inattendu' | 'http_inattendu' | 'reseau';
}

/** Diagnostic du bucket privé ; statuts seuls, jamais de média, clé, URL ou corps fournisseur. */
export async function storagePrivateSelfTest(cfg: StorageConfig): Promise<{ put: boolean; privateRead: boolean; anonymousDenied: boolean; deleted: boolean; diagnostics: StorageDiagnostic[]; error?: string }> {
  const key = `assets/_healthcheck/${randomUUID()}.txt`;
  const body = Buffer.from('tiktrends-ok');
  const path = `/${cfg.bucket}/${encKey(key)}`;
  const result = { put: false, privateRead: false, anonymousDenied: false, deleted: false, diagnostics: [] as StorageDiagnostic[], error: undefined as string | undefined };
  let etape: StorageDiagnostic['cible'] = 'ecriture';
  try {
    const put = await s3SignedFetch(cfg, 'PUT', path, {}, body, { 'content-type': 'text/plain' });
    result.put = put.status >= 200 && put.status < 300;
    result.diagnostics.push({ cible: etape, statut: put.status, resultat: result.put ? 'ok' : 'http_inattendu' });
    if (!result.put) { result.error = `Écriture refusée (HTTP ${put.status})`; return result; }
    etape = 'lecture_signee';
    const read = await fetch(presignGetUrl(cfg, key, 60), { redirect: 'manual', signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    result.privateRead = read.ok && await read.text() === 'tiktrends-ok';
    result.diagnostics.push({ cible: etape, statut: read.status, resultat: result.privateRead ? 'ok' : read.status >= 300 && read.status < 400 ? 'redirection' : read.ok ? 'contenu_inattendu' : 'http_inattendu' });
    const nativeUrl = `https://${cfg.endpoint}/${cfg.bucket}/${encKey(key)}`;
    const configuredUrl = publicUrlFor(cfg, key);
    const anonymousUrls: Array<{ cible: StorageDiagnostic['cible']; url: string }> = [{ cible: 'bucket_anonyme', url: nativeUrl }];
    if (configuredUrl !== nativeUrl) anonymousUrls.push({ cible: 'lecture_configuree_anonyme', url: configuredUrl });
    result.anonymousDenied = true;
    for (const { cible, url } of anonymousUrls) {
      try {
        // Observer le statut sans suivre une redirection vers un CDN ou un autre hôte.
        const anonymous = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), cache: 'no-store' });
        const denied = anonymous.status === 403 || anonymous.status === 401;
        result.anonymousDenied = result.anonymousDenied && denied;
        result.diagnostics.push({ cible, statut: anonymous.status, resultat: denied ? 'refus' : anonymous.ok ? 'accessible' : anonymous.status === 404 ? 'introuvable' : anonymous.status >= 300 && anonymous.status < 400 ? 'redirection' : 'http_inattendu' });
      } catch {
        result.anonymousDenied = false;
        result.diagnostics.push({ cible, statut: null, resultat: 'reseau' });
      }
    }
  } catch {
    result.anonymousDenied = false;
    result.diagnostics.push({ cible: etape, statut: null, resultat: 'reseau' });
    result.error = 'Diagnostic interrompu. Vérifie la connexion et les droits du stockage.';
  } finally {
    try {
      const del = await s3SignedFetch(cfg, 'DELETE', path, {}, Buffer.alloc(0));
      result.deleted = del.status >= 200 && del.status < 300;
      result.diagnostics.push({ cible: 'suppression', statut: del.status, resultat: result.deleted ? 'ok' : 'http_inattendu' });
    } catch { result.deleted = false; result.diagnostics.push({ cible: 'suppression', statut: null, resultat: 'reseau' }); }
  }
  return result;
}

/** Téléverse des octets vers le bucket (serveur -> S3) et renvoie l'URL publique. */
export async function putObject(cfg: StorageConfig, key: string, bytes: Buffer, contentType: string): Promise<string> {
  const r = await s3SignedFetch(cfg, 'PUT', `/${cfg.bucket}/${encKey(key)}`, {}, bytes, { 'content-type': contentType || 'application/octet-stream' });
  if (r.status < 200 || r.status >= 300) throw new Error(`Upload S3 échoué (HTTP ${r.status})`);
  return publicUrlFor(cfg, key);
}

/** Base publique de lecture des objets · celle que `publicUrlFor` préfixe. */
export function basePubliqueStockage(cfg: StorageConfig): string {
  return cfg.publicBaseUrl || `https://${cfg.endpoint}/${cfg.bucket}`;
}

/**
 * Supprime physiquement un objet du bucket (best-effort), UNIQUEMENT s'il
 * appartient à l'espace `workspaceId` (`assets/<espace>/…`, règle
 * `cleObjetDeLEspace` du noyau). Avant, seul le préfixe du bucket était
 * vérifié : un membre d'un espace pouvait faire supprimer l'objet d'un autre.
 * Hors préfixe de l'espace ⇒ `false`, aucune requête envoyée.
 */
export async function deleteObjectByUrl(cfg: StorageConfig, url: string, workspaceId: string): Promise<boolean> {
  const key = cleObjetDeLEspace(url, basePubliqueStockage(cfg), workspaceId);
  if (!key) return false;
  try {
    const r = await s3SignedFetch(cfg, 'DELETE', `/${cfg.bucket}/${encKey(key)}`, {}, Buffer.alloc(0));
    return r.status >= 200 && r.status < 300;
  } catch { return false; }
}
