/**
 * Les sous-sections de la rubrique Réglages · ordre de la maquette
 * (`docs/spatial/reference/utilisation.html`). Seules les destinations qui
 * EXISTENT sont listées · « Partenaires » rejoindra la liste avec son écran.
 */
export const SOUS_NAV_REGLAGES = [
  { href: '/settings', libelle: 'Espace' },
  { href: '/team', libelle: 'Équipe' },
  { href: '/connections', libelle: 'Connexions' },
  { href: '/usage', libelle: 'Crédits & factures' },
  { href: '/billing', libelle: 'Forfaits' },
] as const;
