import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  permissionsStudio, restreindrePlateforme, marquesAccessibles, aPermissionEspace, erreurStudio, estRoleEspace,
  type PermissionEspace, type PermissionsStudio, type RoleEspace, type ErreurStudio, type CapaciteStudio,
} from '@tiktrends/core';
import { getSession, type Session } from '../auth';
import { effectiveAccess } from '../access';
import { canAccess, FEATURES, type Feature } from '../rbac';
import { refusCapacite } from './interrupteurs';

/**
 * Garde unique des commandes studio · session → contexte authentifié.
 *
 * Réévaluée à CHAQUE appel : session relue (`getSession` relit rôle, offre et
 * équipe en base), marques de l'espace et restrictions de marque relues. Rien
 * n'est pris du client : ni l'espace, ni la marque autorisée, ni le rôle. Les
 * permissions viennent du noyau (`permissionsStudio`), à partir du catalogue
 * existant (`canAccess` sur la feature `studio`), sans droit nouveau.
 *
 * Politique de refus (cf. `erreurs.ts`) : pas de session → AUTH_REQUIRED ;
 * geste non permis sur sa propre portée → FORBIDDEN ; objet hors portée →
 * NOT_FOUND (décidé par `depot.ts`, jamais ici).
 */

export const FEATURE_STUDIO: Feature = FEATURES.find((f) => f.key === 'studio')!;

export interface ContexteStudio {
  userId: string;
  workspaceId: string;
  roleEspace: RoleEspace;
  roleEquipe: string | null;
  /** « espace:member » ou « equipe:admin/espace:owner » · tracé dans l'audit. */
  roleEffectif: string;
  permissions: PermissionsStudio;
  marquesDuWorkspace: string[];
  restrictionsMarque: string[];
  /** Marques visibles · le filtre de TOUTE requête du dépôt. */
  marques: string[];
  traceId: string;
}

export function nouveauTraceId(): string {
  return `st_${randomUUID()}`;
}

type SessionStudio = Pick<Session, 'user' | 'workspaceId' | 'role' | 'plan' | 'equipe'>;

/** Pur · éprouvé sans base. */
export function contexteDepuisSession(
  s: SessionStudio,
  marquesDuWorkspace: readonly string[],
  restrictionsMarque: readonly string[],
  traceId: string,
): ContexteStudio {
  const roleEspace: RoleEspace = estRoleEspace(s.role) ? s.role : 'client_viewer';
  const roleEquipe = s.equipe?.role ?? null;
  // SEC-10 / E5 · la portée PLATEFORME n'est accordée qu'à un compte admissible
  // (fondateur de la liste codée, ou compte créé AVANT son entrée
  // `platform_staff` · `equipeDeSession`). Absent → refus. La portée espace
  // n'est pas touchée.
  const permissions = restreindrePlateforme(
    permissionsStudio({
      roleEspace,
      studioOuvert: canAccess(effectiveAccess(s), FEATURE_STUDIO),
      roleEquipe,
    }),
    s.equipe?.plateformeAdmissible === true,
  );
  const marques = marquesAccessibles({ marquesDuWorkspace, restrictionsMarque });
  return {
    userId: s.user.id,
    workspaceId: s.workspaceId,
    roleEspace,
    roleEquipe,
    roleEffectif: roleEquipe ? `equipe:${roleEquipe}/espace:${roleEspace}` : `espace:${roleEspace}`,
    permissions,
    marquesDuWorkspace: [...marquesDuWorkspace],
    restrictionsMarque: [...restrictionsMarque],
    marques,
    traceId,
  };
}

export type ResultatGarde = { ok: true; ctx: ContexteStudio } | ErreurStudio;

/**
 * Charge le contexte et exige la permission d'espace demandée, puis (F1) que
 * la capacité Studios du geste soit active pour CET espace (interrupteurs,
 * `lib/studios/interrupteurs.ts`). Ordre : session ⇒ permission ⇒ capacité ;
 * un refus de capacité est `UNSUPPORTED_CAPABILITY`, avant toute écriture.
 */
export async function gardeStudio(permission: PermissionEspace, capacite?: CapaciteStudio): Promise<ResultatGarde> {
  const traceId = nouveauTraceId();
  const s = await getSession();
  if (!s || !db) return erreurStudio('AUTH_REQUIRED', { traceId });

  const marques = await db.select({ id: schema.brands.id }).from(schema.brands)
    .where(eq(schema.brands.workspaceId, s.workspaceId));
  const restrictions = await db.select({ brandId: schema.studioMemberBrandScopes.brandId })
    .from(schema.studioMemberBrandScopes)
    .where(and(eq(schema.studioMemberBrandScopes.workspaceId, s.workspaceId), eq(schema.studioMemberBrandScopes.userId, s.user.id)));

  const ctx = contexteDepuisSession(s, marques.map((m) => m.id), restrictions.map((r) => r.brandId), traceId);
  if (!aPermissionEspace(ctx.permissions, permission)) {
    return erreurStudio('FORBIDDEN', { traceId });
  }
  if (capacite) {
    const refus = await refusCapacite(ctx, [capacite]);
    if (refus) return refus;
  }
  return { ok: true, ctx };
}
