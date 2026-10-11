import type { ComparaisonVersions, ContenuVersion, DocumentStudio, ErreurStudio, FormatPropose, ProduitInitial } from '@tiktrends/core';

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

/** Une version du projet dans la liste de l'éditeur · auteur et date en clair. */
export interface VersionListee {
  id: string;
  n: number;
  /** ISO 8601. */
  creeLe: string;
  auteur: string;
  raison: string;
  courante: boolean;
}

/** L'aperçu d'une version et ce que sa restauration changerait. */
export interface ApercuVersion {
  version: { id: string; n: number };
  courante: { id: string; n: number };
  document: DocumentStudio | null;
  /** Le document existe mais ne se lit plus · pas d'aperçu. */
  documentIllisible: boolean;
  apercus: Record<string, string>;
  comparaison: ComparaisonVersions;
}

export interface VersionRestauree {
  version: { id: string; n: number };
  restauree: { id: string; n: number };
  contenu: ContenuVersion;
  document: DocumentStudio | null;
}
