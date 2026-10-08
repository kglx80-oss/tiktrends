import type { ContenuVersion, DocumentStudio, ErreurStudio, FormatPropose, ProduitInitial } from '@tiktrends/core';

/**
 * Formes échangées entre la lecture serveur de l'éditeur de calques et l'écran.
 * Types seuls · aucun code serveur ici (importable par un composant client).
 */

/** Un média du projet qu'on peut poser comme calque · référencé, jamais copié. */
export interface MediaEditeur {
  assetId: string;
  nom: string;
  mime: string;
  width: number;
  height: number;
}

export interface DonneesEditeur {
  projet: { id: string; titre: string; marque: string };
  version: { id: string; n: number };
  /** Contenu de la version (sert au calcul d'impact · aucune autre partie n'est éditée ici). */
  contenu: ContenuVersion;
  document: DocumentStudio | null;
  formatPropose: FormatPropose;
  /** La photo du produit, si le projet en épingle une dont on connaît les dimensions. */
  produit: ProduitInitial | null;
  medias: MediaEditeur[];
  /** `studio.propose` · sinon lecture seule. */
  peutEnregistrer: boolean;
}

export type ReponseEditeur<T> = ({ ok: true } & T) | ErreurStudio;

export interface DocumentRelu {
  version: { id: string; n: number };
  document: DocumentStudio | null;
}
