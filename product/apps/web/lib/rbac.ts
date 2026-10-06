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
 * Groupes du rail · des LIEUX, pas des impératifs.
 *
 * « Piloter, Trouver, Créer, Tester » disait juste et ne racontait rien · quatre
 * ordres donnés à quelqu'un qui travaille déjà. On ne « crée » pas : on va à
 * l'atelier. On ne « teste » pas : on va au laboratoire, avec une hypothèse et
 * un protocole — ce qui est exactement ce qu'Adsmap fait.
 *
 * Ils suivent toujours la BOUCLE de travail, pas l'ordre d'arrivée des
 * fonctionnalités.
 *
 * « Analyse » et « Création » dataient d'avant les modules récents : Jarvis y
 * était rangé dans Création alors qu'il est le cerveau, et Adsmap dans Analyse
 * alors qu'il pilote des tests. On lit désormais le rail de haut en bas comme on
 * travaille : on regarde où on en est, on cherche, on crée, on teste et on
 * apprend.
 */
export type NavGroup = 'Accueil' | 'Observatoire' | 'Atelier' | 'Laboratoire' | 'account';
/**
 * L'ordre du rail suit la BOUCLE de travail, pas l'ordre historique.
 *
 * Le produit fait une seule chose · trouver une créative gagnante, la refaire,
 * l'affiner. Cette boucle est observer → créer → tester. Le rail ouvrait sur
 * « Pilotage » (le tableau de bord · un regard en arrière), reléguant le
 * travail réel dessous. On mène par la boucle ; le pilotage, qu'on consulte,
 * vient après.
 */
// « Accueil » MÈNE le rail, en entrée AUTONOME (façon Flora · Kevin 30/09) · une
// tête seule, sans en-tête de section, avant la boucle. Puis on lit le rail comme
// on travaille · observer → créer → tester.
//
// Lot 19A (mandat du 5/10, remplace l'arbitrage du 30/09) · le groupe
// « Piloter » disparaît · le Pilotage est REGROUPÉ sous l'Accueil · « Analytics »
// y est une sous-entrée (`/dashboard?vue=analytics`), la vue Analytics de
// l'Accueil. `/analytics` reste une route valide (307 vers la vue).
export const RAIL_GROUPS: NavGroup[] = ['Accueil', 'Observatoire', 'Atelier', 'Laboratoire'];
/**
 * Ce que le rail AFFICHE · le verbe de l'étape, pas le nom de musée. Les clés
 * internes ne bougent pas (elles servent aussi au fil d'Ariane) · seul le
 * libellé montré nomme le geste, pour qu'on lise le rail comme la boucle.
 *
 * « Accueil » n'a PAS de libellé de section (chaîne vide) · c'est une entrée
 * autonome en tête, pas une rubrique · le rail ne pose aucun en-tête au-dessus.
 */
export const RAIL_GROUP_LABEL: Record<string, string> = {
  Accueil: '', Observatoire: 'Observer', Atelier: 'Créer', Laboratoire: 'Tester',
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
  /**
   * Branche DÉPLIÉE d'office, où que l'on soit (lot 19A) · « Analytics » était
   * une entrée de tête · regroupée sous l'Accueil, elle reste à un clic.
   */
  deplie?: boolean;
}

