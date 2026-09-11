/**
 * Décider quoi faire d'une image importée par lien · règle pure, donc testable.
 *
 * ── Le défaut que ça répare ──────────────────────────────────────────────────
 *
 * Un import par lien ne gardait que l'URL externe. Quand cette URL meurt (lien
 * expiré, protection hotlink, page supprimée), l'aperçu casse et retombe sur
 * l'icône · c'est LE reproche du proprio, et un asset qui pointe dans le vide
 * n'a aucune valeur. On récupère donc l'image AU MOMENT DE L'IMPORT et on en
 * garde une copie durable (data URI embarqué, servie par nous comme un upload).
 *
 * Ici on ne fait que TRANCHER, à partir de ce que le fetch a rendu :
 *  - rien récupéré (introuvable, trop lourd, bloqué) → on refuse, message clair ;
 *  - récupéré mais pas une image → on refuse, message clair ;
 *  - une vraie image → on renvoie le data URI durable à stocker.
 *
 * Le fetch SSRF-safe (`safeFetch`) et l'écriture en base vivent chez l'appelant ·
 * cette fonction reste pure et s'exerce avec un buffer factice.
 */

export interface ImageRecuperee {
  body: Buffer;
  contentType: string;
}

export type DecisionImportImage =
  | { ok: true; dataUri: string; mimeType: string }
  | { ok: false; error: string };

/**
 * Que faire du résultat d'un fetch d'image · `null` quand le fetch a échoué.
 */
export function decideImportedImage(fetched: ImageRecuperee | null): DecisionImportImage {
  if (!fetched) {
    return { ok: false, error: 'Ce lien ne renvoie pas une image accessible (introuvable, trop lourde, ou bloquée). Vérifie le lien de partage, ou téléverse le fichier directement.' };
  }
  const mime = (fetched.contentType || '').split(';')[0]!.trim().toLowerCase();
  if (!/^image\//.test(mime)) {
    return { ok: false, error: 'Ce lien ne pointe pas vers une image. Colle le lien direct d’un fichier image (jpg, png, webp…), ou téléverse-le.' };
  }
  return { ok: true, mimeType: mime, dataUri: `data:${mime};base64,${fetched.body.toString('base64')}` };
}
