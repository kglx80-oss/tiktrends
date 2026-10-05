import 'server-only';
import { canAccess, denyReason, FEATURES, roleAtLeast, type Feature } from './rbac';
import { effectiveAccess } from './access';
import type { Session } from './auth';

/**
 * Qui entre dans Jarvis · la feature `jarvis` du catalogue, telle qu'elle est
 * DÉFINIE (`lib/rbac.ts` · Membre ou plus, offre Core ou plus ; pour l'équipe
 * plateforme, la rubrique `jarvis` de la matrice). Rien n'est redéfini ici.
 *
 * ── Ce qui manquait ──────────────────────────────────────────────────────────
 *
 * La page `/jarvis`, la route `/api/jarvis/chat` et la lecture du fil ne
 * vérifiaient que le rôle d'espace (`member`). Un membre d'un espace Starter, ou
 * un membre d'équipe dont la matrice n'ouvre pas Jarvis (`freelance` par
 * défaut), parlait donc à Jarvis · et recevait dans sa consigne les
 * connaissances de portée plateforme. Ce contrôle passe AVANT toute lecture
 * (marque active, connaissances, `app_settings`).
 *
 * Le contrôle de rôle d'origine (`member`) est CONSERVÉ en plus de `canAccess` ·
 * avec une session d'équipe, `canAccess` ne lit que la matrice, et le retirer
 * ouvrirait Jarvis à un `client_viewer` membre de l'équipe. On n'élargit rien.
 */
export const FEATURE_JARVIS: Feature = FEATURES.find((f) => f.key === 'jarvis')!;

/** null · accès ouvert. Sinon la raison du refus, pour l'écran (`role` ou `plan`). */
export function refusJarvis(s: Pick<Session, 'role' | 'plan' | 'user' | 'equipe'>): 'role' | 'plan' | null {
  if (!roleAtLeast(s.role, 'member')) return 'role';
  const a = effectiveAccess(s);
  if (canAccess(a, FEATURE_JARVIS)) return null;
  return denyReason(a, FEATURE_JARVIS) ?? 'role';
}

/**
 * La phrase de refus, dite par sa VRAIE raison (`denyReason`) · la même à
 * l'écran (`RefusJarvis`) et dans les actions serveur. Avant, une action
 * répondait « rôle administrateur » à un compte Starter ou à un freelance ·
 * c'était faux (l'offre, ou la matrice d'équipe, refusait).
 */
export const TEXTE_REFUS_JARVIS: Readonly<Record<'role' | 'plan', string>> = {
  plan: 'Jarvis est disponible à partir du plan Core. Passe ton espace en Core dans Réglages puis Abonnement.',
  role: "Ton rôle ne permet pas d'accéder à Jarvis.",
};