export const FEATURES: Feature[] = [
  // ── Accueil · l'entrée autonome en tête (façon Flora · Kevin 30/09) ────────
  // « Accueil » (ex-« Dashboard ») MÈNE le rail, sans en-tête de section.
  // La cible reste /dashboard · c'est la vraie page d'accueil · sa vue
  // Analytics est la sous-entrée qui suit.
  { key: 'dashboard', label: 'Accueil',      href: '/dashboard',   icon: 'grid',   group: 'Accueil',   deplie: true, minRole: 'client_viewer', minPlan: 'starter' },

  // Analytics · le Pilotage regroupé SOUS l'Accueil (lot 19A) · même chemin que
  // l'Accueil, la vue `?vue=analytics`. Mêmes droits qu'avant (rôle, formule,
  // rubrique `analytics` de la matrice d'équipe) · seule l'adresse change.
  { key: 'analytics', label: 'Analytics',    href: '/dashboard?vue=analytics', icon: 'chart', group: 'Accueil', parent: 'dashboard', minRole: 'client_viewer', minPlan: 'starter' },

  // ── Trouver · ce que fait le marché ───────────────────────────────────────
  { key: 'inspo',     label: 'Veille',       href: '/veille',       icon: 'bulb',   group: 'Observatoire',  minRole: 'member',        minPlan: 'core' },
  { key: 'scale',     label: 'Ce qui scale', href: '/veille/scale', icon: 'trend',  group: 'Observatoire',  parent: 'inspo', minRole: 'member', minPlan: 'core' },
  { key: 'saved',     label: 'Sauvegardes',  href: '/saved',       icon: 'bookmark', group: 'Observatoire', parent: 'inspo', minRole: 'member', minPlan: 'core' },
  // Formats créatifs v1 (lot 19C) · les sauvegardes classées à la main, par format.
  { key: 'formats',   label: 'Formats',      href: '/veille/formats', icon: 'tag', group: 'Observatoire', parent: 'inspo', minRole: 'member', minPlan: 'core' },
  { key: 'tags',      label: 'Tagging',      href: '/tags',        icon: 'tag',    group: 'Observatoire',  parent: 'inspo', minRole: 'member', minPlan: 'starter' },
  // « Radar créatif » et non « Radar » · le module Adsmap en a un autre, et
  // deux entrées du même nom obligent à cliquer pour savoir laquelle est laquelle.
  // Pas « Radar produits » · la page note des CRÉAS (Hook/Hold/CTR/Conv), elle
  // ne repère aucun produit (recette #106 · promesse erronée).
  { key: 'radar',     label: 'Radar créatif', href: '/radar',     icon: 'radar',  group: 'Observatoire',  minRole: 'member',        minPlan: 'core' },

  // ── Créer · Jarvis d'abord, c'est par lui qu'on entre ─────────────────────
  // Le rail le montre à partir de `core` : l'état des couches et les actions de
  // description valent pour tout le monde. Ce qui demande l'offre Plus, c'est la
  // mémoire MESURÉE, et c'est la page qui le dit.
  { key: 'jarvis',    label: 'Jarvis',       href: '/jarvis',      icon: 'brain',  group: 'Atelier',    minRole: 'member',        minPlan: 'core' },
  { key: 'studio',    label: 'Studio IA',    href: '/studio',      icon: 'spark',  group: 'Atelier',    minRole: 'member',        minPlan: 'core' },
  { key: 'ads',       label: 'Pubs IA',      href: '/studio/ads',   icon: 'spark', group: 'Atelier',    parent: 'studio', minRole: 'member', minPlan: 'core' },
  { key: 'image',     label: 'Image IA',     href: '/studio/image', icon: 'image', group: 'Atelier',    parent: 'studio', minRole: 'member', minPlan: 'core' },
  { key: 'video',     label: 'Vidéo IA',     href: '/studio/video', icon: 'film',  group: 'Atelier',    parent: 'studio', minRole: 'member', minPlan: 'core' },
  { key: 'textes',    label: 'Textes IA',    href: '/studio/textes', icon: 'bulb', group: 'Atelier',    parent: 'studio', minRole: 'member', minPlan: 'core' },
  { key: 'assets',    label: 'Assets',       href: '/assets',      icon: 'layers', group: 'Atelier',    minRole: 'member',        minPlan: 'core' },

  // ── Tester · la boucle hypothèse → verdict → itération ────────────────────
  // Les sous-écrans figurent dans le rail comme ceux du Studio. Ils vivaient
  // jusqu'ici dans une barre de sept boutons en haut de la carte, invisibles
  // depuis n'importe quel autre écran.
  { key: 'adsmap',    label: 'Adsmap',       href: '/adsmap',      icon: 'radar',  group: 'Laboratoire',   minRole: 'member',        minPlan: 'plus' },
  { key: 'suites',    label: 'Suites',       href: '/adsmap/suites', icon: 'trend', group: 'Laboratoire',  parent: 'adsmap', minRole: 'member', minPlan: 'plus' },
  { key: 'lots',      label: 'Lots de test', href: '/adsmap/lots', icon: 'layers', group: 'Laboratoire',   parent: 'adsmap', minRole: 'admin',  minPlan: 'plus' },
  { key: 'ttradar',   label: 'Radar de veille', href: '/adsmap/radar', icon: 'radar', group: 'Laboratoire', parent: 'adsmap', minRole: 'admin', minPlan: 'plus' },
  { key: 'tri',       label: 'Tri des propositions', href: '/adsmap/tri', icon: 'check', group: 'Laboratoire', parent: 'adsmap', minRole: 'member', minPlan: 'plus' },
  { key: 'protocole', label: 'Protocole & seuils', href: '/adsmap/protocole', icon: 'gauge', group: 'Laboratoire', parent: 'adsmap', minRole: 'member', minPlan: 'plus' },
  { key: 'import',    label: 'Importer',     href: '/adsmap/import', icon: 'store', group: 'Laboratoire',  parent: 'adsmap', minRole: 'admin',  minPlan: 'plus' },

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
  jarvis: 'jarvis', studio: 'studio', ads: 'studio', image: 'studio', video: 'studio', textes: 'studio', assets: 'assets',
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
