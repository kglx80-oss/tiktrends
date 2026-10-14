/**
 * UX V2 · lot 3a · photo produit importée DANS le projet. Règles PURES : quel
 * fichier passe, comment le compresser, quand l'ajouter au catalogue, et ce
 * que l'écran dit à chaque étape.
 *
 * ── Le défaut réparé ─────────────────────────────────────────────────────────
 *
 * Le retrait des anciens studios (#779) a emporté le seul geste qui déposait
 * une photo produit depuis l'ordinateur (`setProductImagesAction`). L'écran
 * produit d'un projet renvoyait vers « la fiche de la marque », qui ne sait
 * pas le faire · un produit sans photo ne pouvait plus être épinglé.
 *
 * ── Le chemin repris, tel quel ───────────────────────────────────────────────
 *
 * Même stockage que l'ancien geste : la photo, compressée dans le navigateur,
 * entre en data URI dans `products.image_urls` du produit de la marque DU
 * PROJET (aucune table, aucune migration). Elle devient ensuite la photo
 * épinglée par la règle existante (`epinglerProduit`), identifiée par le
 * SHA-256 de ses octets.
 *
 * ── Les seuils, mesurés ──────────────────────────────────────────────────────
 *
 * Corps d'une action serveur Next 15.5 : 1 Mo par défaut
 * (`next/dist/server/app-render/action-handler.js`, `1024 * 1024`) · la borne
 * de 6 000 000 caractères de l'ancienne bibliothèque n'y était donc jamais
 * atteignable (une requête plus grosse tombait en 413 muet). Data URI JPEG
 * mesurées dans Chromium 1194, source 4000 × 3000 :
 *
 *   source           1280 · 0,85   1280 · 0,70   1024 · 0,70
 *   aplat dégradé         25 827        17 095        12 811
 *   « photo » texturée   377 239       214 243       139 027
 *   bruit plein (pire)   991 691       676 211       433 243
 *
 * Borne retenue : 900 000 caractères (≈ 150 ko de marge sous 1 Mio pour les
 * autres champs, sous 4 ko mesurés). La première étape (celle de l'ancien
 * geste) suffit pour une vraie photo ; la deuxième rattrape le pire cas.
 * Six photos par produit : la borne de l'ancien geste, reprise.
 */

export const FORMATS_PHOTO_IMPORT = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type FormatPhotoImport = typeof FORMATS_PHOTO_IMPORT[number];

/** Attribut `accept` du champ fichier · les mêmes formats, rien d'autre. */
export const ACCEPT_PHOTO_IMPORT = FORMATS_PHOTO_IMPORT.join(',');

/** Data URI la plus longue acceptée (caractères) · mesurée, voir l'en-tête. */
export const DATA_URI_PHOTO_MAX = 900_000;

/** Photos distinctes au plus par produit pour un dépôt (borne de l'ancien geste). */
export const PHOTOS_PRODUIT_MAX = 6;

export interface EtapeCompression { cote: number; format: 'image/png' | 'image/jpeg'; qualite: number | null }

const JPEG: readonly EtapeCompression[] = [
  { cote: 1280, format: 'image/jpeg', qualite: 0.85 },
  { cote: 1280, format: 'image/jpeg', qualite: 0.7 },
  { cote: 1024, format: 'image/jpeg', qualite: 0.7 },
];

/**
 * L'échelle de compression · on s'arrête à la première sortie sous la borne.
 * Une source PNG ou WebP tente d'abord le PNG (la transparence d'un produit
 * détouré compte), puis le JPEG sur fond blanc.
 */
export function etapesCompression(formatSource: string): readonly EtapeCompression[] {
  const f = formatSource.toLowerCase();
  if (f === 'image/png' || f === 'image/webp') return [{ cote: 1280, format: 'image/png', qualite: null }, ...JPEG];
  return JPEG;
}

export type MotifRefusPhoto = 'format' | 'vide' | 'trop_lourd' | 'illisible' | 'complet';

export const MESSAGES_REFUS_PHOTO: Readonly<Record<MotifRefusPhoto, string>> = {
  format: 'Format refusé · seuls JPG, PNG et WebP passent. Exporte la photo dans l’un de ces formats, puis choisis-la à nouveau.',
  vide: 'Ce fichier est vide · choisis une autre photo.',
  trop_lourd: 'Photo trop lourde, même compressée · recadre-la ou réduis-la, puis choisis-la à nouveau.',
  illisible: 'Ce fichier n’est pas une image lisible · choisis une autre photo.',
  complet: `Ce produit a déjà ${PHOTOS_PRODUIT_MAX} photos ou plus · épingle l’une d’elles ci-dessus.`,
};

