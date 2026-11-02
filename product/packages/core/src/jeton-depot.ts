/**
 * Stockage · le JETON DE DÉPÔT · la règle, pure (ni base, ni réseau, ni
 * cryptographie · le scellé vit côté serveur, `apps/web/lib/jeton-depot.ts`).
 *
 * ── Le défaut (#987, puis ce module généralisé) ─────────────────────────────
 *
 * Tout dépôt direct passe par `presignAssetUploadAction` (lien PUT signé, type
 * et taille signés · #972, #975). Avant, l'action rendait aussi `publicUrl`,
 * l'adresse canonique BRUTE de l'objet dans le stockage privé, que le
 * navigateur renvoyait comme identifiant à `registerUploadedAssetAction`,
 * `remplacerAssetAction` et `saveBrandDAAction` (logo importé). L'adresse
 * nommait la clé interne et le bucket, et seul le logo était attesté par un
 * jeton (lisible, signé HMAC).
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Le présigné ne rend plus que le lien PUT signé (seule adresse qui sort ·
 * elle laisse lire la clé, c'est le lien d'envoi) et un JETON OPAQUE (scellé
 * AES-256-GCM avec `AUTH_SECRET`, côté serveur · ni lisible ni forgeable) ;
 * aucune adresse n'est plus REÇUE du navigateur. Le jeton
 * porte l'ESPACE, l'UTILISATEUR, l'USAGE déclaré au présigné (`envoi` de la
 * Bibliothèque, `remplacement` d'un fichier, `logo` de la charte), la CLÉ
 * d'objet, le TYPE et la TAILLE signés dans le lien, et une EXPIRATION courte.
 * Le serveur le résout en clé (`resoudreJetonDepot`), puis toutes les
 * vérifications d'avant s'appliquent à l'adresse RÉSOLUE (appartenance à
 * `assets/<espace>/`, type réel relu, taille, ETag). Un jeton est refusé, avec
 * sa phrase, s'il est illisible (altéré, forgé, d'une autre clé de scellé),
 * d'un autre espace, d'un autre utilisateur, pour un autre usage, ou expiré.
 *
 * ── Réutilisation · NON ─────────────────────────────────────────────────────
 *
 * Un jeton atteste UN dépôt et ne fait entrer son objet qu'UNE fois dans la
 * base · rejoué, il est refusé (`deja_employe`). Deux lignes qui citent le
 * même objet se partageraient un fichier qu'aucun écran ne montre comme
 * partagé (le remplacer ou le supprimer depuis l'une toucherait l'autre), et un
 * jeton rejouable serait un droit d'écriture réutilisable tant qu'il vit. La
 * clé d'objet est neuve à chaque présigné (`newAssetKey`), donc « déjà
 * employé » se lit dans la base (une ligne cite déjà l'objet) · aucune table
 * de jetons consommés, aucune migration. Le renvoi d'une charte qui contient
 * DÉJÀ ce logo reste admis (l'adresse est connue de la marque, rien n'entre).
 *
 * ── Logo · la référence `LOGO_DEPOSE` ───────────────────────────────────────
 *
 * Le navigateur ne connaît plus l'adresse du logo qu'il vient de déposer · il
 * compose la charte avec `LOGO_DEPOSE` à sa place, et le serveur la remplace
 * par l'adresse que le jeton résout (`decisionCharteDeposee`). Une charte qui
 * l'appelle sans jeton valide est refusée · la référence n'est jamais écrite.
 * La charte (`decisionCharteDeposee`) :
 *  1. accepte une adresse du bucket DÉJÀ enregistrée sans jeton (compat · aucune
 *     donnée existante n'est bloquée ni réécrite) ;
 *  2. accepte une adresse du bucket NOUVELLE seulement si le jeton est
 *     authentique, du même espace, du même utilisateur, d'usage `logo`, pour la
 *     même clé, pas expiré, et pas déjà employé · un jeton n'atteste qu'UN
 *     dépôt, donc une seule adresse nouvelle du bucket ;
 *  3. REFUSE une adresse du bucket nouvelle sans jeton valide · l'adresse
 *     externe `https:` (« Ajouter » par adresse) suit la règle d'avant
 *     (`refusAdresseLogo`), sans jeton ;
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
 * cette marge.
 *
 * | Taille              | Lien  | Transfert | Marge | Jeton          |
 * | ------------------- | ----- | --------- | ----- | -------------- |
 * | 2 Mio               | 80 s  | 20 s      | 60 s  | 160 s          |
 * | 4 Mo (logo max)     | 98 s  | 38 s      | 60 s  | 196 s          |
 * | 64 Mio (image max)  | 693 s | 633 s     | 60 s  | 960 s (plafond)|
 */

