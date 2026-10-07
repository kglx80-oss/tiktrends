import 'server-only';
import {
  aPermissionPlateforme, erreurStudio, PERMISSIONS_PLATEFORME,
  type ErreurStudio, type PermissionPlateforme,
} from '@tiktrends/core';
import { getSession } from '../../auth';
import { contexteDepuisSession, nouveauTraceId, type ContexteStudio } from '../garde';
import type { Acteur } from './depot-prompts';

/**
 * Garde des commandes du registre · permissions de portée PLATEFORME.
 *
 * Réutilise la garde L1 (`lib/studios/garde.ts`) : session relue, permissions
 * calculées par le noyau (`permissionsStudio`) depuis les droits EXISTANTS.
 * Seul l'accès total d'équipe (adminplus, admin d'équipe, fondateur) porte les
 * permissions `prompt.*`, `run.inspect_redacted`, `provider.configure`,
 * `knowledge.manage`. Un owner ou un admin d'ESPACE n'en a aucune (SEC-09) ;
 * un lecteur non plus.
 *
 * Les octrois passés au noyau sont exactement ces permissions, sur la portée
 * plateforme : aucun octroi d'espace n'existe tant que le propriétaire n'a pas
 * décidé des personnalisations d'espace (cahier §8.1).
 */

export interface ContextePrompts { ctx: ContexteStudio; acteur: Acteur; permissions: ReadonlySet<PermissionPlateforme> }

export function acteurDepuisContexte(ctx: ContexteStudio): Acteur {
  return {
    userId: ctx.userId,
    roleEffectif: ctx.roleEffectif,
    traceId: ctx.traceId,
    octrois: PERMISSIONS_PLATEFORME.filter((p) => aPermissionPlateforme(ctx.permissions, p)).map((permission) => ({ permission, portee: { niveau: 'plateforme' as const } })),
  };
}

export async function gardePlateforme(permission: PermissionPlateforme): Promise<({ ok: true } & ContextePrompts) | ErreurStudio> {
  const traceId = nouveauTraceId();
  const s = await getSession();
  if (!s) return erreurStudio('AUTH_REQUIRED', { traceId });
  // Les marques ne servent pas ici · le registre est global.
  const ctx = contexteDepuisSession(s, [], [], traceId);
  if (!aPermissionPlateforme(ctx.permissions, permission)) return erreurStudio('FORBIDDEN', { traceId, message: 'Réservé à l’équipe de la plateforme (accès total) · un administrateur d’espace ne modifie pas les prompts globaux.' });
  return { ok: true, ctx, acteur: acteurDepuisContexte(ctx), permissions: ctx.permissions.plateforme };
}
