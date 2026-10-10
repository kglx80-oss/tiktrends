// RBAC TikTrends · droits par rôle + gating par abonnement (CDC §F1).
// Pur (aucune dépendance serveur) : importable partout.

import { roleVoitRubrique, type RolePlateforme, type MatriceDroits } from '@tiktrends/core';

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
/**
 * Groupe du rail · UX V2 (maquettes validées par Kevin, 10/10).
 *
 * Le rail est une liste PLATE de modules, dans l'ordre du travail · Accueil,
 * Veille, Studios, Bibliothèque, Résultats, Jarvis. Les anciennes rubriques
 * (Observer · Créer · Tester, ex-Observatoire · Atelier · Laboratoire) ne
 * s'affichent plus · elles alourdissaient un rail de six entrées et nommaient
 * des lieux que l'utilisateur ne retrouvait nulle part ailleurs.
 *
 * Les sous-écrans gardent leur entrée (droits, palette, matrice d'équipe) ·
 * le rail n'en montre que la tête, et la page les présente en ONGLETS
 * (`sectionsRail`, `sectionDuChemin`, plus bas). `account` porte le menu
 * profil (Compte, Espace, Admin).
 */
export type NavGroup = 'Principal' | 'account';
export const RAIL_GROUPS: NavGroup[] = ['Principal'];
/** Libellé d'en-tête affiché au-dessus d'un groupe · vide · le rail plat n'en pose aucun. */
export const RAIL_GROUP_LABEL: Record<string, string> = {
  Principal: '',
};
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
  // ── Rail UX V2 (maquettes validées par Kevin, 10/10) ─────────────────────
  // Une liste PLATE, dans l'ordre du travail : Accueil, Veille, Studios,
  // Bibliothèque, Résultats, Jarvis. Les sous-écrans gardent leur entrée (droits,
  // palette, fil d'Ariane) mais ne sont plus dans le rail · ils deviennent les
  // ONGLETS de leur section (`ongletsSection`), et la section reste allumée sur
  // tous ses descendants. Rôles, formules et rubriques : INCHANGÉS.

  // Accueil · sa vue Analytics est un onglet de la page (`?vue=analytics`).
  { key: 'dashboard', label: 'Accueil',      href: '/dashboard',   icon: 'grid',   group: 'Principal', minRole: 'client_viewer', minPlan: 'starter' },
  { key: 'analytics', label: 'Analytics',    href: '/dashboard?vue=analytics', icon: 'chart', group: 'Principal', parent: 'dashboard', minRole: 'client_viewer', minPlan: 'starter' },

  // Veille · source → analyse → projet. « Radar créatif » (créas à retravailler)
  // rejoint la Veille · même droit qu'avant (member, core).
  { key: 'inspo',     label: 'Veille',       href: '/veille',       icon: 'bulb',   group: 'Principal',  minRole: 'member',        minPlan: 'core' },
  { key: 'scale',     label: 'Ce qui scale', href: '/veille/scale', icon: 'trend',  group: 'Principal',  parent: 'inspo', minRole: 'member', minPlan: 'core' },
  { key: 'saved',     label: 'Sauvegardes',  href: '/saved',       icon: 'bookmark', group: 'Principal', parent: 'inspo', minRole: 'member', minPlan: 'core' },
  { key: 'formats',   label: 'Formats',      href: '/veille/formats', icon: 'tag', group: 'Principal', parent: 'inspo', minRole: 'member', minPlan: 'core' },
  { key: 'tags',      label: 'Tagging',      href: '/tags',        icon: 'tag',    group: 'Principal',  parent: 'inspo', minRole: 'member', minPlan: 'starter' },
  // « Radar créatif » et non « Radar » · Résultats en a un autre (radar de veille).
  { key: 'radar',     label: 'Radar créatif', href: '/radar',     icon: 'radar',  group: 'Principal',  parent: 'inspo', minRole: 'member',        minPlan: 'core' },

  // Studios · une seule entrée de création (mandat du 10/10). La clé reste
  // `studio` · c'est elle que la garde serveur lit (`gardeStudio`).
  { key: 'studio',    label: 'Studios',      href: '/studio/projets', icon: 'spark', group: 'Principal',    minRole: 'member',        minPlan: 'core' },
  // Bibliothèque · anciennes et nouvelles créations, médias importés.
  { key: 'assets',    label: 'Bibliothèque', href: '/assets',      icon: 'layers', group: 'Principal',    minRole: 'member',        minPlan: 'core' },

  // Résultats · hypothèse → lot → mesures → apprentissage (module Adsmap).
  { key: 'adsmap',    label: 'Résultats',    href: '/adsmap',      icon: 'chart',  group: 'Principal',   minRole: 'member',        minPlan: 'plus' },
  { key: 'tri',       label: 'Tri des propositions', href: '/adsmap/tri', icon: 'check', group: 'Principal', parent: 'adsmap', minRole: 'member', minPlan: 'plus' },
  { key: 'lots',      label: 'Lots de test', href: '/adsmap/lots', icon: 'layers', group: 'Principal',   parent: 'adsmap', minRole: 'admin',  minPlan: 'plus' },
  { key: 'protocole', label: 'Protocole & seuils', href: '/adsmap/protocole', icon: 'gauge', group: 'Principal', parent: 'adsmap', minRole: 'member', minPlan: 'plus' },
  { key: 'import',    label: 'Importer',     href: '/adsmap/import', icon: 'store', group: 'Principal',  parent: 'adsmap', minRole: 'admin',  minPlan: 'plus' },
  { key: 'suites',    label: 'Suites',       href: '/adsmap/suites', icon: 'trend', group: 'Principal',  parent: 'adsmap', minRole: 'member', minPlan: 'plus' },
  { key: 'ttradar',   label: 'Radar de veille', href: '/adsmap/radar', icon: 'radar', group: 'Principal', parent: 'adsmap', minRole: 'admin', minPlan: 'plus' },

  // Jarvis · conversation globale et sources (les sources s'ouvrent depuis la page).
  { key: 'jarvis',    label: 'Jarvis',       href: '/jarvis',      icon: 'brain',  group: 'Principal',    minRole: 'member',        minPlan: 'core' },

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

