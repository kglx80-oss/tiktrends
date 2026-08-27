'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '../../lib/auth';
import { scanWorkspaceTracker, markTrackerSeen } from '../../lib/tracker';

/** Scan à la demande des marques suivies de l'espace (bouton « Scanner maintenant »). */
export async function scanTrackerAction(): Promise<{ newAds?: number; scanned?: number; error?: string }> {
  const s = await getSession();
  if (!s) return { error: 'session' };
  try {
    const res = await scanWorkspaceTracker(s.workspaceId);
    revalidatePath('/saved');
    return res;
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Marque le fil de nouveautés comme lu. */
export async function markTrackerSeenAction(): Promise<void> {
  const s = await getSession();
  if (!s) return;
  await markTrackerSeen(s.workspaceId);
  revalidatePath('/saved');
}
