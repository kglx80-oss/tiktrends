/**
 * Lecture EN FLUX d'un fichier de la bibliothèque · pour l'archive ZIP
 * (`/api/bibliotheque/archive`). Le fichier n'est jamais chargé en entier :
 * on rend le corps de la réponse, que l'archive consomme morceau par morceau.
 *
 * Sûreté (mêmes portes que le proxy `/api/asset/[id]`) :
 *  - objet du bucket · l'adresse vient de la BASE (`assets.url`), jamais du
 *    client ; elle doit désigner un objet de l'espace (`privateObjectUrl` ·
 *    clé `assets/<espace>/…` du bucket configuré), sinon `null` et AUCUNE
 *    requête. La requête part vers `cfg.endpoint` (hôte fixé par le serveur),
 *    signée, redirections refusées ;
 *  - Google Drive · l'identifiant vient de la base (`assets.external_id`), le
 *    jeton de l'espace ; redirections suivies par Google seulement (hôte
 *    `googleapis.com` fixé ici) ;
 *  - délai borné jusqu'aux EN-TÊTES seulement · un gros fichier se lit aussi
 *    longtemps que le client télécharge, sans être coupé au milieu.
 */
import { objectKeyFromUrl, presignHeadUrl, privateObjectUrl, type StorageConfig } from './storage';

const DRIVE = 'https://www.googleapis.com/drive/v3';

async function ouvrir(url: string, init: RequestInit, delaiMs: number): Promise<ReadableStream<Uint8Array> | null> {
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), delaiMs);
  try {
    const res = await fetch(url, { ...init, cache: 'no-store', signal: ctrl.signal });
    if (res.status !== 200 || !res.body) {
      try { await res.body?.cancel(); } catch { /* flux déjà clos */ }
      return null;
    }
    return res.body;
  } catch {
    return null;
  } finally {
    clearTimeout(minuterie);
  }
}

/** Le corps d'un objet du bucket de l'espace · `null` hors espace (aucune requête), absent ou illisible. */
export async function fluxObjetEspace(cfg: StorageConfig, url: string, workspaceId: string, delaiMs = 15_000): Promise<ReadableStream<Uint8Array> | null> {
  const signee = privateObjectUrl(cfg, url, workspaceId, 300);
  if (!signee) return null;
  return ouvrir(signee, { method: 'GET', redirect: 'manual' }, delaiMs);
}

/** Le corps d'un fichier Google Drive · `null` absent ou refusé. */
export async function fluxFichierDrive(accessToken: string, fileId: string, delaiMs = 15_000): Promise<ReadableStream<Uint8Array> | null> {
  if (!fileId || /[\/\\?#]/.test(fileId)) return null;
  return ouvrir(`${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } }, delaiMs);
}

/* ───────────── La TAILLE d'un fichier sans `size_bytes` · relue avant la décision ───────────── */

/**
 * La taille d'un objet du bucket de l'espace · `HEAD` signé (même clé, même
 * hôte, même refus hors espace que `fluxObjetEspace` · aucune requête hors
 * espace), redirections refusées, `content-length` seul cru. La valeur brute
 * est rendue · `tailleRelue` (noyau) la juge.
 */
export async function enteteTailleObjetEspace(cfg: StorageConfig, url: string, workspaceId: string, delaiMs = 5_000): Promise<string | null> {
  if (!workspaceId || /[\/\\]/.test(workspaceId)) return null;
  const cle = objectKeyFromUrl(cfg, url);
  if (!cle?.startsWith(`assets/${workspaceId}/`)) return null;
  try {
    const res = await fetch(presignHeadUrl(cfg, cle, 60), { method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(delaiMs) });
    try { await res.body?.cancel(); } catch { /* aucun corps */ }
    return res.status === 200 ? res.headers.get('content-length') : null;
  } catch {
    return null;
  }
}

/** Plus que `{"size":"…"}` · un corps de métadonnées plus long n'est pas lu. */
const META_MAX = 4_096;

/**
 * La taille d'un fichier Google Drive · métadonnée `size` (champ seul), lue
 * avec le jeton de l'espace. Un document natif Google (Docs, Sheets) n'en a
 * pas · `null`. La valeur brute est rendue · `tailleRelue` (noyau) la juge.
 */
export async function metaTailleFichierDrive(accessToken: string, fileId: string, delaiMs = 5_000): Promise<unknown> {
  if (!fileId || /[\/\\?#]/.test(fileId)) return null;
  try {
    const res = await fetch(`${DRIVE}/files/${encodeURIComponent(fileId)}?fields=size&supportsAllDrives=true`, {
      method: 'GET', headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(delaiMs),
    });
    if (res.status !== 200) { try { await res.body?.cancel(); } catch { /* rien */ } return null; }
    const texte = await res.text();
    if (texte.length > META_MAX) return null;
    const j = JSON.parse(texte) as { size?: unknown } | null;
    return j && typeof j === 'object' ? j.size ?? null : null;
  } catch {
    return null;
  }
}
