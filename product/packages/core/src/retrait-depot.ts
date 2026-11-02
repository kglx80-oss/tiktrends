/**
 * Stockage · RETRAIT d'un dépôt dont l'écriture en base a échoué · la règle,
 * pure (ni base, ni réseau).
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * L'inventaire des orphelins (`stockage-orphelins.ts`) COMPTE les objets que
 * plus aucune ligne ne pointe. Il en relevait les SOURCES · un `putObject`
 * réussi suivi d'un échec de l'insertion (synchro Drive de dossier, côté site
 * et côté worker ; import Drive par le sélecteur ; migration des images
 * embarquées ; enregistrement d'un téléversement direct). L'erreur remontait,
 * l'objet restait dans le bucket, sans ligne, pour toujours.
 *
 * ── La règle (`decisionRetraitDepot`) ────────────────────────────────────────
 *
 * Après un échec d'écriture, le chemin retire l'objet qu'IL vient de déposer,
 * et seulement si TOUT est vrai :
 *  1. l'adresse désigne un objet de CET espace (`cleObjetDeLEspace` · la même
 *     règle que `deleteObjectByUrl`) · sinon `hors_espace` (un lien Drive, une
 *     adresse d'un autre espace, rien n'est envoyé) ;
 *  2. la lecture des références a abouti sur TOUTES les colonnes du
 *     recensement (`RECENSEMENT_REFERENCES_STOCKAGE`) · sinon
 *     `references_inconnues` ;
 *  3. aucune ligne ne référence l'objet · sinon `referencee`.
 * Le 3 est ce qui protège un objet PRÉEXISTANT au même endroit : les clés
 * Drive sont prévisibles (`assets/<espace>/drive-<idDrive>.<ext>`) et un même
 * fichier Drive, branché sur deux marques de l'espace, partage UNE copie · la
 * seconde synchro réécrit la clé (mêmes octets), son insertion échoue, la ligne
 * de la première marque la référence toujours · l'objet reste.
 * Tout doute est un NON · au pire l'objet reste, compté par l'inventaire.
 *
 * L'erreur d'écriture remonte ensuite comme avant · le retrait ne la masque
 * jamais, et son propre échec est silencieux (au mieux).
 */

import { cleObjetDeLEspace } from './objet-espace';
import { APPELANTS_DEPOT_SANS_COLONNE, RECENSEMENT_REFERENCES_STOCKAGE } from './stockage-orphelins';

/** Ce que la lecture des colonnes recensées a trouvé pour UNE clé. */
export type ReferencesObjet = 'aucune' | 'referencee' | 'inconnue';

export type DecisionRetraitDepot =
  | { retirer: true; cle: string }
  | { retirer: false; raison: 'hors_espace' | 'referencee' | 'references_inconnues' };

/**
 * La clé à vérifier puis retirer · celle d'un objet de l'espace sous la base
 * publique du bucket, sinon `null` (rien à retirer, rien à lire).
 */
export function cleDuDepot(url: string, base: string, workspaceId: string): string | null {
  return cleObjetDeLEspace(url, base, workspaceId);
}

/** Retirer ou non, une fois les références lues · tout doute est un NON. */
export function decisionRetraitDepot(cle: string | null, references: ReferencesObjet): DecisionRetraitDepot {
  if (!cle) return { retirer: false, raison: 'hors_espace' };
  if (references === 'referencee') return { retirer: false, raison: 'referencee' };
  if (references !== 'aucune') return { retirer: false, raison: 'references_inconnues' };
  return { retirer: true, cle };
}

/**
 * Les formes sous lesquelles une ligne peut citer la clé · brute, `/` encodé
 * une fois (`%2f`) et deux fois (`%252f`), comme les relit l'inventaire
 * (`clesReferencees`). En minuscules : le lecteur compare en minuscules, une
 * correspondance de trop ne fait que GARDER l'objet.
 */
