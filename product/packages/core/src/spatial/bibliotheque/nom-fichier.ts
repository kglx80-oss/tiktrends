import { validerNomSaisi, type ValidationNom } from '../../bibliotheque-dossiers';
import { TYPES_MEDIA_SERVIS } from '../../medias-servis';

/**
 * Bibliothèque · RENOMMER UN FICHIER (`assets.name`) · RÈGLES PURES (ni base,
 * ni réseau). L'action (`renommerAssetAction`), l'aperçu et le menu « … »
 * s'appuient sur ce module · ils ne redéfinissent aucune règle.
 *
 * La règle est celle du nom de dossier (`validerNomSaisi` · rogné, non vide,
 * longueur bornée, sans caractère interdit), avec trois différences décidées :
 *
 *  1. LA BORNE · 160 caractères, extension comprise. La colonne (`text`) n'en
 *     pose aucune ; la borne est celle que CHAQUE chemin d'entrée applique
 *     déjà au nom d'un fichier, relevée dans le code :
 *
 *     | Chemin d'entrée                                  | Coupe le nom à |
 *     | ------------------------------------------------ | -------------- |
 *     | `uploadImageAssetsAction` (image compressée)     | 160            |
 *     | `importAssetAction` (import par lien)            | 160            |
 *     | `registerUploadedAssetAction` (bucket)           | 160            |
 *     | `syncDriveNowAction`, `drive-sync` (Google Drive) | 160            |
 *
 *     Un nom importé peut donc toujours être réenregistré tel quel, et le
 *     renommage ne crée aucun nom qu'un import n'aurait pas pu créer.
 *
 *  2. L'EXTENSION EST CONSERVÉE · si le nom actuel finit par une extension
 *     CONNUE (`EXTENSIONS_CONSERVEES` · les types servis, plus les formats
 *     courants qu'un import accepte), un nouveau nom qui ne la porte pas la
 *     reçoit (« Nouveau » → « Nouveau.jpg »). Pourquoi · le type réel du
 *     fichier ne change pas avec son nom (`mime_type` reste), et le nom sert
 *     tel quel au téléchargement en archive (`nomFichierArchive`, qui
 *     n'ajoute l'extension du type QUE si le nom n'en porte pas) · « photo.png »
 *     sur un JPEG sortirait sous un nom qui ment. Un nom saisi qui finit déjà
 *     par la même extension (casse ignorée) est gardé tel quel. Une fin qui
 *     n'est pas une extension connue (« Shooting v1.2 », « Rapport.final »)
 *     n'est jamais prise pour une extension · rien n'est ajouté.
 *
 *  3. LES CARACTÈRES INTERDITS · en plus des caractères de contrôle (C0, DEL),
 *     les C1 et les contrôles bidirectionnels (U+061C, U+200E, U+200F,
 *     U+202A-U+202E, U+2066-U+2069) et les séparateurs de ligne et de
 *     paragraphe (U+2028, U+2029) · une inversion bidi fait lire
 *     « photo » + U+202E + « gpj.exe » comme « photoexe.jpg » à l'écran. Les liants de largeur
 *     nulle (U+200C, U+200D) restent permis · ils composent les émojis.
 *
 * Aucune unicité · deux fichiers du même nom restent permis, comme à l'import.
 */

/** La borne du nom d'un fichier, extension comprise · alignée sur les chemins d'entrée (voir le tableau). */
export const LONGUEUR_MAX_NOM_FICHIER = 160;

/** Les extensions reconnues et conservées au renommage · celles des types servis, plus les formats courants importables. */
export const EXTENSIONS_CONSERVEES: ReadonlySet<string> = new Set([
  ...Object.values(TYPES_MEDIA_SERVIS).map((t) => t.extension),
  'jpeg', 'heif', 'svg', 'tif', 'tiff', 'bmp', 'm4v', 'avi', 'mkv', 'aac', 'ogg', 'flac', 'pdf',
]);

/** Les phrases du renommage d'un fichier · les MÊMES dans la fenêtre et dans le refus du serveur. */
export const REFUS_FICHIER = {
  introuvable: 'Fichier introuvable.',
  invalide: 'Nom de fichier invalide.',
  vide: 'Donne un nom au fichier.',
  interdit: 'Le nom ne peut pas contenir de caractère de contrôle ou invisible.',
} as const;

const INTERDITS_NOM_FICHIER = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/;

/** L'extension CONNUE d'un nom, avec son point (« .jpg ») · `''` sans extension reconnue. */
export function extensionNomFichier(nom: string): string {
  const m = /^(.+?)(\.([A-Za-z0-9]{1,10}))$/.exec(nom);
  return m && EXTENSIONS_CONSERVEES.has(m[3]!.toLowerCase()) ? m[2]! : '';
}

/** La partie du nom avant son extension connue · ce que la fenêtre présélectionne. */
export function baseNomFichier(nom: string): string {
  return nom.slice(0, nom.length - extensionNomFichier(nom).length);
}

/** La phrase d'un nom trop long · elle dit quand l'extension conservée compte. */
export function refusNomFichierTropLong(extension: string): string {
  return `Nom trop long (max ${LONGUEUR_MAX_NOM_FICHIER} caractères${extension ? `, extension ${extension} comprise` : ''}).`;
}

/**
 * Le nouveau nom d'un fichier dont le nom ACTUEL est `nomActuel` · rogné, non
 * vide, l'extension connue conservée, au plus `LONGUEUR_MAX_NOM_FICHIER`
 * caractères, sans caractère de contrôle ni invisible.
 */
export function validerNomFichier(nomActuel: string, saisie: unknown): ValidationNom {
  const ext = extensionNomFichier(nomActuel);
  return validerNomSaisi(saisie, {
    max: LONGUEUR_MAX_NOM_FICHIER,
    invalide: REFUS_FICHIER.invalide,
    vide: REFUS_FICHIER.vide,
    long: refusNomFichierTropLong(ext),
    interdit: INTERDITS_NOM_FICHIER,
    interditRaison: REFUS_FICHIER.interdit,
    completer: (propre) => {
      if (!ext) return propre;
      const bas = propre.toLowerCase();
      // L'extension seule n'est pas un nom.
      if (bas === ext.toLowerCase()) return '';
      return bas.endsWith(ext.toLowerCase()) ? propre : `${propre}${ext}`;
    },
  });
}

/**
 * Renommer un fichier · le fichier (vivant, de l'espace, de la bibliothèque,
 * relu par l'appelant · `null` sinon, ce qui couvre une sortie Studios, une
 * ancienne création, un fichier d'un autre espace ou en corbeille) et le nom
 * saisi.
 */
export function validerRenommageFichier(fichier: { name: string } | null | undefined, saisie: unknown): ValidationNom {
  if (!fichier) return { ok: false, raison: REFUS_FICHIER.introuvable };
  return validerNomFichier(fichier.name, saisie);
}

/** Le message dit après un renommage réussi. */
export function messageFichierRenomme(nom: string): string {
  return `Fichier renommé en « ${nom} »`;
}
