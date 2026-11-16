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
 * autres champs, sous 4 ko mesurés). Six photos par produit : la borne de
 * l'ancien geste, reprise.
 *
 * ── Le côté, relevé depuis la mesure de l'étiquette ──────────────────────────
 *
 * 1280 px fermait l'échelle quelle que soit la photo · or le transport (la
 * data URI sous 900 000 caractères) laisse souvent passer plus grand. Mesure
 * reproductible `apps/web/test/produit-prepare-resolution.test.ts` : trois
 * photos synthétiques (scène texturée calée sur la « photo texturée »
 * Chromium · 1280 px → 338 859 caractères contre 377 239), une étiquette à
 * trois lignes de fûts (épais 0,14 h, espacés 0,2 h), réduite puis JPEG 0,85
 * et relue. Hauteur de capitale RÉELLE en px · fûts encore séparés sur 12 ·
 * longueur de la data URI (`MESURE_ETIQUETTE`, ci-dessous) :
 *
 *   source · ligne (capitale)       1024      1280      1600      1920      2048
 *   packshot 2048² · mentions 22    11 12/12  13 12/12  17 12/12  21 12/12  22 12/12
 *     data URI                      217 803   333 963   541 091   831 331   1 281 719
 *   téléphone 4032×3024 · bénéfice 30  8 12/12   9 12/12  12 12/12  14 12/12  15 12/12
 *   téléphone 4032×3024 · mentions 16  0  0/12   4  5/12   5  8/12   7 12/12   7 12/12
 *     data URI                      229 907   338 859   490 095   662 823     740 579
 *   scène 3024×4032 · bénéfice 20    4  9/12   6 12/12   8 12/12  10 12/12  10 12/12
 *   scène 3024×4032 · mentions 11    1  1/12   3  3/12   4  7/12   5 11/12   5 12/12
 *     data URI                      237 407   349 615   505 087   682 787     762 347
 *
 * Lecture : à 1280 px, les mentions d'une photo de téléphone (capitale de
 * 16 px à la source) tombent à 4 px et perdent 7 fûts sur 12 · illisibles.
 * Elles redeviennent séparées à 1920 px (7 px, 12/12) ; 2048 n'y ajoute rien
 * (7 px) pour 12 % de poids en plus et sort le packshot de la borne. Côté
 * retenu : 1920 px, essayé d'abord · la photo de téléphone y pèse 662 823
 * caractères (74 % de la borne ; rapportée à la mesure Chromium, ≈ 737 000,
 * 82 %). Une photo plus chargée retombe d'elle-même à 1600 puis 1280 : on
 * s'arrête à la première sortie sous la borne, la borne ne bouge pas.
 * La mise en scène lointaine (capitale de 11 px) reste trop petite même à
 * 1920 · un gros plan de l'étiquette, envoyé comme deuxième vue (`vues.ts`),
 * est le seul remède ici.
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

/** Une ligne de la mesure de l'étiquette · rejouée par le test de résolution. */
export interface MesureEtiquette {
  source: string;
  ligne: string;
  capitaleSource: number;
  /** Par côté : hauteur de capitale relue en px et fûts encore séparés (sur 12). */
  parCote: Readonly<Record<number, readonly [px: number, futs: number]>>;
}

/** Les côtés mesurés · `MESURE_ETIQUETTE` et `MESURE_DATA_URI` les couvrent tous. */
export const COTES_MESURES = [1024, 1280, 1600, 1920, 2048] as const;

