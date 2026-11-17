'use server';

import { revalidatePath } from 'next/cache';
import { gardeRadar } from '../../lib/radar-garde';
import { scanWorkspaceTracker, markTrackerSeen } from '../../lib/tracker';
import { logAndTranslate } from '../../lib/error-log';
import { GUARD } from '../../lib/guard-error';

/** Scan à la demande des marques suivies de l'espace (bouton « Scanner maintenant »). */
export async function scanTrackerAction(): Promise<{ newAds?: number; scanned?: number; error?: string }> {
  // La garde de la page Radar (rôle ET offre) · avant toute requête de veille.
  const g = await gardeRadar(GUARD.session());
  if ('error' in g) return { error: g.error };
  const { s } = g;
  try {
    const res = await scanWorkspaceTracker(s.workspaceId);
    revalidatePath('/saved');
    return res;
  } catch (e) {
    return { error: logAndTranslate('tracker', e, { subject: 'la veille concurrentielle', workspaceId: s.workspaceId }) };
  }
}

/** Marque le fil de nouveautés comme lu. */
export async function markTrackerSeenAction(): Promise<void> {
  const g = await gardeRadar(GUARD.session());
  if ('error' in g) return;
  const { s } = g;
  await markTrackerSeen(s.workspaceId);
  revalidatePath('/saved');
}
