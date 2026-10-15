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
