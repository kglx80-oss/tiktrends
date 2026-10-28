import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « admin ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 *
 * Tour de contrôle · personnel de la plateforme uniquement (chaque page repose
 * la garde de son écran V5). Ordre de la sous-navigation de la maquette.
 */
export const ECRANS_ADMIN: readonly EcranSpatial[] = [
  { chemin: '/admin', section: 'admin' },
  { chemin: '/admin/churn', section: 'admin' },
  { chemin: '/admin/finance', section: 'admin' },
  { chemin: '/admin/plans', section: 'admin' },
  { chemin: '/admin/signups', section: 'admin' },
  { chemin: '/admin/sav', section: 'admin' },
  { chemin: '/admin/depenses', section: 'admin' },
  { chemin: '/admin/prompts', section: 'admin' },
  { chemin: '/admin/ia-studios', section: 'admin' },
  { chemin: '/admin/usage', section: 'admin' },
  { chemin: '/admin/paiement', section: 'admin' },
  { chemin: '/admin/equipe', section: 'admin' },
  // Vague 3 · écrans de l'ancienne interface hors maquette, portés dans la même
  // section (sous-navigation « outils de la plateforme », après les douze de la maquette).
  { chemin: '/admin/prompts/registre', section: 'admin' },
  { chemin: '/admin/incidents', section: 'admin' },
  { chemin: '/admin/intelligence', section: 'admin' },
  { chemin: '/admin/connaissances', section: 'admin' },
  { chemin: '/admin/studios-interrupteurs', section: 'admin' },
  { chemin: '/console', section: 'admin' },
];