export type VerdictPhoto<T extends object = object> = ({ ok: true } & T) | { ok: false; motif: MotifRefusPhoto; message: string };

const refus = (motif: MotifRefusPhoto): { ok: false; motif: MotifRefusPhoto; message: string } => ({ ok: false, motif, message: MESSAGES_REFUS_PHOTO[motif] });

const estFormat = (x: string): x is FormatPhotoImport => (FORMATS_PHOTO_IMPORT as readonly string[]).includes(x);

/** Le fichier choisi, AVANT toute lecture · type déclaré et taille. */
export function verdictFichierPhoto(f: { type: string; taille: number }): VerdictPhoto<{ format: FormatPhotoImport }> {
  const type = (f.type || '').toLowerCase();
  if (!estFormat(type)) return refus('format');
  if (!(f.taille > 0)) return refus('vide');
  return { ok: true, format: type };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Les premiers octets d'un base64 · assez pour lire une signature. */
function premiersOctets(b64: string, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 4 <= b64.length && out.length < n; i += 4) {
    const v = [0, 1, 2, 3].map((k) => B64.indexOf(b64[i + k]!));
    out.push(((v[0]! << 2) | (v[1]! >> 4)) & 255);
    if (v[2]! >= 0) out.push((((v[1]! & 15) << 4) | (v[2]! >> 2)) & 255);
    if (v[3]! >= 0) out.push((((v[2]! & 3) << 6) | v[3]!) & 255);
  }
  return out.slice(0, n);
}

const ascii = (o: number[], debut: number, mot: string) => [...mot].every((c, i) => o[debut + i] === c.charCodeAt(0));

/** Les octets commencent-ils par la signature du format déclaré ? */
export function signatureConforme(format: FormatPhotoImport, octets: readonly number[]): boolean {
  const o = [...octets];
  if (format === 'image/jpeg') return o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff;
  if (format === 'image/png') return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => o[i] === b);
  return ascii(o, 0, 'RIFF') && ascii(o, 8, 'WEBP');
}

