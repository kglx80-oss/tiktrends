import { jetonDepotPour, type UsageDepot } from '@tiktrends/core';
import { scellerJetonDepot } from '../../lib/jeton-depot';

/**
 * Outils des tests du dépôt direct · le navigateur ne reçoit plus que le lien
 * de PUT et un jeton OPAQUE (`presignAssetUploadAction`). Comme le vrai
 * navigateur, un test qui « dépose » écrit dans le faux bucket à l'adresse du
 * lien de PUT · la clé se lit donc dans ce lien, jamais dans le jeton.
 */

/** La clé d'objet visée par un lien de PUT présigné (`https://<endpoint>/<bucket>/<clé>?X-Amz-…`). */
export function cleDuLienDepot(uploadUrl: string, bucket: string): string {
  const chemin = new URL(uploadUrl).pathname;
  const prefixe = `/${bucket}/`;
  if (!chemin.startsWith(prefixe)) throw new Error(`lien de dépôt hors du bucket ${bucket} : ${chemin}`);
  return decodeURIComponent(chemin.slice(prefixe.length));
}

/**
 * Un jeton scellé par le VRAI sceau du serveur, pour une clé choisie par le
 * test (objet semé à la main) · `maintenant` par défaut l'heure courante.
 */
export function jetonScelle(o: { espace: string; utilisateur: string; usage: UsageDepot; cle: string; type?: string; taille?: number; maintenant?: number }): string {
  return scellerJetonDepot(jetonDepotPour({
    espace: o.espace, utilisateur: o.utilisateur, usage: o.usage, cle: o.cle,
    type: o.type ?? 'image/png', taille: o.taille ?? 2048, maintenant: o.maintenant ?? Date.now(),
  }));
}

/** Le même jeton, un caractère du MILIEU remplacé · le scellé ne tient plus. */
export function jetonAltere(jeton: string): string {
  const i = Math.floor(jeton.length / 2);
  return `${jeton.slice(0, i)}${jeton[i] === 'A' ? 'B' : 'A'}${jeton.slice(i + 1)}`;
}
