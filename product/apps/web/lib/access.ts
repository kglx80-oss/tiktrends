import 'server-only';
import { privilegesEquipe } from '@tiktrends/core';
import { estFondateurCode } from './founder';
import type { EquipeSession } from './equipe-plateforme';
import type { Access, Plan, Role } from './rbac';

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
 *    de formule, voir rbac) · même exigence pour l'accès total ; un rôle gradé
 *    la garde comme avant, avec la formule de son espace.
 * Un compte d'accès total NON admissible (e-mail staff capté, compte créé
 * après son inscription) retombe sur la face client · rôle et formule réels de
 * son espace, aucun privilège d'équipe.
 */
export function effectiveAccess(
  s: { role: Role; plan: Plan; user: { email: string }; equipe?: EquipeSession | null },
): Access {
  const equipe = s.equipe ?? undefined;
  const p = privilegesEquipe({ fondateurCode: estFondateurCode(s.user.email), equipe });
  const plan: Plan = p.formuleBusiness ? 'business' : s.plan;
  return equipe && p.faceEquipe ? { role: s.role, plan, equipe } : { role: s.role, plan };
}
