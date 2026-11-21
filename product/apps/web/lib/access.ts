import 'server-only';
import { privilegesEquipe } from '@tiktrends/core';
import { estFondateurCode } from './founder';
import type { EquipeSession } from './equipe-plateforme';
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
 */
export function effectiveAccess(
  s: { role: Role; plan: Plan; user: { email: string }; equipe?: EquipeSession | null },
): Access {
  const equipe = s.equipe ?? undefined;
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
