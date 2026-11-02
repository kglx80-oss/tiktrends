import type { FichierDrive } from './drive';
import { PHRASES_UTILISE_DANS, type VueUtiliseDans } from './utilise-dans';
import { REFUS_FICHIER } from './nom-fichier';

/**
 * Bibliothèque · « REMPLACER » un fichier · RÈGLES PURES (ni base, ni réseau).
 *
 * ── Le besoin ────────────────────────────────────────────────────────────────
 *
 * L'aperçu d'un fichier (V5 L35) propose « Remplacer » · déposer une nouvelle
 * version SOUS LE MÊME IDENTIFIANT. Les projets Studios citent un fichier par
 * cet identifiant (`brief.references[].assetId = bib_<uuid>`) et relisent sa
 * ligne `assets` à chaque lecture (catalogue, devis, génération) · remplacer
 * la ligne, c'est ce qu'ils liront ensuite. Téléverser un nouveau fichier en
 * créerait un autre, que personne ne cite.
 *
 * ── Le chemin ────────────────────────────────────────────────────────────────
 *
 * Le navigateur dépose la nouvelle version par le présigné existant
 * (`presignAssetUploadAction` · type, taille et durée signés), sous une
 * NOUVELLE clé d'objet. `remplacerAssetAction` relit l'objet déposé (type
 * réel, taille, empreinte · le chemin de `registerUploadedAssetAction`), juge
 * ici (`decisionRemplacement`), puis réécrit l'adresse, le type, la taille et
 * l'empreinte de la MÊME ligne, dans une transaction qui la verrouille. Le
 * nom, le dossier, les droits, le réglage IA, les tags et la date d'ajout ne
 * bougent pas. Tout refus, et tout échec d'écriture, retire le NOUVEL objet
 * (`ecrireApresDepot` · sauf si une ligne le cite déjà). L'ANCIEN objet n'est
 * jamais effacé · plus cité par la ligne, il devient candidat de l'inventaire
 * des orphelins (`stockage-orphelins.ts`) seulement si plus aucune colonne
 * recensée ne le cite.
 *
 * ── Quels fichiers se remplacent (`refusSourceRemplacement`) ─────────────────
 *
 *  · un TÉLÉVERSEMENT rangé dans le stockage de l'application · oui ;
 *  · un fichier synchronisé depuis Google Drive · non · sa source reste le
 *    fichier Drive (identifiant externe de dédoublonnage) ;
 *  · un ancien fichier gardé DANS LA BASE (adresse `data:`) · non · la route
 *    du média le sert « immuable » trente jours (son contenu ne changeait
 *    jamais), un navigateur garderait l'ancienne version sous la même adresse ;
 *  · un fichier importé par lien · non · son contenu vit ailleurs.
 * Une sortie Studios, une ancienne création (lecture seule) et un fichier de
 * la corbeille n'ont pas le geste.
 *
 * ── La famille (`decisionRemplacement`) ──────────────────────────────────────
 *
 * Une image se remplace par une image, une vidéo par une vidéo, un son par un
 * son, un document par un document · le TYPE RELU de l'objet déposé, jamais
 * celui que déclare le navigateur. Au sein d'une famille tout format admis au
 * dépôt passe (un PNG par un JPEG). Pourquoi pas plus large · la famille
 * (`assets.kind`) porte des usages : les Studios ne lisent que les IMAGES de
 * la bibliothèque (une image devenue vidéo disparaîtrait des projets qui la
 * citent, sans le dire), l'analyse et l'usage par l'IA ne valent que pour une
 * image, la vignette et les filtres par type en dépendent.
 */

/** Où vit le contenu d'un média de la bibliothèque · un fait relu côté serveur, jamais pris du navigateur. */
export type ContenuMedia = 'stockage' | 'base' | 'externe';

/** La famille d'un média (`assets.kind`) · `other` = document. */
export type FamilleRemplacement = 'image' | 'video' | 'audio' | 'other';