import { cleObjetDeLEspace } from './objet-espace';
import { RAISON_LOGO_SANS_STOCKAGE } from './spatial/marque/logo';
import { DEBIT_MONTANT_REFERENCE_OCTETS_S, DUREE_LIEN_DEPOT_MAX_S, MARGE_LIEN_DEPOT_S, REFUS_LOGO_NON_ATTESTE, dureeLienDepot, refusCharteLogos, type BucketEspace } from './depot-fichiers';

/** Ce que le dépôt va devenir, déclaré au présigné · un jeton ne sert qu'à cet usage. */
export const USAGES_DEPOT = ['envoi', 'remplacement', 'logo'] as const;
export type UsageDepot = (typeof USAGES_DEPOT)[number];

/** L'usage demandé au présigné · `null` hors de la liste. */
export function lireUsageDepot(x: unknown): UsageDepot | null {
  return typeof x === 'string' && (USAGES_DEPOT as readonly string[]).includes(x) ? (x as UsageDepot) : null;
}

export const REFUS_USAGE_DEPOT = 'Envoi impossible · l’action demandée pour ce fichier n’est pas reconnue. Recharge la page.';

/**
 * Le contenu scellé d'un jeton de dépôt · version, espace, utilisateur, usage,
 * clé, type et taille signés au présigné (`Content-Type`, `Content-Length` du
 * PUT), expiration (ms). Version 3 · un jeton d'une version antérieure ne se
 * lit plus (il ne valait que quelques minutes, l'envoi se relance).
 */
export interface JetonDepot { v: 3; espace: string; utilisateur: string; usage: UsageDepot; cle: string; type: string; taille: number; expireLe: number }

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
 * Le jeton à sceller pour la clé `cle` que le présigné vient de fabriquer ·
 * `type` et `taille` sont ceux SIGNÉS dans le lien de dépôt (`decisionDepot`).
 */
export function jetonDepotPour(o: { espace: string; utilisateur: string; usage: UsageDepot; cle: string; type: string; taille: number; maintenant: number }): JetonDepot {
  return { v: 3, espace: o.espace, utilisateur: o.utilisateur, usage: o.usage, cle: o.cle, type: o.type, taille: o.taille, expireLe: o.maintenant + dureeJetonDepotS(o.taille) * 1000 };
}

/** Le contenu relu (JSON déjà analysé) a-t-il la forme d'un jeton ? · sinon `null`. */
export function formeJetonDepot(x: unknown): JetonDepot | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const j = x as Record<string, unknown>;
  if (j.v !== 3 || typeof j.espace !== 'string' || !j.espace || typeof j.cle !== 'string' || !j.cle) return null;
  if (typeof j.utilisateur !== 'string' || !j.utilisateur) return null;
  const usage = lireUsageDepot(j.usage);
  if (!usage) return null;
  if (typeof j.type !== 'string' || !j.type || j.type.length > LONGUEUR_MAX_TYPE_JETON) return null;
  if (typeof j.taille !== 'number' || !Number.isSafeInteger(j.taille) || j.taille < 1) return null;
  if (typeof j.expireLe !== 'number' || !Number.isFinite(j.expireLe)) return null;
  if (Object.keys(j).length !== 8) return null;
  return { v: 3, espace: j.espace, utilisateur: j.utilisateur, usage, cle: j.cle, type: j.type, taille: j.taille, expireLe: j.expireLe };
}

export type RefusJetonDepot = 'absent' | 'illisible' | 'autre_espace' | 'autre_utilisateur' | 'autre_usage' | 'autre_cle' | 'expire' | 'deja_employe';

/**
 * Un dépôt d'un autre espace OU d'une autre personne · une seule phrase
 * visible (le refus ne renseigne pas sur le propriétaire du dépôt) ; la
 * raison reste distincte dans `RefusJetonDepot` (journaux, tests).
 */
const REFUS_LOGO_PAS_A_TOI = 'Ce fichier de logo n’a pas été importé par toi dans cet espace · importe-le à nouveau.';
const REFUS_FICHIER_PAS_A_TOI = 'Cet envoi n’a pas été préparé par toi dans cet espace · envoie le fichier à nouveau.';