const DATA_URI = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * La data URI reçue (navigateur ET serveur, même règle) · longueur d'abord
 * (jamais d'expression régulière sur un corps démesuré), format permis, base64
 * propre, puis signature des octets conforme au format déclaré : un fichier
 * renommé en `.jpg` ne passe pas.
 */
export function verdictDataUriPhoto(uri: unknown): VerdictPhoto<{ format: FormatPhotoImport }> {
  if (typeof uri !== 'string' || uri.length === 0) return refus('illisible');
  if (uri.length > DATA_URI_PHOTO_MAX) return refus('trop_lourd');
  const m = DATA_URI.exec(uri);
  if (!m) return /^data:image\//i.test(uri) && !/^data:image\/(jpeg|png|webp);/.test(uri) ? refus('format') : refus('illisible');
  const format = m[1]!;
  if (!estFormat(format)) return refus('format');
  if (!signatureConforme(format, premiersOctets(m[2]!, 12))) return refus('illisible');
  return { ok: true, format };
}

/**
 * Les colonnes photo du produit APRÈS l'import · l'écriture SQL fait la même
 * chose (ajout en fin de `image_urls`, `image_url` posée seulement quand le
 * produit n'avait AUCUNE photo). Rien n'est retiré ni réordonné : les photos
 * déjà là gardent leur position.
 */
export function colonnesApresImport(p: { imageUrl: string | null; imageUrls: readonly string[] | null }, dataUri: string): { imageUrl: string | null; imageUrls: string[] } {
  const urls = [...(p.imageUrls ?? [])];
  return { imageUrl: p.imageUrl ?? (urls.length === 0 ? dataUri : null), imageUrls: [...urls, dataUri] };
}

export type DecisionAjoutPhoto = { action: 'ajouter' } | { action: 'reutiliser' } | { action: 'refus'; motif: 'complet'; message: string };

/**
 * Ajouter la photo au catalogue du produit ? Une photo au même contenu y est
 * déjà : on la réutilise (aucun doublon, aucune écriture du produit). Sinon,
 * pas au-delà de la borne.
 */
export function decisionAjoutPhoto(photos: readonly { assetId: string }[], nouvelleId: string): DecisionAjoutPhoto {
  if (photos.some((p) => p.assetId === nouvelleId)) return { action: 'reutiliser' };
  if (photos.length >= PHOTOS_PRODUIT_MAX) return { action: 'refus', motif: 'complet', message: MESSAGES_REFUS_PHOTO.complet };
  return { action: 'ajouter' };
}

export interface EtatGesteImport { peutModifier: boolean; produitChoisi: boolean; enCours: boolean }

/** Raison d'un import impossible · `null` quand le geste est permis. */
export function raisonImportPhoto(e: EtatGesteImport): string | null {
  if (!e.peutModifier) return 'Ton rôle permet de consulter, pas d’importer.';
  if (!e.produitChoisi) return 'Choisis d’abord un produit.';
  if (e.enCours) return 'Import en cours · patiente.';
  return null;
}

// ── Ce que l'écran dit ────────────────────────────────────────────────────────

export type EtapeImportPhoto = 'repos' | 'preparation' | 'envoi' | 'reussi' | 'echec';
export type MotifEchecImport = MotifRefusPhoto | 'reseau' | 'conflit' | 'serveur';
export type RecuperationImport = 'choisir' | 'reessayer' | 'recharger';

export interface EtatImportPhoto {
  etape: EtapeImportPhoto;
  motif?: MotifEchecImport;
  /** Message renvoyé par le serveur (motif `serveur`). */
  message?: string;
  /** Réussi : la photo est-elle nouvelle dans le catalogue (sinon réutilisée) ? */
  ajoutee?: boolean;
  /** Nom du fichier choisi, pour dire de QUOI on parle. */
  fichier?: string;
}

export interface AffichageImport {
  ton: 'info' | 'ok' | 'warn' | 'err';
  /** `status` pour ce qui avance ou réussit, `alert` pour ce qui demande d'agir. */
  role: 'status' | 'alert';
  titre: string;
  texte: string;
  /** Les gestes offerts pour repartir · jamais vide sur un échec. */
  recuperations: readonly RecuperationImport[];
}

/** L'état → le message et les gestes de récupération · `null` au repos. */
export function affichageImportPhoto(e: EtatImportPhoto): AffichageImport | null {
  const de = e.fichier ? ` « ${e.fichier} »` : '';
  switch (e.etape) {
    case 'repos': return null;
    case 'preparation': return { ton: 'info', role: 'status', titre: 'Import en cours', texte: `Compression de la photo${de} dans ton navigateur…`, recuperations: [] };
    case 'envoi': return { ton: 'info', role: 'status', titre: 'Import en cours', texte: `Enregistrement de la photo${de} et épinglage…`, recuperations: [] };
    case 'reussi': return {
      ton: 'ok', role: 'status', titre: 'Photo importée',
      texte: e.ajoutee === false
        ? 'Cette photo était déjà dans le catalogue du produit · elle devient la photo épinglée, sans doublon. Nouvelle version du projet.'
        : 'Elle rejoint le catalogue du produit et devient la photo épinglée · nouvelle version du projet.',
      recuperations: [],
    };
    case 'echec': {
      const m = e.motif ?? 'serveur';
      if (m === 'reseau') return { ton: 'err', role: 'alert', titre: 'Échec réseau', texte: 'Le serveur n’a pas répondu · rien n’est confirmé. Ta photo est gardée : réessaie quand la connexion revient.', recuperations: ['reessayer', 'choisir'] };
      if (m === 'conflit') return { ton: 'warn', role: 'alert', titre: 'Conflit de version', texte: 'Le projet a changé depuis l’ouverture de cette page · rien n’a été épinglé ni écrasé. Recharge la version courante, puis importe à nouveau.', recuperations: ['recharger'] };
      if (m === 'serveur') return { ton: 'err', role: 'alert', titre: 'Import refusé', texte: e.message || 'Le serveur a refusé la photo · rien n’a été épinglé.', recuperations: ['choisir'] };
      return { ton: 'err', role: 'alert', titre: 'Import refusé', texte: MESSAGES_REFUS_PHOTO[m], recuperations: ['choisir'] };
    }
  }
}
