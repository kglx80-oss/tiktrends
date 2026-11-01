/**
 * Dépôt de fichiers dans le bucket de l'espace, et adresses de logo · la règle,
 * pure (ni base, ni réseau).
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * `presignAssetUploadAction` signait un PUT pour TOUT type déclaré, jusqu'à
 * 1 Go, et l'adresse présignée ne signait que `host` : un appel direct à
 * l'action déposait du SVG ou du HTML dans `assets/<espace>/`, servi ensuite
 * avec son type par le bucket (la route `/api/asset/[id]` redirige vers une
 * lecture signée de l'objet). Côté charte, `saveBrandDAAction` enregistrait
 * n'importe quelle adresse de logo (`javascript:`, `http://169.254.169.254/…`),
 * transmise ensuite comme référence d'image aux fournisseurs.
 *
 * ── La règle du dépôt (`decisionDepot`) ──────────────────────────────────────
 *
 * Liste blanche dérivée de TOUS les appelants réels de l'action :
 *  - Bibliothèque (`Bibliotheque.tsx`, sélecteur
 *    `image/*,video/*,audio/*,application/pdf`, plus le glisser-déposer) ;
 *  - import du logo de la marque (`ImportLogo`, png · jpg · webp, 4 Mo) ;
 *  - le test de recette #106b (une vidéo mp4).
 * Donc :
 *  1. les types SERVIS (`TYPES_MEDIA_SERVIS` · images matricielles, vidéos,
 *     sons) gardent leur type, rendu canonique (casse, paramètres et alias
 *     ramenés : `IMAGE/PNG; charset=x` ⇒ `image/png`) ;
 *  2. un PDF, ou un média rare non exécutable du sélecteur (`image/tiff`,
 *     `audio/ogg`…), est déposé en `application/octet-stream` · le bucket ne
 *     l'interprète jamais, exactement comme la synchro Drive
 *     (`entreeSynchroDrive`) ;
 *  3. tout le reste est refusé : SVG, HTML, XML, JavaScript, texte, archive,
 *     type mal formé.
 * Le type retenu est le `Content-Type` SIGNÉ dans l'adresse présignée · le
 * navigateur doit envoyer exactement celui-là, sinon le bucket refuse le PUT.
 * La taille validée (`contentLength`, entier ≥ 1, sous le plafond de sa
 * famille) est signée de même en `Content-Length` : un corps d'une autre
 * longueur que celle déclarée est refusé PAR LE BUCKET. Sans cela, le plafond
 * ne portait que sur la taille DÉCLARÉE (le PUT reste `UNSIGNED-PAYLOAD`) ·
 * déclarer 10 octets puis envoyer 5 Go passait.
 * L'extension de la clé est FORCÉE par ce type (`photo.html.png` déclaré PNG ⇒
 * `photo-html.png`) · jamais celle du nom fourni.
 *
 * Un fichier sans type déclaré (`''` ou `application/octet-stream`, le cas des
 * HEIC sous Chrome) est reconnu par son extension, parmi celles de la liste.
 *
 * ── Les plafonds, mesurés ────────────────────────────────────────────────────
 *
 * | Limite existante                                   | Valeur    | Où                                     |
 * | -------------------------------------------------- | --------- | -------------------------------------- |
 * | Dépôt direct, message affiché                      | 1 Go      | `assets.ts` « max 1 Go »               |
 * | Logo, refusé côté client                           | 4 Mo      | `POIDS_MAX_LOGO`                       |
 * | Image sans stockage (data URI)                     | ~4 Mo     | `uploadImageAssetsAction`              |
 * | Lecture d'une image par les studios et le catalogue| 64 Mio    | `OCTETS_MAX_MEDIA`, `catalogue-medias` |
 * | Proxy d'une adresse externe                        | 50 Mo     | `media-reponse.ts`                     |
 *
 * Image : 64 Mio, le plus grand plafond de lecture serveur d'une image · au
 * delà, aucun lecteur du produit ne l'ouvre. Vidéo, son, document : 1 Go, le
 * plafond affiché aujourd'hui (aucune limite plus fine n'est annoncée). Le logo
 * garde son plafond client de 4 Mo (`refusFichierLogo`).
 *
 * ── L'adresse d'un logo (`refusAdresseLogo`) ─────────────────────────────────
 *
 * `https:` seulement, sans identifiants (`https://user@hote`), sur le port
 * standard, vers un NOM d'hôte public : ni adresse IP littérale (v4 ou v6, une
 * vraie charte n'est jamais servie par une IP · toutes les formes sont déjà
 * ramenées à leur écriture canonique par l'analyseur d'URL : `0x7f.1` ⇒
 * `127.0.0.1`), ni `localhost`, ni nom interne (`.local`, `.internal`…), ni nom
 * sans point (`redis`, `postgres`). Ce contrôle est syntaxique : un nom public
 * qui RÉSOUT vers une adresse privée reste l'affaire de `safeFetch` (DNS relu à
 * chaque saut) quand le serveur lit l'image.
 *
 * Un objet du bucket de CET espace (`assets/<espace>/…` sous la base publique,
 * `cleObjetDeLEspace`) est toujours admis : c'est l'adresse que fabrique
 * l'import d'un fichier de logo, quel que soit l'hôte du stockage configuré.
 *
 * Une adresse DÉJÀ enregistrée n'est pas revalidée à l'écriture
 * (`refusCharteLogos`) · aucune donnée existante n'est réécrite ni bloquée ;
 * c'est à la LECTURE pour les fournisseurs qu'elle est écartée
 * (`logoTransmissible`).
 */