/** Les phrases du LOGO (charte) · reprises depuis #987. */
export const TEXTES_REFUS_JETON_DEPOT: Readonly<Record<RefusJetonDepot, string>> = {
  absent: REFUS_LOGO_NON_ATTESTE,
  illisible: 'L’import de ce logo n’a pas pu être vérifié · importe le fichier à nouveau.',
  // Même phrase pour l'espace et la personne · le refus ne dit pas à qui appartient le dépôt (pas d'oracle).
  autre_espace: REFUS_LOGO_PAS_A_TOI,
  autre_utilisateur: REFUS_LOGO_PAS_A_TOI,
  autre_usage: 'Ce fichier n’a pas été envoyé pour devenir un logo · importe-le avec « Importer ».',
  autre_cle: 'Ce fichier de logo ne correspond pas à l’import en cours · importe-le à nouveau.',
  expire: 'L’import de ce logo a expiré · importe le fichier à nouveau.',
  deja_employe: 'Ce fichier de logo est déjà enregistré ailleurs · importe-le à nouveau pour l’ajouter ici.',
};

/** Les phrases d'un fichier de la Bibliothèque (envoi, remplacement). */
export const TEXTES_REFUS_JETON_FICHIER: Readonly<Record<RefusJetonDepot, string>> = {
  absent: 'L’envoi de ce fichier n’est pas attesté · envoie-le à nouveau.',
  illisible: 'L’envoi de ce fichier n’a pas pu être vérifié · envoie-le à nouveau.',
  autre_espace: REFUS_FICHIER_PAS_A_TOI,
  autre_utilisateur: REFUS_FICHIER_PAS_A_TOI,
  autre_usage: 'Cet envoi a été préparé pour une autre action · recommence l’opération.',
  autre_cle: 'Ce fichier ne correspond pas à l’envoi en cours · envoie-le à nouveau.',
  expire: 'L’envoi de ce fichier a expiré · envoie-le à nouveau.',
  deja_employe: 'Cet envoi est déjà enregistré · envoie le fichier à nouveau pour en faire une autre copie.',
};

/** La phrase d'un refus, selon l'usage attendu par l'action qui lit le jeton. */
export function texteRefusJetonDepot(refus: RefusJetonDepot, usage: UsageDepot): string {
  return (usage === 'logo' ? TEXTES_REFUS_JETON_DEPOT : TEXTES_REFUS_JETON_FICHIER)[refus];
}

/** Ce qu'une action attend d'un jeton · `cle` seulement quand l'adresse est présentée à part. */
export interface CibleJetonDepot { espace: string; utilisateur: string; usage: UsageDepot; maintenant: number; cle?: string }

/**
 * Pourquoi ce jeton n'atteste pas le dépôt attendu · `null` quand il l'atteste.
 * `jeton` est `null` quand aucun n'a été transmis, et `'illisible'` quand son
 * scellé ou sa forme ne tiennent pas (lu côté serveur).
 */
export function refusJetonDepot(jeton: JetonDepot | null | 'illisible', cible: CibleJetonDepot): RefusJetonDepot | null {
  if (jeton === null) return 'absent';
  if (jeton === 'illisible') return 'illisible';
  if (jeton.espace !== cible.espace) return 'autre_espace';
  // La clé d'un dépôt de l'espace vit sous `assets/<espace>/` · un jeton qui en sort ne prouve rien.
  if (!jeton.cle.startsWith(`assets/${cible.espace}/`) || jeton.cle.split('/').some((p) => !p || p === '.' || p === '..')) return 'autre_espace';
  if (jeton.utilisateur !== cible.utilisateur) return 'autre_utilisateur';
  if (jeton.usage !== cible.usage) return 'autre_usage';
  if (cible.cle !== undefined && jeton.cle !== cible.cle) return 'autre_cle';
  if (!(cible.maintenant <= jeton.expireLe)) return 'expire';
  return null;
}

export type ResolutionJetonDepot =
  | { ok: true; cle: string; type: string; taille: number }
  | { ok: false; refus: RefusJetonDepot; erreur: string };

/**
 * Le jeton reçu par une action de la Bibliothèque, résolu en CLÉ d'objet · le
 * serveur en tire l'adresse (`publicUrlFor`) puis applique ses vérifications
 * d'avant (appartenance, relecture du type réel, taille, ETag) et, à
 * l'écriture, refuse un objet déjà cité (`deja_employe`).
 */
export function resoudreJetonDepot(jeton: JetonDepot | null | 'illisible', cible: Omit<CibleJetonDepot, 'cle'>): ResolutionJetonDepot {
  const refus = refusJetonDepot(jeton, cible);
  if (refus || !jeton || jeton === 'illisible') {
    const r = refus ?? 'illisible';
    return { ok: false, refus: r, erreur: texteRefusJetonDepot(r, cible.usage) };
  }
  return { ok: true, cle: jeton.cle, type: jeton.type, taille: jeton.taille };
}

