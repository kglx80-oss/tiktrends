import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « admin ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 *
 * Tour de contrôle · personnel de la plateforme uniquement (chaque page repose
 * la garde de son écran V5). Ordre de la sous-navigation de la maquette.
 *
 * Vague 3 · tous les écrans sont EXCLUSIFS (pages V5 retirées ou inexistantes),
 * sauf « Revenus & MRR » (`/admin/finance` · bénéfice net après impôt et
 * recommandations de marge sans équivalent) et « Inscriptions & comptes »
 * (`/admin/signups` · propriétaire, expérience, objectifs et site déclarés à
 * l'onboarding sans équivalent) · leur page V5 reste ouverte par `?ui=v5`.
 */
export const ECRANS_ADMIN: readonly EcranSpatial[] = [
  { chemin: '/admin', section: 'admin', exclusif: true },
  { chemin: '/admin/churn', section: 'admin', exclusif: true },
  { chemin: '/admin/finance', section: 'admin' },
  { chemin: '/admin/plans', section: 'admin', exclusif: true },
  { chemin: '/admin/signups', section: 'admin' },
  { chemin: '/admin/sav', section: 'admin', exclusif: true },
  { chemin: '/admin/depenses', section: 'admin', exclusif: true },
  { chemin: '/admin/prompts', section: 'admin', exclusif: true },
  { chemin: '/admin/ia-studios', section: 'admin', exclusif: true },
  { chemin: '/admin/usage', section: 'admin', exclusif: true },
  { chemin: '/admin/paiement', section: 'admin', exclusif: true },
  { chemin: '/admin/equipe', section: 'admin', exclusif: true },
  // Vague 3 · écrans de l'ancienne interface hors maquette, portés dans la même
  // section (sous-navigation « outils de la plateforme », après les douze de la maquette).
  { chemin: '/admin/prompts/registre', section: 'admin', exclusif: true },
  { chemin: '/admin/incidents', section: 'admin', exclusif: true },
  { chemin: '/admin/intelligence', section: 'admin', exclusif: true },
  { chemin: '/admin/connaissances', section: 'admin', exclusif: true },
  { chemin: '/admin/studios-interrupteurs', section: 'admin', exclusif: true },
  { chemin: '/console', section: 'admin', exclusif: true },
  // Vague 4 · « Crédits & marges » (écran V5 `/credits` sans fragment de maquette).
  { chemin: '/credits', section: 'admin', exclusif: true },
];
