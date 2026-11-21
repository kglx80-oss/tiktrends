import 'server-only';
import type { MatriceDroits, RolePlateforme } from '@tiktrends/core';
import type { EquipeSession } from './equipe-plateforme';

/**
 * ── Le registre des sessions d'équipe AUTHENTIQUES (suite de #1122) ──────────
 * `effectiveAccess` (lib/access.ts) décide de la face équipe sur
 * `equipe.plateformeAdmissible`. Ce champ venait de l'appelant · une session
 * reconstruite à la main (`{ ...s, equipe: { role: 'admin', matrice: {},
 * plateformeAdmissible: true } }`) obtenait une face RECONNUE, sans aucune
 * lecture de `platform_staff`.
 *
 * Désormais seule compte une `EquipeSession` que `equipeDeSession`
 * (lib/equipe-plateforme.ts, lue par `getSession`) a produite · elle est GELÉE
 * (sa matrice aussi, copiée) puis INSCRITE ici. Toute autre · littéral, copie,
 * `structuredClone`, aller-retour JSON · vaut ABSENTE pour `effectiveAccess`,
 * donc face client. Un WeakSet ne retient rien · une session oubliée par la
 * requête est libérée. Gelée · on ne rend pas admissible après coup une session
 * qui ne l'est pas.
 *
 * `authentifierEquipeSession` est la seule porte d'entrée · seuls
 * lib/equipe-plateforme.ts et le helper de test (test/helpers/face-equipe.ts)
 * la passent (règle `tiktrends/authentification-equipe-session`, recensement
 * `secu-fondateurs-codes-sources`).
 */
const SESSIONS_AUTHENTIQUES = new WeakSet<object>();

/** RÉSERVÉ à `equipeDeSession` (et au helper de test) · gèle puis inscrit une session d'équipe qu'il vient de lire en base. */
export function authentifierEquipeSession(e: EquipeSession): EquipeSession {
  const gelee: EquipeSession = Object.freeze({ ...e, matrice: matriceGelee(e.matrice) });
  SESSIONS_AUTHENTIQUES.add(gelee);
  return gelee;
}

/** La session d'équipe, SI `equipeDeSession` l'a produite · sinon null (aucune équipe). */
export function equipeSessionAuthentique(e: unknown): EquipeSession | null {
  // `typeof` d'abord · un `any` peut y avoir posé une chaîne, que WeakSet#has accepte sans lever.
  return typeof e === 'object' && e !== null && SESSIONS_AUTHENTIQUES.has(e) ? (e as EquipeSession) : null;
}

/** Une copie gelée de la matrice · la session ne partage rien de modifiable. */
function matriceGelee(m: MatriceDroits | undefined): MatriceDroits {
  const copie: Partial<Record<RolePlateforme, readonly string[]>> = {};
  for (const [role, rubriques] of Object.entries(m ?? {})) {
    if (Array.isArray(rubriques)) copie[role as RolePlateforme] = Object.freeze([...rubriques]);
  }
  return Object.freeze(copie);
}
