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

/* ───────────── Ailleurs que la fiche · le logo par défaut et les usages Studios ───────────── */

/**
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * Seule la fiche Identité disait « à réimporter ». Ailleurs, le logo par
 * défaut d'une marque s'affichait en image cassée (vue d'ensemble de la
 * marque, bouton de marque de la coquille, accueil), et les Studios ne le
 * découvraient qu'au REFUS du devis, après la préparation payante de la
 * consigne (`motifLogosAReimporter`).
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 *  · un écran qui montre le logo par défaut le juge par le MÊME bilan que la
 *    fiche (`bilanLogosCharte.defaut`) · servi ⇒ l'image ; sinon l'initiale,
 *    jamais une image que la route refuserait ;
 *  · seul « à réimporter » porte un signal (`logoParDefautAffiche.signal`) ·
 *    « indisponible » montre l'initiale sans rien demander (on ne fait pas
 *    refaire un import qu'on n'a pas pu juger) ;
 *  · le signal mène à la fiche Identité pour qui peut la gérer (admin) ; les
 *    autres lisent qui peut le faire, sans lien vers un écran qui les
 *    renverrait ;
 *  · Studios · un logo à réimporter n'est annoncé que s'il SERAIT UTILISÉ (lié
 *    au brief ou à une consigne du projet) · les autres logos de la charte ne
 *    concernent pas ce visuel et rien n'est bloqué.
 */

/** La fiche Identité d'une marque · là où se réimporte un logo. */
export function cheminIdentiteMarque(brandId: string): string {
  return `/brands/${encodeURIComponent(brandId)}/identite`;
}

export const AIDE_LOGO_SANS_GESTION = 'Un administrateur de l’espace peut le réimporter dans l’Identité de la marque.';

export interface SignalLogoAReimporter {
  libelle: 'Logo à réimporter';
  raison: string;
  /** La fiche Identité · `null` pour qui ne peut pas la gérer (voir `aide`). */
  lien: string | null;
  aide: string;
}

export interface LogoParDefautAffiche {
  /** Montrer l'image du logo par défaut · faux ⇒ l'initiale. */
  image: boolean;
  /** Seulement « à réimporter » · « indisponible » ne signale rien. */
  signal: SignalLogoAReimporter | null;
}

/** Ce qu'un écran montre du logo par défaut · `bilan` absent (rien de vérifié, logo sans empreinte) ⇒ l'image, sans signal. */
export function logoParDefautAffiche(o: { bilan: BilanLogosCharte | null | undefined; brandId: string; peutGerer: boolean }): LogoParDefautAffiche {
  const d = o.bilan?.defaut ?? null;
  if (!d) return { image: true, signal: null };
  if (d.etat !== 'a_reimporter') return { image: false, signal: null };
  return {
    image: false,
    signal: {
      libelle: 'Logo à réimporter', raison: d.raison,
      lien: o.peutGerer ? cheminIdentiteMarque(o.brandId) : null,
      aide: o.peutGerer ? 'Réimporte-le dans l’Identité de la marque.' : AIDE_LOGO_SANS_GESTION,
    },
  };
}

/** Un logo de la charte lié au projet, avec son nom dans le catalogue (« Logo principal », « Logo · variante 1 »). */
export interface LogoDuProjet { assetId: string; url: string; libelle: string }

export interface AnnonceLogosAReimporter {
  logos: Array<{ assetId: string; libelle: string }>;
  message: string;
  /** La fiche Identité · `null` pour qui ne peut pas la gérer (le message dit qui peut). */
  lien: string | null;
}

/**
 * Les logos à réimporter que le visuel UTILISERAIT · `utilises` = les
 * identifiants liés (brief, consignes), `logos` = ceux de la charte, `bilan`
 * = leur état (`bilanLogosCharte`). `null` quand aucun logo utilisé n'est à
 * réimporter (« indisponible » compris · le devis le relira).
 */
export function annonceLogosAReimporter(o: {
  utilises: ReadonlyArray<string>;
  logos: ReadonlyArray<LogoDuProjet>;
  bilan: BilanLogosCharte;
  brandId: string;
  peutGerer: boolean;
}): AnnonceLogosAReimporter | null {
  const voulus = new Set(o.utilises);
  const vus = new Set<string>();
  const out: Array<{ assetId: string; libelle: string }> = [];
  for (const l of o.logos) {
    if (!voulus.has(l.assetId) || vus.has(l.assetId)) continue;
    vus.add(l.assetId);
    const e = Object.prototype.hasOwnProperty.call(o.bilan.etats, l.url) ? o.bilan.etats[l.url]! : null;
    if (e?.etat === 'a_reimporter') out.push({ assetId: l.assetId, libelle: l.libelle });
  }
  if (!out.length) return null;
  const noms = out.map((l) => `« ${l.libelle} »`).join(', ');
  const plusieurs = out.length > 1;
  const message = `${plusieurs ? 'Logos à réimporter' : 'Logo à réimporter'} · ${noms} : ${plusieurs ? 'leurs fichiers ont' : 'son fichier a'} été remplacé${plusieurs ? 's' : ''} ou ${plusieurs ? 'ne sont' : 'n’est'} plus dans le stockage depuis l’import. ${plusieurs ? 'Ils ne seront pas envoyés' : 'Il ne sera pas envoyé'} au fournisseur d’images et une consigne qui ${plusieurs ? 'les' : 'le'} lie ne pourra pas être générée · ${o.peutGerer ? `réimporte-${plusieurs ? 'les' : 'le'} dans l’Identité de la marque avant de préparer ton visuel.` : 'un administrateur de l’espace peut le faire dans l’Identité de la marque.'}`;
  return { logos: out, message, lien: o.peutGerer ? cheminIdentiteMarque(o.brandId) : null };
}
