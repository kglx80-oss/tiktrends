import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « resultats ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 *
 * Restent servis par l'ancienne interface (aucun écran Spatial équivalent ·
 * « à trancher ») : `/adsmap/tri`, `/adsmap/suites`, `/adsmap/radar`,
 * `/adsmap/jarvis`.
 */
export const ECRANS_RESULTATS: readonly EcranSpatial[] = [
  { chemin: '/adsmap', section: 'resultats' },
  { chemin: '/adsmap/boucle', section: 'resultats' },
  { chemin: '/adsmap/hypotheses', section: 'resultats' },
  { chemin: '/adsmap/lots', section: 'resultats' },
  { chemin: '/adsmap/lots/[id]', section: 'resultats' },
  { chemin: '/adsmap/protocole', section: 'resultats' },
  { chemin: '/adsmap/import', section: 'resultats' },
  { chemin: '/adsmap/apprentissages', section: 'resultats' },
];