export const REFUS_REMPLACEMENT = {
  drive: 'Fichier synchronisé depuis Google Drive · il ne se remplace pas ici, sa source reste le fichier Drive.',
  base: 'Ancien fichier gardé dans la base, pas dans le stockage · importe la nouvelle version comme un nouveau fichier.',
  lien: 'Fichier importé par lien · il ne se remplace pas ici, importe la nouvelle version comme un nouveau fichier.',
  stockage: 'Remplacer passe par le stockage de fichiers, pas encore activé pour ton espace.',
  introuvable: REFUS_FICHIER.introuvable,
  identique: 'Ce dépôt est déjà la version actuelle du fichier.',
  dejaEnregistre: 'Ce dépôt est déjà enregistré pour un autre fichier · relance le remplacement.',
} as const;

const NOM_FAMILLE: Readonly<Record<FamilleRemplacement, { un: string; nom: string }>> = {
  image: { un: 'une', nom: 'image' },
  video: { un: 'une', nom: 'vidéo' },
  audio: { un: 'un', nom: 'son' },
  other: { un: 'un', nom: 'document' },
};

const estFamille = (x: unknown): x is FamilleRemplacement => x === 'image' || x === 'video' || x === 'audio' || x === 'other';

/** Le refus d'un dépôt d'une autre famille · « une image se remplace par une image, ce fichier est une vidéo ». */
export function refusFamilleRemplacement(attendue: FamilleRemplacement, recue: FamilleRemplacement): string {
  const a = NOM_FAMILLE[attendue], r = NOM_FAMILLE[recue];
  return `Remplacement refusé · ${a.un} ${a.nom} se remplace par ${a.un} ${a.nom}, ce fichier est ${r.un} ${r.nom}.`;
}

/** Ce que le sélecteur de fichiers propose · la famille du fichier remplacé (le serveur relit de toute façon). */
export const ACCEPT_REMPLACEMENT: Readonly<Record<FamilleRemplacement, string>> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  other: 'application/pdf',
};

/** Où vit le contenu · une adresse `data:` est en base, un objet du stockage de l'application est `stockage`. */
export function contenuMedia(url: string, objetDuStockage: boolean): ContenuMedia {
  if (typeof url === 'string' && /^data:/i.test(url.trim())) return 'base';
  return objetDuStockage ? 'stockage' : 'externe';
}

/** La source d'un média permet-elle le remplacement · `null` = oui, sinon la phrase. */
export function refusSourceRemplacement(m: { source: string; contenu: ContenuMedia }): string | null {
  if (m.source === 'drive') return REFUS_REMPLACEMENT.drive;
  if (m.contenu === 'base') return REFUS_REMPLACEMENT.base;
  if (m.source !== 'upload' || m.contenu !== 'stockage') return REFUS_REMPLACEMENT.lien;
  return null;
}

/** Ce que l'écran sait d'un média pour « Remplacer » (porté par `FichierDrive.remplacement`). */
export interface RemplacementSource {
  famille: FamilleRemplacement;
  /** `null` · la source se remplace ; sinon la phrase (Drive, base, lien). */
  refus: string | null;
}

/** Le fait porté par la donnée de l'écran · `undefined` sans contenu connu (fixture, sortie Studios, ancienne création). */
export function remplacementSource(m: { kind: string; source: string; contenu?: ContenuMedia }): RemplacementSource | undefined {
  if (!m.contenu) return undefined;
  return { famille: estFamille(m.kind) ? m.kind : 'other', refus: refusSourceRemplacement({ source: m.source, contenu: m.contenu }) };
}

export interface GesteRemplacement {
  libelle: 'Remplacer';
  ouvert: boolean;
  raison: string | null;
  /** Le filtre du sélecteur de fichiers · la famille du fichier remplacé. */
  accept: string;
  famille: FamilleRemplacement;
}

/**
 * Le geste « Remplacer » d'un fichier (aperçu, menu « … ») · `null` quand il
 * n'est pas proposé (sortie Studios, ancienne création, corbeille, donnée sans
 * contenu connu). Fermé, avec sa raison · lecture seule, stockage inactif,
 * source qui ne se remplace pas.
 */
