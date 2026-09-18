/**
 * Le catalogue des connecteurs · une seule vérité sur « disponible » vs « à venir ».
 *
 * L'écran Connexions annonçait « N intégrations disponibles » en comptant en
 * réalité la FEUILLE DE ROUTE (les connecteurs « en préparation ») · le même
 * nombre se lisait donc « disponibles » en haut et « en préparation » plus bas
 * (CDC v7 · N09). Pire · un connecteur déjà branché ailleurs (Google Drive dans
 * Assets) figurait encore dans la liste « à venir ».
 *
 * Ce module tranche · à partir de ce qui est VRAIMENT branchable et de la
 * feuille de route, il compte les deux ensembles SANS chevauchement · un
 * connecteur disponible ne peut pas être « en préparation ». Pur, testable, une
 * seule source pour tous les écrans.
 */

function norm(nom: string): string {
  return nom.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export interface EtatCatalogue {
  /** Combien de connecteurs sont branchables AUJOURD'HUI. */
  disponibles: number;
  /** Combien restent en préparation · les disponibles en sont exclus. */
  enPreparation: number;
  /** Les noms présents dans les DEUX listes · à retirer de la feuille de route. */
  conflits: string[];
}

/**
 * L'état du catalogue à partir des connecteurs réellement branchables et de la
 * feuille de route. Un connecteur listé dans les deux est un CONFLIT · il compte
 * comme disponible, jamais « en préparation » (on ne promet pas ce qu'on a déjà).
 */
export function etatCatalogue(disponibles: readonly string[], feuilleDeRoute: readonly string[]): EtatCatalogue {
  const dispo = new Set(disponibles.map(norm));
  const conflits = [...new Set(feuilleDeRoute.filter((r) => dispo.has(norm(r))))];
  return {
    disponibles: dispo.size,
    enPreparation: feuilleDeRoute.filter((r) => !dispo.has(norm(r))).length,
    conflits,
  };
}

/** Un connecteur de la feuille de route est-il DÉJÀ disponible (donc à masquer) ? */
export function dejaDisponible(nom: string, disponibles: readonly string[]): boolean {
  const cible = norm(nom);
  return disponibles.some((d) => norm(d) === cible);
}

/**
 * La PHASE d'un connecteur branché · « connecté » ne dit pas tout (CDC v7 · N09).
 * On distingue le compte relié, le compte à choisir (une agence a plusieurs
 * comptes pub), la connexion sans données remontées, et l'état opérationnel.
 */
export type PhaseConnecteur = 'a_brancher' | 'compte_a_choisir' | 'connecte_sans_donnees' | 'operationnel';

export const PHASE_CONNECTEUR_LABEL: Record<PhaseConnecteur, string> = {
  a_brancher: 'À brancher',
  compte_a_choisir: 'Compte à choisir',
  connecte_sans_donnees: 'Connecté · à synchroniser',
  operationnel: 'Connecté · données à jour',
};

/**
 * L'état affiché d'un connecteur, à partir de ses axes réels · relié ?, compte
 * requis manquant ?, données utilisables ?. Un token présent mais sans compte
 * choisi n'est pas « opérationnel » · une connexion sans synchro non plus.
 */
export function etatConnecteur(o: { connecte: boolean; compteRequisManquant?: boolean; donnees: boolean }): PhaseConnecteur {
  if (!o.connecte) return 'a_brancher';
  if (o.compteRequisManquant) return 'compte_a_choisir';
  return o.donnees ? 'operationnel' : 'connecte_sans_donnees';
}

const pluriel = (n: number) => (n > 1 ? 's' : '');

/**
 * Le résumé d'une synchro de dossier connecté · trouvés / importés / ignorés /
 * en erreur (CDC v7 · N09). Un dossier VIDE se dit comme tel, pas par le silence.
 * Les erreurs se déduisent · un fichier trouvé qui n'a été ni importé ni reconnu
 * déjà présent a échoué.
 */
export function resumeImportDrive(o: { found: number; added: number; skipped: number }): string {
  if (o.found <= 0) {
    return 'Dossier connecté vide · aucun fichier média trouvé, rien à importer. Google (scope drive.file) ne renvoie que ce que tu as sélectionné · re-sélectionne le dossier, ou choisis un sous-dossier qui contient directement des images/vidéos.';
  }
  const erreurs = Math.max(0, o.found - o.added - o.skipped);
  const bouts = [`${o.found} trouvé${pluriel(o.found)}`, `${o.added} importé${pluriel(o.added)}`];
  if (o.skipped > 0) bouts.push(`${o.skipped} déjà présent${pluriel(o.skipped)}`);
  if (erreurs > 0) bouts.push(`${erreurs} en erreur`);
  return `${bouts.join(' · ')}.`;
}

/**
 * L'état PERSISTANT d'un Drive branché, pour l'afficher sans confondre les cas
 * (CDC v8 · N09). Un `syncedAt` absent est un INCONNU, pas un zéro · un dossier
 * choisi mais jamais synchronisé ne se lit pas « vide » (on ne l'a pas encore
 * lu). Le bilan trouvés/importés/ignorés/erreurs (voir `resumeImportDrive`) ne
 * vaut qu'APRÈS une synchro · avant, l'état honnête est « jamais synchronisé ».
 */
export type EtatSyncDrive = 'sans_dossier' | 'jamais_synchronise' | 'synchronise';

export function etatSyncDrive(o: { folderId?: string | null; syncedAt?: string | null }): EtatSyncDrive {
  if (!o.folderId) return 'sans_dossier';
  if (!o.syncedAt) return 'jamais_synchronise';
  return 'synchronise';
}

/** Le libellé de chaque état de synchro · dit l'inconnu comme un inconnu. */
export const LIBELLE_SYNC_DRIVE: Record<EtatSyncDrive, string> = {
  sans_dossier: 'Aucun dossier sélectionné',
  jamais_synchronise: 'Jamais synchronisé · lance une première synchro pour lire le dossier',
  synchronise: 'Synchronisé',
};

/**
 * Le bilan de la dernière TENTATIVE de synchro d'un dossier · conservé pour
 * l'afficher après un rechargement (CDC v8 · N09), pas seulement dans l'instant
 * qui suit le clic. `ok` dit si elle a réussi · les compteurs ne sont présents
 * qu'en cas de succès (un échec n'a pas de bilan à montrer).
 */
export interface DernierSyncDrive {
  /** Horodatage ISO de la tentative (succès ou échec). */
  at: string;
  ok: boolean;
  found?: number;
  added?: number;
  skipped?: number;
  errors?: number;
}

/**
 * La dernière tentative a-t-elle échoué SANS qu'un succès plus récent la
 * couvre ? · un ancien `driveSyncedAt` (dernier SUCCÈS) ne doit pas masquer un
 * échec survenu après lui (CDC v8 · N09). Le dernier succès et la dernière
 * tentative sont deux faits distincts · on les compare, on ne confond pas.
 */
export function derniereTentativeDriveEnEchec(o: { syncedAt?: string | null; dernier?: DernierSyncDrive | null }): boolean {
  const d = o.dernier;
  if (!d || d.ok) return false;
  if (!o.syncedAt) return true; // jamais de succès, et la dernière tentative a échoué
  return new Date(d.at).getTime() > new Date(o.syncedAt).getTime();
}
