/**
 * Stockage · le JETON DE DÉPÔT d'un logo importé · la règle, pure (ni base,
 * ni réseau, ni cryptographie · la signature HMAC vit côté serveur,
 * `apps/web/lib/jeton-depot.ts`).
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * L'import d'un fichier de logo dépose l'objet depuis le NAVIGATEUR
 * (`presignAssetUploadAction` → PUT), puis enregistre son adresse dans la
 * charte (`saveBrandDAAction`). Le serveur ne savait pas laquelle des adresses
 * reçues venait d'être déposée : un logo déposé puis refusé (charte invalide,
 * adresse refusée) restait dans le bucket, sans ligne, pour toujours
 * (`CHEMINS_DEPOT_PUIS_ECRITURE` le classait `non_attribuable`). Et rien ne
 * prouvait qu'une adresse du bucket envoyée à la charte avait été déposée par
 * CET espace via le présigné · seul son préfixe d'espace était vérifié, donc
 * n'importe quel objet de l'espace (copie Drive, fichier de la Bibliothèque)
 * pouvait devenir un logo.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Le présigné rend, en plus de l'adresse, un jeton signé par le serveur liant
 * l'ESPACE, la CLÉ d'objet, le TYPE et la TAILLE signés dans le lien de dépôt
 * (ceux que le bucket impose au PUT) et une EXPIRATION courte
 * (`jetonDepotPour`). Le type et la taille servent à la relecture de l'objet
 * avant d'en faire un logo (`decisionLogoDeposeRelu`, `logo-depose-relu.ts`).
 * La charte (`decisionCharteDeposee`) :
 *  1. accepte une adresse du bucket DÉJÀ enregistrée sans jeton (compat · aucune
 *     donnée existante n'est bloquée ni réécrite) ;
 *  2. accepte une adresse du bucket NOUVELLE seulement si le jeton est
 *     authentique, du même espace, pour la même clé, et pas expiré · un jeton
 *     n'atteste qu'UN dépôt, donc une seule adresse nouvelle du bucket ;
 *  3. REFUSE une adresse du bucket nouvelle sans jeton valide · la seule
 *     origine légitime d'une telle adresse est « Importer » (qui transmet le
 *     jeton) ; l'accepter laisserait une provenance non prouvée et un dépôt
 *     impossible à retirer. L'adresse externe `https:` (« Ajouter » par
 *     adresse) suit la règle d'avant (`refusAdresseLogo`), sans jeton ;
 *  4. désigne le dépôt à RETIRER quand la charte n'aboutit pas (refus) ou ne le
 *     retient pas · seulement si le jeton est authentique et du même espace (il
 *     PROUVE que cet espace a déposé cet objet), même expiré ou présenté avec
 *     une autre adresse. Le serveur ne retire ensuite que si aucune ligne ne
 *     cite l'objet (`decisionRetraitDepot`) · tout doute garde l'objet.
 *
 * ── La durée (`dureeJetonDepotS`) ─────────────────────────────────────────────
 *
 * Dérivée de la durée du lien de dépôt, jamais posée de tête · le PUT peut
 * commencer à la dernière seconde du lien (`dureeLienDepot`), durer le
 * transfert au débit de référence, puis l'enregistrement suit (même marge que
 * le lien, `MARGE_LIEN_DEPOT_S`). Plafonnée à la durée maximale du lien plus
 * cette marge · un jeton ne sert qu'à un logo (4 Mo au plus côté client), un
 * gros fichier n'a aucune raison de garder un jeton ouvert des heures.
 *
 * | Taille              | Lien  | Transfert | Marge | Jeton          |
 * | ------------------- | ----- | --------- | ----- | -------------- |
 * | 2 Mio               | 80 s  | 20 s      | 60 s  | 160 s          |
 * | 4 Mo (logo max)     | 98 s  | 38 s      | 60 s  | 196 s          |
 * | 64 Mio (image max)  | 693 s | 633 s     | 60 s  | 960 s (plafond)|
 */

import { cleObjetDeLEspace } from './objet-espace';
import { DEBIT_MONTANT_REFERENCE_OCTETS_S, DUREE_LIEN_DEPOT_MAX_S, MARGE_LIEN_DEPOT_S, REFUS_LOGO_NON_ATTESTE, dureeLienDepot, refusCharteLogos, type BucketEspace } from './depot-fichiers';

/**
 * Le contenu signé d'un jeton de dépôt · version, espace, clé, type et taille
 * signés au présigné (`Content-Type`, `Content-Length` du PUT), expiration (ms).
 * Version 2 · un jeton de la version 1 (sans type ni taille) ne se lit plus, il
 * ne valait que quelques minutes · l'import se relance.
 */
export interface JetonDepot { v: 2; espace: string; cle: string; type: string; taille: number; expireLe: number }

/** Longueur maximale d'un type signé · un type de la liste blanche en compte moins de 40. */
const LONGUEUR_MAX_TYPE_JETON = 128;

/** Plafond de validité d'un jeton · la durée maximale du lien plus la marge d'enregistrement. */
export const DUREE_JETON_DEPOT_MAX_S = DUREE_LIEN_DEPOT_MAX_S + MARGE_LIEN_DEPOT_S;

/** Validité, en secondes, du jeton d'un dépôt de `taille` octets (validée) · voir le tableau. */
export function dureeJetonDepotS(taille: number): number {
  const t = typeof taille === 'number' && Number.isFinite(taille) && taille > 0 ? taille : 0;
  const brute = dureeLienDepot(t) + Math.ceil(t / DEBIT_MONTANT_REFERENCE_OCTETS_S) + MARGE_LIEN_DEPOT_S;
  return Math.min(DUREE_JETON_DEPOT_MAX_S, brute);
}

