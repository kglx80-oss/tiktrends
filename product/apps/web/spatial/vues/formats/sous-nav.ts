/**
 * Les sous-sections de la rubrique Veille · ordre de la maquette
 * (`docs/spatial/reference/formats.html`). Seules les destinations qui
 * EXISTENT sont listées · « Concurrents » rejoindra la liste avec son écran
 * (rubrique C1). Le badge « PRO » de Radar n'est pas repris · Radar est ouvert
 * dès la formule Core, comme la Veille (`FEATURES`, `lib/rbac.ts`).
 */
export const SOUS_NAV_VEILLE = [
  { href: '/veille', libelle: 'Pubs du moment' },
  { href: '/veille/formats', libelle: 'Formats' },
  { href: '/veille/tendances', libelle: 'Tendances' },
  { href: '/saved', libelle: 'Sauvegardes' },
  { href: '/veille/scale', libelle: 'Ce qui scale' },
  { href: '/radar', libelle: 'Radar' },
] as const;
