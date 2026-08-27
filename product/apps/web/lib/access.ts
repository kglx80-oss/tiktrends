import 'server-only';
import { isFounder } from './founder';
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
 */
export function effectiveAccess(s: { role: Role; plan: Plan; user: { email: string } }): Access {
  return { role: s.role, plan: isFounder(s.user.email) ? 'business' : s.plan };
}
