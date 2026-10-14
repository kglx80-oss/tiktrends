import 'server-only';
import { canAccess, denyReason, FEATURES, roleAtLeast, type Feature } from './rbac';
import { effectiveAccess } from './access';
import type { Session } from './auth';

/**
 * Qui entre dans la Bibliothèque (`/assets`) · la feature `assets` du catalogue,
 * telle qu'elle est DÉFINIE (`lib/rbac.ts` · Membre ou plus, offre Core ou plus ;
 * pour l'équipe plateforme, la rubrique `assets` de la matrice). Rien n'est
 * redéfini ici · même mécanisme que Jarvis (`jarvis-acces.ts`).
 *
 * ── Ce qui manquait ──────────────────────────────────────────────────────────
 *
 * Les actions serveur de la bibliothèque (`app/actions/assets.ts`) ne
 * vérifiaient que la session et l'espace. Un lecteur client, ou un membre d'un
 * espace Starter, pouvait les appeler directement · importer, supprimer, et
 * lancer le tagging IA qui RÉSERVE des crédits et dépense de l'IA. Cacher
 * l'entrée du rail ne protège rien.
 *
 * Le plancher de rôle d'ESPACE (`member`, celui de la page) est CONSERVÉ en plus
 * de `canAccess` · avec une session d'équipe, `canAccess` ne lit que la matrice,
 * et le retirer ouvrirait la bibliothèque à un `client_viewer` membre de
 * l'équipe, que la page renvoie à l'accueil. On n'élargit rien.
 */
export const FEATURE_BIBLIOTHEQUE: Feature = FEATURES.find((f) => f.key === 'assets')!;

/**
 * LECTURE · voir les médias de l'espace (page `/assets`, `listAssets`). La règle
 * d'avant, inchangée · le plancher de rôle de la feature (Membre), SANS offre.
 * Un espace sous Core garde la vue sur ses médias existants · on ne retire
 * aucun accès à des données déjà là.
 */
export function refusLectureBibliotheque(s: Pick<Session, 'role'>): 'role' | null {
  return roleAtLeast(s.role, FEATURE_BIBLIOTHEQUE.minRole) ? null : 'role';
}

/**
 * ÉCRITURE · tout geste qui écrit, réserve un crédit ou appelle l'IA. La feature
 * complète · plancher de rôle d'espace PUIS `canAccess` (rôle et offre).
 * null · accès ouvert. Sinon la raison du refus (`role` ou `plan`).
 */
export function refusEcritureBibliotheque(s: Pick<Session, 'role' | 'plan' | 'user' | 'equipe'>): 'role' | 'plan' | null {
  const lecture = refusLectureBibliotheque(s);
  if (lecture) return lecture;
  const a = effectiveAccess(s);
  if (canAccess(a, FEATURE_BIBLIOTHEQUE)) return null;
  return denyReason(a, FEATURE_BIBLIOTHEQUE) ?? 'role';
}

/**
 * La phrase de refus, dite par sa vraie raison · la même à l'écran et dans les
 * actions. Neutre · elle ne dépend jamais de l'objet visé (un asset d'un autre
 * espace et un asset de l'espace reçoivent la même réponse).
 */
export const TEXTE_REFUS_BIBLIOTHEQUE: Readonly<Record<'role' | 'plan', string>> = {
  plan: 'Ajouter, modifier ou analyser des médias est inclus dès l’offre Core · un propriétaire de l’espace peut changer d’offre dans Réglages.',
  role: 'Ton rôle ne permet pas d’utiliser la Bibliothèque · demande à un administrateur de l’espace.',
};
