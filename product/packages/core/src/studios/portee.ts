/**
 * Studios · portée d'un objet (cahier 01 §7 et §12, recette SEC-01 et SEC-02).
 *
 * Pur. LA règle, appliquée à chaque lecture et à chaque écriture :
 *
 *   un objet est accessible si et seulement si
 *   1. il appartient à l'espace de la SESSION (jamais un espace pris du client) ;
 *   2. sa marque est une marque de cet espace ;
 *   3. cette marque est autorisée pour l'utilisateur · aucune restriction
 *      enregistrée = toutes les marques de l'espace (droits acquis inchangés).
 *
 * Un refus ne dit jamais pourquoi (autre espace, marque restreinte, inconnu) :
 * la réponse est la même, `NOT_FOUND`, voir `erreurs.ts`.
 */

export interface PorteeSession {
  workspaceId: string;
  /** Marques de l'espace de la session, relues en base à chaque appel. */
  marquesDuWorkspace: readonly string[];
  /** Restriction de marque de l'utilisateur ; liste vide = aucune restriction. */
  restrictionsMarque: readonly string[];
}

export interface PorteeObjet {
  workspaceId: string;
  brandId: string;
}

/**
 * Marques que la session peut voir. Une restriction qui ne vise aucune marque de
 * l'espace (donnée incohérente) ne rouvre RIEN : l'ensemble est vide, pas
 * « toutes ». Seule l'absence totale de restriction vaut « toutes ».
 */
export function marquesAccessibles(s: Pick<PorteeSession, 'marquesDuWorkspace' | 'restrictionsMarque'>): string[] {
  const espace = [...new Set(s.marquesDuWorkspace)];
  if (s.restrictionsMarque.length === 0) return espace;
  const autorisees = new Set(s.restrictionsMarque);
  return espace.filter((b) => autorisees.has(b));
}

export function objetDansPortee(s: PorteeSession, o: PorteeObjet): boolean {
  if (!s.workspaceId || o.workspaceId !== s.workspaceId) return false;
  return marquesAccessibles(s).includes(o.brandId);
}

/** La session peut-elle agir sur cette marque (création d'un projet, filtre de liste) ? */
export function marqueDansPortee(s: PorteeSession, brandId: string): boolean {
  return marquesAccessibles(s).includes(brandId);
}
