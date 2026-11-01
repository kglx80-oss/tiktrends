import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { formeJetonDepot, type JetonDepot } from '@tiktrends/core';

/**
 * Jeton de dépôt · HMAC-SHA256 côté serveur (la règle, pure, vit dans
 * `packages/core/src/jeton-depot.ts`).
 *
 * `presignAssetUploadAction` le rend avec l'adresse de dépôt ; la charte
 * (`saveBrandDAAction`) le relit pour prouver que l'adresse du bucket qu'elle
 * reçoit vient d'être déposée par CET espace, et retirer ce dépôt s'il n'est
 * pas enregistré.
 *
 * Même clé que les sessions (`AUTH_SECRET`), dérivée par un préfixe d'usage
 * (comme `lib/studios/sources/scelle.ts`) · aucune nouvelle variable
 * d'environnement. Absente, une clé aléatoire par processus (même posture que
 * `lib/auth.ts` : jamais de secret en dur) · les sessions ne survivraient pas
 * non plus à un redémarrage, le jeton ne vaut que quelques minutes.
 */

const REPLI = randomBytes(48).toString('base64url');
function cle(): string {
  const s = process.env.AUTH_SECRET;
  return `depot-objet:${s && s !== 'change-me' ? s : REPLI}`;
}

const signer = (corps: string) => createHmac('sha256', cle()).update(corps).digest('base64url');

/** Le jeton transmis au client · `<contenu base64url>.<signature>`. */
export function signerJetonDepot(j: JetonDepot): string {
  const corps = Buffer.from(JSON.stringify(j), 'utf8').toString('base64url');
  return `${corps}.${signer(corps)}`;
}

/**
 * Le contenu d'un jeton reçu · `null` quand aucun n'a été transmis,
 * `'illisible'` quand sa signature ou sa forme ne tiennent pas.
 */
export function lireJetonDepot(jeton: unknown): JetonDepot | null | 'illisible' {
  if (jeton === undefined || jeton === null || jeton === '') return null;
  if (typeof jeton !== 'string' || jeton.length > 2000) return 'illisible';
  const [corps, sig, reste] = jeton.split('.');
  if (!corps || !sig || reste !== undefined) return 'illisible';
  const attendu = Buffer.from(signer(corps));
  const recu = Buffer.from(sig);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return 'illisible';
  try {
    return formeJetonDepot(JSON.parse(Buffer.from(corps, 'base64url').toString('utf8'))) ?? 'illisible';
  } catch {
    return 'illisible';
  }
}