/**
 * La référence que le navigateur met dans la charte à la place du logo qu'il
 * vient de déposer · il n'en connaît pas l'adresse. Le serveur la remplace par
 * l'adresse que le jeton résout ; elle n'est jamais écrite (elle n'est pas une
 * adresse `https:`, `refusAdresseLogo` la refuserait).
 */
export const LOGO_DEPOSE = 'depot:logo-importe';

export type DecisionCharteDeposee =
  /**
   * `charte` · la charte à écrire, `LOGO_DEPOSE` remplacée par l'adresse
   * résolue · `deposes` · l'adresse attestée que la charte retient (à retirer
   * si l'écriture échoue).
   */
  | { ok: true; charte: { logoUrl: string; logos: string[] }; deposes: string[]; aRetirer: string[] }
  | { ok: false; erreur: string; aRetirer: string[] };

/**
 * La charte à enregistrer, face au jeton reçu (ou non) · voir la règle en tête.
 * `utilisateur` · celui de la session. `dejaCite` · une ligne de la base cite
 * déjà l'objet du jeton (lu par le serveur) · un jeton ne sert qu'une fois.
 * `aRetirer` · le dépôt attesté que la charte n'enregistre pas, à retirer s'il
 * n'est cité par aucune ligne.
 */
export function decisionCharteDeposee(o: {
  charte: { logoUrl: string; logos: readonly string[] };
  dejaEnregistrees: ReadonlyArray<string | null | undefined>;
  bucket: BucketEspace | null;
  jeton: JetonDepot | null | 'illisible';
  utilisateur: string;
  maintenant: number;
  dejaCite?: boolean;
}): DecisionCharteDeposee {
  const connues = new Set(o.dejaEnregistrees.filter((x): x is string => typeof x === 'string' && !!x));
  const b = o.bucket;
  // Le dépôt que le jeton PROUVE · authentique et du même espace, quels que
  // soient l'adresse présentée, l'usage et l'âge du jeton.
  const j = o.jeton;
  const adresseJeton = b && j && j !== 'illisible' && j.espace === b.espace && cleObjetDeLEspace(`${b.base.replace(/\/+$/, '')}/${j.cle}`, b.base, b.espace) === j.cle
    ? `${b.base.replace(/\/+$/, '')}/${j.cle}` : null;
  const aRetirer = (retenues: readonly string[]) => (adresseJeton && !o.dejaCite && !connues.has(adresseJeton) && !retenues.includes(adresseJeton) ? [adresseJeton] : []);
  const cible = (cle?: string): CibleJetonDepot => ({ espace: b?.espace ?? '', utilisateur: o.utilisateur, usage: 'logo', maintenant: o.maintenant, ...(cle === undefined ? {} : { cle }) });

  // Le logo que le navigateur vient de déposer · `LOGO_DEPOSE` devient l'adresse que le jeton résout.
  let charte = { logoUrl: o.charte.logoUrl, logos: [...o.charte.logos] };
  if (charte.logoUrl === LOGO_DEPOSE || charte.logos.includes(LOGO_DEPOSE)) {
    if (!b) return { ok: false, erreur: RAISON_LOGO_SANS_STOCKAGE, aRetirer: [] };
    const refus = refusJetonDepot(j, cible()) ?? (adresseJeton ? null : 'autre_espace');
    if (refus || !adresseJeton) return { ok: false, erreur: TEXTES_REFUS_JETON_DEPOT[refus ?? 'illisible'], aRetirer: aRetirer([]) };
    const vers = (a: string) => (a === LOGO_DEPOSE ? adresseJeton : a);
    charte = { logoUrl: vers(charte.logoUrl), logos: [...new Set(charte.logos.map(vers))] };
  }

  const adresses = [...new Set([charte.logoUrl, ...charte.logos].filter((a): a is string => typeof a === 'string' && !!a))];
  const attestees: string[] = [];
  for (const a of adresses) {
    if (connues.has(a) || !b) continue;
    const cle = cleObjetDeLEspace(a, b.base, b.espace);
    if (!cle) continue;
    // Un jeton porte UNE clé · une seconde adresse nouvelle du bucket tombe sur `autre_cle`.
    const refus = refusJetonDepot(j, cible(cle)) ?? (o.dejaCite ? 'deja_employe' : null);
    if (refus) return { ok: false, erreur: TEXTES_REFUS_JETON_DEPOT[refus], aRetirer: aRetirer([]) };
    attestees.push(a);
  }
  const refus = refusCharteLogos(charte, [...connues], b, attestees);
  if (refus) return { ok: false, erreur: refus, aRetirer: aRetirer([]) };
  return { ok: true, charte, deposes: attestees, aRetirer: aRetirer(adresses) };
}
