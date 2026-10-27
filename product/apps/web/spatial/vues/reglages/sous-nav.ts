/**
 * Les sous-sections de la rubrique Réglages · ordre de la maquette
 * (`docs/spatial/reference/utilisation.html` · « Partenaires » s'insère après
 * « Équipe », comme dans la maquette). Seules les destinations qui EXISTENT
 * sont listées.
 */
export const SOUS_NAV_REGLAGES = [
  { href: '/settings', libelle: 'Espace' },
  { href: '/team', libelle: 'Équipe' },
  { href: '/settings/partenaires', libelle: 'Partenaires' },
  { href: '/connections', libelle: 'Connexions' },
  { href: '/usage', libelle: 'Crédits & factures' },
  { href: '/billing', libelle: 'Forfaits' },
] as const;
