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
 * Prérequis côté bucket : lecture publique des objets + CORS autorisant PUT depuis l'app.
 */
import { createHash, createHmac, randomUUID } from 'crypto';

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
export function presignPutUrl(cfg: StorageConfig, key: string, expiresSeconds = 900): { uploadUrl: string; publicUrl: string } {
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
  const canonicalRequest = ['PUT', canonicalUri, canonicalQuery, canonicalHeaders, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

  const kDate = createHmac('sha256', 'AWS4' + cfg.secretAccessKey).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(cfg.region).digest();
  const kService = createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const uploadUrl = `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  return { uploadUrl, publicUrl: publicUrlFor(cfg, key) };
}
