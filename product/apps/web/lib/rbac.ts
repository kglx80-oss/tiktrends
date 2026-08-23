// RBAC TikTrends — droits par rôle + gating par abonnement (CDC §F1).
// Pur (aucune dépendance serveur) : importable partout.

export type Role = 'owner' | 'admin' | 'member' | 'client_viewer';
export type Plan = 'starter' | 'core' | 'plus' | 'business';

// Hiérarchie des rôles (plus le rang est haut, plus il y a de droits).
const ROLE_RANK: Record<Role, number> = { client_viewer: 0, member: 1, admin: 2, owner: 3 };
// Hiérarchie des abonnements.
const PLAN_RANK: Record<Plan, number> = { starter: 0, core: 1, plus: 2, business: 3 };

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Propriétaire', admin: 'Admin', member: 'Membre', client_viewer: 'Client (lecture)',
};
export const PLAN_LABEL: Record<Plan, string> = {
  starter: 'Starter', core: 'Core', plus: 'Plus', business: 'Business',
};

export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
export function planAtLeast(plan: Plan, min: Plan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[min];
}

// Catalogue des fonctionnalités : rôle minimum + abonnement minimum.
export interface Feature {
  key: string;
  label: string;
  href: string;
  icon: string;      // glyphe simple (SVG géré dans le rail)
  minRole: Role;
  minPlan: Plan;
  soon?: boolean;    // fonctionnalité à venir (affichée grisée)
}

export const FEATURES: Feature[] = [
  { key: 'dashboard', label: 'Dashboard',    href: '/dashboard',   icon: 'grid',   minRole: 'client_viewer', minPlan: 'starter' },
  { key: 'analytics', label: 'Analytics',    href: '/analytics',   icon: 'chart',  minRole: 'client_viewer', minPlan: 'starter', soon: true },
  { key: 'tags',      label: 'Tagging',      href: '/tags',        icon: 'tag',    minRole: 'member',        minPlan: 'starter' },
  { key: 'inspo',     label: 'Inspo',        href: '/inspo',       icon: 'bulb',   minRole: 'member',        minPlan: 'core' },
  { key: 'studio',    label: 'Studio IA',    href: '/studio',      icon: 'spark',  minRole: 'member',        minPlan: 'core' },
  { key: 'brands',    label: 'Marques',      href: '/brands',      icon: 'store',  minRole: 'admin',         minPlan: 'starter', soon: true },
  { key: 'connect',   label: 'Connexions',   href: '/connections', icon: 'plug',   minRole: 'admin',         minPlan: 'starter', soon: true },
  { key: 'team',      label: 'Équipe',       href: '/team',        icon: 'users',  minRole: 'admin',         minPlan: 'starter' },
  { key: 'support',   label: 'Support',      href: '/support',     icon: 'help',   minRole: 'client_viewer', minPlan: 'starter' },
  { key: 'settings',  label: 'Réglages',     href: '/settings',    icon: 'gear',   minRole: 'admin',         minPlan: 'starter' },
  { key: 'billing',   label: 'Abonnement',   href: '/billing',     icon: 'card',   minRole: 'owner',         minPlan: 'starter', soon: true },
];

export interface Access { role: Role; plan: Plan; }

/** L'utilisateur a-t-il accès (rôle ET abonnement suffisants) ? */
export function canAccess(a: Access, f: Feature): boolean {
  return roleAtLeast(a.role, f.minRole) && planAtLeast(a.plan, f.minPlan);
}

/** Fonctionnalités visibles dans le rail pour cet accès (droits rôle OK ; le plan
 *  insuffisant reste visible mais verrouillé pour inciter à l'upgrade). */
export function visibleFeatures(a: Access): Array<Feature & { locked: boolean }> {
  return FEATURES.filter((f) => roleAtLeast(a.role, f.minRole)).map((f) => ({
    ...f, locked: !planAtLeast(a.plan, f.minPlan),
  }));
}

/** Raison d'un refus (pour l'UI de page verrouillée). */
export function denyReason(a: Access, f: Feature): 'role' | 'plan' | null {
  if (!roleAtLeast(a.role, f.minRole)) return 'role';
  if (!planAtLeast(a.plan, f.minPlan)) return 'plan';
  return null;
}
