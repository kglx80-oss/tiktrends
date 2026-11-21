import 'server-only';
import { privilegesEquipe } from '@tiktrends/core';
import { estFondateurCode } from './founder';
import type { EquipeSession } from './equipe-plateforme';
import { equipeSessionAuthentique } from './registre-equipe-session';
import type { MatriceDroits, RolePlateforme } from '@tiktrends/core';
import { inscrireFaceEquipe, type Access, type FaceEquipe, type Plan, type Role } from './rbac';

/**
 * Accès effectif d'une session.
 *
 * Le fondateur voit et utilise TOUT, quelle que soit l'offre de son espace : il
 * doit pouvoir éprouver le produit entier, y compris ce qu'il vend au palier le
 * plus haut, sans se mettre artificiellement en Business. C'est la même logique
 * que les crédits illimités · le compte de la plateforme n'est pas un client.
 *
 * Le RÔLE, lui, n'est pas relevé : un fondateur invité en lecture seule chez un
 * client reste en lecture seule.
 *
 * ── L'équipe interne prime, si elle y a droit ────────────────────────────────
 * La règle est celle du noyau (`privilegesEquipe`) :
 *  · formule forcée à `business` · fondateur de la liste CODÉE, ou accès total
 *    (adminplus/admin) ADMISSIBLE · afin que tout lecteur direct de `.plan`
 *    (barre de crédits, facturation) reste cohérent avec « voit tout » ;
 *  · face « équipe » (`Access.equipe` · rubriques par la matrice, sans verrou
 *    de formule, voir rbac) · fondateur codé, ou compte d'équipe ADMISSIBLE,
 *    quel que soit son rôle (un gradé admissible la garde avec la formule de
 *    son espace).
 * Un compte d'équipe NON admissible (e-mail staff capté, compte créé après son
 * inscription), accès total ou gradé, retombe sur la face client · rôle et
 * formule réels de son espace, aucun privilège d'équipe.
 *
 * ── Inscrite, gelée (suite de #1122) ──────────────────────────────────────────
 * La face construite ici est GELÉE (sa matrice aussi, copiée) puis INSCRITE au
 * registre de rbac (`inscrireFaceEquipe`). Les lecteurs (`canAccess`,
 * `denyReason`, le rail, le menu) ne reconnaissent QUE les faces inscrites
 * (`faceEquipeReconnue`) · une face forgée ailleurs, par cast, `any`, copie ou
 * JSON, vaut face client. Gelée · on ne peut pas élargir après coup le rôle ou
 * la matrice d'une face reconnue.
 *
 * ── L'entrée authentifiée (suite de #1122) ────────────────────────────────────
 * `privilegesEquipe` croit `equipe.plateformeAdmissible`. On ne lui passe donc
 * QUE la session d'équipe produite par `equipeDeSession` (gelée, inscrite au
 * registre de lib/registre-equipe-session.ts). Une `equipe` reconstruite à la
 * main · littéral, copie, JSON · vaut absente · face client, rôle et formule
 * réels de l'espace. Recensement des appelants · chacun reçoit la session de
 * `getSession` (directement, ou par une garde qui la rend telle quelle) ou
 * n'a pas d'équipe (`membres-mentions`, accès d'un AUTRE membre).
 */
export function effectiveAccess(
  s: { role: Role; plan: Plan; user: { email: string }; equipe?: EquipeSession | null },
): Access {
  // L'entrée est AUTHENTIFIÉE · seule une session d'équipe produite par `equipeDeSession` compte.
  const equipe = equipeSessionAuthentique(s.equipe) ?? undefined;
  if (!equipe && typeof s.equipe === 'object' && s.equipe !== null) avertirSessionNonAuthentifiee();
  const p = privilegesEquipe({ fondateurCode: estFondateurCode(s.user.email), equipe });
  const plan: Plan = p.formuleBusiness ? 'business' : s.plan;
  if (!equipe || !p.faceEquipe) return { role: s.role, plan };
  // Le SEUL endroit où une face équipe est construite (`FaceEquipe`, marque de type) et inscrite.
  const face = Object.freeze({ role: equipe.role, matrice: matriceGelee(equipe.matrice) }) as FaceEquipe;
  return { role: s.role, plan, equipe: inscrireFaceEquipe(face) };
}

/** Une copie gelée de la matrice · la session reste à elle, la face ne partage rien de modifiable. */
function matriceGelee(m: MatriceDroits | undefined): MatriceDroits {
  const copie: Partial<Record<RolePlateforme, readonly string[]>> = {};
  for (const [role, rubriques] of Object.entries(m ?? {})) {
    if (Array.isArray(rubriques)) copie[role as RolePlateforme] = Object.freeze([...rubriques]);
  }
  return Object.freeze(copie);
}

/**
 * Filet de journal · une `equipe` posée mais non authentifiée n'arrive jamais
 * en code légitime (`getSession` la produit). Si elle arrive · une session
 * reconstruite à la main, ou DEUX instances du registre (chacune ses sessions)
 * qui fermeraient l'équipe sans bruit. Dit une fois par processus, sans donnée
 * personnelle.
 */
let sessionNonAuthentifieeDite = false;
function avertirSessionNonAuthentifiee(): void {
  if (sessionNonAuthentifieeDite) return;
  sessionNonAuthentifieeDite = true;
  console.warn('[rbac] session d’équipe non authentifiée · registre d’une autre instance du module ou session reconstruite à la main · le compte retombe sur la face client');
}
