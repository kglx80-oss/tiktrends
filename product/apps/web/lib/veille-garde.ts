import 'server-only';
import { db } from '@tiktrends/db';
import { getSession } from './auth';
import { FEATURES, canAccess, denyReason } from './rbac';
import { effectiveAccess } from './access';

/**
 * La Veille (offre Core) · même contrôle que la page `/veille` (lot 19C).
 * Cacher l'écran ne protège rien · une action serveur reste appelable
 * directement. Partagée par les actions de la Veille (`app/actions/inspo`,
 * `app/actions/veille-vues`) · hors d'un fichier `'use server'`, elle n'est
 * jamais exposée elle-même comme action.
 */
const Veille = FEATURES.find((f) => f.key === 'inspo')!;
export type SessionVeille = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function gardeVeille(): Promise<{ s: SessionVeille } | { error: string }> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée · reconnecte-toi puis réessaie.' };
  const a = effectiveAccess(s);
  if (!canAccess(a, Veille)) {
    return {
      error: denyReason(a, Veille) === 'plan'
        ? 'La Veille est incluse dès l’offre Core · un propriétaire de l’espace peut changer d’offre dans Réglages.'
        : 'Ton rôle ne permet pas d’utiliser la Veille · demande à un administrateur de l’espace.',
    };
  }
  return { s };
}
