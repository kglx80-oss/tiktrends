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
 * ── Sécurité · le type se lit dans les octets ────────────────────────────────
 *
 * Le type retenu est celui des OCTETS (`typeMediaReel`, liste fermée du noyau),
 * jamais l'en-tête du site distant. Avant, tout `image/*` passait, donc
 * `image/svg+xml` : un SVG porte du script, et servi sur notre origine il
 * s'exécutait avec la session de qui l'ouvrait. Un HTML annoncé `image/png`, un
 * SVG annoncé `IMAGE/PNG` : seul le contenu décide, et le data URI est
 * reconstruit avec le type relu, rien de déclaré n'y entre.
 *
 * Le fetch SSRF-safe (`safeFetch`) et l'écriture en base vivent chez l'appelant ·
 * cette fonction reste pure et s'exerce avec un buffer factice.
 */

import { typeMediaReel, familleMedia } from '@tiktrends/core';

export interface ImageRecuperee {
  body: Buffer;
  contentType: string;
}

export type DecisionImportImage =
  | { ok: true; dataUri: string; mimeType: string }
  | { ok: false; error: string };

const PAS_UNE_IMAGE = 'Ce lien ne pointe pas vers une image. Colle le lien direct d’un fichier image (jpg, png, webp, gif…), ou téléverse-le.';

/**
 * Que faire du résultat d'un fetch d'image · `null` quand le fetch a échoué.
 */
export function decideImportedImage(fetched: ImageRecuperee | null): DecisionImportImage {
  if (!fetched) {
    return { ok: false, error: 'Ce lien ne renvoie pas une image accessible (introuvable, trop lourde, ou bloquée). Vérifie le lien de partage, ou téléverse le fichier directement.' };
  }
  const type = typeMediaReel(fetched.body);
  if (!type || familleMedia(type) !== 'image') return { ok: false, error: PAS_UNE_IMAGE };
  return { ok: true, mimeType: type, dataUri: `data:${type};base64,${fetched.body.toString('base64')}` };
}

/**
 * Les octets d'un `data:` URI (base64, ou texte encodé en pourcentage) ·
 * `null` sans contenu ou hors forme `data:…,…`. Le type ANNONCÉ dans le
 * préfixe est ignoré : il se relit dans les octets.
 */
export function octetsDataUri(uri: string): Buffer | null {
  if (typeof uri !== 'string' || !/^data:/i.test(uri)) return null;
  const virgule = uri.indexOf(',');
  if (virgule < 0) return null;
  const charge = uri.slice(virgule + 1);
  let octets: Buffer;
  if (/;base64$/i.test(uri.slice(5, virgule))) octets = Buffer.from(charge, 'base64');
  else {
    try { octets = Buffer.from(decodeURIComponent(charge), 'utf8'); } catch { octets = Buffer.from(charge, 'utf8'); }
  }
  return octets.length ? octets : null;
}
