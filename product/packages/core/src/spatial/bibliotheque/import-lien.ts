/**
 * Spatial · Bibliothèque · « Importer par lien » (repris de l'écran V5 ·
 * import par lien et liens de partage Google Drive). Pur · lit le texte collé,
 * une adresse par ligne, et dit ce qui partira à `importAssetAction`. Un lien
 * de DOSSIER Drive ne s'importe pas ainsi (la synchronisation de dossier le
 * fait) · il est refusé avec sa raison, rien n'est envoyé.
 */
export type TypeImportLien = 'image' | 'video' | 'audio' | 'other';

export const TYPES_IMPORT_LIEN: ReadonlyArray<{ cle: TypeImportLien; libelle: string }> = [
  { cle: 'video', libelle: 'Vidéo' }, { cle: 'image', libelle: 'Image' }, { cle: 'audio', libelle: 'Audio' }, { cle: 'other', libelle: 'Autre fichier' },
];

export function lireImportLiens(texte: string, nomUnique?: string): { liens: Array<{ nom: string; url: string }>; erreur: string | null } {
  const lignes = texte.split('\n').map((l) => l.trim()).filter(Boolean);
  const liens = lignes.filter((l) => /^https?:\/\/\S+$/i.test(l));
  if (!liens.length) return { liens: [], erreur: 'Colle au moins une adresse complète (https://…).' };
  if (liens.some((l) => /\/folders\//i.test(l))) {
    return { liens: [], erreur: 'Un des liens est un DOSSIER Drive · pour tout un dossier, connecte Google Drive et choisis le dossier. Ici, colle le lien de partage de chaque fichier.' };
  }
  const propre = (nomUnique ?? '').trim();
  return {
    liens: liens.map((url) => ({ url, nom: liens.length === 1 && propre ? propre : nomDepuisLien(url) })),
    erreur: lignes.length > liens.length ? 'Une ligne n’est pas une adresse complète (https://…) · elle est ignorée.' : null,
  };
}

/** Le nom d'un lien · son dernier segment utile (un lien Drive `…/d/<id>/view` garde `<id>`). */
export function nomDepuisLien(url: string): string {
  let segs: string[] = [];
  try { segs = new URL(url).pathname.split('/').filter(Boolean); } catch { return 'Lien'; }
  const utile = segs.filter((x) => !['view', 'edit', 'preview', 'd', 'file'].includes(x.toLowerCase()));
  const brut = utile[utile.length - 1] ?? '';
  try { return decodeURIComponent(brut) || 'Lien'; } catch { return brut || 'Lien'; }
}

/**
 * L'analyse des images sans tags part par LOT · `tagUntaggedImagesAction` en
 * traite au plus vingt par appel (une réservation de crédits par image). Le
 * bouton annonce donc « jusqu'à » ce lot, jamais plus (garde de source).
 */
export const LOT_ANALYSE_IMAGES = 20;
