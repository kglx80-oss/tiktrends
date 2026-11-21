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
 * Lue par UN accesseur, `equipeAuthentique` (plus bas) · aucun lecteur ne
 * lit `s.equipe` brut.
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

/**
 * ── L'accesseur unique de `Session.equipe` (suite de #1124) ──────────────────
 * La session d'équipe d'une session, SI `equipeDeSession` l'a produite · sinon
 * null (aucune équipe). C'est le SEUL lecteur de `.equipe` d'une session · la
 * face (`effectiveAccess`), la portée plateforme du studio
 * (`contexteDepuisSession`), l'écriture de l'équipe, la dépense de la
 * plateforme, les Connaissances, « Rôles & droits » et les onglets
 * d'administration passent tous par lui. Une `equipe` reconstruite à la main ·
 * littéral, copie, JSON · vaut ABSENTE pour chacun, quel que soit son
 * `plateformeAdmissible`. Le recensement `secu-equipe-authentique-sources`
 * refuse toute autre lecture.
 */
export function equipeAuthentique(s: { equipe?: EquipeSession | null } | null | undefined): EquipeSession | null {
  const e: unknown = s?.equipe;
  // `typeof` d'abord · un `any` peut y avoir posé une chaîne, que WeakSet#has accepte sans lever.
  const objet = typeof e === 'object' && e !== null;
  if (objet && SESSIONS_AUTHENTIQUES.has(e)) return e as EquipeSession;
  if (objet) avertirSessionNonAuthentifiee();
  return null;
}

/**
 * Filet de journal · une `equipe` posée mais non authentifiée n'arrive jamais
 * en code légitime (`getSession` la produit). Si elle arrive · une session
 * reconstruite à la main, ou DEUX instances de ce registre (chacune ses
 * sessions) qui fermeraient l'équipe sans bruit. Dit une fois par processus,
 * quel que soit le lecteur, sans donnée personnelle.
 */
let sessionNonAuthentifieeDite = false;
function avertirSessionNonAuthentifiee(): void {
  if (sessionNonAuthentifieeDite) return;
  sessionNonAuthentifieeDite = true;
  console.warn('[rbac] session d’équipe non authentifiée · registre d’une autre instance du module ou session reconstruite à la main · le compte retombe sur la face client, sans aucun droit d’équipe');
}

/** Une copie gelée de la matrice · la session ne partage rien de modifiable. */
function matriceGelee(m: MatriceDroits | undefined): MatriceDroits {
  const copie: Partial<Record<RolePlateforme, readonly string[]>> = {};
  for (const [role, rubriques] of Object.entries(m ?? {})) {
    if (Array.isArray(rubriques)) copie[role as RolePlateforme] = Object.freeze([...rubriques]);
  }
  return Object.freeze(copie);
}
