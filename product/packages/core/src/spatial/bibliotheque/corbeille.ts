import type { DonneesDrive, FichierDrive } from './drive';

/**
 * Bibliothèque · la CORBEILLE DES FICHIERS · RÈGLES PURES (ni base, ni réseau).
 *
 * Mettre un fichier à la corbeille pose `assets.deleted_at` · rien d'autre :
 * la ligne reste, l'objet du bucket reste, le fichier se restaure tel quel
 * (dossier, droits, réglage IA). Tant qu'il y est, il ne se montre que dans la
 * section « Corbeille » et ne sert plus ni aux Studios ni à l'IA. La
 * suppression DÉFINITIVE (ligne et objet du bucket) n'est offerte qu'à un
 * fichier déjà dans la corbeille, à l'unité et confirmée · aucune purge
 * automatique n'existe.
 *
 * Ce module dit ce que l'aperçu d'un fichier propose, le nombre affiché à côté
 * de « Corbeille », la confirmation et le message d'un geste. Le JSX ne décide
 * rien.
 */

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** La phrase de l'aperçu d'un fichier en corbeille. */
export const NOTE_FICHIER_CORBEILLE = 'Dans la corbeille · restaurable. Il ne sert plus aux Studios ni à l’IA tant qu’il y reste.';

/** Le refus de l'action de suppression définitive pour un fichier hors corbeille · la même phrase qu'un inconnu. */
export const REFUS_SUPPRESSION_HORS_CORBEILLE = 'Ce fichier n’est pas dans la corbeille · mets-le d’abord à la corbeille.';

/**
 * Le nombre à côté de « Corbeille » · les SOMMETS de la corbeille (un
 * sous-dossier parti avec son parent revient avec lui, il ne compte pas) et
 * chaque fichier mis à la corbeille.
 */
export function compteCorbeille(d: DonneesDrive): number {
  const parId = new Map(d.dossiers.map((x) => [x.id, x] as const));
  const dossiers = d.dossiers.filter((x) => x.reel && x.supprime && !(x.parent && parId.get(x.parent)?.supprime)).length;
  return dossiers + d.fichiers.filter((f) => f.supprime).length;
}

export interface ActionsApercuFichier {
  /** Droits, rangement, usage par l'IA · un fichier vivant de la bibliothèque, écriture ouverte. */
  edition: boolean;
  /** « Mettre à la corbeille » · un fichier vivant de la bibliothèque. */
  corbeille: boolean;
  /** « Restaurer » · un fichier en corbeille. */
  restaurer: boolean;
  /** « Supprimer définitivement » · un fichier DÉJÀ en corbeille, jamais un fichier vivant. */
  supprimerDefinitivement: boolean;
  /** La phrase de l'aperçu · dite même en lecture seule. */
  note: string | null;
}

/** Ce que l'aperçu d'un fichier propose · rien sans écriture, rien pour une sortie Studios ou une ancienne création. */
export function actionsApercuFichier(f: Pick<FichierDrive, 'lectureSeule' | 'supprime'>, ecriture: boolean): ActionsApercuFichier {
  const jete = !!f.supprime && !f.lectureSeule;
  const ouvert = ecriture && !f.lectureSeule;
  return {
    edition: ouvert && !jete,
    corbeille: ouvert && !jete,
    restaurer: ouvert && jete,
    supprimerDefinitivement: ouvert && jete,
    note: jete ? NOTE_FICHIER_CORBEILLE : null,
  };
}

/** La confirmation de « Mettre à la corbeille » de la barre de sélection (réversible, mais groupé). */
export function confirmationCorbeille(dossiers: number, fichiers: number): string {
  if (dossiers && fichiers) return `Mettre ${pluriel(dossiers, 'dossier')} et ${pluriel(fichiers, 'fichier')} à la corbeille ? Tout reste restaurable, les dossiers avec leur contenu.`;
  if (fichiers) return `Mettre ${pluriel(fichiers, 'fichier')} à la corbeille ? ${fichiers > 1 ? 'Ils restent restaurables.' : 'Il reste restaurable.'}`;
  return `Mettre ${pluriel(dossiers, 'dossier')} à la corbeille ? Ils restent restaurables, avec leur contenu.`;
}

/** Le message dit après « Mettre à la corbeille » ou « Restaurer » · ce qui a VRAIMENT été écrit. */
export function messageCorbeille(geste: 'corbeille' | 'restaurer', dossiers: number, fichiers: number): string {
  const total = dossiers + fichiers;
  const quoi = dossiers && fichiers ? `${pluriel(dossiers, 'dossier')} et ${pluriel(fichiers, 'fichier')}`
    : fichiers ? pluriel(fichiers, 'fichier') : pluriel(dossiers, 'dossier');
  const s = total > 1 ? 's' : '';
  return geste === 'corbeille' ? `${quoi} placé${s} dans la corbeille` : `${quoi} restauré${s}`;
}