/** Mesure de l'en-tête, telle que le test la rejoue (valeurs exactes, sharp 0.34.5). */
export const MESURE_ETIQUETTE: readonly MesureEtiquette[] = [
  { source: 'packshot', ligne: 'mentions (contenance)', capitaleSource: 22, parCote: { 1024: [11, 12], 1280: [13, 12], 1600: [17, 12], 1920: [21, 12], 2048: [22, 12] } },
  { source: 'telephone', ligne: 'bénéfice', capitaleSource: 30, parCote: { 1024: [8, 12], 1280: [9, 12], 1600: [12, 12], 1920: [14, 12], 2048: [15, 12] } },
  { source: 'telephone', ligne: 'mentions (contenance)', capitaleSource: 16, parCote: { 1024: [0, 0], 1280: [4, 5], 1600: [5, 8], 1920: [7, 12], 2048: [7, 12] } },
  { source: 'scene', ligne: 'bénéfice', capitaleSource: 20, parCote: { 1024: [4, 9], 1280: [6, 12], 1600: [8, 12], 1920: [10, 12], 2048: [10, 12] } },
  { source: 'scene', ligne: 'mentions (contenance)', capitaleSource: 11, parCote: { 1024: [1, 1], 1280: [3, 3], 1600: [4, 7], 1920: [5, 11], 2048: [5, 12] } },
];

/** Longueur mesurée de la data URI JPEG 0,85, par source et par côté (± 5 % entre builds). */
export const MESURE_DATA_URI: Readonly<Record<'packshot' | 'telephone' | 'scene', Readonly<Record<number, number>>>> = {
  packshot: { 1024: 217_803, 1280: 333_963, 1600: 541_091, 1920: 831_331, 2048: 1_281_719 },
  telephone: { 1024: 229_907, 1280: 338_859, 1600: 490_095, 1920: 662_823, 2048: 740_579 },
  scene: { 1024: 237_407, 1280: 349_615, 1600: 505_087, 1920: 682_787, 2048: 762_347 },
};

/**
 * Tolérance de la REMESURE (test de résolution) · l'écart le plus grand
 * relevé en changeant le noyau de réduction (linear, cubic, mitchell,
 * lanczos3), perturbation plus forte qu'une montée de version de sharp :
 *
 *   capitale  2 px  (téléphone, mentions, 2048 · lanczos3 7 → 9)
 *   fûts      4/12  (téléphone, mentions, 1280 · lanczos3 5 → 1)
 *   data URI  21,9 %
 *
 * Le SEUIL, lui, se lit sur le tableau écrit (valeurs exactes de sharp 0.34.5).
 */
export const TOLERANCE_MESURE = { px: 2, futs: 4, dataUri: 0.22 } as const;

/** La « photo texturée » 4000 × 3000 à 1280 · 0,85, mesurée dans Chromium 1194 (tableau de l'en-tête) · ancre de la marge. */
export const DATA_URI_CHROMIUM_TEXTUREE_1280 = 377_239;

/** Le côté essayé d'abord · le plus petit où les mentions d'une photo de téléphone restent séparées (mesure). */
export const COTE_PHOTO_MAX = 1920;

const JPEG: readonly EtapeCompression[] = [
  { cote: COTE_PHOTO_MAX, format: 'image/jpeg', qualite: 0.85 },
  { cote: 1600, format: 'image/jpeg', qualite: 0.85 },
  { cote: 1280, format: 'image/jpeg', qualite: 0.85 },
  { cote: 1280, format: 'image/jpeg', qualite: 0.7 },
  { cote: 1024, format: 'image/jpeg', qualite: 0.7 },
];

/**
 * L'échelle de compression · on s'arrête à la première sortie sous la borne
 * (le plus grand côté que le transport laisse passer). Une source PNG ou WebP
 * tente d'abord le PNG (la transparence d'un produit détouré compte), aux
 * mêmes côtés, puis le JPEG sur fond blanc.
 */
export function etapesCompression(formatSource: string): readonly EtapeCompression[] {
  const f = formatSource.toLowerCase();
  if (f === 'image/png' || f === 'image/webp') {
    return [
      { cote: COTE_PHOTO_MAX, format: 'image/png', qualite: null },
      { cote: 1600, format: 'image/png', qualite: null },
      { cote: 1280, format: 'image/png', qualite: null },
      ...JPEG,
    ];
  }
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