/**
 * Chaque fonctionnalité appartient à une RUBRIQUE gouvernable par l'équipe
 * interne (voir packages/core · equipe-plateforme). C'est ce qui relie le menu
 * client (par feature) au système de droits de l'équipe (par rubrique). Support
 * n'a pas de rubrique · toujours visible pour l'équipe.
 */
const RUBRIQUE_DE_FEATURE: Record<string, string> = {
  dashboard: 'dashboard', analytics: 'analytics',
  inspo: 'veille', scale: 'veille', tags: 'veille', formats: 'veille', saved: 'saved', radar: 'radar',
  jarvis: 'jarvis', studio: 'studio', assets: 'assets',
  adsmap: 'adsmap', suites: 'adsmap', lots: 'adsmap', ttradar: 'adsmap', tri: 'adsmap', protocole: 'adsmap', import: 'adsmap',
  brands: 'marques', team: 'equipe', connect: 'connexions', usage: 'usage', billing: 'facturation', settings: 'reglages',
};
export function rubriqueDeFeature(key: string): string | null {
  return RUBRIQUE_DE_FEATURE[key] ?? null;
}

/**
 * L'accès effectif d'une session · soit un CLIENT (rôle d'espace + formule), soit
 * un membre de l'ÉQUIPE interne (`equipe` présent · rôle plateforme + matrice).
 * Les deux ne se mélangent pas : quand `equipe` est là, c'est lui qui décide, et
 * la formule ne s'applique plus (l'équipe n'est pas facturée).
 */
export interface Access { role: Role; plan: Plan; equipe?: { role: RolePlateforme; matrice: MatriceDroits } }
export type NavItem = Feature & { locked: boolean; isSub: boolean };

/** La feature est-elle VISIBLE ? Client · rôle d'espace. Équipe · matrice des rubriques. */
function voitFeature(a: Access, f: Feature): boolean {
  if (!a.equipe) return roleAtLeast(a.role, f.minRole);
  const rub = rubriqueDeFeature(f.key);
  if (rub === null) return true; // sans rubrique (support) · toujours pour l'équipe
  return roleVoitRubrique(a.equipe.role, rub, a.equipe.matrice);
}

/** La feature est-elle VERROUILLÉE par la formule ? L'équipe n'est jamais bloquée par le plan. */
function verrouille(a: Access, f: Feature): boolean {
  return a.equipe ? false : !planAtLeast(a.plan, f.minPlan);
}

/** Navigation du rail, groupée ; les sous-menus suivent leur parent (indentés). */
export function railNav(a: Access): Array<{ group: NavGroup; items: NavItem[] }> {
  return RAIL_GROUPS.map((g) => ({
    group: g,
    items: FEATURES.filter((f) => f.group === g && !f.parent && voitFeature(a, f)).flatMap((f) => {
      const self: NavItem = { ...f, locked: verrouille(a, f), isSub: false };
      const subs: NavItem[] = FEATURES
        .filter((c) => c.parent === f.key && voitFeature(a, c))
        .map((c) => ({ ...c, locked: verrouille(a, c), isSub: true }));
      return [self, ...subs];
    }),
  })).filter((grp) => grp.items.length > 0);
}

