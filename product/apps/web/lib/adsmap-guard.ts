import 'server-only';
import { db } from '@tiktrends/db';
import { getSession } from './auth';
import { getActiveBrand } from './brands';
import { canAccess, denyReason, FEATURES, roleAtLeast, type Role } from './rbac';
import { effectiveAccess } from './access';

/**
 * Garde unique des actions serveur ADSMAP.
 *
 * Cacher l'entrée du menu ne protège rien : une action serveur reste appelable
 * directement. ADSMAP est vendu à partir de l'offre Plus · le palier doit donc
 * être vérifié ici, au même endroit que le rôle, sinon la limite d'offre n'est
 * qu'un décor.
 *
 * Le fondateur passe par `effectiveAccess` comme partout ailleurs.
 */

const Adsmap = FEATURES.find((f) => f.key === 'adsmap')!;

export interface AdsMapGuardOk {
  s: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  brand: NonNullable<Awaited<ReturnType<typeof getActiveBrand>>>;
}

export async function adsmapGuard(opts?: { minRole?: Role; noBrand?: false }): Promise<AdsMapGuardOk | { error: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };

  const a = effectiveAccess(s);
  if (!canAccess(a, Adsmap)) {
    return {
      error: denyReason(a, Adsmap) === 'plan'
        ? 'Adsmap est disponible à partir de l’offre Plus.'
        : 'Ton rôle ne permet pas d’accéder à Adsmap.',
    };
  }
  if (opts?.minRole && !roleAtLeast(s.role, opts.minRole)) {
    return { error: 'Action réservée aux administrateurs de l’espace.' };
  }

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne une marque active pour ouvrir Adsmap.' };
  return { s, brand };
}
