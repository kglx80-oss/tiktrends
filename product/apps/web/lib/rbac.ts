// RBAC TikTrends · droits par rôle + gating par abonnement (CDC §F1).
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
export type NavGroup = 'Analyse' | 'Création' | 'account';
export const RAIL_GROUPS: NavGroup[] = ['Analyse', 'Création'];
export type AccountSection = 'Compte' | 'Espace' | 'Admin';

// Allocation de crédits mensuelle par abonnement.
// Calibrée pour garder une marge brute saine (~57-66 %) même si le client consomme
// 100 % de ses crédits, avec une remise volume légère sur les paliers hauts.
export const PLAN_CREDITS: Record<Plan, number> = { starter: 200, core: 2000, plus: 7000, business: 24000 };

// Tarif mensuel indicatif par abonnement (EUR HT) · paramétrable, sert au calcul du MRR.
export const PLAN_PRICE: Record<Plan, number> = { starter: 0, core: 99, plus: 299, business: 990 };

export interface Feature {
  key: string;
  label: string;
  href: string;
  icon: string;      // glyphe simple (SVG géré dans le rail)
  group: NavGroup;
  section?: AccountSection; // sous-section du menu profil (pour group 'account')
  parent?: string;   // sous-menu d'une autre fonctionnalité (ex: saved -> inspo)
  minRole: Role;
  minPlan: Plan;
  soon?: boolean;    // fonctionnalité à venir (affichée grisée)
}

export const FEATURES: Feature[] = [
  // Analyse (rail)
  { key: 'dashboard', label: 'Dashboard',    href: '/dashboard',   icon: 'grid',   group: 'Analyse',  minRole: 'client_viewer', minPlan: 'starter' },
  { key: 'analytics', label: 'Analytics',    href: '/analytics',   icon: 'chart',  group: 'Analyse',  minRole: 'client_viewer', minPlan: 'starter' },
  { key: 'radar',     label: 'Radar',        href: '/radar',       icon: 'radar',  group: 'Analyse',  minRole: 'member',        minPlan: 'core' },
  { key: 'tags',      label: 'Tagging',      href: '/tags',        icon: 'tag',    group: 'Analyse',  minRole: 'member',        minPlan: 'starter' },
  // Création (rail)
  { key: 'inspo',     label: 'Veille',       href: '/inspo',       icon: 'bulb',   group: 'Création', minRole: 'member',        minPlan: 'core' },
  { key: 'scale',     label: 'Ce qui scale', href: '/inspo/scale', icon: 'trend',  group: 'Création', parent: 'inspo', minRole: 'member', minPlan: 'core' },
  { key: 'saved',     label: 'Sauvegardes',  href: '/saved',       icon: 'bookmark', group: 'Création', parent: 'inspo', minRole: 'member', minPlan: 'core' },
  { key: 'studio',    label: 'Studio IA',    href: '/studio',      icon: 'spark',  group: 'Création', minRole: 'member',        minPlan: 'core' },
  { key: 'ads',       label: 'Pubs IA',      href: '/studio/ads',   icon: 'spark', group: 'Création', parent: 'studio', minRole: 'member', minPlan: 'core' },
  { key: 'image',     label: 'Image IA',     href: '/studio/image', icon: 'image', group: 'Création', parent: 'studio', minRole: 'member', minPlan: 'core' },
  { key: 'video',     label: 'Vidéo IA',     href: '/studio/video', icon: 'film',  group: 'Création', parent: 'studio', minRole: 'member', minPlan: 'core' },
  { key: 'assets',    label: 'Assets',       href: '/assets',      icon: 'layers', group: 'Création', minRole: 'member',        minPlan: 'core' },
  // Menu profil · Compte (personnel · tous les rôles)
  { key: 'support',   label: 'Support',      href: '/support',     icon: 'help',   group: 'account', section: 'Compte', minRole: 'client_viewer', minPlan: 'starter' },
  // Menu profil · Espace de travail (client · propriétaire/admin de l'espace)
  { key: 'brands',    label: 'Marques',      href: '/brands',      icon: 'store',  group: 'account', section: 'Espace', minRole: 'admin',  minPlan: 'starter' },
  { key: 'team',      label: 'Membres',      href: '/team',        icon: 'users',  group: 'account', section: 'Espace', minRole: 'admin',  minPlan: 'starter' },
  { key: 'connect',   label: 'Connexions',   href: '/connections', icon: 'plug',   group: 'account', section: 'Espace', minRole: 'admin',  minPlan: 'starter' },
  { key: 'usage',     label: 'Utilisation des crédits', href: '/usage', icon: 'coin', group: 'account', section: 'Espace', minRole: 'admin', minPlan: 'starter' },
  { key: 'billing',   label: 'Abonnement & factures', href: '/billing', icon: 'card', group: 'account', section: 'Espace', minRole: 'admin', minPlan: 'starter' },
  { key: 'settings',  label: 'Réglages',     href: '/settings',    icon: 'gear',   group: 'account', section: 'Espace', minRole: 'admin',  minPlan: 'starter' },
  // Note : Console + Crédits/marges (coûts réels API) sont réservés à la plateforme
  // (ADMIN+ · isFounder), pas exposés dans le menu client. Voir app/(app)/admin.
];

export interface Access { role: Role; plan: Plan; }
export type NavItem = Feature & { locked: boolean; isSub: boolean };

/** Navigation du rail, groupée ; les sous-menus suivent leur parent (indentés). */
export function railNav(a: Access): Array<{ group: NavGroup; items: NavItem[] }> {
  return RAIL_GROUPS.map((g) => ({
    group: g,
    items: FEATURES.filter((f) => f.group === g && !f.parent && roleAtLeast(a.role, f.minRole)).flatMap((f) => {
      const self: NavItem = { ...f, locked: !planAtLeast(a.plan, f.minPlan), isSub: false };
      const subs: NavItem[] = FEATURES
        .filter((c) => c.parent === f.key && roleAtLeast(a.role, c.minRole))
        .map((c) => ({ ...c, locked: !planAtLeast(a.plan, c.minPlan), isSub: true }));
      return [self, ...subs];
    }),
  })).filter((grp) => grp.items.length > 0);
}

/** Fonctionnalités du menu de compte (profil). */
export function accountFeatures(a: Access): NavItem[] {
  return FEATURES.filter((f) => f.group === 'account' && roleAtLeast(a.role, f.minRole))
    .map((f) => ({ ...f, locked: !planAtLeast(a.plan, f.minPlan), isSub: false }));
}

export const ACCOUNT_SECTIONS: AccountSection[] = ['Compte', 'Espace', 'Admin'];
/** Menu profil groupé par section (Compte / Espace de travail / ADMIN+). */
export function accountSections(a: Access): Array<{ section: AccountSection; items: NavItem[] }> {
  const feats = accountFeatures(a);
  return ACCOUNT_SECTIONS.map((sec) => ({ section: sec, items: feats.filter((f) => f.section === sec) }))
    .filter((g) => g.items.length > 0);
}

/** L'utilisateur a-t-il accès (rôle ET abonnement suffisants) ? */
export function canAccess(a: Access, f: Feature): boolean {
  return roleAtLeast(a.role, f.minRole) && planAtLeast(a.plan, f.minPlan);
}

/** Raison d'un refus (pour l'UI de page verrouillée). */
export function denyReason(a: Access, f: Feature): 'role' | 'plan' | null {
  if (!roleAtLeast(a.role, f.minRole)) return 'role';
  if (!planAtLeast(a.plan, f.minPlan)) return 'plan';
  return null;
}
