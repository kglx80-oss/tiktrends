/**
 * Spatial · Marque · importer un FICHIER de logo. Pur · ni base, ni réseau.
 *
 * Le geste réutilise deux actions EXISTANTES · le dépôt dans le bucket de
 * l'espace (`presignAssetUploadAction`, celui de la Bibliothèque) puis la
 * charte (`saveBrandDAAction`, celle de « Logos de la charte »). Ce module
 * décide ce qui est accepté et ce que la charte devient · rien d'autre ne
 * change (couleurs et polices renvoyées telles quelles).
 */

/** Les formats acceptés · ceux que la Bibliothèque accepte pour une image (`FORMATS_TELEVERSES`). */
export const FORMATS_LOGO: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Le poids maximal · le plafond déjà annoncé pour une image de la Bibliothèque
 * (« max ~4 Mo », `uploadImageAssetsAction`). Un logo pèse rarement plus de
 * quelques centaines de Ko · on reprend le plafond existant, on n'en invente pas.
 */
export const POIDS_MAX_LOGO = 4_000_000;

/** Pourquoi ce fichier est refusé · `null` quand il est accepté. */
export function refusFichierLogo(f: { type: string; taille: number }): string | null {
  if (!FORMATS_LOGO.includes(f.type)) return 'Formats acceptés pour un logo : png, jpg, webp.';
  if (!(f.taille > 0)) return 'Ce fichier est vide.';
  if (f.taille > POIDS_MAX_LOGO) return 'Logo trop lourd (4 Mo au plus).';
  return null;
}

/**
 * La charte après l'import · le logo importé devient le logo PAR DÉFAUT, les
 * logos déjà enregistrés restent (en variantes), sans doublon.
 */
export function charteAvecLogoImporte(c: { logos: readonly string[]; defaut: string | null }, url: string): { logoUrl: string; logos: string[] } {
  const logos = [...new Set([...(c.defaut ? [c.defaut] : []), ...c.logos, url].filter((u) => !!u))];
  return { logoUrl: url, logos };
}

/** Sans stockage de fichiers, le dépôt est impossible · les deux autres chemins existants restent. */
export const RAISON_LOGO_SANS_STOCKAGE = 'Le dépôt de fichiers n’est pas activé pour ton espace · récupère le logo depuis le site, ou colle son adresse dans Identité.';