/**
 * Le jeton à signer pour la clé `cle` que le présigné vient de fabriquer ·
 * `type` et `taille` sont ceux SIGNÉS dans le lien de dépôt (`decisionDepot`).
 */
export function jetonDepotPour(o: { espace: string; cle: string; type: string; taille: number; maintenant: number }): JetonDepot {
  return { v: 2, espace: o.espace, cle: o.cle, type: o.type, taille: o.taille, expireLe: o.maintenant + dureeJetonDepotS(o.taille) * 1000 };
}

/** Le contenu relu (JSON déjà analysé) a-t-il la forme d'un jeton ? · sinon `null`. */
export function formeJetonDepot(x: unknown): JetonDepot | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const j = x as Record<string, unknown>;
  if (j.v !== 2 || typeof j.espace !== 'string' || !j.espace || typeof j.cle !== 'string' || !j.cle) return null;
  if (typeof j.type !== 'string' || !j.type || j.type.length > LONGUEUR_MAX_TYPE_JETON) return null;
  if (typeof j.taille !== 'number' || !Number.isSafeInteger(j.taille) || j.taille < 1) return null;
  if (typeof j.expireLe !== 'number' || !Number.isFinite(j.expireLe)) return null;
  if (Object.keys(j).length !== 6) return null;
  return { v: 2, espace: j.espace, cle: j.cle, type: j.type, taille: j.taille, expireLe: j.expireLe };
}

export type RefusJetonDepot = 'absent' | 'illisible' | 'autre_espace' | 'autre_cle' | 'expire';

export const TEXTES_REFUS_JETON_DEPOT: Readonly<Record<RefusJetonDepot, string>> = {
  absent: REFUS_LOGO_NON_ATTESTE,
  illisible: 'L’import de ce logo n’a pas pu être vérifié · importe le fichier à nouveau.',
  autre_espace: 'Ce fichier de logo n’a pas été importé dans ton espace · importe-le à nouveau.',
  autre_cle: 'Ce fichier de logo ne correspond pas à l’import en cours · importe-le à nouveau.',
  expire: 'L’import de ce logo a expiré · importe le fichier à nouveau.',
};

/**
 * Pourquoi ce jeton n'atteste pas le dépôt de `cle` pour `espace` · `null`
 * quand il l'atteste. `jeton` est `null` quand aucun n'a été transmis, et
 * `'illisible'` quand sa signature ou sa forme ne tiennent pas (lu côté serveur).
 */
export function refusJetonDepot(jeton: JetonDepot | null | 'illisible', cible: { espace: string; cle: string; maintenant: number }): RefusJetonDepot | null {
  if (jeton === null) return 'absent';
  if (jeton === 'illisible') return 'illisible';
  if (jeton.espace !== cible.espace) return 'autre_espace';
  if (jeton.cle !== cible.cle) return 'autre_cle';
  if (!(cible.maintenant <= jeton.expireLe)) return 'expire';
  return null;
}

export type DecisionCharteDeposee =
  /** `deposes` · l'adresse attestée que la charte retient (à retirer si l'écriture échoue). */
  | { ok: true; deposes: string[]; aRetirer: string[] }
  | { ok: false; erreur: string; aRetirer: string[] };

/**
 * La charte à enregistrer, face au jeton reçu (ou non) · voir la règle en tête.
 * `aRetirer` · le dépôt attesté que la charte n'enregistre pas, à retirer s'il
 * n'est cité par aucune ligne.
 */
export function decisionCharteDeposee(o: {
  charte: { logoUrl: string; logos: readonly string[] };
  dejaEnregistrees: ReadonlyArray<string | null | undefined>;
  bucket: BucketEspace | null;
  jeton: JetonDepot | null | 'illisible';
  maintenant: number;
}): DecisionCharteDeposee {
  const connues = new Set(o.dejaEnregistrees.filter((x): x is string => typeof x === 'string' && !!x));
  const adresses = [...new Set([o.charte.logoUrl, ...o.charte.logos].filter((a): a is string => typeof a === 'string' && !!a))];
  const b = o.bucket;
  // Le dépôt que le jeton PROUVE · authentique et du même espace, quels que
  // soient l'adresse présentée et l'âge du jeton.
  const j = o.jeton;
  const prouve = b && j && j !== 'illisible' && j.espace === b.espace && cleObjetDeLEspace(`${b.base.replace(/\/+$/, '')}/${j.cle}`, b.base, b.espace) === j.cle
    ? `${b.base.replace(/\/+$/, '')}/${j.cle}` : null;
  const aRetirer = (retenues: readonly string[]) => (prouve && !connues.has(prouve) && !retenues.includes(prouve) ? [prouve] : []);

  const attestees: string[] = [];
  for (const a of adresses) {
    if (connues.has(a) || !b) continue;
    const cle = cleObjetDeLEspace(a, b.base, b.espace);
    if (!cle) continue;
    // Un jeton porte UNE clé · une seconde adresse nouvelle du bucket tombe sur `autre_cle`.
    const refus = refusJetonDepot(j, { espace: b.espace, cle, maintenant: o.maintenant });
    if (refus) return { ok: false, erreur: TEXTES_REFUS_JETON_DEPOT[refus], aRetirer: aRetirer([]) };
    attestees.push(a);
  }
  const refus = refusCharteLogos(o.charte, [...connues], b, attestees);
  if (refus) return { ok: false, erreur: refus, aRetirer: aRetirer([]) };
  return { ok: true, deposes: attestees, aRetirer: aRetirer(adresses) };
}
