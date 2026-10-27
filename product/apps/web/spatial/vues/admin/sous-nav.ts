/**
 * La sous-navigation du Tour de contrôle · ordre et libellés de la maquette
 * (`docs/spatial/reference/admin.html`), adresses RÉELLES (`MATRICE.md`).
 * Les raccourcis du bas de la vue d'ensemble reprennent la même liste, avec
 * l'icône de la maquette.
 */
export const SOUS_NAV_ADMIN = [
  { href: '/admin', libelle: 'Vue d’ensemble' },
  { href: '/admin/churn', libelle: 'Churn & rétention' },
  { href: '/admin/finance', libelle: 'Revenus & MRR' },
  { href: '/admin/plans', libelle: 'Forfaits' },
  { href: '/admin/signups', libelle: 'Inscriptions & comptes' },
  { href: '/admin/sav', libelle: 'Tickets SAV' },
  { href: '/admin/depenses', libelle: 'Coûts IA & marges' },
  { href: '/admin/prompts', libelle: 'Bibliothèque IA' },
  { href: '/admin/ia-studios', libelle: 'Modèles IA' },
  { href: '/admin/usage', libelle: 'Usage & tests' },
  { href: '/admin/paiement', libelle: 'Stripe & Whop' },
  { href: '/admin/equipe', libelle: 'Rôles & droits' },
] as const;

export const ICONE_RACCOURCI_ADMIN: Readonly<Record<string, string>> = {
  '/admin/churn': 'warn', '/admin/finance': 'chart', '/admin/plans': 'tag', '/admin/signups': 'users',
  '/admin/sav': 'chat', '/admin/depenses': 'spark', '/admin/prompts': 'brush', '/admin/ia-studios': 'bulb',
  '/admin/usage': 'flask', '/admin/paiement': 'card', '/admin/equipe': 'shield',
};
