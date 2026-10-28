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

/**
 * Les outils de la plateforme hors maquette (vague 3) · écrans de l'ancienne
 * interface portés dans la section, APRÈS les douze de la maquette. Les
 * raccourcis de la vue d'ensemble restent ceux de la maquette.
 */
export const OUTILS_ADMIN = [
  { href: '/admin/prompts/registre', libelle: 'Registre IA' },
  { href: '/admin/incidents', libelle: 'Incidents' },
  { href: '/admin/intelligence', libelle: 'Intelligence marché' },
  { href: '/admin/connaissances', libelle: 'Connaissances' },
  { href: '/admin/studios-interrupteurs', libelle: 'Interrupteurs Studios' },
  { href: '/console', libelle: 'Console' },
] as const;

/** La sous-navigation affichée · la maquette, puis les outils de la plateforme. */
export const SOUS_NAV_ADMIN_COMPLETE = [...SOUS_NAV_ADMIN, ...OUTILS_ADMIN] as const;

export const ICONE_RACCOURCI_ADMIN: Readonly<Record<string, string>> = {
  '/admin/churn': 'warn', '/admin/finance': 'chart', '/admin/plans': 'tag', '/admin/signups': 'users',
  '/admin/sav': 'chat', '/admin/depenses': 'spark', '/admin/prompts': 'brush', '/admin/ia-studios': 'bulb',
  '/admin/usage': 'flask', '/admin/paiement': 'card', '/admin/equipe': 'shield',
};