import { TYPES_MEDIA_SERVIS, entreeSynchroDrive, typeMediaDeclare, type FamilleMedia, type TypeMediaServi } from './medias-servis';
import { cleObjetDeLEspace } from './objet-espace';

export type FamilleDepot = FamilleMedia | 'document';

/** Plafonds par famille, en octets · voir le tableau mesuré ci-dessus. */
export const PLAFONDS_DEPOT: Readonly<Record<FamilleDepot, number>> = {
  image: 64 * 1024 * 1024,
  video: 1_073_741_824,
  audio: 1_073_741_824,
  document: 1_073_741_824,
};

const LIBELLE_PLAFOND: Readonly<Record<FamilleDepot, string>> = {
  image: 'Image trop lourde (64 Mo au plus).',
  video: 'Vidéo trop lourde (1 Go au plus).',
  audio: 'Son trop lourd (1 Go au plus).',
  document: 'Fichier trop lourd (1 Go au plus).',
};

/** Le dépôt neutre · le bucket sert l'objet sans jamais l'interpréter. */
export const TYPE_DEPOT_NEUTRE = 'application/octet-stream';

export const MESSAGES_REFUS_DEPOT = {
  invalide: 'Fichier invalide.',
  vide: 'Ce fichier est vide.',
  type: 'Type de fichier refusé · images, vidéos, sons et PDF uniquement (ni SVG, ni HTML).',
} as const;

export type DecisionDepot =
  | { ok: true; contentType: string; contentLength: number; extension: string; famille: FamilleDepot; nomFichier: string }
  | { ok: false; erreur: string };

/** Extensions reconnues quand le navigateur ne déclare aucun type. */
const TYPE_PAR_EXTENSION: Readonly<Record<string, TypeMediaServi | 'application/pdf'>> = {
  ...Object.fromEntries(Object.entries(TYPES_MEDIA_SERVIS).map(([t, v]) => [v.extension, t as TypeMediaServi])),
  jpeg: 'image/jpeg', heif: 'image/heic', m4v: 'video/mp4',
  pdf: 'application/pdf',
};

function extensionDuNom(nom: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(nom.trim());
  return m ? m[1]!.toLowerCase() : '';
}

/**
 * Le nom rangé dans la clé · base assainie (tout point devient `-`, donc plus
 * de double extension), puis l'extension FORCÉE par le type retenu.
 */
export function nomFichierDepot(nom: string, extension: string): string {
  const sansExt = (nom || '').trim().replace(/\.[A-Za-z0-9]{1,8}$/, '');
  const base = sansExt.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fichier';
  return `${base}.${extension}`;
}

/**
 * Ce que le dépôt accepte, sous quel `Content-Type` signé et quelle extension ·
 * ou pourquoi il refuse. Aucune déclaration n'est crue telle quelle : le type
 * est ramené à la liste fermée, l'extension en découle.
 */
export function decisionDepot(f: { nom: string; type: string; taille: number }): DecisionDepot {
  if (!f || typeof f.nom !== 'string' || !f.nom.trim() || typeof f.type !== 'string') return { ok: false, erreur: MESSAGES_REFUS_DEPOT.invalide };
  if (typeof f.taille !== 'number' || !Number.isSafeInteger(f.taille) || f.taille < 0) return { ok: false, erreur: MESSAGES_REFUS_DEPOT.invalide };
  if (f.taille === 0) return { ok: false, erreur: MESSAGES_REFUS_DEPOT.vide };

  let declare = f.type.split(';')[0]!.trim().toLowerCase();
  if (!declare || declare === TYPE_DEPOT_NEUTRE) declare = TYPE_PAR_EXTENSION[extensionDuNom(f.nom)] ?? '';
  if (!declare) return { ok: false, erreur: MESSAGES_REFUS_DEPOT.type };

  let retenu: { contentType: string; extension: string; famille: FamilleDepot };
  const servi = typeMediaDeclare(declare);
  if (servi) {
    retenu = { contentType: servi, extension: TYPES_MEDIA_SERVIS[servi].extension, famille: TYPES_MEDIA_SERVIS[servi].famille };
  } else if (declare === 'application/pdf') {
    retenu = { contentType: TYPE_DEPOT_NEUTRE, extension: 'pdf', famille: 'document' };
  } else {
    // Média rare du sélecteur · la règle de la synchro Drive (non exécutable ⇒
    // dépôt neutre), restreinte aux familles que le sélecteur propose.
    const e = entreeSynchroDrive(declare);
    if (!e || e.kind === 'other' || e.depot !== TYPE_DEPOT_NEUTRE) return { ok: false, erreur: MESSAGES_REFUS_DEPOT.type };
    retenu = { contentType: TYPE_DEPOT_NEUTRE, extension: e.extension, famille: e.kind };
  }
  if (f.taille > PLAFONDS_DEPOT[retenu.famille]) return { ok: false, erreur: LIBELLE_PLAFOND[retenu.famille] };
  return { ok: true, ...retenu, contentLength: f.taille, nomFichier: nomFichierDepot(f.nom, retenu.extension) };
}

