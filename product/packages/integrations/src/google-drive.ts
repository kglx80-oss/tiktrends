/**
 * Google Drive · OAuth (accès offline, refresh token) + lecture des fichiers d'un dossier choisi.
 * Modèle « drive.file » (comme Atria) : scope NON sensible, aucune vérification Google requise.
 * L'utilisateur choisit son dossier via le sélecteur Google natif (Picker) ; l'app n'accède
 * ensuite qu'à ce dossier et à son contenu. N'importe quel client se connecte en 1 clic.
 *
 * Env : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL (OAuth) · GOOGLE_API_KEY, GOOGLE_APP_ID (Picker).
 * Redirect URI : {APP_URL}/api/oauth/google/callback
 * Scope : https://www.googleapis.com/auth/drive.file
 */
const OAUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const DRIVE = 'https://www.googleapis.com/drive/v3';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL);
}

/** Le Picker exige en plus une clé API et l'ID de projet (numéro) côté navigateur. */
export function drivePickerConfigured(): boolean {
  return googleConfigured() && !!process.env.GOOGLE_API_KEY && !!process.env.GOOGLE_APP_ID;
}

export function buildGoogleAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: (process.env.APP_URL || '') + '/api/oauth/google/callback',
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${OAUTH}?${q.toString()}`;
}

/** Échange le code contre les tokens (access + refresh). */
export async function googleExchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string }> {
  const body = new URLSearchParams({
    code, client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect_uri: (process.env.APP_URL || '') + '/api/oauth/google/callback', grant_type: 'authorization_code',
  });
  const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).then((x) => x.json()) as { access_token?: string; refresh_token?: string; error?: string };
  if (!r.access_token) throw new Error('Google : échange du code échoué.');
  return { accessToken: r.access_token, refreshToken: r.refresh_token };
}

/** Renouvelle un access token à partir du refresh token. */
export async function googleAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: refreshToken, client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', grant_type: 'refresh_token',
  });
  const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).then((x) => x.json()) as { access_token?: string; error?: string };
  if (!r.access_token) throw new Error('Google : refresh du token échoué.');
  return r.access_token;
}

export interface DriveFolder { id: string; name: string }
export interface DriveFile { id: string; name: string; mimeType: string; size?: number; webViewLink?: string; thumbnailLink?: string }

async function driveGet<T>(accessToken: string, path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${DRIVE}/${path}?${qs}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = await r.json() as T & { error?: { message: string } };
  if (!r.ok || j.error) throw new Error('Drive : ' + (j.error?.message || `HTTP ${r.status}`));
  return j;
}

/** Liste les dossiers accessibles (pour le sélecteur). */
export async function driveListFolders(accessToken: string): Promise<DriveFolder[]> {
  const j = await driveGet<{ files: DriveFolder[] }>(accessToken, 'files', {
    q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id,name)', pageSize: '100', orderBy: 'name',
  });
  return j.files || [];
}

/** Liste les fichiers média d'un dossier (images, vidéos, audio) · niveau direct uniquement. */
export async function driveListFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const j = await driveGet<{ files: DriveFile[] }>(accessToken, 'files', {
    q: `'${folderId}' in parents and trashed=false and (mimeType contains 'image/' or mimeType contains 'video/' or mimeType contains 'audio/')`,
    fields: 'files(id,name,mimeType,size,webViewLink,thumbnailLink)', pageSize: '200', orderBy: 'createdTime desc',
  });
  return (j.files || []).map((f) => ({ ...f, size: f.size ? Number(f.size) : undefined }));
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Parcourt un dossier ET ses sous-dossiers (arborescence) et remonte tous les fichiers média.
 * Borné pour rester sûr : maxFiles fichiers et maxFolders dossiers visités au total.
 */
export async function driveListFilesDeep(accessToken: string, rootId: string, o?: { maxFiles?: number; maxFolders?: number }): Promise<DriveFile[]> {
  const maxFiles = o?.maxFiles ?? 500;
  const maxFolders = o?.maxFolders ?? 200;
  const out: DriveFile[] = [];
  const queue: string[] = [rootId];
  let visited = 0;

  while (queue.length && out.length < maxFiles && visited < maxFolders) {
    const folderId = queue.shift()!;
    visited++;
    let pageToken: string | undefined;
    do {
      const params: Record<string, string> = {
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken,files(id,name,mimeType,size,webViewLink,thumbnailLink)',
        pageSize: '200', orderBy: 'folder,createdTime desc',
      };
      if (pageToken) params.pageToken = pageToken;
      const j = await driveGet<{ files: DriveFile[]; nextPageToken?: string }>(accessToken, 'files', params);
      for (const f of j.files || []) {
        if (f.mimeType === FOLDER_MIME) { if (queue.length + visited < maxFolders) queue.push(f.id); continue; }
        if (/^(image|video|audio)\//.test(f.mimeType)) {
          out.push({ ...f, size: f.size ? Number(f.size) : undefined });
          if (out.length >= maxFiles) break;
        }
      }
      pageToken = j.nextPageToken;
    } while (pageToken && out.length < maxFiles);
  }
  return out;
}

/** Télécharge le contenu binaire d'un fichier Drive. */
export async function driveDownload(accessToken: string, fileId: string): Promise<Buffer> {
  const r = await fetch(`${DRIVE}/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`Drive download HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
