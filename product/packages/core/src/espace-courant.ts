/**
 * L'espace courant d'une session · quelle appartenance d'un compte fait foi
 * (espace, rôle, plan, marques, données affichées). Pur · ni base, ni réseau.
 *
 * Avant cette règle, `getSession` (`apps/web/lib/auth.ts`) prenait la
 * PREMIÈRE ligne de `workspace_members` rendue par Postgres (`limit(1)` sans
 * ordre) · l'ordre PHYSIQUE de la table. Un simple changement de rôle réécrit
 * la ligne en fin de table · pour un compte de deux espaces, l'espace courant
 * basculait sans que rien n'ait changé pour la personne (audit #1088).
 *
 * Aucun mécanisme de CHOIX n'existe (ni cookie, ni sélecteur d'espace, ni
 * colonne « dernier espace ») · l'espace courant est donc un ORDRE
 * DÉTERMINISTE, explicite :
 *
 *   1. l'espace le plus ANCIEN (`workspaces.created_at` croissant) ;
 *   2. à instant égal, le plus petit identifiant d'espace (texte minuscule,
 *      l'ordre des octets de l'uuid, celui de Postgres) ;
 *   3. une date illisible passe après toutes les dates lisibles.
 *
 * Pourquoi cet ordre ·
 *  · un compte à UNE appartenance (la quasi-totalité · l'inscription crée un
 *    espace et une appartenance, l'invitation n'accepte qu'un compte neuf)
 *    retrouve exactement la même et seule appartenance · rien ne change ;
 *  · il ne lit que des attributs IMMUABLES de l'espace · ni un changement de
 *    rôle, ni un retrait suivi d'un retour, ni une réorganisation physique de
 *    la table ne déplacent l'espace courant ;
 *  · il n'utilise PAS le rôle · trier « propriétaire d'abord » ferait d'une
 *    promotion ailleurs un changement d'espace, et choisirait l'espace selon
 *    les droits qu'il donne · aucun droit n'est élargi ni restreint, on
 *    retient l'appartenance et SON rôle, tel quel ;
 *  · « l'appartenance la plus ancienne » serait plus juste, mais
 *    `workspace_members` ne porte aucune date · il faudrait une migration.
 *
 * Quel espace par défaut pour un compte multi-espaces est une décision
 * produit (Kevin) · cet ordre la rend seulement stable et lisible.
 */

export interface AppartenanceCandidate {
  /** L'espace de l'appartenance (`workspace_members.workspace_id`). */
  workspaceId: string;
  /** La création de l'espace (`workspaces.created_at`). */
  espaceCreeLe: Date;
}

const instant = (d: Date): number => {
  const t = d instanceof Date ? d.getTime() : Number.NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

/** L'ordre des appartenances · négatif quand `a` passe avant `b`. */
export function comparerAppartenances(a: AppartenanceCandidate, b: AppartenanceCandidate): number {
  const ta = instant(a.espaceCreeLe);
  const tb = instant(b.espaceCreeLe);
  if (ta !== tb) return ta < tb ? -1 : 1;
  const ia = a.workspaceId.toLowerCase();
  const ib = b.workspaceId.toLowerCase();
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

/**
 * L'appartenance qui fait l'espace courant · `null` sans appartenance (pas de
 * session). Rend l'objet reçu tel quel (son rôle compris) · ne modifie pas la
 * liste.
 */
export function espaceCourant<T extends AppartenanceCandidate>(appartenances: readonly T[]): T | null {
  let retenue: T | null = null;
  for (const a of appartenances) {
    if (retenue === null || comparerAppartenances(a, retenue) < 0) retenue = a;
  }
  return retenue;
}