export function formesRechercheesObjet(cle: string): string[] {
  if (typeof cle !== 'string' || !cle) return [];
  const bas = cle.toLowerCase();
  return [...new Set([bas, bas.replace(/\//g, '%2f'), bas.replace(/\//g, '%252f')])];
}

/** Le traitement d'un fichier qui dépose dans le bucket, face à un échec d'écriture en base. */
export type TraitementEchecEcriture =
  /** Dépôt puis écriture · l'objet déposé est retiré si l'écriture échoue (règle ci-dessus). */
  | 'retrait_si_echec'
  /** Clé déterministe (empreinte, travail) et écriture rejouable · un nouvel essai réécrit la même clé puis la ligne. */
  | 'idempotent'
  /** Relais ou cache · aucune écriture en base dans ce fichier. */
  | 'sans_ecriture'
  /** Le dépôt est fait par le navigateur, l'action ne sait pas quelle adresse il vient de déposer. */
  | 'non_attribuable';

export interface CheminDepot { fichier: string; traitement: TraitementEchecEcriture; note: string }

/**
 * LE tableau des chemins « dépôt dans le bucket puis écriture en base » ·
 * un par fichier du recensement de l'inventaire (écrivains et appelants sans
 * colonne). Le test `stockage-retrait-depot-db` refuse un fichier du
 * recensement absent d'ici, et éprouve chaque `retrait_si_echec` sur une
 * vraie base.
 */
export const CHEMINS_DEPOT_PUIS_ECRITURE: readonly CheminDepot[] = [
  { fichier: 'packages/integrations/src/drive-sync.ts', traitement: 'retrait_si_echec', note: 'Synchro de dossier Drive (site et worker) · copie et vignette retirées si `insertAsset` échoue.' },
  { fichier: 'apps/web/app/actions/drive.ts', traitement: 'retrait_si_echec', note: 'Import Drive par le sélecteur · copie et vignette retirées si l’insertion échoue ; la synchro de dossier passe par `drive-sync.ts`.' },
  { fichier: 'apps/web/app/actions/storage.ts', traitement: 'retrait_si_echec', note: 'Migration des images embarquées · objet retiré si la ligne n’est pas réécrite (échec ou ligne disparue).' },
  { fichier: 'apps/web/app/actions/assets.ts', traitement: 'retrait_si_echec', note: 'Téléversement direct · objet relu puis retiré si l’insertion de la ligne échoue (comme un refus de relecture depuis #977). « Remplacer » (`remplacerAssetAction`) · la nouvelle version relue puis retirée si elle est refusée ou si la mise à jour de la ligne échoue ; l’ancien objet n’est jamais effacé.' },
  { fichier: 'apps/web/app/actions/brand-detail.ts', traitement: 'retrait_si_echec', note: 'Logo importé · déposé par le navigateur via `presignAssetUploadAction`, attesté par son jeton de dépôt scellé (`jeton-depot.ts`, la charte nomme `LOGO_DEPOSE`) ; retiré si la charte est refusée, si l’écriture échoue ou si la charte ne le retient pas.' },
  { fichier: 'apps/workers/src/studios/moteur.ts', traitement: 'idempotent', note: 'Sorties générées · clé `<préfixe>/<espace>/<travail>/<opération>` ; un échec de la transaction laisse le travail rejouable, qui réécrit la même clé.' },
  { fichier: 'apps/web/lib/studios/export/export.ts', traitement: 'idempotent', note: 'Archive d’export · clé par empreinte (`cleArchiveExport`) ; le même export réécrit la même clé.' },
  { fichier: 'apps/web/lib/studios/video/rendu-final.ts', traitement: 'idempotent', note: 'Vidéo finale · clé par empreinte, insertion `onConflictDoNothing` sur (espace, clé).' },
  { fichier: 'apps/web/lib/ad-store.ts', traitement: 'sans_ecriture', note: 'Cache des rendus de maquette · clé déterministe, aucune écriture en base.' },
  { fichier: 'apps/workers/src/studios/fournisseurs.ts', traitement: 'sans_ecriture', note: 'Relais `stockageS3.deposer` · la ligne est écrite par `moteur.ts`.' },
];

/** Les fichiers du recensement de l'inventaire · ceux que le tableau ci-dessus doit couvrir. */
export function fichiersRecensesDepot(): string[] {
  return [...new Set([
    ...RECENSEMENT_REFERENCES_STOCKAGE.flatMap((r) => r.ecrivains),
    ...APPELANTS_DEPOT_SANS_COLONNE.map((a) => a.fichier),
  ])].sort();
}
