import 'server-only';
import type { ErreurStudio, PermissionEspace } from '@tiktrends/core';
import { gardeStudio, type ContexteStudio } from '../garde';
import { getSession } from '../../auth';
import { effectiveAccess } from '../../access';
import { canAccess, FEATURES, type Feature } from '../../rbac';

/**
 * Garde du parcours Veille → projet · la garde studio (L1, inchangée) PLUS
 * l'ouverture de la Veille, relue à chaque appel.
 *
 * La Veille compte deux fois : une annonce observée en Veille n'est une source
 * que pour quelqu'un qui a accès à la Veille (même règle que `saveAd`) ; et
 * une source Veille d'un projet n'est plus LISIBLE quand cet accès est retiré
 * (offre rétrogradée, rôle abaissé) · on montre alors son tombstone, jamais
 * l'annonce.
 */

export const FEATURE_VEILLE: Feature = FEATURES.find((f) => f.key === 'inspo')!;

export interface ContexteSources {
  ctx: ContexteStudio;
  veilleOuverte: boolean;
}

export async function gardeSources(permission: PermissionEspace): Promise<({ ok: true } & ContexteSources) | ErreurStudio> {
  const g = await gardeStudio(permission);
  if (!g.ok) return g;
  const s = await getSession();
  const veilleOuverte = !!s && s.workspaceId === g.ctx.workspaceId && canAccess(effectiveAccess(s), FEATURE_VEILLE);
  return { ok: true, ctx: g.ctx, veilleOuverte };
}