export function remplacementFichier(
  f: Pick<FichierDrive, 'lectureSeule' | 'supprime' | 'remplacement'>,
  ctx: { lectureSeule: string | null; stockage: boolean },
): GesteRemplacement | null {
  if (f.lectureSeule || f.supprime || !f.remplacement) return null;
  const raison = ctx.lectureSeule ?? (!ctx.stockage ? REFUS_REMPLACEMENT.stockage : f.remplacement.refus);
  return { libelle: 'Remplacer', ouvert: raison === null, raison, accept: ACCEPT_REMPLACEMENT[f.remplacement.famille], famille: f.remplacement.famille };
}

export type DecisionRemplacement = { ok: true } | { ok: false; raison: string };

/**
 * La décision du serveur, sur la ligne relue et verrouillée et l'objet relu ·
 * `ancien` null = introuvable (autre espace, corbeille, sortie Studios ou
 * inconnu · la même phrase).
 */
export function decisionRemplacement(
  ancien: { kind: string; source: string; contenu: ContenuMedia; url: string } | null,
  nouveau: { kind: string; url: string },
): DecisionRemplacement {
  if (!ancien) return { ok: false, raison: REFUS_REMPLACEMENT.introuvable };
  const refus = refusSourceRemplacement(ancien);
  if (refus) return { ok: false, raison: refus };
  if (ancien.url === nouveau.url) return { ok: false, raison: REFUS_REMPLACEMENT.identique };
  const a = estFamille(ancien.kind) ? ancien.kind : 'other';
  const n = estFamille(nouveau.kind) ? nouveau.kind : 'other';
  if (a !== n) return { ok: false, raison: refusFamilleRemplacement(a, n) };
  return { ok: true };
}

/* ───────────────────────────── Ce que l'écran dit ───────────────────────────── */

export const PHRASES_REMPLACEMENT = {
  garde: 'Le fichier garde son identifiant, son nom, son dossier, ses droits et son réglage IA.',
  ancienne: 'L’ancienne version n’est pas effacée du stockage.',
  sansLecture: 'Si des projets Studios le citent, ils liront la nouvelle version.',
  association: 'Une association déjà faite garde l’empreinte de l’ancienne version · avant de recompiler, retire puis ajoute à nouveau le fichier dans « Produit et références » de chaque projet. Rien n’est substitué en silence.',
  tags: 'Ses tags d’analyse décrivent l’ancienne version · « Analyser à nouveau » les refait.',
} as const;

/** Le nombre de projets Studios qui citent le fichier · ceux montrés et le reste. */
export const projetsCitant = (u: VueUtiliseDans): number => u.projets.length + u.reste;

/** La phrase sur les projets · « Utilisé dans N projets Studios · ils liront la nouvelle version. » */
export function phraseProjetsRemplacement(u: VueUtiliseDans | null): string {
  if (!u) return PHRASES_REMPLACEMENT.sansLecture;
  const n = projetsCitant(u);
  if (!n) return u.phrase ?? PHRASES_UTILISE_DANS.aucun;
  return `Utilisé dans ${n} projet${n > 1 ? 's' : ''} Studios · ${n > 1 ? 'ils liront' : 'il lira'} la nouvelle version.`;
}

/**
 * La confirmation AVANT tout envoi · ce qui change, ce qui reste, et les
 * projets Studios qui le citent (`vueUtiliseDans`, la lecture de l'aperçu).
 */
export function confirmationRemplacement(o: { nom: string; nouveau: string; utilise: VueUtiliseDans | null; tags: number }): { question: string; lignes: string[] } {
  const cite = !!o.utilise && projetsCitant(o.utilise) > 0;
  return {
    question: `Remplacer « ${o.nom} » par « ${o.nouveau} » ?`,
    lignes: [
      phraseProjetsRemplacement(o.utilise),
      ...(cite ? [PHRASES_REMPLACEMENT.association] : []),
      PHRASES_REMPLACEMENT.garde,
      ...(o.tags > 0 ? [PHRASES_REMPLACEMENT.tags] : []),
      PHRASES_REMPLACEMENT.ancienne,
    ],
  };
}

/** Le message dit après un remplacement réussi · ce qui a VRAIMENT été écrit. */
export const messageFichierRemplace = (nom: string): string => `« ${nom} » remplacé par sa nouvelle version`;