/* ───────────────────────── Adresse d'un logo ───────────────────────── */

export const MESSAGES_REFUS_LOGO = {
  illisible: 'Adresse de logo illisible · colle l’adresse complète (https://…).',
  schema: 'Adresse de logo refusée · seules les adresses https:// sont acceptées.',
  identifiants: 'Adresse de logo refusée · elle ne doit pas contenir d’identifiants (https://nom@…).',
  port: 'Adresse de logo refusée · le port doit rester celui par défaut.',
  hote: 'Adresse de logo refusée · elle doit pointer vers un site public, ni adresse IP, ni réseau interne.',
} as const;

/** Suffixes de noms réservés aux réseaux internes (RFC 6761, 6762, 8375 et usages). */
const SUFFIXES_INTERNES = ['localhost', 'local', 'internal', 'intranet', 'lan', 'home.arpa', 'corp', 'localdomain'];

/** Pourquoi cette adresse ne peut pas devenir un logo · `null` quand elle le peut. */
export function refusAdresseLogo(adresse: string): string | null {
  const brut = typeof adresse === 'string' ? adresse.trim() : '';
  if (!brut) return MESSAGES_REFUS_LOGO.illisible;
  let u: URL;
  try { u = new URL(brut); } catch { return MESSAGES_REFUS_LOGO.illisible; }
  if (u.protocol !== 'https:') return MESSAGES_REFUS_LOGO.schema;
  if (u.username || u.password) return MESSAGES_REFUS_LOGO.identifiants;
  if (u.port) return MESSAGES_REFUS_LOGO.port;
  const hote = u.hostname.toLowerCase().replace(/\.+$/, '');
  if (!hote || hote.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(hote)) return MESSAGES_REFUS_LOGO.hote;
  if (!hote.includes('.')) return MESSAGES_REFUS_LOGO.hote;
  if (SUFFIXES_INTERNES.some((s) => hote === s || hote.endsWith(`.${s}`))) return MESSAGES_REFUS_LOGO.hote;
  return null;
}

/** Le bucket de l'espace · sa base publique (`basePubliqueStockage`) et l'espace. */
export interface BucketEspace { base: string; espace: string }

const objetDuBucket = (a: string, bucket?: BucketEspace | null): boolean =>
  !!bucket && cleObjetDeLEspace(a, bucket.base, bucket.espace) !== null;

/**
 * La charte à enregistrer · chaque adresse NOUVELLE (absente de ce qui est déjà
 * enregistré) doit passer `refusAdresseLogo`. Une adresse déjà en base est
 * renvoyée telle quelle sans blocage (choisir un autre logo par défaut ne doit
 * pas échouer à cause d'une variante ancienne) · elle est écartée à la lecture
 * pour les fournisseurs (`logoTransmissible`).
 */
export function refusCharteLogos(c: { logoUrl: string; logos: readonly string[] }, dejaEnregistrees: ReadonlyArray<string | null | undefined>, bucket?: BucketEspace | null): string | null {
  const connues = new Set(dejaEnregistrees.filter((x): x is string => typeof x === 'string' && !!x));
  for (const a of [c.logoUrl, ...c.logos]) {
    if (!a || connues.has(a) || objetDuBucket(a, bucket)) continue;
    const refus = refusAdresseLogo(a);
    if (refus) return refus;
  }
  return null;
}

/** Image matricielle embarquée · seule forme `data:` déjà transmise aux fournisseurs. */
const DATA_IMAGE_MATRICIELLE = /^data:image\/(png|jpeg|webp);base64,/;

/**
 * Lecture pour les fournisseurs · une adresse de logo ENREGISTRÉE part comme
 * référence seulement si elle passe la règle d'écriture, ou si c'est une image
 * matricielle embarquée (`data:image/png|jpeg|webp;base64`, déjà admise par les
 * références), ou un objet du bucket de l'espace. Le reste (`http:`, IP, `javascript:`, SVG embarqué) est ignoré,
 * sans toucher à la base.
 */
export function logoTransmissible(adresse: string | null | undefined, bucket?: BucketEspace | null): boolean {
  if (typeof adresse !== 'string' || !adresse) return false;
  return DATA_IMAGE_MATRICIELLE.test(adresse) || objetDuBucket(adresse, bucket) || refusAdresseLogo(adresse) === null;
}