/** Fonctionnalités du menu de compte (profil). */
export function accountFeatures(a: Access): NavItem[] {
  return FEATURES.filter((f) => f.group === 'account' && voitFeature(a, f))
    .map((f) => ({ ...f, locked: verrouille(a, f), isSub: false }));
}

export const ACCOUNT_SECTIONS: AccountSection[] = ['Compte', 'Espace', 'Admin'];
/** Menu profil groupé par section (Compte / Espace de travail / ADMIN+). */
export function accountSections(a: Access): Array<{ section: AccountSection; items: NavItem[] }> {
  const feats = accountFeatures(a);
  return ACCOUNT_SECTIONS.map((sec) => ({ section: sec, items: feats.filter((f) => f.section === sec) }))
    .filter((g) => g.items.length > 0);
}

/** L'utilisateur a-t-il accès ? Client · rôle ET formule. Équipe · la rubrique suffit (pas de formule). */
export function canAccess(a: Access, f: Feature): boolean {
  if (a.equipe) return voitFeature(a, f);
  return roleAtLeast(a.role, f.minRole) && planAtLeast(a.plan, f.minPlan);
}

/** Raison d'un refus (pour l'UI de page verrouillée). */
export function denyReason(a: Access, f: Feature): 'role' | 'plan' | null {
  if (a.equipe) return voitFeature(a, f) ? null : 'role';
  if (!roleAtLeast(a.role, f.minRole)) return 'role';
  if (!planAtLeast(a.plan, f.minPlan)) return 'plan';
  return null;
}

/**
 * Lot 11 · pour chaque rubrique, le RÔLE l'ouvre-t-il ? Lu par l'accueil pour
 * ne proposer que les gestes ouverts. Un verrou de FORMULE n'est pas un refus
 * de rôle · la rubrique reste proposée et sa page explique l'offre. Ne protège
 * rien · les pages et les actions gardent leurs propres contrôles.
 */
export function ouverturesParRole(a: Access): Array<{ href: string; ouvert: boolean; verrou: boolean }> {
  return FEATURES.map((f) => { const d = denyReason(a, f); return { href: f.href, ouvert: d !== 'role', verrou: d === 'plan' }; });
}

/**
 * Lot 12 · le menu de compte suit la garde RÉELLE des pages « Espace »
 * (roleAtLeast admin · brands, team, connections, usage, billing, réglages).
 * La face équipe plateforme (matrice) les montrait à un membre de l'équipe
 * dont le rôle d'ESPACE est inférieur · chaque page le renvoyait à l'accueil.
 * N'élargit rien, ne protège rien · les pages gardent leurs contrôles.
 */
export function sectionsCompteOuvertes(a: Access): Array<{ section: AccountSection; items: NavItem[] }> {
  return accountSections(a)
    .map((g) => (g.section === 'Espace' && !roleAtLeast(a.role, 'admin') ? { ...g, items: [] } : g))
    .filter((g) => g.items.length > 0);
}

/* -------------------------------------------------------------------------- */
/*  Rail UX V2 · sections et onglets (pur, testable)                          */
/* -------------------------------------------------------------------------- */

/** Une section du rail · son entrée et ses sous-écrans visibles (onglets de page). */
export interface EntreeRail { key: string; href: string; isSub: boolean }
export interface SectionRail<T extends EntreeRail = NavItem> { tete: T; onglets: T[] }

const cheminDe = (href: string): string => href.split('#')[0]!.split('?')[0]!;
const contient = (base: string, chemin: string): boolean => chemin === base || chemin.startsWith(base + '/');

/** Les sections du rail, à partir de la navigation déjà filtrée par les droits (`railNav`). */
export function sectionsRail<T extends EntreeRail>(nav: Array<{ items: T[] }>): Array<SectionRail<T>> {
  const out: Array<SectionRail<T>> = [];
  for (const it of nav.flatMap((g) => g.items)) {
    if (it.isSub && out.length) out[out.length - 1]!.onglets.push(it);
    else if (!it.isSub) out.push({ tete: it, onglets: [] });
  }
  return out;
}

/**
 * La section qui CONTIENT un chemin · son entrée, ou l'un de ses sous-écrans,
 * ou un de leurs descendants (« Studios » reste allumé dans un projet, « Veille »
 * sur les Sauvegardes). La section la plus précise gagne.
 */
export function sectionDuChemin<T extends EntreeRail>(sections: ReadonlyArray<SectionRail<T>>, pathname: string): SectionRail<T> | null {
  let meilleure: { s: SectionRail<T>; long: number } | null = null;
  for (const s of sections) {
    for (const href of [s.tete.href, ...s.onglets.map((o) => o.href)]) {
      const base = cheminDe(href);
      if (contient(base, pathname) && (!meilleure || base.length > meilleure.long)) meilleure = { s, long: base.length };
    }
  }
  return meilleure?.s ?? null;
}
