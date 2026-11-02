/**
 * Stockage · l'EMPREINTE d'un logo importé · gardée à l'import, vérifiée avant
 * de servir le logo ou de l'envoyer à un fournisseur · la règle, pure (la
 * vérification vit dans `packages/integrations/src/storage-relecture.ts`).
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * Depuis le jeton de dépôt et la relecture (`logo-depose-relu.ts`), un logo
 * importé est une image du type et de la taille signés AU MOMENT de
 * l'enregistrement. Mais le lien de dépôt présigné reste valable après
 * (`dureeLienDepot`, ≈ 100 s pour 4 Mo · un lien ne se révoque pas) · il peut
 * redéposer d'autres octets de même type et même longueur à la même adresse,
 * et la charte affichait puis envoyait aux fournisseurs ce nouveau contenu,
 * jamais relu. La Bibliothèque s'en protège par `assets.object_etag` (#978) ;
 * la charte des marques ne gardait rien.
 *
 * ── Le stockage (`brands.logo_empreintes_json`) ──────────────────────────────
 *
 * `logos` est un tableau de TEXTE (`text[]`), pas un JSON · il n'a pas de
 * place pour une empreinte sans changer la forme de chaque adresse, donc de
 * tous ses lecteurs (aperçus, catalogue, identifiants `logo_` dérivés de
 * l'adresse). Une colonne additive `jsonb`, nullable, garde une table
 * « adresse → empreinte » · les adresses ne changent pas, une adresse absente
 * de la table (logo ancien, adresse externe, stockage sans ETag) n'a pas
 * d'empreinte et reste servie comme avant.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 *  · à l'enregistrement de la charte (`empreintesLogosCharte`), chaque logo
 *    nouveau RELU garde l'ETag fort lu à sa relecture (celui exigé par
 *    `If-Match` sur les octets jugés) ; un logo déjà en base garde l'empreinte
 *    qu'il avait ; un logo retiré de la charte perd la sienne · la table ne
 *    décrit que les adresses de la charte ;
 *  · au service (`decisionLogoServi`), un logo SANS empreinte est servi comme
 *    aujourd'hui (aucune requête de plus) ; un logo AVEC empreinte n'est servi
 *    ou transmis que si le stockage confirme que l'objet est toujours celui-là
 *    (`If-Match` accepté, ETag relu égal · `etatEmpreinte`). Remplacé ⇒ ni
 *    servi ni transmis, « à réimporter » ; disparu ⇒ ni servi ni transmis ;
 *    stockage injoignable ⇒ rien n'est servi tant qu'on ne peut pas vérifier
 *    (même parti que la relecture de l'import : une lecture impossible refuse).
 */

import { empreinteObjet, etatEmpreinte } from './depot-relu';

/** Adresse → empreinte (contenu de l'ETag fort, sans guillemets). */
export type EmpreintesLogos = Readonly<Record<string, string>>;

/** Plafond d'une adresse gardée · celui des lecteurs (`/api/brands/[id]/media` refuse au-delà de 8 192). */
const LONGUEUR_MAX_ADRESSE = 8192;

