import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { formeJetonDepot, type JetonDepot } from '@tiktrends/core';

/**
 * Jeton de dépôt · SCELLÉ côté serveur (la règle, pure, vit dans
 * `packages/core/src/jeton-depot.ts`).
 *
 * `presignAssetUploadAction` le rend avec le seul lien de PUT ; les actions
 * qui enregistrent le dépôt (`registerUploadedAssetAction`,
 * `remplacerAssetAction`, `saveBrandDAAction`) le relisent pour retrouver la
 * CLÉ d'objet · le navigateur ne reçoit plus d'adresse du stockage.
 *
 * Même mécanisme que #987, généralisé · même clé que les sessions
 * (`AUTH_SECRET`) dérivée par le même préfixe d'usage, même module, même règle
 * du noyau. Le jeton signé HMAC de #987 était LISIBLE (JSON en base64url · il
 * nommait l'espace et la clé interne de l'objet) ; il est désormais SCELLÉ
 * AES-256-GCM · opaque pour le navigateur, et l'étiquette d'authentification
 * GCM joue le rôle de la signature (toute altération, ou un jeton fabriqué
 * sans la clé, est illisible). Absente, une clé aléatoire par processus (même
 * posture que `lib/auth.ts` : jamais de secret en dur) · les sessions ne
 * survivraient pas non plus à un redémarrage, le jeton ne vaut que quelques
 * minutes.
 *
 * Format · `base64url(iv 12 o ‖ étiquette 16 o ‖ contenu chiffré)`, données
 * associées `depot-objet:v3` (un scellé d'un autre usage du secret ne se lit
 * pas ici).
 */

const REPLI = randomBytes(48).toString('base64url');
const AAD = Buffer.from('depot-objet:v3', 'utf8');
/** Longueur maximale d'un jeton reçu · un vrai jeton en compte moins de 500. */
const LONGUEUR_MAX_JETON = 2000;

function cle(): Buffer {
  const s = process.env.AUTH_SECRET;
  return createHash('sha256').update(`depot-objet:${s && s !== 'change-me' ? s : REPLI}`, 'utf8').digest();
}

/** Le jeton transmis au client · opaque. */
export function scellerJetonDepot(j: JetonDepot): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', cle(), iv);
  c.setAAD(AAD);
  const chiffre = Buffer.concat([c.update(JSON.stringify(j), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), chiffre]).toString('base64url');
}

/**
 * Le contenu d'un jeton reçu · `null` quand aucun n'a été transmis,
 * `'illisible'` quand son scellé ou sa forme ne tiennent pas.
 */
export function lireJetonDepot(jeton: unknown): JetonDepot | null | 'illisible' {
  if (jeton === undefined || jeton === null || jeton === '') return null;
  if (typeof jeton !== 'string' || jeton.length > LONGUEUR_MAX_JETON || !/^[A-Za-z0-9_-]+$/.test(jeton)) return 'illisible';
  const brut = Buffer.from(jeton, 'base64url');
  if (brut.length <= 28) return 'illisible';
  try {
    const d = createDecipheriv('aes-256-gcm', cle(), brut.subarray(0, 12));
    d.setAAD(AAD);
    d.setAuthTag(brut.subarray(12, 28));
    const clair = Buffer.concat([d.update(brut.subarray(28)), d.final()]).toString('utf8');
    return formeJetonDepot(JSON.parse(clair)) ?? 'illisible';
  } catch {
    return 'illisible';
  }
}
