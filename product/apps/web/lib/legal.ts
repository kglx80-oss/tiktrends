/**
 * Informations légales de la société · éditables ici (ou via variables d'environnement).
 * Complète les champs marqués « À COMPLÉTER » avec les valeurs exactes de l'extrait Kbis /
 * de l'annuaire des entreprises. Aucune donnée sensible : ces infos sont publiques et
 * obligatoires (mentions légales).
 */
function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : fallback;
}

export const LEGAL = {
  siteName: 'TikTrends',
  legalName: env('LEGAL_NAME', 'TIKTRENDS'),
  form: env('LEGAL_FORM', 'SAS (société par actions simplifiée)'),
  capital: env('LEGAL_CAPITAL', 'À COMPLÉTER'),           // ex : « 1 000 € »
  siren: env('LEGAL_SIREN', '990 103 475'),
  siret: env('LEGAL_SIRET', 'À COMPLÉTER'),               // SIRET du siège
  rcsCity: env('LEGAL_RCS_CITY', 'À COMPLÉTER'),          // ville du greffe (RCS)
  ape: env('LEGAL_APE', 'À COMPLÉTER'),                   // code APE/NAF + libellé
  vatNumber: env('LEGAL_VAT', 'À COMPLÉTER'),             // TVA intracommunautaire (FR..)
  address: env('LEGAL_ADDRESS', 'À COMPLÉTER'),           // adresse du siège social
  president: env('LEGAL_PRESIDENT', 'À COMPLÉTER'),       // président / directeur de la publication
  email: env('LEGAL_EMAIL', 'contact@tiktrends.co'),
  dpoEmail: env('LEGAL_DPO_EMAIL', 'privacy@tiktrends.co'),
  siteUrl: env('APP_URL', 'https://app.tiktrends.co'),
  host: {
    name: env('LEGAL_HOST_NAME', 'OVH SAS'),
    address: env('LEGAL_HOST_ADDRESS', '2 rue Kellermann, 59100 Roubaix, France'),
    url: 'https://www.ovhcloud.com',
  },
  updatedAt: env('LEGAL_UPDATED', '2026'),
} as const;

export type LegalInfo = typeof LEGAL;

export const LEGAL_NAV: Array<{ href: string; label: string }> = [
  { href: '/legal/mentions-legales', label: 'Mentions légales' },
  { href: '/legal/cgu', label: 'CGU' },
  { href: '/legal/cgv', label: 'CGV' },
  { href: '/legal/confidentialite', label: 'Confidentialité' },
  { href: '/legal/cookies', label: 'Cookies' },
];