/** La table relue en base · toute entrée mal formée est ignorée (jamais une erreur). */
export function lireEmpreintesLogos(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [url, e] of Object.entries(v as Record<string, unknown>)) {
    if (!url || url.length > LONGUEUR_MAX_ADRESSE || typeof e !== 'string') continue;
    const forte = empreinteObjet(`"${e}"`);
    if (forte === e) Object.defineProperty(out, url, { value: e, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

/** L'empreinte gardée pour `url` · `null` si la table n'en a pas (logo ancien, externe, stockage sans ETag). */
export function empreinteDuLogo(table: unknown, url: string): string | null {
  const t = lireEmpreintesLogos(table);
  return Object.prototype.hasOwnProperty.call(t, url) ? t[url]! : null;
}

/**
 * La table à écrire avec la charte · `charte` = toutes les adresses retenues
 * (logo par défaut et variantes), `relues` = l'empreinte lue pour chaque logo
 * NOUVEAU relu à cet enregistrement (`null` si le stockage n'a pas rendu
 * d'ETag fort). `null` quand aucune adresse n'a d'empreinte (colonne vide).
 */
export function empreintesLogosCharte(o: {
  avant: unknown;
  charte: ReadonlyArray<string | null | undefined>;
  relues: ReadonlyMap<string, string | null>;
}): Record<string, string> | null {
  const avant = lireEmpreintesLogos(o.avant);
  const out: Record<string, string> = {};
  for (const url of o.charte) {
    if (typeof url !== 'string' || !url || Object.prototype.hasOwnProperty.call(out, url)) continue;
    const e = o.relues.has(url) ? empreinteObjet(`"${o.relues.get(url) ?? ''}"`) : (Object.prototype.hasOwnProperty.call(avant, url) ? avant[url]! : null);
    if (e) Object.defineProperty(out, url, { value: e, enumerable: true, writable: true, configurable: true });
  }
  return Object.keys(out).length ? out : null;
}

/** Ce que rend la vérification du stockage (`verifierEmpreinteObjetEspace`, `lireObjetEspaceConforme`). */
export type VerificationEmpreinte =
  | { ok: true; empreinte: string | null }
  /** `remplace` · le stockage a répondu 412 à `If-Match` (l'objet n'est plus celui de l'empreinte). */
  | { ok: false; raison: 'hors_espace' | 'absent' | 'remplace' | 'illisible' };

export const MESSAGES_LOGO_SERVI = {
  remplace: 'Logo à réimporter · son fichier a été remplacé dans le stockage depuis l’import. Il n’est plus affiché ni envoyé aux générations · importe-le à nouveau dans la charte de la marque.',
  absent: 'Logo à réimporter · son fichier n’est plus dans le stockage.',
  illisible: 'Logo non vérifiable pour l’instant (stockage injoignable) · rien n’est affiché ni envoyé, réessaie dans un instant.',
} as const;

export type DecisionLogoServi =
  /** `verifie` · l'objet a été confirmé par son empreinte (faux pour un logo sans empreinte, servi comme avant). */
  | { servir: true; verifie: boolean }
  | { servir: false; cause: keyof typeof MESSAGES_LOGO_SERVI; message: string };

/**
 * Le logo peut-il être servi (aperçu) ou transmis (fournisseur) · `empreinte`
 * = celle gardée pour son adresse, `verification` = ce que le stockage a
 * répondu (absente si aucune vérification n'a pu partir, stockage non
 * configuré compris). Voir la règle en tête.
 */
export function decisionLogoServi(o: { empreinte: string | null | undefined; verification?: VerificationEmpreinte | null }): DecisionLogoServi {
  if (!o.empreinte) return { servir: true, verifie: false };
  const refus = (cause: keyof typeof MESSAGES_LOGO_SERVI): DecisionLogoServi => ({ servir: false, cause, message: MESSAGES_LOGO_SERVI[cause] });
  const v = o.verification;
  if (!v) return refus('illisible');
  if (!v.ok) return refus(v.raison === 'remplace' ? 'remplace' : v.raison === 'absent' ? 'absent' : 'illisible');
  // Un stockage qui ignorerait `If-Match` · l'ETag rendu doit rester celui gardé.
  if (etatEmpreinte(o.empreinte, v.empreinte) === 'remplace') return refus('remplace');
  return { servir: true, verifie: true };
}

/* ───────────── La charte vue par la fiche · « à réimporter » au rendu ───────────── */

/**
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * Un logo remplacé n'est plus servi (`/api/brands/[id]/media` → 409) ni
 * transmis, mais la fiche Identité ne le disait pas · une image cassée, sans
 * raison ni geste. La fiche juge chaque logo de la charte par la MÊME décision
 * que le service (`decisionLogoServi`) · ce que la fiche dit est ce que le
 * service fait.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 *  · seul un logo AVEC empreinte se vérifie (`logosAVerifier`) · un logo sans
 *    empreinte (ancien, externe) n'entraîne aucune requête et reste « servi » ;
 *  · remplacé ou disparu ⇒ « à réimporter », avec sa raison · la fiche propose
 *    « Importer » à sa place ;
 *  · stockage injoignable (ou vérification qui n'a pas pu partir) ⇒
 *    « indisponible », JAMAIS « à réimporter » · on ne demande pas de refaire
 *    un import qu'on n'a pas pu juger ;
 *  · le logo par défaut qui n'est pas servi est signalé en tête de la carte du
 *    logo (`bilanLogosCharte.defaut`).
 */

/** La raison montrée à côté du badge · courte, sans le préfixe « Logo à réimporter » que porte déjà le badge. */
export const RAISONS_LOGO_CHARTE = {
  remplace: 'Son fichier a été remplacé dans le stockage depuis l’import · il n’est plus affiché ni envoyé aux générations.',
  absent: 'Son fichier n’est plus dans le stockage · il n’est plus affiché ni envoyé aux générations.',
  illisible: 'Stockage injoignable · ce logo n’a pas pu être vérifié, réessaie dans un instant.',
} as const;

export type EtatLogoCharte =
  /** Sans empreinte (servi comme avant), ou objet confirmé par son empreinte. */
  | { etat: 'servi' }
  | { etat: 'a_reimporter'; cause: 'remplace' | 'absent'; raison: string }
  | { etat: 'indisponible'; raison: string };

/** L'état d'un logo de la charte · la décision du service, dite pour la fiche. */
export function etatLogoCharte(o: { empreinte: string | null | undefined; verification?: VerificationEmpreinte | null }): EtatLogoCharte {
  const d = decisionLogoServi(o);
  if (d.servir) return { etat: 'servi' };
  if (d.cause === 'illisible') return { etat: 'indisponible', raison: RAISONS_LOGO_CHARTE.illisible };
  return { etat: 'a_reimporter', cause: d.cause, raison: RAISONS_LOGO_CHARTE[d.cause] };
}

/** Les logos de la charte à vérifier au rendu · ceux qui ont une empreinte, chacun une fois. */
export function logosAVerifier(table: unknown, urls: ReadonlyArray<string | null | undefined>): Array<{ url: string; empreinte: string }> {
  const t = lireEmpreintesLogos(table);
  const vus = new Set<string>();
  const out: Array<{ url: string; empreinte: string }> = [];
  for (const url of urls) {
    if (typeof url !== 'string' || !url || vus.has(url)) continue;
    vus.add(url);
    if (Object.prototype.hasOwnProperty.call(t, url)) out.push({ url, empreinte: t[url]! });
  }
  return out;
}

export interface BilanLogosCharte {
  /** Adresse → état · seulement les logos qui ne sont PAS servis (un logo absent de la table est servi). */
  etats: Record<string, Exclude<EtatLogoCharte, { etat: 'servi' }>>;
  /** Le logo par défaut, quand il n'est pas servi · signalé en tête de la carte du logo. */
  defaut: Exclude<EtatLogoCharte, { etat: 'servi' }> | null;
}

/** Le bilan de la charte · `verifications` = ce que le stockage a répondu pour chaque logo vérifié (absent : rien n'a pu partir). */
export function bilanLogosCharte(o: {
  logos: ReadonlyArray<string | null | undefined>;
  defaut: string | null | undefined;
  empreintes: unknown;
  verifications: ReadonlyMap<string, VerificationEmpreinte | null>;
}): BilanLogosCharte {
  const etats: BilanLogosCharte['etats'] = {};
  for (const { url, empreinte } of logosAVerifier(o.empreintes, [o.defaut, ...o.logos])) {
    const e = etatLogoCharte({ empreinte, verification: o.verifications.get(url) ?? null });
    if (e.etat !== 'servi') Object.defineProperty(etats, url, { value: e, enumerable: true, writable: true, configurable: true });
  }
  const d = o.defaut && Object.prototype.hasOwnProperty.call(etats, o.defaut) ? etats[o.defaut]! : null;
  return { etats, defaut: d };
}
