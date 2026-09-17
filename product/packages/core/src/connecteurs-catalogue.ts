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
