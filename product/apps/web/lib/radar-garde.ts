import 'server-only';
import { db } from '@tiktrends/db';
import { getSession } from './auth';
import { FEATURES, canAccess, denyReason } from './rbac';
import { effectiveAccess } from './access';

/**
 * Le Radar (feature `radar` · Membre, offre Core) · même contrôle que la page
 * `/radar` (`canAccess(effectiveAccess(s), radar)`), au même mécanisme que la
 * Veille (`veille-garde.ts`).
 *
 * ── Ce qui manquait ──────────────────────────────────────────────────────────
 *
 * Les actions du Radar (`decouverteMarcheAction`, `scanTrackerAction`,
 * `markTrackerSeenAction`) ne vérifiaient que la session · un lecteur client,
 * ou un espace Starter, lançait la découverte et le scan (requêtes à la veille)
 * et marquait le fil comme lu. Cacher l'écran ne protège rien. Hors d'un
 * fichier `'use server'`, la garde n'est jamais exposée comme action.
 */
const Radar = FEATURES.find((f) => f.key === 'radar')!;
export type SessionRadar = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** La phrase de refus, dite par sa vraie raison · la même que le verrou de la page. */
export const TEXTE_REFUS_RADAR: Readonly<Record<'role' | 'plan', string>> = {
  plan: 'Le Radar est inclus dès l’offre Core · un propriétaire de l’espace peut changer d’offre dans Réglages.',
  role: 'Ton rôle ne permet pas d’utiliser le Radar · demande l’accès à un administrateur de l’espace.',
};

/** `texteSession` · la phrase de session expirée propre à chaque action, inchangée depuis main. */
export async function gardeRadar(texteSession: string): Promise<{ s: SessionRadar } | { error: string }> {
  const s = await getSession();
  if (!s || !db) return { error: texteSession };
  const a = effectiveAccess(s);
  if (!canAccess(a, Radar)) return { error: TEXTE_REFUS_RADAR[denyReason(a, Radar) === 'plan' ? 'plan' : 'role'] };
  return { s };
}
