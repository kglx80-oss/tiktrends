/**
 * Un objet du bucket appartient-il à CET espace ? · la règle, pure.
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * `registerUploadedAssetAction` enregistrait n'importe quelle URL https comme
 * un téléversement (`source: 'upload'`), et `deleteAssetAction` supprimait
 * ensuite l'objet physique par `deleteObjectByUrl`, qui ne vérifiait que le
 * préfixe du BUCKET. Les clés Drive sont prévisibles
 * (`assets/<espace>/drive-<idDrive>.<ext>`) : un membre d'un espace B
 * enregistrait l'URL d'un objet de l'espace A, puis supprimait « son » asset,
 * et l'objet de A disparaissait du bucket.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Une URL n'est reconnue comme un objet de l'espace que si elle est EXACTEMENT
 * `<base publique>/assets/<espace>/<suite>` :
 *  - la base se termine par une frontière `/` (`…/bucket-voisin/…` n'est pas
 *    `…/bucket/…`) ;
 *  - la suite ne contient que `[A-Za-z0-9._-]` et des `/` · tout ce que
 *    fabriquent `newAssetKey` et la synchro Drive, rien de plus. Donc aucun
 *    `%` (ni encodage simple ni double), aucun `@`, `?`, `#`, `\`, espace ;
 *  - aucun segment vide, `.` ou `..` (pas de remontée vers un autre espace,
 *    même après normalisation de l'URL par le client HTTP) ;
 *  - au moins un segment après `assets/<espace>/`.
 * Sinon `null` : on n'enregistre pas, on ne supprime pas.
 */

const SUITE_SURE = /^[A-Za-z0-9._\-/]+$/;
const ESPACE_SUR = /^[A-Za-z0-9-]+$/;

/**
 * La clé d'objet (`assets/<espace>/…`) quand `url` désigne un objet de
 * l'espace `workspaceId` sous la base publique `base`, sinon `null`.
 */
export function cleObjetDeLEspace(url: string, base: string, workspaceId: string): string | null {
  if (typeof url !== 'string' || typeof base !== 'string' || typeof workspaceId !== 'string') return null;
  if (!ESPACE_SUR.test(workspaceId)) return null;
  const racine = base.replace(/\/+$/, '');
  if (!/^https?:\/\/[^/?#@\\]+/i.test(racine)) return null;
  if (!url.startsWith(`${racine}/`)) return null;
  const cle = url.slice(racine.length + 1);
  if (!SUITE_SURE.test(cle)) return null;
  const segments = cle.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  if (segments.length < 3 || segments[0] !== 'assets' || segments[1] !== workspaceId) return null;
  return cle;
}

/**
 * Le nom de fichier d'une clé · `drive-…` est réservé à la synchro Drive (clé
 * prévisible, `assets/<espace>/drive-<idDrive>.<ext>`). Un TÉLÉVERSEMENT ne
 * l'enregistre jamais : sinon un membre enregistrerait l'objet Drive d'une
 * marque comme un téléversement, et sa suppression effacerait la copie que la
 * synchro partage avec d'autres lignes.
 */
export function cleTeleversable(url: string, base: string, workspaceId: string): string | null {
  const cle = cleObjetDeLEspace(url, base, workspaceId);
  if (!cle) return null;
  const fichier = cle.split('/').pop()!;
  return /^drive-/i.test(fichier) ? null : cle;
}

/** Hôtes Google Drive vers lesquels une redirection est sûre. */
const HOTES_DRIVE = new Set(['drive.google.com', 'docs.google.com']);

/**
 * Redirection `direct` du proxy d'assets · l'adresse normalisée quand elle
 * pointe vers le bucket (une des `basesBucket`, même origine, sous son chemin)
 * ou vers Drive (`drive.google.com`, `docs.google.com`,
 * `*.googleusercontent.com`, https), sinon `null` : l'appelant sert alors les
 * octets lui-même (proxy), jamais une redirection ouverte vers un hôte choisi
 * par celui qui a enregistré l'asset. Identifiants dans l'URL (`a@b`) ⇒ `null`.
 */
export function adresseRedirigeable(url: string, basesBucket: ReadonlyArray<string>): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.username || u.password) return null;
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const hote = u.hostname.toLowerCase();
  if (u.protocol === 'https:' && (HOTES_DRIVE.has(hote) || hote.endsWith('.googleusercontent.com'))) return u.toString();
  for (const b of basesBucket) {
    if (!b) continue;
    let base: URL;
    try { base = new URL(`${b.replace(/\/+$/, '')}/`); } catch { continue; }
    if (u.origin === base.origin && u.pathname.startsWith(base.pathname)) return u.toString();
  }
  return null;
}
