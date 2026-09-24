import 'server-only';
import { accesTotal } from '@tiktrends/core';
import { isFounder } from './founder';
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
 * ── L'équipe interne prime ───────────────────────────────────────────────────
 * Quand la session porte un rôle d'équipe (`equipe`), c'est LUI qui décide
 * l'accès (rubriques, sans verrou de formule · voir rbac). On force alors la
 * formule à `business` pour les accès totaux (adminplus/admin) afin que tout
 * lecteur direct de `.plan` (barre de crédits, facturation) reste cohérent avec
 * « voit tout ». Un rôle gradé garde la formule de son espace : sa face « équipe »
 * ignore de toute façon la formule.
 */
export function effectiveAccess(
  s: { role: Role; plan: Plan; user: { email: string }; equipe?: EquipeSession | null },
): Access {
  const equipe = s.equipe ?? undefined;
  const total = equipe ? accesTotal(equipe.role) : false;
  const plan: Plan = total || isFounder(s.user.email) ? 'business' : s.plan;
  return equipe ? { role: s.role, plan, equipe } : { role: s.role, plan };
}
